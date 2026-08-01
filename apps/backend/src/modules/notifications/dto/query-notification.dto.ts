import { IsOptional, IsString, IsIn, IsInt, Min, Max, IsBoolean, IsISO8601 } from 'class-validator';
import { Type, Transform } from 'class-transformer';

const toBool = ({ value }: { value: any }) =>
  value === true || value === 'true' || value === '1' ? true : value === false || value === 'false' || value === '0' ? false : undefined;

export class QueryNotificationDto {
  /** Notification-centre tab. */
  @IsOptional()
  @IsIn(['inbound', 'inventory', 'outbound', 'worker', 'system'])
  category?: string;

  @IsOptional() @Transform(toBool) @IsBoolean() unread?: boolean;

  /** The Approvals tab (spec Part 4). */
  @IsOptional() @Transform(toBool) @IsBoolean() requiresAction?: boolean;

  @IsOptional() @IsIn(['info', 'warning', 'critical']) severity?: string;

  @IsOptional() @IsString() eventType?: string;

  @IsOptional() @IsISO8601() dateFrom?: string;
  @IsOptional() @IsISO8601() dateTo?: string;

  @IsOptional() @IsString() search?: string;

  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) limit?: number;
}
