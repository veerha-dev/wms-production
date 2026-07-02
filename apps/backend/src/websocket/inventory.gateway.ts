import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
  ConnectedSocket,
  MessageBody,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Logger } from '@nestjs/common';

@WebSocketGateway({
  cors: {
    origin: (process.env.CORS_ORIGIN || 'http://localhost:8080,http://localhost:8090')
      .split(',')
      .map((o) => o.trim())
      .filter(Boolean),
    credentials: true,
  },
  namespace: '/inventory',
})
export class InventoryGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  private logger: Logger = new Logger('InventoryGateway');

  handleConnection(client: Socket) {
    this.logger.log(`Client connected: ${client.id}`);
    client.emit('connected', { message: 'Connected to inventory updates' });
  }

  handleDisconnect(client: Socket) {
    this.logger.log(`Client disconnected: ${client.id}`);
  }

  // Subscribe to inventory updates for a specific tenant
  @SubscribeMessage('subscribe-inventory')
  handleSubscribeInventory(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { tenantId: string },
  ) {
    client.join(`tenant-${data.tenantId}`);
    this.logger.log(`Client ${client.id} subscribed to inventory updates for tenant ${data.tenantId}`);
    return { success: true, message: 'Subscribed to inventory updates' };
  }

  // Subscribe to stock level updates
  @SubscribeMessage('subscribe-stock-levels')
  handleSubscribeStockLevels(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { tenantId: string },
  ) {
    client.join(`stock-levels-${data.tenantId}`);
    this.logger.log(`Client ${client.id} subscribed to stock level updates for tenant ${data.tenantId}`);
    return { success: true, message: 'Subscribed to stock level updates' };
  }

  // Emit inventory update to all subscribed clients
  emitInventoryUpdate(tenantId: string, data: any) {
    this.server.to(`tenant-${tenantId}`).emit('inventory-update', data);
  }

  // Emit a tenant audit event for live dashboard activity feed.
  emitAudit(tenantId: string, data: any) {
    this.server.to(`tenant-${tenantId}`).emit('audit.created', data);
  }

  // Emit stock level update to all subscribed clients
  emitStockLevelUpdate(tenantId: string, data: any) {
    this.server.to(`stock-levels-${data.tenantId}`).emit('stock-level-update', data);
  }

  // Emit movement update
  emitMovementUpdate(tenantId: string, data: any) {
    this.server.to(`tenant-${tenantId}`).emit('movement-update', data);
  }

  // Emit damaged item update
  emitDamagedItemUpdate(tenantId: string, data: any) {
    this.server.to(`tenant-${tenantId}`).emit('damaged-item-update', data);
  }

  // Emit adjustment update
  emitAdjustmentUpdate(tenantId: string, data: any) {
    this.server.to(`tenant-${tenantId}`).emit('adjustment-update', data);
  }
}
