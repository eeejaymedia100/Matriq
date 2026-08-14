import { base64ToBytes, bytesToBase64 } from "./files";

/**
 * Minimal, dependency-free PDF builder (Tools — "Image to PDF", spec §8).
 *
 * Embeds JPEG pages as DCTDecode image XObjects with a correct xref table.
 * Deliberately tiny and deterministic: pages are placed at a fixed A4-ish
 * media box, each image scaled to fit while keeping its aspect ratio.
 */

const PAGE_W = 612; // A4-ish @72dpi (8.5in × 11in)
const PAGE_H = 792;

const encoder = new TextEncoder();

function concat(parts: (Uint8Array | number[])[]): Uint8Array {
  const total = parts.reduce((sum, p) => sum + p.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const p of parts) {
    out.set(p, offset);
    offset += p.length;
  }
  return out;
}

/** Parse JPEG dimensions from the SOF marker (0xC0–0xCF, excluding C4/C8/CC). */
export function jpegDimensions(bytes: Uint8Array): {
  width: number;
  height: number;
} | null {
  if (bytes[0] !== 0xff || bytes[1] !== 0xd8) return null;
  let i = 2;
  while (i < bytes.length - 8) {
    if (bytes[i] !== 0xff) {
      i += 1;
      continue;
    }
    // Skip 0xFF padding
    let marker = bytes[i + 1];
    if (marker === 0xff) {
      i += 1;
      continue;
    }
    const segmentLen = (bytes[i + 2] << 8) | bytes[i + 3];
    const isSof =
      marker >= 0xc0 &&
      marker <= 0xcf &&
      marker !== 0xc4 &&
      marker !== 0xc8 &&
      marker !== 0xcc;
    if (isSof) {
      const height = (bytes[i + 5] << 8) | bytes[i + 6];
      const width = (bytes[i + 7] << 8) | bytes[i + 8];
      return { width, height };
    }
    if (segmentLen < 2) return null;
    i += 2 + segmentLen;
  }
  return null;
}

interface PageImage {
  jpegBytes: Uint8Array;
  width: number;
  height: number;
}

function escapePdfName(name: string): string {
  return name.replace(/[()\\]/g, "");
}

/** Build a single-page PDF from one or more JPEG images (base64). */
export function buildPdfFromJpegs(jpegBase64: string[]): string {
  const pages: PageImage[] = jpegBase64.map((b64) => {
    const jpegBytes = base64ToBytes(b64);
    const dims = jpegDimensions(jpegBytes) ?? { width: PAGE_W, height: PAGE_H };
    return { jpegBytes, width: dims.width, height: dims.height };
  });

  const objects: Uint8Array[] = [];
  const byteOffsets: number[] = [0];

  const push = (obj: Uint8Array) => {
    byteOffsets.push(byteOffsets[byteOffsets.length - 1] + obj.length);
    objects.push(obj);
  };

  // 1: catalog
  push(encoder.encode(`1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n`));

  // 2: pages tree — count children now
  const kids = pages.map((_, i) => `${3 + i * 3} 0 R`).join(" ");
  push(
    encoder.encode(
      `2 0 obj\n<< /Type /Pages /Kids [ ${kids} ] /Count ${pages.length} >>\nendobj\n`,
    ),
  );

  pages.forEach((img, idx) => {
    const pageObjNum = 3 + idx * 3;
    const xobjNum = pageObjNum + 1;
    const contentNum = pageObjNum + 2;

    // Scale to fit the page, keep aspect ratio, centre it.
    const scale = Math.min(PAGE_W / img.width, PAGE_H / img.height, 1);
    const drawW = Math.floor(img.width * scale);
    const drawH = Math.floor(img.height * scale);
    const x = Math.floor((PAGE_W - drawW) / 2);
    const y = Math.floor((PAGE_H - drawH) / 2);

    // 3: page
    push(
      encoder.encode(
        `${pageObjNum} 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_W} ${PAGE_H}] /Resources << /XObject << /Im${pageObjNum} ${xobjNum} 0 R >> >> /Contents ${contentNum} 0 R >>\nendobj\n`,
      ),
    );

    // 4: image XObject (DCTDecode = raw JPEG bytes)
    const imgBytes = img.jpegBytes;
    const streamStart = `${xobjNum} 0 obj\n<< /Type /XObject /Subtype /Image /Width ${img.width} /Height ${img.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${imgBytes.length} >>\nstream\n`;
    const streamEnd = encoder.encode("\nendstream\nendobj\n");
    push(concat([encoder.encode(streamStart), imgBytes, streamEnd]));

    // 5: content stream — draw the image
    const content = `q\n${drawW} 0 0 ${drawH} ${x} ${y} cm\n/Im${pageObjNum} Do\nQ\n`;
    const contentBytes = encoder.encode(content);
    const contentObj = `${contentNum} 0 obj\n<< /Length ${contentBytes.length} >>\nstream\n`;
    push(
      concat([
        encoder.encode(contentObj),
        contentBytes,
        encoder.encode("\nendstream\nendobj\n"),
      ]),
    );
  });

  // xref
  const xrefOffset = byteOffsets[byteOffsets.length - 1];
  const count = objects.length + 1;
  let xref = `xref\n0 ${count}\n0000000000 65535 f \n`;
  for (let i = 1; i < objects.length + 1; i += 1) {
    xref += `${String(byteOffsets[i]).padStart(10, "0")} 00000 n \n`;
  }
  const trailer = `trailer\n<< /Size ${count} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;

  const body = concat(objects);
  const xrefBytes = encoder.encode(xref);
  const trailerBytes = encoder.encode(trailer);

  const all = concat([
    encoder.encode("%PDF-1.4\n"),
    body,
    xrefBytes,
    trailerBytes,
  ]);

  return bytesToBase64(all);
}

/** A tiny helper so callers can name their PDFs consistently. */
export function pdfFileName(prefix: string): string {
  const safe = escapePdfName(prefix.trim()) || "images";
  return `${safe}-${Date.now()}.pdf`;
}
