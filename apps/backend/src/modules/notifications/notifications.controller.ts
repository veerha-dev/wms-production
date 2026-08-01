import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  Req,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { NotificationsService } from './notifications.service';
import { NotificationActionsService } from './notification-actions.service';
import { NotificationsRepository } from './notifications.repository';
import { getCurrentTenantId } from '../common/tenant.context';
import { QueryNotificationDto, NotificationActionDto } from './dto';

/**
 * A user may only ever see their OWN notifications.
 *
 * There is deliberately no `userId` parameter on any route: the recipient is
 * always taken from the verified JWT (`req.user.id`) and the tenant from the
 * request's tenant context. Routing was already resolved at creation time
 * (spec Part 7), so "my rows" is the complete and only access rule here.
 */
@Controller('api/v1/notifications')
export class NotificationsController {
  constructor(
    private readonly service: NotificationsService,
    private readonly actions: NotificationActionsService,
    private readonly repository: NotificationsRepository,
  ) {}

  private scope(req: any): { tenantId: string; userId: string } {
    const userId = req?.user?.id;
    if (!userId) throw new BadRequestException('Authenticated user context is required');
    return { tenantId: getCurrentTenantId(), userId };
  }

  @Get()
  async findAll(@Query() query: QueryNotificationDto, @Req() req: any) {
    const { tenantId, userId } = this.scope(req);
    const result = await this.service.findAll(tenantId, userId, query);
    return { success: true, data: result.data, meta: result.meta };
  }

  @Get('unread-count')
  async unreadCount(@Req() req: any) {
    const { tenantId, userId } = this.scope(req);
    const data = await this.service.unreadCount(tenantId, userId);
    return { success: true, data };
  }

  @Get(':id')
  async findById(@Param('id') id: string, @Req() req: any) {
    const { tenantId, userId } = this.scope(req);
    const data = await this.service.findById(tenantId, userId, id);
    if (!data) throw new NotFoundException('Notification not found');
    return { success: true, data };
  }

  @Post('read-all')
  async markAllRead(@Req() req: any) {
    const { tenantId, userId } = this.scope(req);
    const data = await this.service.markAllRead(tenantId, userId);
    return { success: true, data };
  }

  @Post(':id/read')
  async markRead(@Param('id') id: string, @Req() req: any) {
    const { tenantId, userId } = this.scope(req);
    const data = await this.service.markRead(tenantId, userId, id);
    if (!data) throw new NotFoundException('Notification not found');
    return { success: true, data };
  }

  /**
   * Inline approve/reject from the Approvals tab (spec Part 4). The underlying
   * module's own service performs the work — including its role checks — and
   * only then is action_state stamped.
   */
  @Post(':id/action')
  async action(
    @Param('id') id: string,
    @Body() dto: NotificationActionDto,
    @Req() req: any,
  ) {
    const { tenantId, userId } = this.scope(req);

    const notification = await this.service.findById(tenantId, userId, id);
    if (!notification) throw new NotFoundException('Notification not found');
    if (!notification.requiresAction) {
      throw new BadRequestException('This notification does not require an action');
    }
    if (notification.actionState && notification.actionState !== 'pending') {
      throw new BadRequestException(`This request was already ${notification.actionState}`);
    }

    // Throws 400 with a clear message when nothing owns this entity type.
    const result = await this.actions.execute({
      entityType: notification.entityType,
      entityId: notification.entityId,
      action: dto.action,
      reason: dto.reason,
      user: req.user,
    });

    const state = dto.action === 'approve' ? 'approved' : 'rejected';
    const updated = await this.service.markRead(tenantId, userId, id).catch(() => null);
    await this.repository.setActionState(tenantId, userId, id, state);
    // Everyone else's copy of the same request stops being actionable too.
    await this.repository
      .resolvePeerActionRows(
        tenantId,
        notification.eventType,
        notification.entityType,
        notification.entityId,
        state,
      )
      .catch(() => 0);

    return {
      success: true,
      data: {
        id,
        actionState: state,
        isRead: true,
        entityType: notification.entityType,
        entityId: notification.entityId,
        result: result ?? null,
        updatedAt: updated?.updatedAt ?? null,
      },
    };
  }
}
