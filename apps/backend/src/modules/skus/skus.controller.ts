import { Controller, Get, Post, Put, Delete, Body, Param, Query } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiParam, ApiQuery, ApiBearerAuth } from '@nestjs/swagger';
import { SkusService } from './skus.service';
import { Roles } from '../auth/decorators/roles.decorator';
import { CreateSkuDto, UpdateSkuDto, QuerySkuDto, BulkCreateSkuDto, BulkUpdateSkuDto } from './dto';

@ApiTags('SKUs')
@Controller('api/v1/skus')
@ApiBearerAuth('JWT-auth')
export class SkusController {
  constructor(private service: SkusService) {}

  @Get()
  @ApiOperation({ 
    summary: 'List all SKUs',
    description: 'Retrieve a paginated list of all product SKUs with optional filtering and sorting'
  })
  @ApiQuery({ name: 'page', required: false, type: Number, description: 'Page number (default: 1)' })
  @ApiQuery({ name: 'limit', required: false, type: Number, description: 'Items per page (default: 50)' })
  @ApiQuery({ name: 'search', required: false, type: String, description: 'Search by SKU code or name' })
  @ApiQuery({ name: 'category', required: false, type: String, description: 'Filter by category' })
  @ApiQuery({ name: 'status', required: false, type: String, description: 'Filter by status (active/inactive)' })
  @ApiResponse({ status: 200, description: 'SKUs retrieved successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async findAll(@Query() query: QuerySkuDto) {
    const result = await this.service.findAll(query);
    return { success: true, data: result.data, meta: result.meta };
  }

  @Get(':id')
  @ApiOperation({ 
    summary: 'Get SKU by ID',
    description: 'Retrieve detailed information about a specific SKU'
  })
  @ApiParam({ name: 'id', type: 'string', description: 'SKU UUID' })
  @ApiResponse({ status: 200, description: 'SKU found' })
  @ApiResponse({ status: 404, description: 'SKU not found' })
  async findById(@Param('id') id: string) {
    const data = await this.service.findById(id);
    return { success: true, data };
  }

  @Post()
  @ApiOperation({ 
    summary: 'Create new SKU',
    description: 'Create a new product SKU in the catalog'
  })
  @ApiResponse({ status: 201, description: 'SKU created successfully' })
  @ApiResponse({ status: 400, description: 'Invalid input data' })
  @ApiResponse({ status: 409, description: 'SKU code already exists' })
  async create(@Body() dto: CreateSkuDto) {
    const data = await this.service.create(dto);
    return { success: true, data };
  }

  @Post('bulk')
  @ApiOperation({
    summary: 'Bulk create SKUs',
    description: 'Create multiple SKUs in a single operation. Useful for importing product catalogs.'
  })
  @ApiResponse({ status: 201, description: 'Bulk operation completed. Returns count of created/failed items.' })
  @ApiResponse({ status: 400, description: 'Invalid input data' })
  async bulkCreate(@Body() dto: BulkCreateSkuDto) {
    const result = await this.service.bulkCreate(dto);
    return { success: true, data: result };
  }

  @Post('import')
  @ApiOperation({
    summary: 'Import SKUs from parsed CSV/XLSX',
    description: 'Onboarding endpoint — accepts a JSON array of SKU rows (parsed client-side from CSV/XLSX). Returns per-row error report.',
  })
  async importSkus(@Body() dto: BulkCreateSkuDto) {
    const result = await this.service.bulkCreate(dto);
    return { success: true, data: result };
  }

  @Post('barcodes/backfill')
  @Roles('admin')
  @ApiOperation({
    summary: 'Backfill missing SKU barcodes',
    description:
      'Issues an auto-generated EAN-13 for every SKU in the tenant that has no barcode. SKUs that already carry one are left untouched. Runs regardless of sku_barcode_source — it is an explicit admin action.',
  })
  @ApiResponse({ status: 201, description: 'Backfill completed. Returns how many barcodes were issued.' })
  async backfillBarcodes() {
    const data = await this.service.backfillBarcodes();
    return { success: true, data };
  }

  @Post(':id/generate-barcode')
  @Roles('admin', 'manager')
  @ApiOperation({
    summary: 'Generate a barcode for a SKU',
    description:
      'Issues a fresh auto-generated EAN-13 (GS1 internal prefix 20) for this SKU, replacing any existing value. Runs regardless of sku_barcode_source.',
  })
  @ApiParam({ name: 'id', type: 'string', description: 'SKU UUID' })
  @ApiResponse({ status: 201, description: 'Barcode generated' })
  @ApiResponse({ status: 404, description: 'SKU not found' })
  async generateBarcode(@Param('id') id: string) {
    const data = await this.service.generateBarcode(id);
    return { success: true, data };
  }

  @Put('bulk-update')
  @ApiOperation({ 
    summary: 'Bulk update SKUs',
    description: 'Update multiple existing SKUs in a single operation. Requires SKU IDs.'
  })
  @ApiResponse({ status: 200, description: 'Bulk update completed. Returns count of updated/failed items.' })
  @ApiResponse({ status: 400, description: 'Invalid input data' })
  @ApiResponse({ status: 404, description: 'One or more SKUs not found' })
  async bulkUpdate(@Body() dto: BulkUpdateSkuDto) {
    const result = await this.service.bulkUpdate(dto);
    return { success: true, data: result };
  }

  @Put(':id')
  @ApiOperation({ 
    summary: 'Update SKU',
    description: 'Update an existing SKU with new information'
  })
  @ApiParam({ name: 'id', type: 'string', description: 'SKU UUID' })
  @ApiResponse({ status: 200, description: 'SKU updated successfully' })
  @ApiResponse({ status: 404, description: 'SKU not found' })
  @ApiResponse({ status: 400, description: 'Invalid input data' })
  async update(@Param('id') id: string, @Body() dto: UpdateSkuDto) {
    const data = await this.service.update(id, dto);
    return { success: true, data };
  }

  @Delete(':id')
  @ApiOperation({ 
    summary: 'Delete SKU',
    description: 'Soft delete a SKU from the catalog. SKU must not have active inventory.'
  })
  @ApiParam({ name: 'id', type: 'string', description: 'SKU UUID' })
  @ApiResponse({ status: 200, description: 'SKU deleted successfully' })
  @ApiResponse({ status: 404, description: 'SKU not found' })
  @ApiResponse({ status: 409, description: 'Cannot delete SKU with active inventory' })
  async delete(@Param('id') id: string) {
    await this.service.delete(id);
    return { success: true, data: { deleted: true } };
  }
}
