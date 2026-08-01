import { Module } from '@nestjs/common';
import { AdjustmentsController } from './adjustments.controller';
import { AdjustmentsService } from './adjustments.service';
import { AdjustmentsRepository } from './adjustments.repository';
import { SkusModule } from '../skus/skus.module';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [SkusModule, NotificationsModule],
  controllers: [AdjustmentsController],
  providers: [AdjustmentsService, AdjustmentsRepository],
  exports: [AdjustmentsService],
})
export class AdjustmentsModule {}
