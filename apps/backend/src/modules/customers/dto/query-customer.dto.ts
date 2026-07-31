import { IsOptional, IsString, IsIn, IsInt, Min, Max } from 'class-validator';
import { Type } from 'class-transformer';

export class QueryCustomerDto {
  /** Matches name, code, phone or GSTIN. */
  @IsOptional() @IsString() search?: string;

  @IsOptional() @IsIn(['b2b', 'b2c']) customerType?: string;
  @IsOptional() @IsIn(['b2b', 'b2c']) customer_type?: string;
  @IsOptional() @IsIn(['b2b', 'b2c']) type?: string;

  @IsOptional() @IsString() state?: string;
  @IsOptional() @IsString() city?: string;
  @IsOptional() @IsIn(['active', 'inactive']) status?: string;

  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page?: number = 1;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(500) limit?: number = 20;

  @IsOptional() @IsString() sortBy?: string;
  @IsOptional() @IsString() sort_by?: string;
  @IsOptional() @IsIn(['asc', 'desc', 'ASC', 'DESC']) sortOrder?: string;
  @IsOptional() @IsIn(['asc', 'desc', 'ASC', 'DESC']) sort_order?: string;
}

export class SearchCustomerDto {
  @IsOptional() @IsString() q?: string;
  @IsOptional() @IsString() search?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(50) limit?: number = 10;
}

export class CreditCheckDto {
  @IsOptional() @Type(() => Number) orderValue?: number;
  @IsOptional() @Type(() => Number) order_value?: number;
}
