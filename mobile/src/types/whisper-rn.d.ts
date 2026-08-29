/**
 * Minimal ambient types for whisper.rn.
 *
 * The package ships real .d.ts files, but its `exports` map has no root "."
 * entry, so TypeScript can't resolve `import ... from "whisper.rn"` under
 * bundler resolution. Declaring the (small) API surface we use here keeps the
 * offline voice feature typed without fighting the package's resolution.
 */
declare module "whisper.rn" {
  export interface WhisperSegment {
    text: string;
  }

  export interface TranscribeResult {
    segments: WhisperSegment[];
  }

  export interface TranscribeOptions {
    language?: string;
    verbose?: boolean;
    timestamps?: boolean;
    onProgress?: (progress: number) => void;
  }

  export class WhisperContext {
    transcribe(
      filePathOrBase64: string | number,
      options?: TranscribeOptions,
    ): { stop: () => Promise<void>; promise: Promise<TranscribeResult> };
    release(): Promise<void>;
  }

  export interface ContextOptions {
    filePath: string | number;
    isBundleAsset?: boolean;
    useGpu?: boolean;
  }

  export function initWhisper(options: ContextOptions): Promise<WhisperContext>;
}
