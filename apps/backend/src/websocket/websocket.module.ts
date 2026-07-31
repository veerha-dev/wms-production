import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { InventoryGateway } from './inventory.gateway';

@Module({
  imports: [JwtModule.register({})],
  providers: [InventoryGateway],
  exports: [InventoryGateway],
})
export class WebsocketModule {}
