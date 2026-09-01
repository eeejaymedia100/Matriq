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

/**
 * OCR hybrid pipeline — the quality gate that decides when a scan escalates
 * to the Gemini rescue pass. Tesseract helpers are stubbed so no binary,
 * worker or network call ever runs; Gemini is stubbed so no API is hit.
 */
describe("ToolsService — OCR hybrid pipeline", () => {
  // `!` — jest's beforeEach always assigns before any test (or helper) runs.
  let service!: ToolsService;
  const fakeJpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0]);

  beforeEach(() => {
    service = new ToolsService();
  });

  const stubTesseract = (
    overrides: Partial<{
      text: string;
      confidence: number;
      readable: boolean;
    }> = {},
  ) => {
    const result = {
      text: overrides.text ?? "",
      confidence: overrides.confidence ?? 0,
      readable: overrides.readable ?? false,
      engine: "tesseract" as const,
    };
    const avail = jest
      .spyOn(
        service as unknown as { tesseractAvailable: () => Promise<boolean> },
        "tesseractAvailable",
      )
      .mockResolvedValue(true);
    const pre = jest
      .spyOn(
        service as unknown as { preprocessForOcr: (b: Buffer) => Promise<Buffer> },
        "preprocessForOcr",
      )
      .mockResolvedValue(fakeJpeg);
    const sys = jest
      .spyOn(
        service as unknown as {
          ocrWithSystemTesseract: (b: Buffer) => Promise<object>;
        },
        "ocrWithSystemTesseract",
      )
      .mockResolvedValue(result);
    return { avail, pre, sys, result };
  };

  const stubGeminiEnabled = (enabled: boolean) =>
    jest
      .spyOn(
        service as unknown as { isGeminiOcrEnabled: () => Promise<boolean> },
        "isGeminiOcrEnabled",
      )
      .mockResolvedValue(enabled);

  const stubGemini = (result: object | null) =>
    jest
      .spyOn(
        service as unknown as {
          ocrWithGemini: (b: Buffer, m: string) => Promise<object | null>;
        },
        "ocrWithGemini",
      )
      .mockResolvedValue(result);

  it("trusts Tesseract when confidence is high — no Gemini call, no API cost", async () => {
    const { sys } = stubTesseract({
      text: "printed lecture slide",
      confidence: 91,
      readable: true,
    });
    const gemini = stubGemini({});
    const gEnabled = stubGeminiEnabled(false);

    const result = await service.ocrBuffer(fakeJpeg, "image/jpeg");

    expect(sys).toHaveBeenCalledTimes(1);
    expect(gemini).not.toHaveBeenCalled();
    expect(gEnabled).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      text: "printed lecture slide",
      confidence: 91,
      engine: "tesseract",
    });
  });

  it("rescues with Gemini when Tesseract isn't confident (the handwriting case)", async () => {
    stubTesseract({ text: "", confidence: 12, readable: false });
    stubGeminiEnabled(true);
    const gemini = stubGemini({
      text: "handwritten lecture note",
      confidence: 100,
      readable: true,
      engine: "gemini",
    });

    const result = await service.ocrBuffer(fakeJpeg, "image/jpeg");

    expect(gemini).toHaveBeenCalledWith(fakeJpeg, "image/jpeg");
    expect(result).toMatchObject({
      text: "handwritten lecture note",
      readable: true,
      engine: "gemini",
    });
  });

  it("returns Tesseract's best effort when Gemini is not configured (old behaviour)", async () => {
    stubTesseract({ text: "", confidence: 20, readable: false });
    stubGeminiEnabled(false);
    const gemini = stubGemini(null);

    const result = await service.ocrBuffer(fakeJpeg, "image/jpeg");

    expect(gemini).not.toHaveBeenCalled();
    expect(result).toMatchObject({ confidence: 20, readable: false, engine: "tesseract" });
  });

  it("keeps Tesseract's effort when Gemini finds no readable text either", async () => {
    const { result: lowConf } = stubTesseract({
      text: "co",
      confidence: 30,
      readable: false,
    });
    stubGeminiEnabled(true);
    stubGemini({ text: "", confidence: 0, readable: false, engine: "gemini" });

    const result = await service.ocrBuffer(fakeJpeg, "image/jpeg");

    expect(result).toBe(lowConf);
  });
});
