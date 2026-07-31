import { Injectable, UnauthorizedException, ConflictException, BadRequestException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import { AuthRepository } from './auth.repository';
import { LoginDto } from './dto/login.dto';
import { SignupDto } from './dto/signup.dto';
import { EmailService } from '../email/email.service';
import { DatabaseService } from '../../database/database.service';

@Injectable()
export class AuthService {
  constructor(
    private repository: AuthRepository,
    private jwtService: JwtService,
    private configService: ConfigService,
    private email: EmailService,
    private db: DatabaseService,
  ) {}

  async signup(dto: SignupDto) {
    const existing = await this.repository.findUserByEmail(dto.email);
    if (existing) {
      throw new ConflictException('Email already registered');
    }

    const passwordHash = await bcrypt.hash(dto.password, 12);

    // Self-signup provisions its own tenant. The signing-up user is the admin
    // of that new tenant only — never of a pre-existing/shared one.
    const { user } = await this.repository.createTenantWithAdmin({
      companyName: dto.companyName,
      email: dto.email,
      fullName: dto.fullName,
      passwordHash,
    });

    const tokens = await this.generateTokens({
      sub: user.id,
      email: user.email,
      role: user.role,
      tenantId: user.tenant_id,
      warehouseId: user.warehouse_id ?? null,
      tokenVersion: user.token_version ?? 0,
    });

    // Fire and forget welcome email — onboarding wizard takes over on first login
    this.email
      .sendWelcomeEmail({
        to: user.email,
        fullName: user.full_name,
      })
      .catch(() => undefined);

    return {
      ...tokens,
      user: {
        id: user.id,
        email: user.email,
        fullName: user.full_name,
        role: user.role,
        tenantId: user.tenant_id,
        warehouseId: user.warehouse_id ?? null,
        phone: user.phone ?? null,
        isActive: true,
        mustChangePassword: user.must_change_password ?? false,
      },
    };
  }

  async login(dto: LoginDto) {
    const user = await this.repository.findUserByEmail(dto.email);
    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }

    if (!user.is_active) {
      throw new UnauthorizedException('Account is deactivated');
    }

    if (!user.password_hash) {
      throw new UnauthorizedException('Account not set up for password login');
    }

    const isPasswordValid = await bcrypt.compare(dto.password, user.password_hash);
    if (!isPasswordValid) {
      throw new UnauthorizedException('Invalid credentials');
    }

    await this.repository.updateLastLogin(user.id);

    const tokens = await this.generateTokens({
      sub: user.id,
      email: user.email,
      role: user.role,
      tenantId: user.tenant_id,
      warehouseId: user.warehouse_id ?? null,
      tokenVersion: user.token_version ?? 0,
    });

    return {
      ...tokens,
      user: {
        id: user.id,
        email: user.email,
        fullName: user.full_name,
        role: user.role,
        tenantId: user.tenant_id,
        warehouseId: user.warehouse_id ?? null,
        phone: user.phone ?? null,
        isActive: user.is_active,
        mustChangePassword: user.must_change_password ?? false,
      },
    };
  }

  async getProfile(userId: string) {
    const user = await this.repository.findUserById(userId);
    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    return {
      id: user.id,
      email: user.email,
      fullName: user.full_name,
      role: user.role,
      tenantId: user.tenant_id,
      warehouseId: user.warehouse_id ?? null,
      phone: user.phone ?? null,
      isActive: user.is_active,
      mustChangePassword: user.must_change_password ?? false,
      lastLogin: user.last_login,
      createdAt: user.created_at,
    };
  }

  async refreshToken(refreshToken: string) {
    try {
      const payload = this.jwtService.verify(refreshToken, {
        secret: this.configService.getOrThrow<string>('JWT_REFRESH_SECRET'),
      });

      const user = await this.repository.findUserById(payload.sub);
      if (!user || !user.is_active) {
        throw new UnauthorizedException('Invalid refresh token');
      }
      // If token_version was bumped after this refresh token was issued, reject it.
      const issuedVersion = payload.tokenVersion ?? 0;
      if ((user.token_version ?? 0) > issuedVersion) {
        throw new UnauthorizedException('Session terminated. Please log in again.');
      }

      return this.generateTokens({
        sub: user.id,
        email: user.email,
        role: user.role,
        tenantId: user.tenant_id,
        warehouseId: user.warehouse_id ?? null,
        tokenVersion: user.token_version ?? 0,
      });
    } catch {
      throw new UnauthorizedException('Invalid refresh token');
    }
  }

  async changePassword(userId: string, dto: { currentPassword: string; newPassword: string }) {
    const user = await this.repository.findUserWithHashById(userId);
    if (!user) throw new UnauthorizedException('User not found');

    if (!user.password_hash) throw new BadRequestException('Account does not use password login');

    const valid = await bcrypt.compare(dto.currentPassword, user.password_hash);
    if (!valid) throw new UnauthorizedException('Current password is incorrect');

    // Enforce tenant password policy
    const fullUser = await this.repository.findUserById(userId);
    const tid = fullUser?.tenant_id;
    if (tid) {
      const result = await this.policyValidator(tid, dto.newPassword);
      if (!result.ok) {
        throw new BadRequestException(`Password must include: ${result.problems.join(', ')}`);
      }
    } else if (dto.newPassword.length < 8) {
      throw new BadRequestException('New password must be at least 8 characters');
    }

    const hash = await bcrypt.hash(dto.newPassword, 12);
    await this.repository.updatePasswordHash(userId, hash);
    await this.repository.bumpTokenVersion(userId);
    return { message: 'Password updated successfully' };
  }

  /**
   * Inline policy validator — duplicated logic from SettingsService.validatePasswordAgainstPolicy
   * to avoid a circular AuthModule ⇄ SettingsModule dependency. Reads the policy directly via the
   * shared DatabaseService.
   */
  private async policyValidator(tenantId: string, password: string) {
    const res = await this.db.query(
      `SELECT password_min_length, password_require_upper, password_require_lower,
              password_require_digit, password_require_special
         FROM tenant_security_settings WHERE tenant_id = $1`,
      [tenantId],
    );
    const p = res.rows[0] || {
      password_min_length: 8,
      password_require_upper: true,
      password_require_lower: true,
      password_require_digit: true,
      password_require_special: true,
    };
    const problems: string[] = [];
    if (password.length < p.password_min_length) problems.push(`min ${p.password_min_length} chars`);
    if (p.password_require_upper && !/[A-Z]/.test(password)) problems.push('1 uppercase');
    if (p.password_require_lower && !/[a-z]/.test(password)) problems.push('1 lowercase');
    if (p.password_require_digit && !/\d/.test(password)) problems.push('1 digit');
    if (p.password_require_special && !/[^A-Za-z0-9]/.test(password)) problems.push('1 special character');
    return { ok: problems.length === 0, problems };
  }

  private async generateTokens(payload: { sub: string; email: string; role: string; tenantId: string; warehouseId?: string | null; tokenVersion?: number }) {
    const [accessToken, refreshToken] = await Promise.all([
      this.jwtService.signAsync(payload, {
        secret: this.configService.getOrThrow<string>('JWT_SECRET'),
        expiresIn: '24h',
      }),
      this.jwtService.signAsync(payload, {
        secret: this.configService.getOrThrow<string>('JWT_REFRESH_SECRET'),
        expiresIn: '7d',
      }),
    ]);

    return { accessToken, refreshToken };
  }
}
