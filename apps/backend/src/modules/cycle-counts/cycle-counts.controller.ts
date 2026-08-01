import { Controller, Get, Post, Put, Delete, Body, Param, Query, HttpCode, HttpStatus, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CycleCountsService } from './cycle-counts.service';
import { CreateCycleCountDto, UpdateCycleCountDto, QueryCycleCountDto } from './dto';

@Controller('api/v1/cycle-counts')
export class CycleCountsController {
  constructor(private readonly service: CycleCountsService) {}

  @Get('stats')
  async getStats(@Query('warehouseId') warehouseId?: string) {
    return { success: true, data: await this.service.getStats(warehouseId) };
  }

  @Get()
  async findAll(@Query() query: QueryCycleCountDto) {
    const result = await this.service.findAll(query);
    return { success: true, data: result.data, meta: result.meta };
  }

  @Get(':id')
  async findById(@Param('id') id: string) {
    return { success: true, data: await this.service.findById(id) };
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(@Body() dto: CreateCycleCountDto) {
    return { success: true, data: await this.service.create(dto) };
  }

  @Put(':id')
  async update(@Param('id') id: string, @Body() dto: UpdateCycleCountDto) {
    return { success: true, data: await this.service.update(id, dto) };
  }

  @Post(':id/assign')
  @HttpCode(HttpStatus.OK)
  async assign(@Param('id') id: string, @Body() body: { assignedTo: string }) {
    return { success: true, data: await this.service.assign(id, body.assignedTo) };
  }

  @Post(':id/start')
  @HttpCode(HttpStatus.OK)
  async start(@Param('id') id: string) {
    return { success: true, data: await this.service.start(id) };
  }

  @Post(':id/submit')
  @HttpCode(HttpStatus.OK)
  async submit(
    @Param('id') id: string,
    @Body() body: { items: { id: string; physicalQty: number }[] },
    @Req() req: any,
  ) {
    return { success: true, data: await this.service.submit(id, body.items, req?.user) };
  }

  @Post(':id/review')
  @HttpCode(HttpStatus.OK)
  async review(@Param('id') id: string, @Body() body: { items: { id: string; action: string; notes?: string }[] }) {
    return { success: true, data: await this.service.review(id, body.items) };
  }

  @Post(':id/complete')
  @HttpCode(HttpStatus.OK)
  async complete(@Param('id') id: string) {
    return { success: true, data: await this.service.complete(id) };
  }

  @Post(':id/approve')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  async approve(@Param('id') id: string, @Req() req: any) {
    return { success: true, data: await this.service.approve(id, req.user) };
  }

  @Post(':id/reject')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  async reject(@Param('id') id: string, @Req() req: any) {
    return { success: true, data: await this.service.reject(id, req.user) };
  }

  @Post(':id/escalate')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  async escalate(@Param('id') id: string, @Req() req: any, @Body() body: { notes?: string }) {
    return { success: true, data: await this.service.escalate(id, req.user, body?.notes) };
  }

  @Post(':id/cancel')
  @HttpCode(HttpStatus.OK)
  async cancel(@Param('id') id: string) {
    return { success: true, data: await this.service.cancel(id) };
  }

  @Delete(':id')
  async delete(@Param('id') id: string) {
    await this.service.delete(id);
    return { success: true, data: { deleted: true } };
  }
}
