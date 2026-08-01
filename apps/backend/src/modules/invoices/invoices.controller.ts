import { Controller, Get, Post, Put, Patch, Delete, Body, Param, Query } from '@nestjs/common';
import { InvoicesService } from './invoices.service';
import { CreateInvoiceDto, UpdateInvoiceDto, QueryInvoiceDto } from './dto';
import { Roles } from '../auth/decorators/roles.decorator';

/**
 * Invoicing is a finance surface: a warehouse worker had no business creating,
 * editing, voiding or even listing invoices, yet not a single route carried a
 * role. Gated at the controller so every current and future route inherits it
 * (the global RolesGuard reads class metadata when the handler has none).
 *
 * This does NOT affect the two server-side auto-invoice paths — GrnService
 * (`invoices.createFromGrn` on GRN completion) and ShipmentsService
 * (`invoices.createFromShipment` on dispatch) call InvoicesService directly, so
 * they never pass through this controller or its guard.
 */
@Controller('api/v1/invoices')
@Roles('admin', 'manager')
export class InvoicesController {
  constructor(private service: InvoicesService) {}

  @Get('stats')
  async getStats(@Query('warehouseId') warehouseId?: string) {
    const data = await this.service.getStats(warehouseId);
    return { success: true, data };
  }

  @Get()
  async findAll(@Query() query: QueryInvoiceDto) {
    const result = await this.service.findAll(query);
    return { success: true, data: result.data, meta: result.meta };
  }

  @Get(':id')
  async findById(@Param('id') id: string) {
    const data = await this.service.findById(id);
    return { success: true, data };
  }

  @Post()
  async create(@Body() dto: CreateInvoiceDto) {
    const data = await this.service.create(dto);
    return { success: true, data };
  }

  @Post('from-grn/:grnId')
  async createFromGrn(@Param('grnId') grnId: string) {
    const { invoice, created } = await this.service.createFromGrn(grnId);
    return { success: true, data: invoice, meta: { created } };
  }

  @Post('from-shipment/:shipmentId')
  async createFromShipment(@Param('shipmentId') shipmentId: string) {
    const { invoice, created } = await this.service.createFromShipment(shipmentId);
    return { success: true, data: invoice, meta: { created } };
  }

  @Post('service')
  async createServiceInvoice(@Body() body: any) {
    const data = await this.service.createServiceInvoice(body);
    return { success: true, data };
  }

  @Put(':id')
  async update(@Param('id') id: string, @Body() dto: UpdateInvoiceDto) {
    const data = await this.service.update(id, dto);
    return { success: true, data };
  }

  @Patch(':id/status')
  async updateStatus(@Param('id') id: string, @Body() body: { status: string; paidAmount?: number }) {
    const data = await this.service.updateStatus(id, body.status, body.paidAmount);
    return { success: true, data };
  }

  @Delete(':id')
  async delete(@Param('id') id: string) {
    await this.service.delete(id);
    return { success: true, data: { deleted: true } };
  }
}
