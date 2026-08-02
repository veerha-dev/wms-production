import { Controller, Get, Query, Req } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiQuery, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { LabelsService } from './labels.service';
import { QueryLabelBinsDto, QueryLabelSkusDto } from './dto';

/**
 * Everything a label printer needs, in one call per label type. See
 * labels.service.ts for the encoding contract — what each label type actually
 * encodes is fixed there, and the scan endpoints validate exactly that.
 *
 * All routes are authenticated (global JwtAuthGuard); no @Roles, because
 * printing labels is ordinary floor work.
 */
@ApiTags('Labels')
@Controller('api/v1/labels')
@ApiBearerAuth('JWT-auth')
export class LabelsController {
  constructor(private service: LabelsService) {}

  @Get('settings')
  @ApiOperation({
    summary: 'Barcode/label settings for this tenant',
    description:
      'The same barcode_settings row Settings > Masters edits — symbology, label size, print format, human-readable text and SKU barcode source.',
  })
  @ApiResponse({ status: 200, description: 'Settings retrieved' })
  async getSettings() {
    const data = await this.service.getSettings();
    return { success: true, data };
  }

  @Get('bins')
  @ApiOperation({
    summary: 'Location label data',
    description:
      'Bin rows with their zone/rack/aisle/warehouse names resolved, ready to print. Filter by warehouse, zone or rack, or pass an explicit list of bin ids. Managers are restricted to their own warehouse.',
  })
  @ApiQuery({ name: 'warehouseId', required: false, type: String })
  @ApiQuery({ name: 'zoneId', required: false, type: String })
  @ApiQuery({ name: 'rackId', required: false, type: String })
  @ApiQuery({ name: 'binIds', required: false, type: String, description: 'Comma-separated bin UUIDs' })
  @ApiResponse({ status: 200, description: 'Bin label rows. meta.truncated is true when the batch cap was hit.' })
  async findBins(@Query() query: QueryLabelBinsDto, @Req() req: any) {
    const { data, meta } = await this.service.findBins(query, req.user);
    return { success: true, data, meta };
  }

  @Get('skus')
  @ApiOperation({
    summary: 'SKU label data',
    description:
      'SKU rows ready to print. SKUs with no barcode are included with barcode: null so the UI can flag them — their label falls back to the SKU code.',
  })
  @ApiQuery({ name: 'skuIds', required: false, type: String, description: 'Comma-separated SKU UUIDs' })
  @ApiQuery({ name: 'category', required: false, type: String })
  @ApiQuery({ name: 'search', required: false, type: String, description: 'Matches code, name or barcode' })
  @ApiResponse({ status: 200, description: 'SKU label rows. meta.truncated is true when the batch cap was hit.' })
  async findSkus(@Query() query: QueryLabelSkusDto) {
    const { data, meta } = await this.service.findSkus(query);
    return { success: true, data, meta };
  }
}
