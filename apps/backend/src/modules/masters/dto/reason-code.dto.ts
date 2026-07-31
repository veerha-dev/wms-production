import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import { REASON_CATEGORIES } from '../masters.registry';

export class CreateReasonCodeDto {
  @IsString() @MaxLength(200) reasonText: string;
  @IsIn(REASON_CATEGORIES as unknown as string[]) category: string;
  @IsOptional() @IsString() @MaxLength(40) code?: string;
  @IsOptional() @IsIn(['active', 'inactive']) status?: string;
}

export class UpdateReasonCodeDto {
  @IsOptional() @IsString() @MaxLength(200) reasonText?: string;
  @IsOptional() @IsIn(REASON_CATEGORIES as unknown as string[]) category?: string;
  @IsOptional() @IsString() @MaxLength(40) code?: string;
  @IsOptional() @IsIn(['active', 'inactive']) status?: string;
}
