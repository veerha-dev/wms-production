import { Controller, Get, Query, Req, BadRequestException, ForbiddenException } from '@nestjs/common';
import { DashboardService } from './dashboard.service';

@Controller('api/v1/dashboard')
export class DashboardController {
  constructor(private service: DashboardService) {}

  /**
   * A manager's own warehouse is on their JWT, so requiring the client to pass
   * it back was redundant — and the endpoint 400'd whenever it was omitted.
   * It now defaults to `req.user.warehouseId`, and only 400s when neither a
   * query param nor a warehouse on the token exists (e.g. an admin with no
   * warehouse assignment who did not name one).
   *
   * Scoping is enforced here too: a manager passing a *different* warehouse's
   * id used to receive that warehouse's full stats — headcount, stock, orders,
   * shipments — a cross-warehouse data leak. Managers are now pinned to their
   * own warehouse; admins remain free to inspect any of them.
   */
  @Get('manager-stats')
  async getManagerStats(@Req() req: any, @Query('warehouseId') warehouseId?: string) {
    const user = req?.user;
    const ownWarehouseId: string | undefined = user?.warehouseId ?? undefined;

    if (user?.role === 'manager') {
      if (!ownWarehouseId) {
        throw new BadRequestException('No warehouse is assigned to this manager');
      }
      if (warehouseId && warehouseId !== ownWarehouseId) {
        throw new ForbiddenException('Manager can only view stats for their assigned warehouse');
      }
      warehouseId = ownWarehouseId;
    }

    const resolved = warehouseId || ownWarehouseId;
    if (!resolved) throw new BadRequestException('warehouseId is required');

    const data = await this.service.getManagerStats(resolved);
    return { success: true, data };
  }

  @Get('stats')
  async getStats(@Query('warehouseId') warehouseId?: string) {
    const data = await this.service.getStats(warehouseId);
    return { success: true, data };
  }

  @Get('inventory-overview')
  async getInventoryOverview() {
    const data = await this.service.getInventoryOverview();
    return { success: true, data };
  }

  @Get('orders-summary')
  async getOrdersSummary() {
    const data = await this.service.getOrdersSummary();
    return { success: true, data };
  }

  @Get('realtime')
  async getRealtime() {
    const data = await this.service.getRealtimeData();
    return { success: true, data };
  }

  @Get('trend')
  async getTrend(@Query('period') period?: string) {
    const data = await this.service.getTrendData(period || '7d');
    return { success: true, data };
  }
}
