import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

/** Inline approve/reject from the notification centre (spec Part 4). */
export class NotificationActionDto {
  @IsIn(['approve', 'reject'])
  action: 'approve' | 'reject';

  @IsOptional() @IsString() @MaxLength(500) reason?: string;
}
