import { IsBoolean, IsInt, IsOptional, Max, Min } from 'class-validator';

export class UpdateSecurityPolicyDto {
  @IsOptional() @IsInt() @Min(6) @Max(64) passwordMinLength?: number;
  @IsOptional() @IsBoolean() passwordRequireUpper?: boolean;
  @IsOptional() @IsBoolean() passwordRequireLower?: boolean;
  @IsOptional() @IsBoolean() passwordRequireDigit?: boolean;
  @IsOptional() @IsBoolean() passwordRequireSpecial?: boolean;
  /** 0 = never expires. */
  @IsOptional() @IsInt() @Min(0) @Max(3650) passwordExpiryDays?: number;
  @IsOptional() @IsInt() @Min(5) @Max(10080) sessionTimeoutMinutes?: number;
  /** 0 = no lockout. */
  @IsOptional() @IsInt() @Min(0) @Max(100) failedLoginLockoutCount?: number;
  @IsOptional() @IsInt() @Min(1) @Max(10080) failedLoginLockoutMinutes?: number;
  @IsOptional() @IsBoolean() require2faForAdmins?: boolean;
  @IsOptional() @IsBoolean() require2faForAll?: boolean;
}
