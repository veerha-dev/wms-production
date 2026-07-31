import { IsOptional, IsString, IsBoolean, IsInt, IsIn, Min, Max, Matches } from 'class-validator';

export class UpdateGeneralDto {
  @IsOptional() @IsString() systemName?: string;
  @IsOptional() @IsIn(['en', 'hi', 'es', 'fr', 'de', 'ar']) language?: string;
  @IsOptional() @IsString() timezone?: string;
  @IsOptional() @IsIn(['mdy', 'dmy', 'ymd']) dateFormat?: string;
  @IsOptional() @IsBoolean() autoRefresh?: boolean;
  @IsOptional() @IsBoolean() compactView?: boolean;
  @IsOptional() @IsInt() @Min(15) @Max(3600) refreshIntervalSeconds?: number;
}

export class UpdateNotificationsDto {
  @IsOptional() @IsBoolean() notifEmailLowStock?: boolean;
  @IsOptional() @IsBoolean() notifEmailTaskException?: boolean;
  @IsOptional() @IsBoolean() notifEmailDailySummary?: boolean;
  @IsOptional() @IsBoolean() notifEmailUserActivity?: boolean;
  @IsOptional() @IsBoolean() notifEmailSystemUpdates?: boolean;
  @IsOptional() @IsBoolean() notifInappRealtime?: boolean;
  @IsOptional() @IsBoolean() notifInappSound?: boolean;
}

export class UpdateAppearanceDto {
  @IsOptional() @IsIn(['light', 'dark', 'system']) theme?: string;
  @IsOptional() @IsString()
  @Matches(/^#[0-9A-Fa-f]{6}$/, { message: 'primaryColor must be a valid hex colour like #2B9E8C' })
  primaryColor?: string;
}

export class UpdateSecurityPrefsDto {
  @IsOptional() @IsInt() @IsIn([15, 30, 60, 480]) sessionTimeoutMinutes?: number;
}
