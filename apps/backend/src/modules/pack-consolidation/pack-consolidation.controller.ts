import { Body, Controller, Get, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PackConsolidationService } from './pack-consolidation.service';

@Controller('api/v1/pack-consolidations')
@UseGuards(JwtAuthGuard)
export class PackConsolidationController {
  constructor(private readonly service: PackConsolidationService) {}

  @Get()
  async findAll(@Query() query: { status?: string; warehouseId?: string }, @Req() req: any) {
    const data = await this.service.findAll(query, req.user);
    return { success: true, data };
  }

  @Get(':id')
  async findOne(@Param('id') id: string) {
    const data = await this.service.findOne(id);
    return { success: true, data };
  }

  @Post()
  async create(@Body() body: { pickListId: string; soId?: string; warehouseId?: string; totalSubPicks: number }) {
    const data = await this.service.createForPickList(body);
    return { success: true, data };
  }

  @Post(':id/sub-pick-complete')
  async subPickComplete(@Param('id') id: string) {
    const data = await this.service.recordSubPickComplete(id);
    return { success: true, data };
  }

  @Post(':id/acknowledge')
  async acknowledge(@Param('id') id: string, @Req() req: any) {
    const data = await this.service.acknowledge(id, req.user);
    return { success: true, data };
  }

  @Post(':id/mark-packed')
  async markPacked(@Param('id') id: string) {
    const data = await this.service.markPacked(id);
    return { success: true, data };
  }
}
