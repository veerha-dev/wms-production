import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
  ConnectedSocket,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';

@WebSocketGateway({
  cors: {
    origin: (origin: string, callback: (err: Error | null, allow?: boolean) => void) => {
      const corsOrigins = (process.env.CORS_ORIGIN || 'http://localhost:8080,http://localhost:8090')
        .split(',')
        .map((o) => o.trim())
        .filter(Boolean);
      if (!origin || corsOrigins.includes('*') || corsOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error('Not allowed by CORS'));
      }
    },
    credentials: true,
  },
  namespace: '/inventory',
})
export class InventoryGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  private logger: Logger = new Logger('InventoryGateway');

  constructor(
    private readonly configService: ConfigService,
    private readonly jwtService: JwtService,
  ) {}

  handleConnection(client: Socket) {
    try {
      const token = this.extractToken(client);
      if (!token) {
        throw new Error('Missing auth token');
      }

      const secret = this.configService.getOrThrow<string>('JWT_SECRET');
      const payload = this.jwtService.verify(token, { secret }) as any;

      const tenantId = payload?.tenantId;
      const userId = payload?.sub;
      if (!tenantId || !userId) {
        throw new Error('Token has no tenant/user claims');
      }

      // Identity lives on the socket — clients can never choose their tenant.
      client.data.tenantId = tenantId;
      client.data.userId = userId;

      // Auto-join tenant and user rooms server-side.
      client.join(`tenant-${tenantId}`);
      client.join(`user-${userId}`);

      this.logger.log(`Client connected: ${client.id} (tenant ${tenantId})`);
      client.emit('connected', { message: 'Connected to inventory updates' });
    } catch (err) {
      this.logger.warn(`Rejected unauthenticated socket ${client.id}: ${(err as Error).message}`);
      client.disconnect(true);
    }
  }

  private extractToken(client: Socket): string | undefined {
    const authToken = client.handshake?.auth?.token;
    if (typeof authToken === 'string' && authToken) {
      return authToken;
    }
    const header = client.handshake?.headers?.authorization;
    if (typeof header === 'string' && header.startsWith('Bearer ')) {
      return header.substring(7);
    }
    return undefined;
  }

  handleDisconnect(client: Socket) {
    this.logger.log(`Client disconnected: ${client.id}`);
  }

  // Subscribe to inventory updates for the authenticated tenant.
  // Client-supplied tenant ids are ignored — the tenant comes from the
  // verified JWT stored on the socket at connection time.
  @SubscribeMessage('subscribe-inventory')
  handleSubscribeInventory(@ConnectedSocket() client: Socket) {
    const tenantId = client.data?.tenantId;
    if (!tenantId) {
      return { success: false, message: 'Not authenticated' };
    }
    client.join(`tenant-${tenantId}`);
    this.logger.log(`Client ${client.id} subscribed to inventory updates for tenant ${tenantId}`);
    return { success: true, message: 'Subscribed to inventory updates' };
  }

  // Subscribe to stock level updates for the authenticated tenant.
  @SubscribeMessage('subscribe-stock-levels')
  handleSubscribeStockLevels(@ConnectedSocket() client: Socket) {
    const tenantId = client.data?.tenantId;
    if (!tenantId) {
      return { success: false, message: 'Not authenticated' };
    }
    client.join(`stock-levels-${tenantId}`);
    this.logger.log(`Client ${client.id} subscribed to stock level updates for tenant ${tenantId}`);
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
    this.server.to(`stock-levels-${tenantId}`).emit('stock-level-update', data);
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
