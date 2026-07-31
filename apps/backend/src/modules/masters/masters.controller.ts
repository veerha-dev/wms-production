import {
  Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, Put, Query, UseGuards,
} from '@nestjs/common';
import { MastersService } from './masters.service';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { GST_RATES, REASON_CATEGORIES } from './masters.registry';
import {
  CreateBoxDto, UpdateBoxDto,
  CreateMaterialDto, UpdateMaterialDto,
  CreateCarrierDto, UpdateCarrierDto,
  CreateReasonCodeDto, UpdateReasonCodeDto,
  CreateUnitDto, UpdateUnitDto,
  CreateSkuCategoryDto, UpdateSkuCategoryDto,
  CreateHsnCodeDto, UpdateHsnCodeDto,
  UpdateBarcodeSettingsDto, UpdateDocumentNumberingDto,
  QueryMastersDto, QueryReasonCodesDto,
} from './dto';

/**
 * Settings > Masters — company-wide reference data.
 *
 * Reads: any authenticated user (dropdowns across the app consume these).
 * Writes: @Roles('admin') — enforced by the global RolesGuard.
 * DELETE is always a soft delete (status -> 'inactive').
 *
 * The guards are also registered globally; declaring them here keeps the
 * admin-only writes enforced even if that global registration changes.
 */
@Controller('api/v1/settings/masters')
@UseGuards(JwtAuthGuard, RolesGuard)
export class MastersController {
  constructor(private readonly service: MastersService) {}

  // ─── Packaging: Boxes ───────────────────────────────────────────────────────

  @Get('boxes')
  async listBoxes(@Query() query: QueryMastersDto) {
    const data = await this.service.list('boxes', query);
    return { success: true, data, meta: { total: data.length } };
  }

  @Post('boxes')
  @Roles('admin')
  async createBox(@Body() dto: CreateBoxDto) {
    return { success: true, data: await this.service.create('boxes', dto) };
  }

  @Put('boxes/:id')
  @Roles('admin')
  async updateBox(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateBoxDto) {
    return { success: true, data: await this.service.update('boxes', id, dto) };
  }

  @Delete('boxes/:id')
  @Roles('admin')
  async deleteBox(@Param('id', ParseUUIDPipe) id: string) {
    return { success: true, data: await this.service.deactivate('boxes', id) };
  }

  // ─── Packaging: Materials ───────────────────────────────────────────────────

  @Get('materials')
  async listMaterials(@Query() query: QueryMastersDto) {
    const data = await this.service.list('materials', query);
    return { success: true, data, meta: { total: data.length } };
  }

  @Post('materials')
  @Roles('admin')
  async createMaterial(@Body() dto: CreateMaterialDto) {
    return { success: true, data: await this.service.create('materials', dto) };
  }

  @Put('materials/:id')
  @Roles('admin')
  async updateMaterial(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateMaterialDto) {
    return { success: true, data: await this.service.update('materials', id, dto) };
  }

  @Delete('materials/:id')
  @Roles('admin')
  async deleteMaterial(@Param('id', ParseUUIDPipe) id: string) {
    return { success: true, data: await this.service.deactivate('materials', id) };
  }

  // ─── Carriers ───────────────────────────────────────────────────────────────

  @Get('carriers')
  async listCarriers(@Query() query: QueryMastersDto) {
    const data = await this.service.list('carriers', query);
    return { success: true, data, meta: { total: data.length } };
  }

  @Post('carriers')
  @Roles('admin')
  async createCarrier(@Body() dto: CreateCarrierDto) {
    return { success: true, data: await this.service.create('carriers', dto) };
  }

  @Put('carriers/:id')
  @Roles('admin')
  async updateCarrier(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateCarrierDto) {
    return { success: true, data: await this.service.update('carriers', id, dto) };
  }

  @Delete('carriers/:id')
  @Roles('admin')
  async deleteCarrier(@Param('id', ParseUUIDPipe) id: string) {
    return { success: true, data: await this.service.deactivate('carriers', id) };
  }

  // ─── Reason Codes ───────────────────────────────────────────────────────────

  @Get('reason-codes')
  async listReasonCodes(@Query() query: QueryReasonCodesDto) {
    const data = await this.service.list('reason-codes', query);
    return {
      success: true,
      data,
      meta: { total: data.length, categories: REASON_CATEGORIES },
    };
  }

