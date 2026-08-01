import { Controller, Get, Post, Put, Delete, Body, Param, Query, HttpCode, HttpStatus, Req, UseGuards } from '@nestjs/common';
import { StockTransfersService } from './stock-transfers.service';
import { CreateStockTransferDto, UpdateStockTransferDto, QueryStockTransferDto } from './dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@Controller('api/v1/stock-transfers')
export class StockTransfersController {
  constructor(private readonly service: StockTransfersService) {}

  @Get('stats')
  @UseGuards(JwtAuthGuard)
  async getStats(@Query('warehouseId') warehouseId?: string, @Req() req?: any) {
    return { success: true, data: await this.service.getStats(warehouseId, req?.user) };
  }

  @Get()
  @UseGuards(JwtAuthGuard)
  async findAll(@Query() query: QueryStockTransferDto, @Req() req: any) {
    const result = await this.service.findAll(query, req.user);
    return { success: true, data: result.data, meta: result.meta };
  }

  @Get(':id')
  async findById(@Param('id') id: string) {
    return { success: true, data: await this.service.findById(id) };
  }

  @Post()
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.CREATED)
  async create(@Body() dto: CreateStockTransferDto, @Req() req: any) {
    return { success: true, data: await this.service.create(dto, req.user) };
  }

  @Put(':id')
  async update(@Param('id') id: string, @Body() dto: UpdateStockTransferDto) {
    return { success: true, data: await this.service.update(id, dto) };
  }

  @Post(':id/approve')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  async approve(@Param('id') id: string, @Req() req: any) {
    return { success: true, data: await this.service.approve(id, req.user) };
  }

  @Post(':id/start-transit')
  @HttpCode(HttpStatus.OK)
  async startTransit(@Param('id') id: string) {
    return { success: true, data: await this.service.startTransit(id) };
  }

  @Post(':id/complete')
  @HttpCode(HttpStatus.OK)
  async complete(@Param('id') id: string, @Req() req: any) {
    return { success: true, data: await this.service.complete(id, req?.user) };
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
