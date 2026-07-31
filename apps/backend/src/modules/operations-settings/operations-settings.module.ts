import { Module } from '@nestjs/common';
import { OperationsSettingsController } from './operations-settings.controller';
import { OperationsSettingsService } from './operations-settings.service';
import { OperationsSettingsRepository } from './operations-settings.repository';

@Module({
  controllers: [OperationsSettingsController],
  providers: [OperationsSettingsService, OperationsSettingsRepository],
  exports: [OperationsSettingsService],
})
export class OperationsSettingsModule {}
