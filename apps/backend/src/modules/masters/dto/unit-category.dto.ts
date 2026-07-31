import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateUnitDto {
  @IsString() @MaxLength(40) code: string;
  @IsString() @MaxLength(120) name: string;
  @IsOptional() @IsIn(['active', 'inactive']) status?: string;
}

export class UpdateUnitDto {
  @IsOptional() @IsString() @MaxLength(40) code?: string;
  @IsOptional() @IsString() @MaxLength(120) name?: string;
  @IsOptional() @IsIn(['active', 'inactive']) status?: string;
}

export class CreateSkuCategoryDto {
  @IsString() @MaxLength(120) name: string;
  @IsOptional() @IsString() @MaxLength(40) code?: string;
  @IsOptional() @IsIn(['active', 'inactive']) status?: string;
}

export class UpdateSkuCategoryDto {
  @IsOptional() @IsString() @MaxLength(120) name?: string;
  @IsOptional() @IsString() @MaxLength(40) code?: string;
  @IsOptional() @IsIn(['active', 'inactive']) status?: string;
}
