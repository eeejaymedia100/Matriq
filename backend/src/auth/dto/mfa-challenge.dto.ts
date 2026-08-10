import { IsString, Length, MinLength } from "class-validator";

export class MfaChallengeDto {
  @IsString()
  @MinLength(10)
  challengeToken: string;

  @IsString()
  @Length(6, 6)
  code: string;
}
