import { IsEmail, IsNotEmpty, IsString, MinLength } from "class-validator";

export class RegisterFresherDto {
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
  jambNumber: string;

  @IsString()
  @IsNotEmpty()
  faculty: string;

  @IsString()
  @IsNotEmpty()
  department: string;

  @IsString()
  @IsNotEmpty()
  privacyPolicyVersion: string;

  @IsString()
  @IsNotEmpty()
  termsVersion: string;
}
