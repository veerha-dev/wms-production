import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  Req,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PurchaseOrdersService } from './purchase-orders.service';
import {
  CreatePurchaseOrderDto,
  UpdatePurchaseOrderDto,
  QueryPurchaseOrderDto,
} from './dto';

@Controller('api/v1/purchase-orders')
@UseGuards(JwtAuthGuard)
export class PurchaseOrdersController {
  constructor(
    private readonly purchaseOrdersService: PurchaseOrdersService,
  ) {}

  @Get()
  async findAll(@Query() query: QueryPurchaseOrderDto) {
    const result = await this.purchaseOrdersService.findAll(query);
    return {
      success: true,
      data: result.data,
      meta: result.meta,
    };
  }

  @Get('stats')
  async getStats() {
    const data = await this.purchaseOrdersService.getStats();
    return { success: true, data };
  }

  @Get(':id')
  async findById(@Param('id') id: string) {
    const data = await this.purchaseOrdersService.findById(id);
    return { success: true, data };
  }

  @Post()
  async create(@Body() dto: CreatePurchaseOrderDto, @Req() req: any) {
    const data = await this.purchaseOrdersService.create(dto, req.user);
    return { success: true, data };
  }

  @Put(':id')
  async update(
    @Param('id') id: string,
    @Body() dto: UpdatePurchaseOrderDto,
  ) {
    const data = await this.purchaseOrdersService.update(id, dto);
    return { success: true, data };
  }

  @Delete(':id')
  async delete(@Param('id') id: string) {
    const data = await this.purchaseOrdersService.delete(id);
    return { success: true, data };
  }

  @Post(':id/submit')
  @HttpCode(HttpStatus.OK)
  async submit(@Param('id') id: string, @Req() req: any) {
    const data = await this.purchaseOrdersService.submit(id, req.user);
    return { success: true, data };
  }

  @Post(':id/approve')
  @HttpCode(HttpStatus.OK)
  async approve(@Param('id') id: string, @Req() req: any) {
    const data = await this.purchaseOrdersService.approve(id, req.user);
    return { success: true, data };
  }

  @Post(':id/reject')
  @HttpCode(HttpStatus.OK)
  async reject(
    @Param('id') id: string,
    @Body('reason') reason: string,
    @Req() req: any,
  ) {
    const data = await this.purchaseOrdersService.reject(id, reason, req.user);
    return { success: true, data };
  }

  @Post(':id/recall')
  @HttpCode(HttpStatus.OK)
  async recall(@Param('id') id: string, @Req() req: any) {
    const data = await this.purchaseOrdersService.recall(id, req.user);
    return { success: true, data };
  }

  @Post(':id/cancel')
  @HttpCode(HttpStatus.OK)
  async cancel(@Param('id') id: string) {
    const data = await this.purchaseOrdersService.cancel(id);
    return { success: true, data };
  }
}
