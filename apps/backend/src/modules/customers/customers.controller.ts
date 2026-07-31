import {
  Controller,
  Get,
  Post,
  Put,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  Req,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { CustomersService } from './customers.service';
import { Roles } from '../auth/decorators/roles.decorator';
import {
  CreateCustomerDto,
  UpdateCustomerDto,
  QueryCustomerDto,
  SearchCustomerDto,
  CreditCheckDto,
  CustomerAddressDto,
  ImportCustomersDto,
} from './dto';

/**
 * Every route is behind the global JwtAuthGuard.
 *
 * Spec §7: workers have no access to customers at all, so the controller-level
 * @Roles keeps reads to admin + manager. Method-level @Roles overrides it
 * (RolesGuard reads handler metadata first), which is how DELETE and the
 * status change stay admin-only.
 */
@Controller('api/v1/customers')
@Roles('admin', 'manager')
export class CustomersController {
  constructor(private readonly service: CustomersService) {}

  // --- static paths first: Nest matches routes in declaration order, so these
  // must precede ':id' or 'stats' would be read as a customer id.

  @Get('stats')
  async getStats() {
    return { success: true, data: await this.service.getStats() };
  }

  @Get('search')
  async search(@Query() query: SearchCustomerDto) {
    const term = query.q ?? query.search;
    const data = await this.service.search(term, query.limit ?? 10);
    return { success: true, data, meta: { count: data.length, query: term ?? null } };
  }

  @Get('export')
  async exportAll(@Query() query: QueryCustomerDto) {
    const data = await this.service.exportAll(query);
    return { success: true, data, meta: { total: data.length } };
  }

  @Post('import')
  @Roles('admin', 'manager')
  @HttpCode(HttpStatus.OK)
  async importCustomers(@Body() dto: ImportCustomersDto, @Req() req: any) {
    const result = await this.service.importCustomers(dto, req.user);
    return { success: true, data: result };
  }

  @Get()
  async findAll(@Query() query: QueryCustomerDto) {
    const result = await this.service.findAll(query);
    return { success: true, data: result.data, meta: result.meta };
  }

  @Post()
  @Roles('admin', 'manager')
  @HttpCode(HttpStatus.CREATED)
  async create(@Body() dto: CreateCustomerDto, @Req() req: any) {
    return { success: true, data: await this.service.create(dto, req.user) };
  }

  // --- per-customer sub-resources (before ':id' is fine; Nest distinguishes
  // by path depth, but keeping them grouped here keeps the surface readable).

  @Get(':id/addresses')
  async listAddresses(@Param('id') id: string) {
    const data = await this.service.listAddresses(id);
    return { success: true, data, meta: { total: data.length } };
  }

  @Post(':id/addresses')
  @Roles('admin', 'manager')
  @HttpCode(HttpStatus.CREATED)
  async createAddress(@Param('id') id: string, @Body() dto: CustomerAddressDto) {
    return { success: true, data: await this.service.createAddress(id, dto) };
  }

  @Put(':id/addresses/:addressId')
  @Roles('admin', 'manager')
  async updateAddress(
    @Param('id') id: string,
    @Param('addressId') addressId: string,
    @Body() dto: CustomerAddressDto,
  ) {
    return { success: true, data: await this.service.updateAddress(id, addressId, dto) };
  }

  @Delete(':id/addresses/:addressId')
  @Roles('admin', 'manager')
  async removeAddress(@Param('id') id: string, @Param('addressId') addressId: string) {
    return { success: true, data: await this.service.removeAddress(id, addressId) };
  }

  @Get(':id/orders')
  async getOrders(@Param('id') id: string, @Query('limit') limit?: string, @Query('offset') offset?: string) {
    const result = await this.service.getOrders(id, Number(limit) || 100, Number(offset) || 0);
    return { success: true, data: result.data, meta: result.meta };
  }

  @Get(':id/invoices')
  async getInvoices(@Param('id') id: string, @Query('limit') limit?: string, @Query('offset') offset?: string) {
    const result = await this.service.getInvoices(id, Number(limit) || 100, Number(offset) || 0);
    return { success: true, data: result.data, meta: result.meta };
  }

  @Get(':id/credit-check')
  async creditCheck(@Param('id') id: string, @Query() query: CreditCheckDto) {
    const orderValue = query.orderValue ?? query.order_value ?? 0;
    return { success: true, data: await this.service.creditCheck(id, Number(orderValue) || 0) };
  }

  @Get(':id')
  async findOne(@Param('id') id: string) {
    return { success: true, data: await this.service.findOne(id) };
  }

  @Put(':id')
  @Roles('admin', 'manager')
  async update(@Param('id') id: string, @Body() dto: UpdateCustomerDto, @Req() req: any) {
    return { success: true, data: await this.service.update(id, dto, req.user) };
  }

  @Patch(':id/status')
  @Roles('admin')
  async updateStatus(@Param('id') id: string, @Body('status') status: string, @Req() req: any) {
    return { success: true, data: await this.service.updateStatus(id, status, req.user) };
  }

  /**
   * Deactivate. Hard-deletes only when the customer has no sales orders,
   * invoices, returns or serial numbers pointing at it.
   */
  @Delete(':id')
  @Roles('admin')
  async remove(@Param('id') id: string, @Req() req: any) {
    return { success: true, data: await this.service.remove(id, req.user) };
  }
}
