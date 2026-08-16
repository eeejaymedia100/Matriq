import { BadRequestException } from "@nestjs/common";
import { ToolsService } from "./tools.service";

/**
 * OCR input validation (round-2 QA §7 + §13). These assertions never touch the
 * tesseract binary or worker — they fail fast on the file checks.
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

  it("accepts jpeg/png/webp images (open-source tesseract path)", async () => {
    // A tiny buffer is fine here — validation passes, then the OCR engine runs.
    // To keep the test fast and offline we mock the private helpers to no-ops.
    const file = {
      buffer: Buffer.from([0xff, 0xd8, 0xff, 0xe0]),
      mimetype: "image/jpeg",
      size: 4,
      originalname: "photo.jpg",
    } as Express.Multer.File;

    const availSpy = jest
      .spyOn(service as unknown as { tesseractAvailable: () => Promise<boolean> }, "tesseractAvailable")
      .mockResolvedValue(false);
    const preSpy = jest
      .spyOn(service as unknown as { preprocessForOcr: () => Promise<Buffer> }, "preprocessForOcr")
      .mockResolvedValue(file.buffer);
    const tessSpy = jest
      .spyOn(service as unknown as { ocrWithTesseract: () => Promise<object> }, "ocrWithTesseract")
      .mockResolvedValue({
        text: "hello",
        confidence: 90,
        readable: true,
        engine: "tesseract",
      });

    const result = await service.ocrImage(file);
    expect(tessSpy).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({ readable: true, engine: "tesseract" });

    availSpy.mockRestore();
    preSpy.mockRestore();
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
