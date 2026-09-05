import {
  IsEmail,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from "class-validator";

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
  institutionId?: string;

  // Optional referral share code from an existing student's invite link.
  // Stored as pendingReferralCode and only credited once the invitee
  // verifies their email — see AuthService.consumePendingReferral.
  @IsOptional()
  @IsString()
  @MaxLength(64)
  referralCode?: string;

  @IsString()
  @IsNotEmpty()
  privacyPolicyVersion: string;

  @IsString()
  @IsNotEmpty()
  termsVersion: string;
}
