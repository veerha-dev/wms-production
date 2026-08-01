import { Controller, Get, Post, Put, Delete, Patch, Body, Param, Query, HttpCode, HttpStatus, Req } from '@nestjs/common';
import { QcService } from './qc.service';
import { CreateQcDto, UpdateQcDto, QueryQcDto } from './dto';

@Controller('api/v1/qc')
export class QcController {
  constructor(private readonly service: QcService) {}

  @Get('stats')
  async getStats() { return { success: true, data: await this.service.getStats() }; }

  @Get()
  async findAll(@Query() query: QueryQcDto) {
    const result = await this.service.findAll(query);
    return { success: true, data: result.data, meta: result.meta };
  }

  @Get(':id')
  async findOne(@Param('id') id: string) { return { success: true, data: await this.service.findOne(id) }; }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(@Body() dto: CreateQcDto, @Req() req: any) { return { success: true, data: await this.service.create(dto, req.user) }; }

  @Put(':id')
  async update(@Param('id') id: string, @Body() dto: UpdateQcDto) { return { success: true, data: await this.service.update(id, dto) }; }

  @Delete(':id')
  async remove(@Param('id') id: string) { await this.service.remove(id); return { success: true, data: { id } }; }

  @Post(':id/start')
  @HttpCode(HttpStatus.OK)
  async start(@Param('id') id: string) { return { success: true, data: await this.service.updateStatus(id, 'in_progress', { startedAt: new Date() }) }; }

  @Post(':id/pass')
  @HttpCode(HttpStatus.OK)
  async pass(@Param('id') id: string) { return { success: true, data: await this.service.updateStatus(id, 'completed', { result: 'passed', completedAt: new Date() }) }; }

  @Post(':id/fail')
  @HttpCode(HttpStatus.OK)
  async fail(@Param('id') id: string, @Body() body: { notes?: string }, @Req() req: any) { return { success: true, data: await this.service.updateStatus(id, 'completed', { result: 'failed', completedAt: new Date(), notes: body.notes }, req.user) }; }

  @Post(':id/complete')
  @HttpCode(HttpStatus.OK)
  async complete(@Param('id') id: string, @Body() body: { result: string; notes?: string }, @Req() req: any) { return { success: true, data: await this.service.updateStatus(id, 'completed', { result: body.result, completedAt: new Date(), notes: body.notes }, req.user) }; }

  @Post(':id/defects')
  @HttpCode(HttpStatus.OK)
  async addDefect(@Param('id') id: string, @Body() body: any) { return { success: true, data: await this.service.update(id, { defectCount: (body.defectCount || 0) + 1 }) }; }
}
