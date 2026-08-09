import { IsString, IsOptional, IsUUID, IsArray, IsNumber, IsDateString, ValidateNested , IsIn} from 'class-validator';
import { Type } from 'class-transformer';

export class SalesOrderItemDto {
  @IsOptional() @IsUUID() sku_id?: string;
  @IsOptional() @IsUUID() skuId?: string;
  @IsOptional() @IsNumber() ordered_quantity?: number;
  @IsOptional() @IsNumber() quantity?: number;
  @IsOptional() @IsNumber() unit_price?: number;
  @IsOptional() @IsNumber() unitPrice?: number;
  @IsOptional() @IsNumber() tax_percentage?: number;
  @IsOptional() @IsString() notes?: string;
}

export class CreateSalesOrderDto {
  @IsOptional() @IsString() customer_name?: string;
  @IsOptional() @IsString() customerName?: string;
  @IsOptional() @IsString() customer_code?: string;
  @IsOptional() @IsString() customer_contact?: string;
  @IsOptional() @IsString() customer_address?: string;
  @IsOptional() @IsUUID() customer_id?: string;
  @IsOptional() @IsUUID() customerId?: string;
  @IsOptional() @IsUUID() warehouse_id?: string;
  @IsOptional() @IsUUID() warehouseId?: string;
  /** Promised delivery date, ISO (YYYY-MM-DD). Optional — NULL means no date agreed. */
  @IsOptional() @IsDateString() expected_delivery_date?: string;
  @IsOptional() @IsDateString() expectedDeliveryDate?: string;
  @IsOptional() @IsString() shipping_address?: string;
  @IsOptional() @IsString() shippingAddress?: string;
  /** Saved customer_addresses row; omit for a one-off typed address. */
  @IsOptional() @IsUUID() shipping_address_id?: string;
  @IsOptional() @IsUUID() shippingAddressId?: string;
  @IsOptional() @IsString() payment_terms?: string;
  @IsOptional() @IsString() paymentTerms?: string;
  /** low | medium | high | urgent — see migration 092. */
  @IsOptional() @IsIn(['low', 'medium', 'high', 'urgent']) priority?: string;
  @IsOptional() @IsString() notes?: string;
  @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => SalesOrderItemDto)
  items?: SalesOrderItemDto[];
}
