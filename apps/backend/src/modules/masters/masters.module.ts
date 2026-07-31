import { Module } from '@nestjs/common';
import { MastersController } from './masters.controller';
import { MastersService } from './masters.service';
import { MastersRepository } from './masters.repository';

@Module({
  controllers: [MastersController],
  providers: [MastersService, MastersRepository],
  exports: [MastersService],
})
export class MastersModule {}
