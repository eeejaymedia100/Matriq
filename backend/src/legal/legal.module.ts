import { Module } from "@nestjs/common";
import { LegalController } from "./legal.controller";
import { AuthModule } from "../auth/auth.module";

@Module({
  imports: [AuthModule],
  controllers: [LegalController],
})
export class LegalModule {}
