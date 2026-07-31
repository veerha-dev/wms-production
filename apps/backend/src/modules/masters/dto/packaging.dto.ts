import { IsIn, IsNumber, IsOptional, IsString, MaxLength, Min } from 'class-validator';

export class CreateBoxDto {
  @IsString() @MaxLength(120) name: string;
  @IsOptional() @IsString() @MaxLength(40) code?: string;
  @IsOptional() @IsNumber() @Min(0) lengthCm?: number;
  @IsOptional() @IsNumber() @Min(0) widthCm?: number;
  @IsOptional() @IsNumber() @Min(0) heightCm?: number;
  @IsOptional() @IsNumber() @Min(0) maxWeightKg?: number;
  @IsOptional() @IsString() @MaxLength(40) boxType?: string;
  @IsOptional() @IsNumber() @Min(0) cost?: number;
  @IsOptional() @IsIn(['active', 'inactive']) status?: string;
}

export class UpdateBoxDto {
  @IsOptional() @IsString() @MaxLength(120) name?: string;
  @IsOptional() @IsString() @MaxLength(40) code?: string;
  @IsOptional() @IsNumber() @Min(0) lengthCm?: number;
  @IsOptional() @IsNumber() @Min(0) widthCm?: number;
  @IsOptional() @IsNumber() @Min(0) heightCm?: number;
  @IsOptional() @IsNumber() @Min(0) maxWeightKg?: number;
  @IsOptional() @IsString() @MaxLength(40) boxType?: string;
  @IsOptional() @IsNumber() @Min(0) cost?: number;
  @IsOptional() @IsIn(['active', 'inactive']) status?: string;
}

export class CreateMaterialDto {
  @IsString() @MaxLength(120) name: string;
  @IsOptional() @IsString() @MaxLength(40) code?: string;
  @IsOptional() @IsString() @MaxLength(20) unit?: string;
  @IsOptional() @IsNumber() @Min(0) cost?: number;
  @IsOptional() @IsIn(['active', 'inactive']) status?: string;
}

export class UpdateMaterialDto {
  @IsOptional() @IsString() @MaxLength(120) name?: string;
  @IsOptional() @IsString() @MaxLength(40) code?: string;
  @IsOptional() @IsString() @MaxLength(20) unit?: string;
  @IsOptional() @IsNumber() @Min(0) cost?: number;
  @IsOptional() @IsIn(['active', 'inactive']) status?: string;
}
