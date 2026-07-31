import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

export const DOOR_TYPES = ['inbound', 'outbound', 'both'] as const;

export class CreateDockDoorDto {
  @IsString() @MaxLength(120) name: string;
  @IsOptional() @IsString() @MaxLength(40) code?: string;
  @IsOptional() @IsIn(DOOR_TYPES as unknown as string[]) doorType?: string;
  @IsOptional() @IsIn(['active', 'inactive']) status?: string;
}

export class UpdateDockDoorDto {
  @IsOptional() @IsString() @MaxLength(120) name?: string;
  @IsOptional() @IsString() @MaxLength(40) code?: string;
  @IsOptional() @IsIn(DOOR_TYPES as unknown as string[]) doorType?: string;
  @IsOptional() @IsIn(['active', 'inactive']) status?: string;
}
