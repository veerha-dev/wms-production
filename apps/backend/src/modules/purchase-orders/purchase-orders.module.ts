import { Module } from '@nestjs/common';
import { PurchaseOrdersController } from './purchase-orders.controller';
import { PurchaseOrdersService } from './purchase-orders.service';
import { PurchaseOrdersRepository } from './purchase-orders.repository';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  // NotificationsModule is not @Global — it must be imported to inject
  // NotificationsService. The reverse direction (notifications → purchase
  // orders, for the inline approve/reject inbox) goes through ModuleRef, so
  // this import does not create a circular module graph.
  imports: [NotificationsModule],
  controllers: [PurchaseOrdersController],
  providers: [PurchaseOrdersService, PurchaseOrdersRepository],
  exports: [PurchaseOrdersService, PurchaseOrdersRepository],
})
export class PurchaseOrdersModule {}
