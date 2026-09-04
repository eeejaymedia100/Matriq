import { Module } from "@nestjs/common";
import { DeepReadService } from "./deepread.service";
import { DeepReadController } from "./deepread.controller";
import { DeepReadPreprocessService } from "./deepread-preprocess.service";
import { DeepReadTranscribeService } from "./deepread-transcribe.service";
import { DeepReadCacheService } from "./deepread-cache.service";
import { AuthModule } from "../auth/auth.module";
import { NotificationsModule } from "../notifications/notifications.module";
import { StorageModule } from "../storage/storage.module";

@Module({
  imports: [AuthModule, NotificationsModule, StorageModule],
  controllers: [DeepReadController],
  providers: [
    DeepReadService,
    DeepReadPreprocessService,
    DeepReadTranscribeService,
    DeepReadCacheService,
  ],
  exports: [DeepReadService],
})
export class DeepReadModule {}
