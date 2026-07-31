import { IsBoolean, IsIn, IsObject, IsOptional } from 'class-validator';

export class UpdateNotificationConfigDto {
  @IsOptional() @IsBoolean() enabled?: boolean;
  @IsOptional() @IsBoolean() emailEnabled?: boolean;
  @IsOptional() @IsIn(['admin', 'manager', 'both']) recipients?: string;

  /** Per-alert extras, e.g. `{ daysBefore: 30 }` for the expiry alert. */
  @IsOptional() @IsObject() config?: Record<string, any>;
}
