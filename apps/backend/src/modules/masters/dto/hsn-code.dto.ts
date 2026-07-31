import { IsIn, IsNumber, IsOptional, IsString, Matches, Max, MaxLength, Min } from 'class-validator';

export class CreateHsnCodeDto {
  @IsString()
  @Matches(/^\d{4,12}$/, { message: 'hsnCode must be 4 to 12 digits' })
  hsnCode: string;

  @IsOptional() @IsString() @MaxLength(200) description?: string;
  @IsOptional() @IsNumber() @Min(0) @Max(100) gstRate?: number;
  @IsOptional() @IsIn(['active', 'inactive']) status?: string;
}

export class UpdateHsnCodeDto {
  @IsOptional() @IsString()
  @Matches(/^\d{4,12}$/, { message: 'hsnCode must be 4 to 12 digits' })
  hsnCode?: string;

  @IsOptional() @IsString() @MaxLength(200) description?: string;
  @IsOptional() @IsNumber() @Min(0) @Max(100) gstRate?: number;
  @IsOptional() @IsIn(['active', 'inactive']) status?: string;
}
