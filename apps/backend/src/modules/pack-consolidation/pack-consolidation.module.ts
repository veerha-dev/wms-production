import { Module } from '@nestjs/common';
import { PackConsolidationController } from './pack-consolidation.controller';
import { PackConsolidationService } from './pack-consolidation.service';

@Module({
  controllers: [PackConsolidationController],
  providers: [PackConsolidationService],
  exports: [PackConsolidationService],
})
export class PackConsolidationModule {}
