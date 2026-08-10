import { IsEmail, IsNotEmpty, IsString, MinLength } from "class-validator";

export class RegisterStayliteDto {
  @IsEmail()
  email: string;

  @IsString()
  @IsNotEmpty()
  fullName: string;

  @IsString()
  @MinLength(8)
  password: string;

  @IsString()
  @IsNotEmpty()
  matricNumber: string;

  @IsString()
  @IsNotEmpty()
  faculty: string;

  @IsString()
  @IsNotEmpty()
  department: string;

  @IsString()
  @IsNotEmpty()
  level: string;

  // Legal consent: which versions the user is accepting during registration
  @IsString()
  @IsNotEmpty()
  privacyPolicyVersion: string;

  @IsString()
  @IsNotEmpty()
  termsVersion: string;
}
