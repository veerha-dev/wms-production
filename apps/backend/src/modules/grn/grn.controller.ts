import { Controller, Get, Post, Put, Delete, Patch, Body, Param, Query, HttpCode, HttpStatus, Req, UseGuards } from '@nestjs/common';
import { GrnService } from './grn.service';
import { CreateGrnDto, UpdateGrnDto, QueryGrnDto } from './dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RequirePermission } from '../auth/decorators/require-permission.decorator';

/**
 * Gated on the "GRN" module of the Permissions Matrix — writes only.
 *
 * Deliberately NOT guarded: the reads, and POST :id/complete. Closing a receipt
 * is dock-floor work that a warehouse user may be doing mid-shift, and the
 * default seed has worker GRN=false for every action; a mis-toggled checkbox
 * must not strand a half-received delivery.
 */
@Controller('api/v1/grn')
export class GrnController {
  constructor(private readonly service: GrnService) {}

  @Get('stats')
  async getStats() { return { success: true, data: await this.service.getStats() }; }

  @Get()
  @UseGuards(JwtAuthGuard)
  async findAll(@Query() query: QueryGrnDto, @Req() req: any) {
    const result = await this.service.findAll(query, req.user);
    return { success: true, data: result.data, meta: result.meta };
  }

  @Get(':id')
  async findOne(@Param('id') id: string) { return { success: true, data: await this.service.findOne(id) }; }

  @Post()
  @RequirePermission('GRN', 'create')
  @HttpCode(HttpStatus.CREATED)
  async create(@Body() dto: CreateGrnDto, @Req() req: any) { return { success: true, data: await this.service.create(dto, req.user) }; }

  @Put(':id')
  @RequirePermission('GRN', 'edit')
  async update(@Param('id') id: string, @Body() dto: UpdateGrnDto) { return { success: true, data: await this.service.update(id, dto) }; }

  @Delete(':id')
  @RequirePermission('GRN', 'delete')
  async remove(@Param('id') id: string) { await this.service.remove(id); return { success: true, data: { id } }; }

  @Put(':id/items/:itemId')
  @RequirePermission('GRN', 'edit')
  async updateItem(
    @Param('id') id: string,
    @Param('itemId') itemId: string,
    @Body() dto: any,
  ) {
    return { success: true, data: await this.service.updateItem(id, itemId, dto) };
  }

  @Post(':id/complete')
  @HttpCode(HttpStatus.OK)
  async complete(@Param('id') id: string, @Req() req: any) { return { success: true, data: await this.service.updateStatus(id, 'completed', { receivedDate: new Date() }, req.user) }; }
}
