import { IsOptional, IsString, IsUUID } from 'class-validator';

export class QueryLabelBinsDto {
  /** Admins may filter by warehouse; managers are forced to their own. */
  @IsOptional() @IsUUID() warehouseId?: string;

  /** "Print every label for Zone A" — the common case. */
  @IsOptional() @IsUUID() zoneId?: string;

  @IsOptional() @IsUUID() rackId?: string;

  /** Comma-separated bin UUIDs, for reprinting a hand-picked selection. */
  @IsOptional() @IsString() binIds?: string;
}
