import {
  IsString,
  IsOptional,
  IsEmail,
  IsIn,
  IsNumber,
  IsBoolean,
  MaxLength,
  Min,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { CustomerAddressDto } from './customer-address.dto';

export const CUSTOMER_TYPES = ['b2b', 'b2c'] as const;
export const PAYMENT_TERMS = ['immediate', 'net_15', 'net_30', 'net_45', 'net_60'] as const;
export const CUSTOMER_STATUSES = ['active', 'inactive'] as const;

export class CreateCustomerDto {
  @IsOptional() @IsString() @MaxLength(40) code?: string;

  @IsString() @MaxLength(255) name: string;

  @IsOptional() @IsIn(CUSTOMER_TYPES as unknown as string[]) customerType?: string;
  @IsOptional() @IsIn(CUSTOMER_TYPES as unknown as string[]) customer_type?: string;

  @IsOptional() @IsString() @MaxLength(120) contactPerson?: string;
  @IsOptional() @IsString() @MaxLength(120) contact_person?: string;

  @IsString() @MaxLength(20) phone: string;

  @IsOptional() @IsString() @MaxLength(20) whatsappNumber?: string;
  @IsOptional() @IsString() @MaxLength(20) whatsapp_number?: string;

  @ValidateIf((o) => o.email !== undefined && o.email !== null && o.email !== '')
  @IsEmail({}, { message: 'email must be a valid email address' })
  email?: string;

  // Tax details (B2B). Validated in the service: required for b2b, forbidden
  // for b2c, and the state is derived from the GSTIN's first two digits.
  @IsOptional() @IsString() @MaxLength(15) gstNumber?: string;
  @IsOptional() @IsString() @MaxLength(15) gst_number?: string;
  @IsOptional() @IsString() @MaxLength(15) gstin?: string;

  @IsOptional() @IsString() @MaxLength(20) panNumber?: string;
  @IsOptional() @IsString() @MaxLength(20) pan_number?: string;

  // Billing address
  @IsOptional() @IsString() address?: string;
  @IsOptional() @IsString() addressLine1?: string;
  @IsOptional() @IsString() address_line1?: string;
  @IsOptional() @IsString() addressLine2?: string;
  @IsOptional() @IsString() address_line2?: string;
  @IsOptional() @IsString() @MaxLength(120) city?: string;
  @IsOptional() @IsString() @MaxLength(120) state?: string;
  @IsOptional() @IsString() @MaxLength(12) pincode?: string;
  @IsOptional() @IsString() @MaxLength(12) postalCode?: string;
  @IsOptional() @IsString() @MaxLength(12) postal_code?: string;
  @IsOptional() @IsString() @MaxLength(60) country?: string;

  // Commercial
  @IsOptional() @IsIn(PAYMENT_TERMS as unknown as string[]) paymentTerms?: string;
  @IsOptional() @IsIn(PAYMENT_TERMS as unknown as string[]) payment_terms?: string;

  /** Admin-only. Stripped from the payload for non-admin callers. */
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) creditLimit?: number;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) credit_limit?: number;

  @IsOptional() @IsString() notes?: string;

  @IsOptional() @IsIn(CUSTOMER_STATUSES as unknown as string[]) status?: string;

  /** Optional address book entries created alongside the customer. */
  @IsOptional()
  @ValidateNested({ each: true })
  @Type(() => CustomerAddressDto)
  addresses?: CustomerAddressDto[];

  /** "Same as billing" shortcut — copies the billing address into the book. */
  @IsOptional() @IsBoolean() shippingSameAsBilling?: boolean;
}
