import { Module } from '@nestjs/common';
import { PackingController } from './packing.controller';
import { PackingService } from './packing.service';
import { PackingRepository } from './packing.repository';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [NotificationsModule],
  controllers: [PackingController],
  providers: [PackingService, PackingRepository],
  exports: [PackingService],
})
export class PackingModule {}
