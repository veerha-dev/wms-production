import { Module } from '@nestjs/common';
import { StockTransfersController } from './stock-transfers.controller';
import { StockTransfersService } from './stock-transfers.service';
import { StockTransfersRepository } from './stock-transfers.repository';
import { NotificationsModule } from '../notifications/notifications.module';
import { InventoryModule } from '../inventory/inventory.module';

@Module({
  imports: [NotificationsModule, InventoryModule],
  controllers: [StockTransfersController],
  providers: [StockTransfersService, StockTransfersRepository],
  exports: [StockTransfersService],
})
export class StockTransfersModule {}
