import { IsOptional, IsString } from 'class-validator';

export class QueryLabelSkusDto {
  /** Comma-separated SKU UUIDs, for printing a hand-picked selection. */
  @IsOptional() @IsString() skuIds?: string;

  @IsOptional() @IsString() category?: string;

  /** Matches SKU code, name or barcode. */
  @IsOptional() @IsString() search?: string;
}
