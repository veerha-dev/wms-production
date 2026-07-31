import { IsBoolean, IsOptional, IsString, MaxLength } from 'class-validator';

export class UpdateIntegrationDto {
  @IsBoolean() connected: boolean;

  /** Free-form label shown on the card (e.g. "Shiprocket — acct 4412"). */
  @IsOptional() @IsString() @MaxLength(500) connectionDetails?: string;
}
