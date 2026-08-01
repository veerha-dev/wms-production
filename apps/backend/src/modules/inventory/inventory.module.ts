import { Module } from '@nestjs/common';
import { InventoryController } from './inventory.controller';
import { InventoryService } from './inventory.service';
import { InventoryRepository } from './inventory.repository';
import { StockAlertsService } from './stock-alerts.service';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [NotificationsModule],
  controllers: [InventoryController],
  providers: [InventoryService, InventoryRepository, StockAlertsService],
  // StockAlertsService is exported so every module that writes stock_levels
  // (adjustments, cycle counts, transfers) raises threshold alerts the same way.
  exports: [InventoryService, InventoryRepository, StockAlertsService],
})
export class InventoryModule {}
