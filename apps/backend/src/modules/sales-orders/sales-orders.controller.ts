import { Controller, Get, Post, Put, Delete, Patch, Body, Param, Query, HttpCode, HttpStatus, Req, UseGuards } from '@nestjs/common';
import { SalesOrdersService } from './sales-orders.service';
import { CreateSalesOrderDto, UpdateSalesOrderDto, QuerySalesOrderDto } from './dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Roles } from '../auth/decorators/roles.decorator';

/**
 * Every route is behind the global JwtAuthGuard, and the global RolesGuard
 * enforces the @Roles metadata below.
 *
 * The controller previously carried NO @Roles at all, so any authenticated
 * user — including a worker — could create, confirm or cancel sales orders.
 * Workers execute warehouse tasks and have no business on order screens
 * (see ROLE_MODULE_DENYLIST on the client), so the controller-level @Roles
 * keeps both reads and state transitions to admin + manager.
 */
@Controller('api/v1/sales-orders')
@Roles('admin', 'manager')
export class SalesOrdersController {
  constructor(private readonly service: SalesOrdersService) {}

  @Get('stats')
  async getStats() { return { success: true, data: await this.service.getStats() }; }

  @Get()
  @UseGuards(JwtAuthGuard)
  async findAll(@Query() query: QuerySalesOrderDto, @Req() req: any) {
    const result = await this.service.findAll(query, req.user);
    return { success: true, data: result.data, meta: result.meta };
  }

  @Get(':id')
  async findOne(@Param('id') id: string) { return { success: true, data: await this.service.findOne(id) }; }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(@Body() dto: CreateSalesOrderDto) { return { success: true, data: await this.service.create(dto) }; }

  @Put(':id')
  async update(@Param('id') id: string, @Body() dto: UpdateSalesOrderDto) { return { success: true, data: await this.service.update(id, dto) }; }

  @Delete(':id')
  async remove(@Param('id') id: string) { await this.service.remove(id); return { success: true, data: { id } }; }

  @Post(':id/confirm')
  @HttpCode(HttpStatus.OK)
  async confirm(@Param('id') id: string) { return { success: true, data: await this.service.updateStatus(id, 'confirmed', { confirmedAt: new Date() }) }; }

  @Post(':id/cancel')
  @HttpCode(HttpStatus.OK)
  async cancel(@Param('id') id: string) { return { success: true, data: await this.service.updateStatus(id, 'cancelled') }; }
}
