import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { UsersRepository } from './users.repository';
import { DatabaseService } from '../../database/database.service';
import { CreateUserDto, UpdateUserDto, QueryUserDto } from './dto';
import { getCurrentTenantId } from '../common/tenant.context';
import { EmailService } from '../email/email.service';
import { NotificationsService } from '../notifications/notifications.service';

export interface BulkInviteResult {
  invited: number;
  failed: number;
  errors: Array<{ row: number; email: string; message: string }>;
  users: Array<{ id: string; email: string; fullName: string; role: string }>;
}

@Injectable()
export class UsersService {
  constructor(
    private repository: UsersRepository,
    private db: DatabaseService,
    private email: EmailService,
    private readonly notifications: NotificationsService,
  ) {}

  async findAll(query: QueryUserDto) {
    const { page = 1, limit = 50 } = query;
    const { data, total } = await this.repository.findAll(getCurrentTenantId(), query);
    return {
      data,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  async findById(id: string) {
    const user = await this.repository.findById(getCurrentTenantId(), id);
    if (!user) throw new NotFoundException('User not found');
    return user;
  }

  async create(dto: CreateUserDto & { password?: string }, actorUserId?: string) {
    const existing = await this.repository.findByEmail(getCurrentTenantId(), dto.email);
    if (existing) throw new ConflictException(`User with email ${dto.email} already exists`);

    // Hash password if provided — user can login immediately
    let passwordHash = null;
    if (dto.password) {
      passwordHash = await bcrypt.hash(dto.password, 12);
    }

    const user = await this.repository.create(getCurrentTenantId(), { ...dto, passwordHash });
    this.announceUserActivated(user, actorUserId);
    return user;
  }

  async update(id: string, dto: UpdateUserDto) {
    await this.findById(id);
    if (dto.email) {
      const existing = await this.repository.findByEmail(getCurrentTenantId(), dto.email);
      if (existing && existing.id !== id) {
        throw new ConflictException(`Email ${dto.email} is already in use`);
      }
    }
    return this.repository.update(getCurrentTenantId(), id, dto);
  }

  async delete(id: string) {
    await this.findById(id);
    return this.repository.delete(getCurrentTenantId(), id);
  }

  async invite(dto: CreateUserDto & { password?: string; invitedByName?: string; invitedById?: string }) {
    const existing = await this.repository.findByEmail(getCurrentTenantId(), dto.email);
    if (existing) throw new ConflictException(`User with email ${dto.email} already exists`);

    const tempPassword = dto.password || this.generateTempPassword();
    const passwordHash = await bcrypt.hash(tempPassword, 12);

    const user = await this.repository.create(getCurrentTenantId(), {
      ...dto,
      passwordHash,
      isActive: true,
      mustChangePassword: true,
    });

    // Resolve warehouse name for the email (optional)
    let warehouseName: string | undefined;
    if ((dto as any).warehouseId) {
      const wh = await this.db.query<{ name: string }>(
        `SELECT name FROM warehouses WHERE id = $1 AND tenant_id = $2`,
        [(dto as any).warehouseId, getCurrentTenantId()],
      );
      warehouseName = wh.rows[0]?.name;
    }

    // Fire and forget — failure to send email should not roll back user creation
    this.email
      .sendInviteEmail({
        to: user.email,
        fullName: user.fullName || user.full_name || dto.email,
        tempPassword,
        role: dto.role || 'worker',
        warehouseName,
        invitedByName: dto.invitedByName,
      })
      .catch(() => undefined);

    // The invited user is created ACTIVE with a temporary password, so this
    // insert is the moment they become a member of the organisation — there is
    // no separate "accept invitation" endpoint to hook (see the report).
    this.announceUserActivated(user, dto.invitedById, warehouseName);

    // Do NOT return tempPassword to the client. It's been emailed.
    return { ...user, emailed: true };
  }

  // ─── Notifications (spec Part 2 — system events) ───────────────────────────

  /**
   * Raised once a user row exists and is active: tells the admins somebody
   * joined, then re-checks the plan's seat usage.
   *
   * Fire-and-forget by construction — a notification must never roll back or
   * fail a user creation.
   */
  private announceUserActivated(user: any, actorUserId?: string, warehouseName?: string) {
    if (!user?.id) return;
    const tenantId = getCurrentTenantId();

    if (user.isActive !== false) {
      void this.notifications
        .emit('user.joined', {
          tenantId,
          // Users are a company-wide concern; the registry marks the event
          // companyWide so managers are still resolved without a warehouse.
          warehouseId: user.warehouseId ?? null,
          entityType: 'user',
          entityId: user.id,
          data: {
            actorUserId,
            fullName: user.fullName || user.full_name || user.email,
            email: user.email,
            role: user.role,
            warehouseName,
          },
        })
        .catch(() => undefined);
    }

    void this.checkPlanLimits(tenantId).catch(() => undefined);
  }

  /**
   * Seat usage against the tenant's plan, evaluated after every user insert.
   *
   * NOTE: no `actorUserId` is passed. Unlike "X approved your request", a plan
   * limit is a billing state of the whole organisation — the admin who just
   * consumed the last seat is precisely the person who has to act on it, so
   * excluding them would silence the only useful recipient.
   */
  private async checkPlanLimits(tenantId: string): Promise<void> {
    const res = await this.db.query(
      `SELECT t.max_users,
              COALESCE(p.name, 'current') AS plan_name,
              (SELECT COUNT(*) FROM users u WHERE u.tenant_id = t.id) AS used
         FROM tenants t
         LEFT JOIN plans p ON p.id = t.plan_id
        WHERE t.id = $1`,
      [tenantId],
    );
    const row = res.rows[0];
    const limit = Number(row?.max_users);
    const used = Number(row?.used);
    if (!Number.isFinite(limit) || limit <= 0 || !Number.isFinite(used)) return;

    const ratio = used / limit;
    if (ratio < 0.9) return;

    const eventType = ratio >= 1 ? 'plan.limit_reached' : 'plan.limit_approaching';
    await this.notifications.emit(eventType, {
      tenantId,
      entityType: 'tenant',
      entityId: tenantId,
      data: {
        limitType: 'users',
        used,
        limit,
        percentUsed: Math.round(ratio * 100),
        planName: row.plan_name,
      },
    });
  }

  async inviteBulk(
    invites: Array<CreateUserDto & { password?: string }>,
    invitedByName?: string,
    invitedById?: string,
  ): Promise<BulkInviteResult> {
    const result: BulkInviteResult = { invited: 0, failed: 0, errors: [], users: [] };

    for (let i = 0; i < invites.length; i++) {
      const dto = invites[i];
      try {
        const user = await this.invite({ ...dto, invitedByName, invitedById });
        result.invited++;
        result.users.push({
          id: user.id,
          email: user.email,
          fullName: user.fullName || user.full_name || dto.email,
          role: dto.role || 'worker',
        });
      } catch (err) {
        result.failed++;
        result.errors.push({
          row: i + 1,
          email: dto.email,
          message: err instanceof Error ? err.message : 'Unknown error',
        });
      }
    }

    return result;
  }

  async forceLogout(id: string) {
    const user = await this.findById(id);
    await this.db.query(
      `UPDATE users SET token_version = COALESCE(token_version, 0) + 1, updated_at = NOW()
       WHERE id = $1 AND tenant_id = $2`,
      [id, getCurrentTenantId()],
    );
    return { id: user.id, forcedLogout: true };
  }

  async resetPassword(id: string) {
    const user = await this.findById(id);
    const tempPassword = this.generateTempPassword();
    const passwordHash = await bcrypt.hash(tempPassword, 12);
    await this.db.query(
      `UPDATE users SET password_hash = $1, must_change_password = true,
                        token_version = COALESCE(token_version, 0) + 1, updated_at = NOW()
       WHERE id = $2 AND tenant_id = $3`,
      [passwordHash, id, getCurrentTenantId()],
    );

    this.email
      .sendPasswordResetEmail({
        to: user.email,
        fullName: user.fullName || user.full_name || user.email,
        tempPassword,
      })
      .catch(() => undefined);

    return { id, emailed: true };
  }

  private generateTempPassword(): string {
    // 12 chars: 3 letters + 1 special + 3 letters + 1 special + 4 digits → meets complexity rules
    const upper = 'ABCDEFGHJKMNPQRSTUVWXYZ';
    const lower = 'abcdefghjkmnpqrstuvwxyz';
    const digits = '23456789';
    const specials = '!@#$%^&*';
    const pick = (s: string) => s[Math.floor(Math.random() * s.length)];
    const segs = [
      pick(upper), pick(lower), pick(lower),
      pick(specials),
      pick(upper), pick(lower), pick(lower),
      pick(specials),
      pick(digits), pick(digits), pick(digits), pick(digits),
    ];
    return segs.join('');
  }

  async deactivate(id: string) {
    await this.findById(id);
    return this.repository.setActive(getCurrentTenantId(), id, false);
  }

  async reactivate(id: string) {
    await this.findById(id);
    return this.repository.setActive(getCurrentTenantId(), id, true);
  }

  async getStats() {
    return this.repository.getStats(getCurrentTenantId());
  }

  // ─── Permissions ───────────────────────────────────────────

  async getPermissions() {
    const result = await this.db.query(
      `SELECT role, module, action, allowed FROM role_permissions WHERE tenant_id = $1 ORDER BY module, action, role`,
      [getCurrentTenantId()],
    );

    // Group into the matrix format the frontend expects: { module, action, admin, manager, worker }
    const matrix: Record<string, Record<string, Record<string, boolean>>> = {};
    for (const row of result.rows) {
      if (!matrix[row.module]) matrix[row.module] = {};
      if (!matrix[row.module][row.action]) matrix[row.module][row.action] = {};
      matrix[row.module][row.action][row.role] = row.allowed;
    }

    const permissions: any[] = [];
    for (const [module, actions] of Object.entries(matrix)) {
      for (const [action, roles] of Object.entries(actions)) {
        permissions.push({
          module,
          action,
          admin: roles.admin ?? true,
          manager: roles.manager ?? false,
          worker: roles.worker ?? false,
        });
      }
    }

    return permissions;
  }

  async updatePermissions(permissions: any[]) {
    for (const perm of permissions) {
      for (const role of ['admin', 'manager', 'worker']) {
        const allowed = perm[role] ?? false;
        await this.db.query(
          `INSERT INTO role_permissions (tenant_id, role, module, action, allowed, updated_at)
           VALUES ($1, $2, $3, $4, $5, NOW())
           ON CONFLICT (tenant_id, role, module, action)
           DO UPDATE SET allowed = $5, updated_at = NOW()`,
          [getCurrentTenantId(), role, perm.module, perm.action, allowed],
        );
      }
    }
    return this.getPermissions();
  }
}
