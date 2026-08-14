import { Module } from "@nestjs/common";
import { VaultService } from "./vault.service";
import { VaultController } from "./vault.controller";
import { AuthModule } from "../auth/auth.module";
import { AuditModule } from "../audit/audit.module";
import { StorageModule } from "../storage/storage.module";

@Module({
  imports: [AuthModule, AuditModule, StorageModule],
  controllers: [VaultController],
  providers: [VaultService],
  exports: [VaultService],
})
export class VaultModule {}
