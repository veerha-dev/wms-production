import { IsEmail, IsString, MinLength, MaxLength } from 'class-validator';

export class SignupDto {
  @IsEmail()
  email: string;

  @IsString()
  @MinLength(6)
  password: string;

  @IsString()
  @MinLength(2)
  @MaxLength(100)
  fullName: string;

  // Required: each signup provisions its own tenant, which needs a name.
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  companyName: string;
}
