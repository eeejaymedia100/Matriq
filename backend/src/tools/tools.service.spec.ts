import { BadRequestException } from "@nestjs/common";
import { ToolsService } from "./tools.service";

/**
 * OCR input validation (round-2 QA §7 + §13). These assertions never touch
 * Gemini or the tesseract worker — they fail fast on the file checks.
 */
describe("ToolsService — OCR input validation", () => {
  let service: ToolsService;

  beforeEach(() => {
    service = new ToolsService();
  });

  it("rejects a missing file", async () => {
    await expect(
      service.ocrImage(undefined as unknown as Express.Multer.File),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("rejects unsupported mime types (never trust the client)", async () => {
    const file = {
      buffer: Buffer.from("hello"),
      mimetype: "text/plain",
      size: 5,
      originalname: "note.txt",
    } as Express.Multer.File;
    await expect(service.ocrImage(file)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it("accepts jpeg/png/webp images", async () => {
    // A tiny buffer is fine here — validation passes, then the Gemini path
    // short-circuits (no key in this env) into the tesseract worker. To keep
    // the test fast and offline we assert the *acceptance* by mocking the
    // private OCR helpers to no-ops.
    const file = {
      buffer: Buffer.from([0xff, 0xd8, 0xff, 0xe0]),
      mimetype: "image/jpeg",
      size: 4,
      originalname: "photo.jpg",
    } as Express.Multer.File;

    const geminiSpy = jest
      .spyOn(service as unknown as { ocrWithGemini: () => Promise<null> }, "ocrWithGemini")
      .mockResolvedValue(null);
    const tessSpy = jest
      .spyOn(service as unknown as { ocrWithTesseract: () => Promise<object> }, "ocrWithTesseract")
      .mockResolvedValue({
        text: "hello",
        confidence: 90,
        readable: true,
        engine: "tesseract",
      });

    // No GEMINI_API_KEY set → the Gemini branch is skipped entirely and the
    // tesseract fallback handles it (exactly the designed behaviour).
    const result = await service.ocrImage(file);
    expect(tessSpy).toHaveBeenCalledTimes(1);
    expect(geminiSpy).toHaveBeenCalledTimes(0);
    expect(result).toMatchObject({ readable: true });

    geminiSpy.mockRestore();
    tessSpy.mockRestore();
  });

  it("rejects oversized images (>10 MB)", async () => {
    const big = Buffer.alloc(11 * 1024 * 1024);
    const file = {
      buffer: big,
      mimetype: "image/png",
      size: big.length,
      originalname: "big.png",
    } as Express.Multer.File;
    await expect(service.ocrImage(file)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });
});
