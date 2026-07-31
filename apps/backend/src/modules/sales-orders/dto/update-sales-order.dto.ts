import { IsString, IsOptional, IsUUID } from 'class-validator';
export class UpdateSalesOrderDto {
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsString() status?: string;
  @IsOptional() @IsString() notes?: string;
  @IsOptional() @IsString() shipping_address?: string;
  @IsOptional() @IsString() shippingAddress?: string;
  /** Saved customer_addresses row; null clears back to the typed address. */
  @IsOptional() @IsUUID() shipping_address_id?: string;
  @IsOptional() @IsUUID() shippingAddressId?: string;
}
