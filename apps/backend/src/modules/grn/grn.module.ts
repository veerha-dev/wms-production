import { Module } from '@nestjs/common';
import { GrnController } from './grn.controller';
import { GrnService } from './grn.service';
import { GrnRepository } from './grn.repository';
import { InvoicesModule } from '../invoices/invoices.module';
import { PurchaseOrdersModule } from '../purchase-orders/purchase-orders.module';
import { QcModule } from '../qc/qc.module';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  // NotificationsModule is not @Global — import it to inject NotificationsService.
  imports: [InvoicesModule, PurchaseOrdersModule, QcModule, NotificationsModule],
  controllers: [GrnController],
  providers: [GrnService, GrnRepository],
  exports: [GrnService],
})
export class GrnModule {}
