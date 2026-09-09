import { contentFingerprint, contentFingerprintMatches } from "./resource-audit.duplicates";

/**
 * The metadata-immune duplicate key: re-saving a document (new export,
 * new timestamps, re-zipped container) changes its SHA-256 but not its
 * content chunks — the fingerprint must stay stable, so the same document
 * re-uploaded under a new course code is still caught at intake.
 */

/** A minimal PDF (≥512 B) whose object-2 body is fingerprint-significant. */
function pdfBuffer(trailerId: string, startxref: string, padChar = "x"): Buffer {
  const header = "%PDF-1.7\n";
  const obj1 = "1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n";
  const obj2Body = "<< /Type /Pages /Count 0 /Notes (" + padChar.repeat(400) + ") >>";
  const obj2 = `2 0 obj\n${obj2Body}\nendobj\n`;
  // The trailer is what every re-save rewrites: new IDs, new offsets.
  const tail = `xref\n0 3\ntrailer\n<< /ID [<${trailerId}>] >>\nstartxref\n${startxref}\n%%EOF\n`;
  return Buffer.from(header + obj1 + obj2 + tail, "latin1");
}

describe("contentFingerprint — the metadata-immune duplicate key", () => {
  it("is stable across a re-save that changes the SHA-256", () => {
    const original = pdfBuffer("original-id-0001", "999");
    const resaved = pdfBuffer("RE-SAVED-ID-9999", "1001");
    // The premise: the byte streams (and thus SHA-256) really differ.
    expect(resaved.equals(original)).toBe(false);

    const fp1 = contentFingerprint(original, "application/pdf");
    const fp2 = contentFingerprint(resaved, "application/pdf");
    expect(fp1).toBeTruthy();
    expect(fp2).toBeTruthy();
    expect(fp1).toEqual(fp2);
    expect(contentFingerprintMatches(fp1, fp2)).toBe(true);
  });

  it("changes when the actual content changes (different document)", () => {
    const a = contentFingerprint(pdfBuffer("id-a", "999"), "application/pdf");
    // Same structure, but the object body itself is different content.
    const b = contentFingerprint(pdfBuffer("id-a", "999", "y"), "application/pdf");
    expect(a).toBeTruthy();
    expect(b).toBeTruthy();
    expect(a).not.toEqual(b);
    expect(contentFingerprintMatches(a, b)).toBe(false);
  });

  it("returns null for unknown or tiny containers (no honest fingerprint)", () => {
    expect(contentFingerprint(Buffer.alloc(100), "application/octet-stream")).toBeNull();
    expect(contentFingerprint(Buffer.alloc(0), "application/pdf")).toBeNull();
  });

  it("fingerprints PNG chunk data deterministically", () => {
    function png(text: string): Buffer {
      const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
      const type = Buffer.from("tEXt", "latin1");
      const data = Buffer.concat([Buffer.alloc(600, 0x42), Buffer.from(text, "latin1")]);
      const len = Buffer.alloc(4);
      len.writeUInt32BE(data.length);
      const crc = Buffer.alloc(4, 0x00);
      const iend = Buffer.from([0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82]);
      return Buffer.concat([sig, len, type, data, crc, iend]);
    }
    const a = contentFingerprint(png("uploaded-by-ada"), "image/png");
    const b = contentFingerprint(png("uploaded-by-ada"), "image/png");
    const c = contentFingerprint(png("uploaded-by-femi"), "image/png");
    expect(a).toBeTruthy();
    expect(a).toEqual(b);
    expect(a).not.toEqual(c);
  });
});
