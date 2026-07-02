import { Module } from '@nestjs/common';
import { GrnController } from './grn.controller';
import { GrnService } from './grn.service';
import { GrnRepository } from './grn.repository';
import { InvoicesModule } from '../invoices/invoices.module';
import { PurchaseOrdersModule } from '../purchase-orders/purchase-orders.module';
import { QcModule } from '../qc/qc.module';

@Module({
  imports: [InvoicesModule, PurchaseOrdersModule, QcModule],
  controllers: [GrnController],
  providers: [GrnService, GrnRepository],
  exports: [GrnService],
})
export class GrnModule {}
