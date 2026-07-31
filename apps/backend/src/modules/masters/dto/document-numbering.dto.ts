import { IsBoolean, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

export class UpdateDocumentNumberingDto {
  @IsOptional() @IsString() @MaxLength(20) prefix?: string;

  /** The value the next issued document will carry. */
  @IsOptional() @IsInt() @Min(1) nextNumber?: number;

  @IsOptional() @IsInt() @Min(1) @Max(12) numberLength?: number;

  @IsOptional() @IsBoolean() resetYearly?: boolean;
}
