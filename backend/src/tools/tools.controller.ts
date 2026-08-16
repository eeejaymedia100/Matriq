import {
  Controller,
  Post,
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

}