  @Post('reason-codes')
  @Roles('admin')
  async createReasonCode(@Body() dto: CreateReasonCodeDto) {
    return { success: true, data: await this.service.create('reason-codes', dto) };
  }

  @Put('reason-codes/:id')
  @Roles('admin')
  async updateReasonCode(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateReasonCodeDto) {
    return { success: true, data: await this.service.update('reason-codes', id, dto) };
  }

  @Delete('reason-codes/:id')
  @Roles('admin')
  async deleteReasonCode(@Param('id', ParseUUIDPipe) id: string) {
    return { success: true, data: await this.service.deactivate('reason-codes', id) };
  }

  // ─── Units of Measure ───────────────────────────────────────────────────────

  @Get('units')
  async listUnits(@Query() query: QueryMastersDto) {
    const data = await this.service.list('units', query);
    return { success: true, data, meta: { total: data.length } };
  }

  @Post('units')
  @Roles('admin')
  async createUnit(@Body() dto: CreateUnitDto) {
    return { success: true, data: await this.service.create('units', dto) };
  }

  @Put('units/:id')
  @Roles('admin')
  async updateUnit(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateUnitDto) {
    return { success: true, data: await this.service.update('units', id, dto) };
  }

  @Delete('units/:id')
  @Roles('admin')
  async deleteUnit(@Param('id', ParseUUIDPipe) id: string) {
    return { success: true, data: await this.service.deactivate('units', id) };
  }

  // ─── SKU Categories ─────────────────────────────────────────────────────────

  @Get('sku-categories')
  async listSkuCategories(@Query() query: QueryMastersDto) {
    const data = await this.service.list('sku-categories', query);
    return { success: true, data, meta: { total: data.length } };
  }

  @Post('sku-categories')
  @Roles('admin')
  async createSkuCategory(@Body() dto: CreateSkuCategoryDto) {
    return { success: true, data: await this.service.create('sku-categories', dto) };
  }

  @Put('sku-categories/:id')
  @Roles('admin')
  async updateSkuCategory(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateSkuCategoryDto,
  ) {
    return { success: true, data: await this.service.update('sku-categories', id, dto) };
  }

  @Delete('sku-categories/:id')
  @Roles('admin')
  async deleteSkuCategory(@Param('id', ParseUUIDPipe) id: string) {
    return { success: true, data: await this.service.deactivate('sku-categories', id) };
  }

  // ─── HSN Codes ──────────────────────────────────────────────────────────────

  @Get('hsn-codes')
  async listHsnCodes(@Query() query: QueryMastersDto) {
    const data = await this.service.list('hsn-codes', query);
    return { success: true, data, meta: { total: data.length, gstRates: GST_RATES } };
  }

  @Post('hsn-codes')
  @Roles('admin')
  async createHsnCode(@Body() dto: CreateHsnCodeDto) {
    return { success: true, data: await this.service.create('hsn-codes', dto) };
  }

  @Put('hsn-codes/:id')
  @Roles('admin')
  async updateHsnCode(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateHsnCodeDto) {
    return { success: true, data: await this.service.update('hsn-codes', id, dto) };
  }

  @Delete('hsn-codes/:id')
  @Roles('admin')
  async deleteHsnCode(@Param('id', ParseUUIDPipe) id: string) {
    return { success: true, data: await this.service.deactivate('hsn-codes', id) };
  }

  // ─── GST rates (static list, read-only) ─────────────────────────────────────

  @Get('gst-rates')
  async listGstRates() {
    return { success: true, data: GST_RATES };
  }

  // ─── Document Numbering ─────────────────────────────────────────────────────

  @Get('document-numbering')
  async listDocumentNumbering() {
    const data = await this.service.listDocumentNumbering();
    return { success: true, data, meta: { total: data.length } };
  }

  @Patch('document-numbering/:docType')
  @Roles('admin')
  async updateDocumentNumbering(
    @Param('docType') docType: string,
    @Body() dto: UpdateDocumentNumberingDto,
  ) {
    return { success: true, data: await this.service.updateDocumentNumbering(docType, dto) };
  }

  // ─── Barcode & Labels (singleton) ───────────────────────────────────────────

  @Get('barcode-settings')
  async getBarcodeSettings() {
    return { success: true, data: await this.service.getBarcodeSettings() };
  }

  @Patch('barcode-settings')
  @Roles('admin')
  async updateBarcodeSettings(@Body() dto: UpdateBarcodeSettingsDto) {
    return { success: true, data: await this.service.updateBarcodeSettings(dto) };
  }
}
