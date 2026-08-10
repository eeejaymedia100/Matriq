// Shared PrismaModule — single PrismaClient instance for the entire app.
// Import this once in AppModule; every other module injects PrismaService.

import { Global, Module } from "@nestjs/common";
import { PrismaService } from "./prisma.service";

@Global()
@Module({
  providers: [PrismaService],
  exports: [PrismaService],
})
export class PrismaModule {}
