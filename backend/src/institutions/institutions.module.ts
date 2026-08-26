import { Module } from "@nestjs/common";
import { InstitutionsService } from "./institutions.service";
import { InstitutionsController } from "./institutions.controller";

@Module({
  controllers: [InstitutionsController],
  providers: [InstitutionsService],
  exports: [InstitutionsService],
})
export class InstitutionsModule {}
