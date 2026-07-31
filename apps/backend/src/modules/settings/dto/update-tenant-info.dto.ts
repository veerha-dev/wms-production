import {
  IsEmail, IsInt, IsOptional, IsString, Matches, Max, MaxLength, Min,
} from 'class-validator';

/** ~2 MB of characters. A base64 data URL is ~1.37x the raw byte size. */
const MAX_LOGO_CHARS = 2 * 1024 * 1024;

/**
 * The logo is stored inline in `tenants.logo_url` as a base64 data URL at
 * launch (no object-storage infra yet). An https:// URL is also accepted so the
 * later move to R2/S3 needs no API change. SVG is deliberately excluded — an
 * SVG data URL can carry script.
 */
const LOGO_RE = /^(data:image\/(png|jpe?g|gif|webp);base64,[A-Za-z0-9+/=\s]+|https:\/\/\S+)$/;

export class UpdateTenantInfoDto {
  @IsOptional() @IsString() @MaxLength(200) companyName?: string;

  @IsOptional() @IsString() @MaxLength(40) companyType?: string;

  @IsOptional() @IsString() industry?: string;

  @IsOptional() @IsString() @MaxLength(500) address?: string;
  @IsOptional() @IsString() @MaxLength(120) city?: string;
  @IsOptional() @IsString() @MaxLength(60) state?: string;
  @IsOptional() @IsString() @MaxLength(12) pincode?: string;
  @IsOptional() @IsString() @MaxLength(60) country?: string;

  @IsOptional() @IsString() @MaxLength(20) phone?: string;
  @IsOptional() @IsEmail() @MaxLength(200) email?: string;

  @IsOptional() @IsString() @MaxLength(20) gstNumber?: string;

  @IsOptional() @IsString() @MaxLength(20)
  @Matches(/^[A-Z]{5}[0-9]{4}[A-Z]$/, { message: 'panNumber must look like ABCDE1234F' })
  panNumber?: string;

  @IsOptional() @IsInt() @Min(1) @Max(12) fyStartMonth?: number;

  /** Alias the Settings UI sends; folded into `fyStartMonth` by the service. */
  @IsOptional() @IsInt() @Min(1) @Max(12) financialYearStartMonth?: number;

  @IsOptional() @IsString() @MaxLength(MAX_LOGO_CHARS, {
    message: 'logoUrl must be under 2 MB — please upload a smaller image',
  })
  @Matches(LOGO_RE, {
    message: 'logoUrl must be a data:image/(png|jpg|gif|webp);base64 URL or an https:// URL',
  })
  logoUrl?: string;
}
