import { Controller, Get, Post, Put, Delete, Patch, Body, Param, Query, HttpCode, HttpStatus, Req, UseGuards } from '@nestjs/common';
import { PickListsService } from './pick-lists.service';
import { CreatePickListDto, GeneratePickListDto, UpdatePickListDto, QueryPickListDto } from './dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Roles } from '../auth/decorators/roles.decorator';

/**
 * Deliberately NOT locked down at the controller level.
 *
 * A worker's whole job lives on this resource: they list their pick lists,
 * open one, and run assign / start / complete / pick / scan-item. Only the
 * planning operations — hand-authoring, editing or deleting a pick list, and
 * wave generation — are restricted to admin + manager.
 */
@Controller('api/v1/pick-lists')
export class PickListsController {
  constructor(private readonly service: PickListsService) {}

  @Get('stats')
  async getStats() { return { success: true, data: await this.service.getStats() }; }

  @Get()
  @UseGuards(JwtAuthGuard)
  async findAll(@Query() query: QueryPickListDto, @Req() req: any) {
    const result = await this.service.findAll(query, req.user);
    return { success: true, data: result.data, meta: result.meta };
  }

  @Get(':id')
  async findOne(@Param('id') id: string) { return { success: true, data: await this.service.findOne(id) }; }

  @Post()
  @Roles('admin', 'manager')
  @HttpCode(HttpStatus.CREATED)
  async create(@Body() dto: CreatePickListDto) { return { success: true, data: await this.service.create(dto) }; }

  @Put(':id')
  @Roles('admin', 'manager')
  async update(@Param('id') id: string, @Body() dto: UpdatePickListDto) { return { success: true, data: await this.service.update(id, dto) }; }

  @Delete(':id')
  @Roles('admin', 'manager')
  async remove(@Param('id') id: string) { await this.service.remove(id); return { success: true, data: { id } }; }

  @Post('generate')
  @UseGuards(JwtAuthGuard)
  @Roles('admin', 'manager')
  @HttpCode(HttpStatus.CREATED)
  async generate(@Body() dto: GeneratePickListDto, @Req() req: any) { return { success: true, data: await this.service.generate(dto, req.user) }; }

  @Post(':id/assign')
  @HttpCode(HttpStatus.OK)
  async assign(@Param('id') id: string, @Body() body: { userId: string }) { return { success: true, data: await this.service.updateStatus(id, 'assigned', { assignedTo: body.userId }) }; }

  @Post(':id/start')
  @HttpCode(HttpStatus.OK)
  async start(@Param('id') id: string) { return { success: true, data: await this.service.updateStatus(id, 'in_progress', { startedAt: new Date() }) }; }

  @Post(':id/complete')
  @HttpCode(HttpStatus.OK)
  async complete(@Param('id') id: string, @Req() req: any) { return { success: true, data: await this.service.complete(id, req.user) }; }

  @Post(':id/pick/:itemId')
  @HttpCode(HttpStatus.OK)
  async pickItem(@Param('id') id: string, @Param('itemId') itemId: string, @Body() body: { quantityPicked: number }) { return { success: true, data: { id, itemId, quantityPicked: body.quantityPicked } }; }

  @Post(':id/scan-item')
  @HttpCode(HttpStatus.OK)
  async scanItem(@Param('id') id: string, @Body() body: { barcode: string; binBarcode?: string; quantity?: number }) {
    return { success: true, data: await this.service.scanItem(id, body) };
  }
}
