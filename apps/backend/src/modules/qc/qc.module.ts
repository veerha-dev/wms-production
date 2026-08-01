import { Module } from '@nestjs/common';
import { QcController } from './qc.controller';
import { QcService } from './qc.service';
import { QcRepository } from './qc.repository';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  // NotificationsModule is not @Global — import it to inject NotificationsService.
  imports: [NotificationsModule],
  controllers: [QcController],
  providers: [QcService, QcRepository],
  exports: [QcService],
})
export class QcModule {}
