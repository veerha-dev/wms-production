import { Module } from '@nestjs/common';
import { PickWavesController } from './pick-waves.controller';
import { PickWavesService } from './pick-waves.service';

@Module({
  controllers: [PickWavesController],
  providers: [PickWavesService],
  exports: [PickWavesService],
})
export class PickWavesModule {}
