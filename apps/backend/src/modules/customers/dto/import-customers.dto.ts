import { IsArray, IsOptional, IsString, ValidateNested, IsBoolean } from 'class-validator';
import { Type } from 'class-transformer';

/**
 * A single spreadsheet row. Deliberately permissive at the class-validator
 * layer (everything optional strings) — per-row validation happens in the
 * service so that one bad row produces an error entry instead of rejecting
 * the whole file with a 400.
 */
export class ImportCustomerRowDto {
  @IsOptional() @IsString() code?: string;
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsString() customerType?: string;
  @IsOptional() @IsString() customer_type?: string;
  @IsOptional() @IsString() type?: string;
  @IsOptional() @IsString() contactPerson?: string;
  @IsOptional() @IsString() contact_person?: string;
  @IsOptional() @IsString() contact?: string;
  @IsOptional() @IsString() phone?: string;
  @IsOptional() @IsString() whatsappNumber?: string;
  @IsOptional() @IsString() whatsapp_number?: string;
  @IsOptional() @IsString() email?: string;
  @IsOptional() @IsString() gstNumber?: string;
  @IsOptional() @IsString() gst_number?: string;
  @IsOptional() @IsString() gstin?: string;
  @IsOptional() @IsString() panNumber?: string;
  @IsOptional() @IsString() pan_number?: string;
  @IsOptional() @IsString() address?: string;
  @IsOptional() @IsString() addressLine1?: string;
  @IsOptional() @IsString() address_line1?: string;
  @IsOptional() @IsString() city?: string;
  @IsOptional() @IsString() state?: string;
  @IsOptional() @IsString() pincode?: string;
  @IsOptional() @IsString() postalCode?: string;
  @IsOptional() @IsString() postal_code?: string;
  @IsOptional() @IsString() country?: string;
  @IsOptional() @IsString() paymentTerms?: string;
  @IsOptional() @IsString() payment_terms?: string;
  @IsOptional() creditLimit?: any;
  @IsOptional() credit_limit?: any;
  @IsOptional() @IsString() notes?: string;
  @IsOptional() @IsString() status?: string;
}

export class ImportCustomersDto {
  /**
   * Two accepted keys for the same payload: the shared ImportDialog posts
   * `{ items: [...] }`, direct API callers use `{ rows: [...] }`. Both must be
   * declared here or the global ValidationPipe (whitelist: true) strips them.
   */
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ImportCustomerRowDto)
  rows?: ImportCustomerRowDto[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ImportCustomerRowDto)
  items?: ImportCustomerRowDto[];

  /** When true, nothing is written — only the validation report is returned. */
  @IsOptional() @IsBoolean() dryRun?: boolean;
}
