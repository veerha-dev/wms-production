import { IsBoolean, IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateCarrierDto {
  @IsString() @MaxLength(120) name: string;
  @IsOptional() @IsString() @MaxLength(40) code?: string;
  @IsOptional() @IsString() @MaxLength(40) carrierType?: string;
  @IsOptional() @IsString() @MaxLength(60) transporterId?: string;
  @IsOptional() @IsString() @MaxLength(120) contact?: string;
  @IsOptional() @IsBoolean() apiIntegrated?: boolean;
  @IsOptional() @IsIn(['active', 'inactive']) status?: string;
}

export class UpdateCarrierDto {
  @IsOptional() @IsString() @MaxLength(120) name?: string;
  @IsOptional() @IsString() @MaxLength(40) code?: string;
  @IsOptional() @IsString() @MaxLength(40) carrierType?: string;
  @IsOptional() @IsString() @MaxLength(60) transporterId?: string;
  @IsOptional() @IsString() @MaxLength(120) contact?: string;
  @IsOptional() @IsBoolean() apiIntegrated?: boolean;
  @IsOptional() @IsIn(['active', 'inactive']) status?: string;
}
