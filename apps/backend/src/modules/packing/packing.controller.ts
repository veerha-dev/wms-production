import {
  Controller, Get, Post, Put, Patch, Delete, Body, Param, Query, Req,
  HttpCode, HttpStatus, UseGuards,
} from '@nestjs/common';
import { PackingService } from './packing.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import {
  QueryPackingOrdersDto,
  ScanPackItemDto,
  SetItemQuantityDto,
  AssignItemPackageDto,
  UpsertPackageDto,
  SetLabelDto,
} from './dto';

/**
 * Packing bench API. Shared by the web packing station and the mobile packing
 * screen — the two surfaces differ only in layout, never in rules.
 *
 * Not role-locked beyond the guard: packing is a worker's job. Manager scoping
 * is applied inside the service via the order's warehouse, and cancelling a
 * session is the one manager/admin-only action.
 */
@Controller('api/v1/packing')
@UseGuards(JwtAuthGuard)
export class PackingController {
  constructor(private readonly service: PackingService) {}

  @Get('orders')
  async findPackableOrders(@Query() query: QueryPackingOrdersDto, @Req() req: any) {
    const result = await this.service.findPackableOrders(query, req.user);
    return { success: true, data: result.data, meta: result.meta };
  }

  @Get('boxes')
  async getBoxes() {
    return { success: true, data: await this.service.getBoxes() };
  }

  @Get('orders/:soId')
  async getOrder(@Param('soId') soId: string, @Req() req: any) {
    return { success: true, data: await this.service.getOrder(soId, req.user) };
  }

  @Post('orders/:soId/start')
  @HttpCode(HttpStatus.OK)
  async start(@Param('soId') soId: string, @Req() req: any) {
    return { success: true, data: await this.service.openOrder(soId, req.user) };
  }

  @Post('orders/:soId/scan')
  @HttpCode(HttpStatus.OK)
  async scan(@Param('soId') soId: string, @Body() dto: ScanPackItemDto, @Req() req: any) {
    return { success: true, data: await this.service.scanItem(soId, dto, req.user) };
  }

  @Patch('orders/:soId/items/:itemId/quantity')
  async setItemQuantity(
    @Param('soId') soId: string,
    @Param('itemId') itemId: string,
    @Body() dto: SetItemQuantityDto,
    @Req() req: any,
  ) {
    return { success: true, data: await this.service.setItemQuantity(soId, itemId, dto.quantity, req.user) };
  }

  @Patch('orders/:soId/items/:itemId/package')
  async assignItemPackage(
    @Param('soId') soId: string,
    @Param('itemId') itemId: string,
    @Body() dto: AssignItemPackageDto,
    @Req() req: any,
  ) {
    return {
      success: true,
      data: await this.service.assignItemToPackage(soId, itemId, dto.packageId ?? null, req.user),
    };
  }

  @Post('orders/:soId/packages')
  @HttpCode(HttpStatus.CREATED)
  async addPackage(@Param('soId') soId: string, @Body() dto: UpsertPackageDto, @Req() req: any) {
    return { success: true, data: await this.service.addPackage(soId, dto, req.user) };
  }

  @Put('orders/:soId/packages/:packageId')
  async updatePackage(
    @Param('soId') soId: string,
    @Param('packageId') packageId: string,
    @Body() dto: UpsertPackageDto,
    @Req() req: any,
  ) {
    return { success: true, data: await this.service.updatePackage(soId, packageId, dto, req.user) };
  }

  @Delete('orders/:soId/packages/:packageId')
  async removePackage(
    @Param('soId') soId: string,
    @Param('packageId') packageId: string,
    @Req() req: any,
  ) {
    return { success: true, data: await this.service.removePackage(soId, packageId, req.user) };
  }

  @Post('orders/:soId/label')
  @HttpCode(HttpStatus.OK)
  async setLabel(@Param('soId') soId: string, @Body() dto: SetLabelDto, @Req() req: any) {
    return { success: true, data: await this.service.setLabel(soId, dto, req.user) };
  }

  @Post('orders/:soId/label/printed')
  @HttpCode(HttpStatus.OK)
  async markLabelPrinted(@Param('soId') soId: string, @Req() req: any) {
    return { success: true, data: await this.service.markLabelPrinted(soId, req.user) };
  }

  @Post('orders/:soId/complete')
  @HttpCode(HttpStatus.OK)
  async complete(@Param('soId') soId: string, @Req() req: any) {
    return { success: true, data: await this.service.complete(soId, req.user) };
  }

  @Post('orders/:soId/cancel')
  @Roles('admin', 'manager')
  @HttpCode(HttpStatus.OK)
  async cancel(@Param('soId') soId: string, @Req() req: any) {
    return { success: true, data: await this.service.cancel(soId, req.user) };
  }
}
