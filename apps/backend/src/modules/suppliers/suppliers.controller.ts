import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
} from '@nestjs/common';
import { SuppliersService } from './suppliers.service';
import { CreateSupplierDto, UpdateSupplierDto, QuerySupplierDto } from './dto';
import { RequirePermission } from '../auth/decorators/require-permission.decorator';

/**
 * Gated by the tenant's Permissions Matrix (module "Suppliers"). The
 * class-level 'view' covers the two reads; writes name their own action.
 */
@Controller('api/v1/suppliers')
@RequirePermission('Suppliers', 'view')
export class SuppliersController {
  constructor(private readonly suppliersService: SuppliersService) {}

  @Get()
  async findAll(@Query() query: QuerySupplierDto) {
    const result = await this.suppliersService.findAll(query);
    return {
      success: true,
      data: result.data,
      meta: result.meta,
    };
  }

  @Get(':id')
  async findById(@Param('id') id: string) {
    const data = await this.suppliersService.findById(id);
    return { success: true, data };
  }

  @Post()
  @RequirePermission('Suppliers', 'create')
  async create(@Body() dto: CreateSupplierDto) {
    const data = await this.suppliersService.create(dto);
    return { success: true, data };
  }

  @Put(':id')
  @RequirePermission('Suppliers', 'edit')
  async update(@Param('id') id: string, @Body() dto: UpdateSupplierDto) {
    const data = await this.suppliersService.update(id, dto);
    return { success: true, data };
  }

  @Delete(':id')
  @RequirePermission('Suppliers', 'delete')
  async delete(@Param('id') id: string) {
    const data = await this.suppliersService.delete(id);
    return { success: true, data };
  }
}
