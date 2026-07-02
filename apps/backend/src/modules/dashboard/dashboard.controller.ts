import { Controller, Get, Query, BadRequestException } from '@nestjs/common';
import { DashboardService } from './dashboard.service';

@Controller('api/v1/dashboard')
export class DashboardController {
  constructor(private service: DashboardService) {}

  @Get('manager-stats')
  async getManagerStats(@Query('warehouseId') warehouseId?: string) {
    if (!warehouseId) throw new BadRequestException('warehouseId is required');
    const data = await this.service.getManagerStats(warehouseId);
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
