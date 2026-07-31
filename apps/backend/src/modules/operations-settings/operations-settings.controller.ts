import {
  Body, Controller, Delete, Get, Param, ParseUUIDPipe, Post, Put, Query, Request, UseGuards,
} from '@nestjs/common';
import { OperationsSettingsService } from './operations-settings.service';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import {
  CreateShiftDto, UpdateShiftDto,
  CreateDockDoorDto, UpdateDockDoorDto,
  CreatePackingStationDto, UpdatePackingStationDto,
  CreateEquipmentDto, UpdateEquipmentDto,
  QueryOperationsDto,
} from './dto';

/**
 * Settings > Operations — warehouse-scoped setup.
 *
 * Reads: any authenticated user (the global JwtAuthGuard already ran).
 * Writes: @Roles('admin','manager'); the service additionally restricts a
 * manager to their own warehouse.
 *
 * The guards are also registered globally; declaring them here keeps the
 * role checks enforced even if that global registration changes.
 */
@Controller('api/v1/settings/operations')
@UseGuards(JwtAuthGuard, RolesGuard)
export class OperationsSettingsController {
  constructor(private readonly service: OperationsSettingsService) {}

  // ─── Shifts ─────────────────────────────────────────────────────────────────

  @Get(':warehouseId/shifts')
  async listShifts(
    @Param('warehouseId', ParseUUIDPipe) warehouseId: string,
    @Query() query: QueryOperationsDto,
  ) {
    const data = await this.service.list(warehouseId, 'shifts', query);
    return { success: true, data, meta: { total: data.length, warehouseId } };
  }

  @Post(':warehouseId/shifts')
  @Roles('admin', 'manager')
  async createShift(
    @Request() req: any,
    @Param('warehouseId', ParseUUIDPipe) warehouseId: string,
    @Body() dto: CreateShiftDto,
  ) {
    const data = await this.service.create(req.user, warehouseId, 'shifts', dto);
    return { success: true, data };
  }

  @Put(':warehouseId/shifts/:id')
  @Roles('admin', 'manager')
  async updateShift(
    @Request() req: any,
    @Param('warehouseId', ParseUUIDPipe) warehouseId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateShiftDto,
  ) {
    const data = await this.service.update(req.user, warehouseId, 'shifts', id, dto);
    return { success: true, data };
  }

  @Delete(':warehouseId/shifts/:id')
  @Roles('admin', 'manager')
  async deleteShift(
    @Request() req: any,
    @Param('warehouseId', ParseUUIDPipe) warehouseId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    const data = await this.service.deactivate(req.user, warehouseId, 'shifts', id);
    return { success: true, data };
  }

  // ─── Dock Doors ─────────────────────────────────────────────────────────────

  @Get(':warehouseId/dock-doors')
  async listDockDoors(
    @Param('warehouseId', ParseUUIDPipe) warehouseId: string,
    @Query() query: QueryOperationsDto,
  ) {
    const data = await this.service.list(warehouseId, 'dock-doors', query);
    return { success: true, data, meta: { total: data.length, warehouseId } };
  }

  @Post(':warehouseId/dock-doors')
  @Roles('admin', 'manager')
  async createDockDoor(
    @Request() req: any,
    @Param('warehouseId', ParseUUIDPipe) warehouseId: string,
    @Body() dto: CreateDockDoorDto,
  ) {
    const data = await this.service.create(req.user, warehouseId, 'dock-doors', dto);
    return { success: true, data };
  }

  @Put(':warehouseId/dock-doors/:id')
  @Roles('admin', 'manager')
  async updateDockDoor(
    @Request() req: any,
    @Param('warehouseId', ParseUUIDPipe) warehouseId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateDockDoorDto,
  ) {
    const data = await this.service.update(req.user, warehouseId, 'dock-doors', id, dto);
    return { success: true, data };
  }

  @Delete(':warehouseId/dock-doors/:id')
  @Roles('admin', 'manager')
  async deleteDockDoor(
    @Request() req: any,
    @Param('warehouseId', ParseUUIDPipe) warehouseId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    const data = await this.service.deactivate(req.user, warehouseId, 'dock-doors', id);
    return { success: true, data };
  }

  // ─── Packing Stations ───────────────────────────────────────────────────────

  @Get(':warehouseId/packing-stations')
  async listPackingStations(
    @Param('warehouseId', ParseUUIDPipe) warehouseId: string,
    @Query() query: QueryOperationsDto,
  ) {
    const data = await this.service.list(warehouseId, 'packing-stations', query);
    return { success: true, data, meta: { total: data.length, warehouseId } };
  }

  @Post(':warehouseId/packing-stations')
  @Roles('admin', 'manager')
  async createPackingStation(
    @Request() req: any,
    @Param('warehouseId', ParseUUIDPipe) warehouseId: string,
    @Body() dto: CreatePackingStationDto,
  ) {
    const data = await this.service.create(req.user, warehouseId, 'packing-stations', dto);
    return { success: true, data };
  }

  @Put(':warehouseId/packing-stations/:id')
  @Roles('admin', 'manager')
  async updatePackingStation(
    @Request() req: any,
    @Param('warehouseId', ParseUUIDPipe) warehouseId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdatePackingStationDto,
  ) {
    const data = await this.service.update(req.user, warehouseId, 'packing-stations', id, dto);
    return { success: true, data };
  }

  @Delete(':warehouseId/packing-stations/:id')
  @Roles('admin', 'manager')
  async deletePackingStation(
    @Request() req: any,
    @Param('warehouseId', ParseUUIDPipe) warehouseId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    const data = await this.service.deactivate(req.user, warehouseId, 'packing-stations', id);
    return { success: true, data };
  }

  // ─── Equipment ──────────────────────────────────────────────────────────────

  @Get(':warehouseId/equipment')
  async listEquipment(
    @Param('warehouseId', ParseUUIDPipe) warehouseId: string,
    @Query() query: QueryOperationsDto,
  ) {
    const data = await this.service.list(warehouseId, 'equipment', query);
    return { success: true, data, meta: { total: data.length, warehouseId } };
  }

  @Post(':warehouseId/equipment')
  @Roles('admin', 'manager')
  async createEquipment(
    @Request() req: any,
    @Param('warehouseId', ParseUUIDPipe) warehouseId: string,
    @Body() dto: CreateEquipmentDto,
  ) {
    const data = await this.service.create(req.user, warehouseId, 'equipment', dto);
    return { success: true, data };
  }

  @Put(':warehouseId/equipment/:id')
  @Roles('admin', 'manager')
  async updateEquipment(
    @Request() req: any,
    @Param('warehouseId', ParseUUIDPipe) warehouseId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateEquipmentDto,
  ) {
    const data = await this.service.update(req.user, warehouseId, 'equipment', id, dto);
    return { success: true, data };
  }

  @Delete(':warehouseId/equipment/:id')
  @Roles('admin', 'manager')
  async deleteEquipment(
    @Request() req: any,
    @Param('warehouseId', ParseUUIDPipe) warehouseId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    const data = await this.service.deactivate(req.user, warehouseId, 'equipment', id);
    return { success: true, data };
  }
}
