import { Module } from '@nestjs/common';
import { SkusController } from './skus.controller';
import { SkusService } from './skus.service';
import { SkusRepository } from './skus.repository';
import { SkuBarcodeService } from './sku-barcode.service';
import { MastersModule } from '../masters/masters.module';

@Module({
  // MastersModule is the single owner of barcode_settings; barcode generation
  // reads sku_barcode_source through it rather than re-querying the table.
  imports: [MastersModule],
  controllers: [SkusController],
  providers: [SkusService, SkusRepository, SkuBarcodeService],
  exports: [SkusService, SkusRepository, SkuBarcodeService],
})
export class SkusModule {}
