import { IsIn, IsOptional, IsString } from 'class-validator';
import { REASON_CATEGORIES } from '../masters.registry';

export class QueryMastersDto {
  @IsOptional() @IsString() search?: string;
  @IsOptional() @IsIn(['active', 'inactive']) status?: string;
}

export class QueryReasonCodesDto extends QueryMastersDto {
  @IsOptional() @IsIn(REASON_CATEGORIES as unknown as string[]) category?: string;
}
