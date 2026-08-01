import { Controller, Get, Post, Put, Delete, Patch, Body, Param, Query, HttpCode, HttpStatus, Req } from '@nestjs/common';
import { ShipmentsService } from './shipments.service';
import { CreateShipmentDto, UpdateShipmentDto, QueryShipmentDto } from './dto';

@Controller('api/v1/shipments')
export class ShipmentsController {
  constructor(private readonly service: ShipmentsService) {}

  @Get('stats')
  async getStats() { return { success: true, data: await this.service.getStats() }; }

  @Get()
  async findAll(@Query() query: QueryShipmentDto) {
    const result = await this.service.findAll(query);
    return { success: true, data: result.data, meta: result.meta };
  }

  @Get(':id')
  async findOne(@Param('id') id: string) { return { success: true, data: await this.service.findOne(id) }; }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(@Body() dto: CreateShipmentDto) { return { success: true, data: await this.service.create(dto) }; }

  @Put(':id')
  async update(@Param('id') id: string, @Body() dto: UpdateShipmentDto) { return { success: true, data: await this.service.update(id, dto) }; }

  @Delete(':id')
  async remove(@Param('id') id: string) { await this.service.remove(id); return { success: true, data: { id } }; }

  @Post(':id/dispatch')
  @HttpCode(HttpStatus.OK)
  async dispatch(@Param('id') id: string) { return { success: true, data: await this.service.updateStatus(id, 'dispatched', { dispatchedAt: new Date() }) }; }

  @Post(':id/deliver')
  @HttpCode(HttpStatus.OK)
  async deliver(@Param('id') id: string, @Req() req: any) { return { success: true, data: await this.service.deliver(id, req.user) }; }
}
