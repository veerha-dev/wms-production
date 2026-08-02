import { Module } from '@nestjs/common';
import { LabelsController } from './labels.controller';
import { LabelsService } from './labels.service';
import { LabelsRepository } from './labels.repository';
import { MastersModule } from '../masters/masters.module';

@Module({
  // barcode_settings is owned by MastersModule; the label endpoints proxy it
  // rather than keeping a second reader of the same table.
  imports: [MastersModule],
  controllers: [LabelsController],
  providers: [LabelsService, LabelsRepository],
  exports: [LabelsService],
})
export class LabelsModule {}
