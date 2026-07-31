import { IsBoolean, IsIn, IsNumber, IsOptional, IsString, MaxLength, Min } from 'class-validator';

/** Spec Tab 3 §4 — kept as a soft list; custom types are allowed. */
export const EQUIPMENT_TYPES = [
  'trolley',
  'pallet_jack',
  'forklift',
  'hand_cart',
  'cage_trolley',
] as const;

export class CreateEquipmentDto {
  @IsString() @MaxLength(120) name: string;
  @IsOptional() @IsString() @MaxLength(40) code?: string;
  @IsOptional() @IsString() @MaxLength(30) equipmentType?: string;
  @IsOptional() @IsNumber() @Min(0) capacityKg?: number;
  @IsOptional() @IsBoolean() requiresCertifiedOperator?: boolean;
  @IsOptional() @IsIn(['active', 'inactive']) status?: string;
}

export class UpdateEquipmentDto {
  @IsOptional() @IsString() @MaxLength(120) name?: string;
  @IsOptional() @IsString() @MaxLength(40) code?: string;
  @IsOptional() @IsString() @MaxLength(30) equipmentType?: string;
  @IsOptional() @IsNumber() @Min(0) capacityKg?: number;
  @IsOptional() @IsBoolean() requiresCertifiedOperator?: boolean;
  @IsOptional() @IsIn(['active', 'inactive']) status?: string;
}
