import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Client as MinioClient } from "minio";

/**
 * Object storage abstraction (S3-compatible — MinIO by default).
 *
 * Env-gated: disabled unless S3_ENDPOINT is set, in which case callers fall
 * back to their previous behaviour (e.g. base64 data-URI storage). A storage
 * failure is logged and never thrown to the caller — uploads must not fail
 * because object storage hiccuped.
 */
@Injectable()
export class StorageService {
  private readonly logger = new Logger(StorageService.name);
  private readonly client: MinioClient | null;
  private readonly bucket: string;
  private readonly enabled: boolean;
  private bucketReady = false;

  constructor(private readonly configService: ConfigService) {
    const endpoint = this.configService.get<string>("S3_ENDPOINT");
    this.bucket = this.configService.get<string>("S3_BUCKET") ?? "matriq";

    if (!endpoint) {
      this.enabled = false;
      this.client = null;
      return;
    }

    const port = Number(this.configService.get<string>("S3_PORT") ?? "9000");
    const useSSL = this.configService.get<string>("S3_USE_SSL") === "true";
    const accessKey = this.configService.get<string>("S3_ACCESS_KEY") ?? "";
    const secretKey = this.configService.get<string>("S3_SECRET_KEY") ?? "";
    const region = this.configService.get<string>("S3_REGION") ?? "us-east-1";

    this.client = new MinioClient({
      endPoint: endpoint,
      port,
      useSSL,
      accessKey,
      secretKey,
      region,
      pathStyle: true,
    });
    this.enabled = true;
    this.logger.log(
      `Object storage enabled: ${endpoint}:${port}/${this.bucket} (ssl=${useSSL})`,
    );
  }

  get isEnabled(): boolean {
    return this.enabled;
  }

  /**
   * Upload a buffer under `key`. Returns the key on success, null on failure.
   */
  async put(
    key: string,
    buffer: Buffer,
    mimeType: string,
  ): Promise<string | null> {
    if (!this.enabled || !this.client) return null;
    try {
      await this.ensureBucket();
      await this.client.putObject(this.bucket, key, buffer, buffer.length, {
        "Content-Type": mimeType,
      });
      this.logger.log(`Stored object: ${this.bucket}/${key}`);
      return key;
    } catch (err) {
      this.logger.error(
        `Object storage put failed for ${key}: ${err instanceof Error ? err.message : String(err)}`,
      );
      return null;
    }
  }

  /**
   * Fetch an object and return its raw bytes. Returns null on any failure so
   * callers can fall back. Prefer this over getDataUri for large files — a
   * base64 data-URI inflates the payload ~33% and forces the whole file into
   * a single JSON string.
   */
  async getBuffer(key: string): Promise<Buffer | null> {
    if (!this.enabled || !this.client) return null;
    try {
      const stream = await this.client.getObject(this.bucket, key);
      const chunks: Buffer[] = [];
      for await (const chunk of stream) {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      }
      return Buffer.concat(chunks);
    } catch (err) {
      this.logger.error(
        `Object storage get failed for ${key}: ${err instanceof Error ? err.message : String(err)}`,
      );
      return null;
    }
  }

  /**
   * Fetch an object and return it as a base64 data-URI. Returns null on
   * any failure so callers can fall back.
   */
  async getDataUri(key: string, mimeType: string): Promise<string | null> {
    if (!this.enabled || !this.client) return null;
    try {
      const stream = await this.client.getObject(this.bucket, key);
      const chunks: Buffer[] = [];
      for await (const chunk of stream) {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      }
      const buffer = Buffer.concat(chunks);
      return `data:${mimeType};base64,${buffer.toString("base64")}`;
    } catch (err) {
      this.logger.error(
        `Object storage get failed for ${key}: ${err instanceof Error ? err.message : String(err)}`,
      );
      return null;
    }
  }

  /** Create the bucket once, if it doesn't exist yet. Never throws. */
  private async ensureBucket(): Promise<void> {
    if (!this.client || this.bucketReady) return;
    try {
      const exists = await this.client.bucketExists(this.bucket);
      if (!exists) {
        await this.client.makeBucket(this.bucket);
        this.logger.log(`Created bucket: ${this.bucket}`);
      }
      this.bucketReady = true;
    } catch (err) {
      this.logger.warn(
        `Bucket check failed (will retry): ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }
}
