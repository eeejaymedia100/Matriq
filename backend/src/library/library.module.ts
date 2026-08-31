import { Module } from "@nestjs/common";
import { PrismaModule } from "../prisma/prisma.module";
import { StorageModule } from "../storage/storage.module";
import { AdminModule } from "../admin/admin.module";
import { LibraryService } from "./library.service";
import { LibraryController } from "./library.controller";
import { LibraryAdminController } from "./library.admin.controller";

@Module({
  imports: [PrismaModule, StorageModule, AdminModule],
  controllers: [LibraryController, LibraryAdminController],
  providers: [LibraryService],
  exports: [LibraryService],
})
export class LibraryModule {}