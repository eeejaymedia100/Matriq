import { Module } from "@nestjs/common";
import { HealthController, V1HealthController } from "./health.controller";

@Module({
  controllers: [HealthController, V1HealthController],
})
export class HealthModule {}
