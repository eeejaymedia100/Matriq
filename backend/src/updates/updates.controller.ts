import {
  Controller,
  Get,
  Req,
  Res,
  Logger,
  Header,
  NotFoundException,
} from "@nestjs/common";
import { Request, Response } from "express";
import * as crypto from "crypto";
import * as fs from "fs";
import * as fsp from "fs/promises";
import * as path from "path";

/**
 * OTA update manifest endpoint (Expo Updates protocol v1).
 *
 * The mobile app is configured with updates.url = https://api.matriq.com.ng/v1/updates/manifest.
 * On launch (and on foreground re-checks) expo-updates GETs this endpoint
 * with headers:
 *   expo-protocol-version: 1
 *   expo-platform: android
 *   expo-runtime-version: <the native build's runtime version>
 * and accepts either a JSON manifest body or 204 (no update).
 *
 * Published updates live on the `updates` Docker volume at /srv/updates:
 *   /srv/updates/<runtimeVersion>/android/metadata.json   ← written by scripts/_publish-ota.sh
 *   /srv/updates/<runtimeVersion>/android/<hash>.hbc      ← launch asset
 *   /srv/updates/<runtimeVersion>/android/assets/<hash>   ← other assets
 * The metadata.json is the file `npx expo export` emits; the manifest is
 * assembled from it at request time. Assets are served by Caddy from the
 * same volume (immutable, hash-addressed URLs baked into the manifest), so
 * this controller only ever reads two small JSON files per request.
 *
 * The endpoint is stateless and public: expo-updates can't authenticate
 * before it has code to run. Anything sensitive must never live in an OTA
 * bundle — the bundle is the app's own JS.
 */
@Controller("v1/updates")
export class UpdatesController {
  private readonly logger = new Logger(UpdatesController.name);
  /** Container mount for the `updates` volume (docker-compose). */
  private readonly root = process.env.UPDATES_DIR ?? "/srv/updates";

  @Get("manifest")
  @Header("expo-protocol-version", "1")
  @Header("expo-sfv-version", "0")
  @Header("cache-control", "private, max-age=0")
  async manifest(@Req() req: Request, @Res() res: Response): Promise<void> {
    const platform = String(req.headers["expo-platform"] ?? "");
    const runtimeVersion = String(req.headers["expo-runtime-version"] ?? "");

    if (platform !== "android" && platform !== "ios") {
      throw new NotFoundException("unsupported platform");
    }

    // runtimeVersion is client-supplied and used to build a filesystem path
    // below — lock it to the safe character set Expo emits (e.g. "2.2.0") so
    // a crafted header ("../../etc") cannot traverse out of the updates dir.
    if (runtimeVersion === "" || !/^[A-Za-z0-9._-]+$/.test(runtimeVersion)) {
      throw new NotFoundException("unsupported runtime version");
    }

    const dir = path.join(this.root, runtimeVersion, platform);
    try {
      const metadataPath = path.join(dir, "metadata.json");
      const [metadataBuf, stat] = await Promise.all([
        fsp.readFile(metadataPath),
        fsp.stat(metadataPath),
      ]);
      const metadata = JSON.parse(metadataBuf.toString("utf-8")) as {
        fileMetadata: Record<
          string,
          { bundle: string | null; assets: Array<{ path: string; ext: string }> }
        >;
      };

      const platformMeta = metadata.fileMetadata[platform];
      if (!platformMeta?.bundle) {
        res.status(204).end();
        return;
      }

      // update id: stable hash of the metadata content (same convention as
      // Expo's reference server) formatted as a UUID.
      const idHash = crypto
        .createHash("sha256")
        .update(metadataBuf)
        .digest("hex");
      const id = `${idHash.slice(0, 8)}-${idHash.slice(8, 12)}-${idHash.slice(
        12,
        16,
      )}-${idHash.slice(16, 20)}-${idHash.slice(20, 32)}`;

      const assetUrl = (relPath: string) =>
        `${this.publicOrigin}/updates/${encodeURIComponent(
          runtimeVersion,
        )}/${platform}/${relPath
          .split("/")
          .map(encodeURIComponent)
          .join("/")}`;

      const manifest = {
        id,
        createdAt: stat.birthtime.toISOString(),
        runtimeVersion,
        launchAsset: {
          hash: await this.sha256FileAsync(path.join(dir, platformMeta.bundle)),
          key: "launch-asset",
          contentType: "application/javascript",
          url: assetUrl(platformMeta.bundle),
        },
        assets: await Promise.all(
          (platformMeta.assets ?? []).map(async (a) => {
            const filePath = path.join(dir, a.path);
            const ext = a.ext ? `.${a.ext}` : "";
            return {
              hash: await this.sha256FileAsync(filePath),
              // Mirror the reference server: MD5-hex asset key. expo-updates
              // matches assets by this key against its local database.
              key: crypto.createHash("md5").update(await fsp.readFile(filePath)).digest("hex"),
              contentType: mimeFor(a.ext),
              fileExtension: ext,
              url: assetUrl(a.path),
            };
          }),
        ),
        metadata: {},
        extra: {},
      };

      res.setHeader("content-type", "application/expo+json");
      res.status(200).send(manifest);
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") {
        // No published update for this runtime — the embedded bundle is the
        // latest. 204 = "no update available" per the protocol.
        res.status(204).end();
        return;
      }
      this.logger.error(
        `manifest error for runtime ${runtimeVersion}: ${String(err)}`,
      );
      res.status(500).end();
    }
  }

  private get publicOrigin(): string {
    return process.env.PUBLIC_ORIGIN ?? "https://matriq.com.ng";
  }

  private async sha256FileAsync(p: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const hash = crypto.createHash("sha256");
      fs.createReadStream(p)
        .on("data", (chunk) => hash.update(chunk))
        .on("end", () =>
          resolve(
            hash
              .digest("base64")
              .replace(/\+/g, "-")
              .replace(/\//g, "_")
              .replace(/=+$/, ""),
          ),
        )
        .on("error", reject);
    });
  }
}

/** MIME type for an exported asset extension (metadata.json `ext` field). */
function mimeFor(ext: string): string {
  switch (ext) {
    case "png":
      return "image/png";
    case "jpg":
    case "jpeg":
      return "image/jpeg";
    case "webp":
      return "image/webp";
    case "gif":
      return "image/gif";
    case "svg":
      return "image/svg+xml";
    case "ttf":
      return "font/ttf";
    case "otf":
      return "font/otf";
    case "woff":
      return "font/woff";
    case "woff2":
      return "font/woff2";
    case "mp3":
      return "audio/mpeg";
    case "wav":
      return "audio/wav";
    case "json":
      return "application/json";
    case "txt":
      return "text/plain";
    case "hbc":
    case "bundle":
      return "application/javascript";
    default:
      return "application/octet-stream";
  }
}
