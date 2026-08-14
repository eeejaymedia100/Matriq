import {
  Controller,
  Post,
  UseGuards,
  UseInterceptors,
  UploadedFile,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { Throttle } from "@nestjs/throttler";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { ToolsService } from "./tools.service";

@Controller("v1")
export class ToolsController {
  constructor(private readonly toolsService: ToolsService) {}

  // Image to Text (OCR) — spec §8. 10/min: OCR is CPU-bound on the box.
  @Post("tools/ocr")
  @UseGuards(JwtAuthGuard)
  @Throttle({ default: { ttl: 60000, limit: 10 } })
  @UseInterceptors(
    FileInterceptor("image", { limits: { fileSize: 11 * 1024 * 1024 } }),
  )
  ocr(@UploadedFile() file: Express.Multer.File) {
    return this.toolsService.ocrImage(file);
  }
}
