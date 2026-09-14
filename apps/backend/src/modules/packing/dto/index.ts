import { IsOptional, IsString, IsNumber, IsUUID, Min, IsInt } from 'class-validator';
import { Type } from 'class-transformer';

export class QueryPackingOrdersDto {
  @IsOptional() @IsString() search?: string;
  @IsOptional() @IsUUID() warehouseId?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) limit?: number;
}

export class ScanPackItemDto {
  @IsString() barcode!: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) quantity?: number;
}

export class SetItemQuantityDto {
  @Type(() => Number) @IsInt() @Min(0) quantity!: number;
}

export class AssignItemPackageDto {
  // null detaches the item from its package.
  @IsOptional() @IsUUID() packageId?: string | null;
}

export class UpsertPackageDto {
  @IsOptional() @IsUUID() boxId?: string | null;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) lengthCm?: number;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) widthCm?: number;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) heightCm?: number;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) weightKg?: number;
}

export class SetLabelDto {
  @IsOptional() @IsString() carrier?: string;
  @IsOptional() @IsString() trackingNumber?: string;
  /** Set by a courier integration; empty for the manual launch-phase label. */
  @IsOptional() @IsString() labelUrl?: string;
  @IsOptional() @IsString() labelSource?: string;
}
