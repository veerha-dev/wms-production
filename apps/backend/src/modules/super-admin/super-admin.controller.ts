import {
  Controller, Get, Post, Put, Delete, Body, Param,
  UseGuards, HttpCode, HttpStatus,
} from '@nestjs/common';
import { SuperAdminService } from './super-admin.service';
import { SuperAdminGuard } from './super-admin.guard';
import { CreateTenantDto } from './dto';
import { Public } from '../auth/decorators/public.decorator';

// @Public() opts the whole controller out of the global JwtAuthGuard.
// Super-admin tokens carry no tenantId, so the tenant-scoped JWT strategy
// must not run here — every route except auth/login is instead protected
// by its own @UseGuards(SuperAdminGuard), which verifies the JWT and the
// is_super_admin flag itself.
@Public()
@Controller('api/v1/sa')
export class SuperAdminController {
  constructor(private readonly service: SuperAdminService) {}

  @Post('auth/login')
  @HttpCode(HttpStatus.OK)
  async login(@Body() body: { email: string; password: string }) {
    const data = await this.service.login(body.email, body.password);
    return { success: true, data };
  }

  @Get('dashboard')
  @UseGuards(SuperAdminGuard)
  async getDashboard() { return { success: true, data: await this.service.getDashboardStats() }; }

  @Get('tenants')
  @UseGuards(SuperAdminGuard)
  async getAllTenants() { return { success: true, data: await this.service.getAllTenants() }; }

  @Post('tenants')
  @UseGuards(SuperAdminGuard)
  async createTenant(@Body() dto: CreateTenantDto) { return { success: true, data: await this.service.createTenant(dto) }; }

  @Get('tenants/:id')
  @UseGuards(SuperAdminGuard)
  async getTenantById(@Param('id') id: string) { return { success: true, data: await this.service.getTenantById(id) }; }

  @Put('tenants/:id')
  @UseGuards(SuperAdminGuard)
  async updateTenant(@Param('id') id: string, @Body() body: any) { return { success: true, data: await this.service.updateTenant(id, body) }; }

  @Post('tenants/:id/suspend')
  @UseGuards(SuperAdminGuard)
  @HttpCode(HttpStatus.OK)
  async suspendTenant(@Param('id') id: string) { return { success: true, data: await this.service.suspendTenant(id) }; }

  @Post('tenants/:id/activate')
  @UseGuards(SuperAdminGuard)
  @HttpCode(HttpStatus.OK)
  async activateTenant(@Param('id') id: string) { return { success: true, data: await this.service.activateTenant(id) }; }

  @Delete('tenants/:id')
  @UseGuards(SuperAdminGuard)
  async deleteTenant(@Param('id') id: string) { return { success: true, data: await this.service.deleteTenant(id) }; }

  @Get('plans')
  @UseGuards(SuperAdminGuard)
  async getAllPlans() { return { success: true, data: await this.service.getAllPlans() }; }

  @Post('plans')
  @UseGuards(SuperAdminGuard)
  async createPlan(@Body() body: any) { return { success: true, data: await this.service.createPlan(body) }; }

  @Put('plans/:id')
  @UseGuards(SuperAdminGuard)
  async updatePlan(@Param('id') id: string, @Body() body: any) { return { success: true, data: await this.service.updatePlan(id, body) }; }

  @Get('billing/invoices')
  @UseGuards(SuperAdminGuard)
  async getAllInvoices() { return { success: true, data: await this.service.getAllInvoices() }; }

  @Post('billing/invoices')
  @UseGuards(SuperAdminGuard)
  async createInvoice(@Body() body: any) { return { success: true, data: await this.service.createInvoice(body) }; }

  @Post('billing/invoices/:id/mark-paid')
  @UseGuards(SuperAdminGuard)
  @HttpCode(HttpStatus.OK)
  async markInvoicePaid(@Param('id') id: string) { return { success: true, data: await this.service.markInvoicePaid(id) }; }

  @Get('usage/:tenantId')
  @UseGuards(SuperAdminGuard)
  async getUsageForTenant(@Param('tenantId') tenantId: string) { return { success: true, data: await this.service.getUsageForTenant(tenantId) }; }

  // Tenant users & warehouses
  @Get('tenants/:id/users')
  @UseGuards(SuperAdminGuard)
  async getTenantUsers(@Param('id') id: string) { return { success: true, data: await this.service.getTenantUsers(id) }; }

  @Get('tenants/:id/warehouses')
  @UseGuards(SuperAdminGuard)
  async getTenantWarehouses(@Param('id') id: string) { return { success: true, data: await this.service.getTenantWarehouses(id) }; }

  // Feature flags
  @Get('tenants/:id/feature-flags')
  @UseGuards(SuperAdminGuard)
  async getFeatureFlags(@Param('id') id: string) { return { success: true, data: await this.service.getFeatureFlags(id) }; }

  @Put('tenants/:id/feature-flags')
  @UseGuards(SuperAdminGuard)
  async updateFeatureFlags(@Param('id') id: string, @Body() body: any) { return { success: true, data: await this.service.updateFeatureFlags(id, body) }; }

  // Notes
  @Get('tenants/:id/notes')
  @UseGuards(SuperAdminGuard)
  async getTenantNotes(@Param('id') id: string) { return { success: true, data: await this.service.getTenantNotes(id) }; }

  @Post('tenants/:id/notes')
  @UseGuards(SuperAdminGuard)
  @HttpCode(HttpStatus.OK)
  async addTenantNote(@Param('id') id: string, @Body() body: { text: string }) { return { success: true, data: await this.service.addTenantNote(id, body.text) }; }

  // Audit logs
  @Get('audit-logs')
  @UseGuards(SuperAdminGuard)
  async getAuditLogs() { return { success: true, data: await this.service.getAuditLogs() }; }
}
