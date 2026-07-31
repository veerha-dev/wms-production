import { IsIn, IsOptional, IsString } from 'class-validator';

export class QueryOperationsDto {
  @IsOptional() @IsString() search?: string;
  @IsOptional() @IsIn(['active', 'inactive']) status?: string;
}
