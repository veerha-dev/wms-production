import { IsBoolean, IsIn, IsOptional } from 'class-validator';

export class UpdateBarcodeSettingsDto {
  @IsOptional() @IsIn(['qr', 'barcode']) locationCodeType?: string;
  @IsOptional() @IsIn(['small', 'medium', 'large']) labelSize?: string;
  @IsOptional() @IsIn(['a4', 'thermal']) printFormat?: string;
  @IsOptional() @IsBoolean() includeHumanReadable?: boolean;
  @IsOptional() @IsIn(['manufacturer', 'auto', 'both']) skuBarcodeSource?: string;
}
