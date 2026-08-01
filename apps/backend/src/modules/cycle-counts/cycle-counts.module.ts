import { Module } from '@nestjs/common';
import { CycleCountsController } from './cycle-counts.controller';
import { CycleCountsService } from './cycle-counts.service';
import { CycleCountsRepository } from './cycle-counts.repository';
import { NotificationsModule } from '../notifications/notifications.module';
import { InventoryModule } from '../inventory/inventory.module';

@Module({
  imports: [NotificationsModule, InventoryModule],
  controllers: [CycleCountsController],
  providers: [CycleCountsService, CycleCountsRepository],
  exports: [CycleCountsService],
})
export class CycleCountsModule {}
