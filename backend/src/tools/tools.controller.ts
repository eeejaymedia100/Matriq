import {
  Controller,
  Post,
  Body,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  UploadedFiles,
} from "@nestjs/common";
import {
  FileInterceptor,
  FilesInterceptor,
} from "@nestjs/platform-express";
import { Throttle } from "@nestjs/throttler";
import { IsOptional, IsString, Matches, MaxLength } from "class-validator";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { ToolsService } from "./tools.service";

class PassportDto {
  @IsOptional()
  @IsString()
  @MaxLength(7)
  @Matches(/^#?[0-9a-fA-F]{6}$/, { message: "color must be a #RRGGBB hex" })
  color?: string;
}

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

  // PDF merge — combine up to 10 PDFs in order (capped for memory).
  @Post("tools/pdf/merge")
  @UseGuards(JwtAuthGuard)
  @Throttle({ default: { ttl: 60000, limit: 10 } })
  @UseInterceptors(
    FilesInterceptor("files", 10, { limits: { fileSize: 16 * 1024 * 1024 } }),
  )
  merge(@UploadedFiles() files: Express.Multer.File[]) {
    return this.toolsService.mergePdfs(files ?? []);
  }

  // PDF split — every page becomes its own PDF, returned as a zip.
  @Post("tools/pdf/split")
  @UseGuards(JwtAuthGuard)
  @Throttle({ default: { ttl: 60000, limit: 10 } })
  @UseInterceptors(
    FileInterceptor("file", { limits: { fileSize: 31 * 1024 * 1024 } }),
  )
  split(@UploadedFile() file: Express.Multer.File) {
    return this.toolsService.splitPdf(file);
  }

  // PDF → Word (.docx)
  @Post("tools/pdf/to-word")
  @UseGuards(JwtAuthGuard)
  @Throttle({ default: { ttl: 60000, limit: 10 } })
  @UseInterceptors(
    FileInterceptor("file", { limits: { fileSize: 21 * 1024 * 1024 } }),
  )
  pdfToWord(@UploadedFile() file: Express.Multer.File) {
    return this.toolsService.pdfToWord(file);
  }

  // Word (.docx) → PDF
  @Post("tools/pdf/from-word")
  @UseGuards(JwtAuthGuard)
  @Throttle({ default: { ttl: 60000, limit: 10 } })
  @UseInterceptors(
    FileInterceptor("file", { limits: { fileSize: 21 * 1024 * 1024 } }),
  )
  wordToPdf(@UploadedFile() file: Express.Multer.File) {
    return this.toolsService.wordToPdf(file);
  }

  // Passport background remover (uniform-background replacement)
  @Post("tools/passport")
  @UseGuards(JwtAuthGuard)
  @Throttle({ default: { ttl: 60000, limit: 10 } })
  @UseInterceptors(
    FileInterceptor("image", { limits: { fileSize: 11 * 1024 * 1024 } }),
  )
  passport(
    @UploadedFile() file: Express.Multer.File,
    @Body() dto: PassportDto,
  ) {
    return this.toolsService.removePassportBackground(file, dto?.color);
  }
}
