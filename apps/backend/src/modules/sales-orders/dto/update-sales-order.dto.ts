import { IsString, IsOptional, IsUUID, IsDateString, IsIn } from 'class-validator';
export class UpdateSalesOrderDto {
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsString() status?: string;
  @IsOptional() @IsString() notes?: string;
  /** low | medium | high | urgent — see migration 092. */
  @IsOptional() @IsIn(['low', 'medium', 'high', 'urgent']) priority?: string;
  /** Promised delivery date, ISO (YYYY-MM-DD). Omit to leave unchanged. */
  @IsOptional() @IsDateString() expected_delivery_date?: string;
  @IsOptional() @IsDateString() expectedDeliveryDate?: string;
  @IsOptional() @IsString() shipping_address?: string;
  @IsOptional() @IsString() shippingAddress?: string;
  /** Saved customer_addresses row; null clears back to the typed address. */
  @IsOptional() @IsUUID() shipping_address_id?: string;
  @IsOptional() @IsUUID() shippingAddressId?: string;
}
