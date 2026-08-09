import { Controller, Get, Post, Put, Delete, Body, Param, Query, Req } from '@nestjs/common';
import { InventoryService } from './inventory.service';
import {
  CreateStockLevelDto, UpdateStockLevelDto, TransferStockDto,
  AdjustStockDto, CreateMovementDto, QueryInventoryDto, QueryMovementsDto,
} from './dto';
import { RequirePermission } from '../auth/decorators/require-permission.decorator';

/**
 * Gated on the "Inventory" module of the Permissions Matrix. Stock transfers
 * and adjustments are treated as 'edit' of existing stock rather than 'create',
 * which is what the Inventory screen's own wording implies.
 */
@Controller('api/v1/inventory')
@RequirePermission('Inventory', 'view')
export class InventoryController {
  constructor(private service: InventoryService) {}

  // ─── Stock Levels ───────────────────────────────────────────

  @Get()
  async findAllStockLevels(@Query() query: QueryInventoryDto) {
    const result = await this.service.findAllStockLevels(query);
    return { success: true, data: result.data, meta: result.meta };
  }

  @Get('low-stock')
  async findLowStock() {
    const data = await this.service.findLowStock();
    return { success: true, data };
  }

  @Get('expiring')
  async findExpiring() {
    const data = await this.service.findExpiring();
    return { success: true, data };
  }

  @Get('movements')
  async findAllMovements(@Query() query: QueryMovementsDto) {
    const result = await this.service.findAllMovements(query);
    return { success: true, data: result.data, meta: result.meta };
  }

  @Get(':id')
  async findStockLevelById(@Param('id') id: string) {
    const data = await this.service.findStockLevelById(id);
    return { success: true, data };
  }

  @Post()
  @RequirePermission('Inventory', 'create')
  async createStockLevel(@Body() dto: CreateStockLevelDto, @Req() req: any) {
    const data = await this.service.createStockLevel(dto, req?.user?.id);
    return { success: true, data };
  }

  @Post('transfer')
  @RequirePermission('Inventory', 'edit')
  async transferStock(@Body() dto: TransferStockDto, @Req() req: any) {
    const data = await this.service.transferStock(dto, req?.user?.id);
    return { success: true, data };
  }

  @Post('adjustment')
  @RequirePermission('Inventory', 'edit')
  async adjustStock(@Body() dto: AdjustStockDto, @Req() req: any) {
    const data = await this.service.adjustStock(dto, req?.user?.id);
    return { success: true, data };
  }

  @Post('movements')
  @RequirePermission('Inventory', 'create')
  async createMovement(@Body() dto: CreateMovementDto) {
    const data = await this.service.createMovement(dto);
    return { success: true, data };
  }

  @Put(':id')
  @RequirePermission('Inventory', 'edit')
  async updateStockLevel(@Param('id') id: string, @Body() dto: UpdateStockLevelDto, @Req() req: any) {
    const data = await this.service.updateStockLevel(id, dto, req?.user?.id);
    return { success: true, data };
  }

  @Delete(':id')
  @RequirePermission('Inventory', 'delete')
  async deleteStockLevel(@Param('id') id: string, @Req() req: any) {
    await this.service.deleteStockLevel(id, req?.user?.id);
    return { success: true, data: { deleted: true } };
  }
}
