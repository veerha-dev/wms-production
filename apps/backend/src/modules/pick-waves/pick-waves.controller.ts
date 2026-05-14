import { Body, Controller, Get, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PickWavesService, CreateWaveDto } from './pick-waves.service';

@Controller('api/v1/pick-waves')
@UseGuards(JwtAuthGuard)
export class PickWavesController {
  constructor(private readonly service: PickWavesService) {}

  @Get()
  async findAll(@Query() q: { status?: string; warehouseId?: string }, @Req() req: any) {
    const data = await this.service.findAll(q, req.user);
    return { success: true, data };
  }

  @Get(':id')
  async findOne(@Param('id') id: string) {
    const data = await this.service.findOne(id);
    return { success: true, data };
  }

  @Get(':id/status')
  async getStatus(@Param('id') id: string) {
    const data = await this.service.getStatus(id);
    return { success: true, data };
  }

  @Post()
  async create(@Body() dto: CreateWaveDto, @Req() req: any) {
    const data = await this.service.create(dto, req.user);
    return { success: true, data };
  }

  @Post(':id/attach-pick-lists')
  async attach(@Param('id') id: string, @Body() body: { pickListIds: string[] }) {
    const data = await this.service.attachPickLists(id, body.pickListIds || []);
    return { success: true, data };
  }

  @Post(':id/release')
  async release(@Param('id') id: string) {
    const data = await this.service.release(id);
    return { success: true, data };
  }

  @Post(':id/complete')
  async complete(@Param('id') id: string) {
    const data = await this.service.complete(id);
    return { success: true, data };
  }

  @Post(':id/cancel')
  async cancel(@Param('id') id: string) {
    const data = await this.service.cancel(id);
    return { success: true, data };
  }
}
