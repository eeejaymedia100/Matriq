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

  // Image to Text (OCR) — spec §8. 10/min: OCR is CPU/API-bound.
  @Post("tools/ocr")
  @UseGuards(JwtAuthGuard)
  @Throttle({ default: { ttl: 60000, limit: 10 } })
  @UseInterceptors(
    FileInterceptor("image", { limits: { fileSize: 11 * 1024 * 1024 } }),
  )
  ocr(@UploadedFile() file: Express.Multer.File) {
    return this.toolsService.ocrImage(file);
  }

  // Extract plain text from a study file (PDF/DOCX/txt/photo) — used by the
  // offline-AI material import on mobile. 10/min: extraction is CPU-bound.
  @Post("tools/extract-text")
  @UseGuards(JwtAuthGuard)
  @Throttle({ default: { ttl: 60000, limit: 10 } })
  @UseInterceptors(
    FileInterceptor("file", { limits: { fileSize: 21 * 1024 * 1024 } }),
  )
  extractText(@UploadedFile() file: Express.Multer.File) {
    return this.toolsService.extractText(file);
  }

  // Transcribe a voice note (Gemini audio understanding). 6/min: audio
  // transcription is API-bound.
  @Post("tools/transcribe")
  @UseGuards(JwtAuthGuard)
  @Throttle({ default: { ttl: 60000, limit: 6 } })
  @UseInterceptors(
    FileInterceptor("audio", { limits: { fileSize: 10 * 1024 * 1024 } }),
  )
  transcribe(@UploadedFile() file: Express.Multer.File) {
    return this.toolsService.transcribeAudio(file);
  }
}
