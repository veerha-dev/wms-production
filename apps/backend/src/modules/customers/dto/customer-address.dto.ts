import { IsString, IsOptional, IsIn, IsBoolean, MaxLength } from 'class-validator';

export const ADDRESS_TYPES = ['billing', 'shipping'] as const;

export class CustomerAddressDto {
  @IsOptional() @IsString() @MaxLength(120) label?: string;

  @IsOptional() @IsIn(ADDRESS_TYPES as unknown as string[]) addressType?: string;
  @IsOptional() @IsIn(ADDRESS_TYPES as unknown as string[]) address_type?: string;

  @IsOptional() @IsString() street?: string;
  @IsOptional() @IsString() address?: string;

  @IsOptional() @IsString() @MaxLength(120) city?: string;
  @IsOptional() @IsString() @MaxLength(120) state?: string;
  @IsOptional() @IsString() @MaxLength(12) pincode?: string;
  @IsOptional() @IsString() @MaxLength(12) postalCode?: string;

  @IsOptional() @IsBoolean() isDefault?: boolean;
  @IsOptional() @IsBoolean() is_default?: boolean;

  @IsOptional() @IsIn(['active', 'inactive']) status?: string;
}

export class UpdateCustomerAddressDto extends CustomerAddressDto {}
