import { IsBoolean, IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

export class CreatePackingStationDto {
  @IsString() @MaxLength(120) name: string;
  @IsOptional() @IsString() @MaxLength(40) code?: string;
  @IsOptional() @IsString() @MaxLength(120) zoneLocation?: string;
  @IsOptional() @IsBoolean() hasLabelPrinter?: boolean;
  @IsOptional() @IsBoolean() hasWeighingScale?: boolean;
  @IsOptional() @IsIn(['active', 'inactive']) status?: string;
}

export class UpdatePackingStationDto {
  @IsOptional() @IsString() @MaxLength(120) name?: string;
  @IsOptional() @IsString() @MaxLength(40) code?: string;
  @IsOptional() @IsString() @MaxLength(120) zoneLocation?: string;
  @IsOptional() @IsBoolean() hasLabelPrinter?: boolean;
  @IsOptional() @IsBoolean() hasWeighingScale?: boolean;
  @IsOptional() @IsIn(['active', 'inactive']) status?: string;
}
