import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';
import { NotificationsRepository } from './notifications.repository';
import { NotificationActionsService } from './notification-actions.service';
import { NotificationJobsService } from './notification-jobs.service';
import { WebsocketModule } from '../../websocket/websocket.module';

/**
 * The notification engine.
 *
 * - `EmailModule` is @Global, so EmailService needs no import here.
 * - `WebsocketModule` exports InventoryGateway and IS imported — that is how a
 *   notification reaches the `user-{userId}` room live.
 * - The approve/reject delegates (purchase-orders, adjustments, stock-transfers,
 *   cycle-counts) are resolved at call time through ModuleRef instead of being
 *   imported, so instrumenting those modules with NotificationsService later
 *   cannot create a circular module graph.
 * - ScheduleModule.forRoot() is registered here rather than in AppModule, so
 *   the notification cron jobs stay self-contained.
 */
@Module({
  imports: [ScheduleModule.forRoot(), WebsocketModule],
  controllers: [NotificationsController],
  providers: [
    NotificationsService,
    NotificationsRepository,
    NotificationActionsService,
    NotificationJobsService,
  ],
  exports: [NotificationsService, NotificationsRepository],
})
export class NotificationsModule {}
