import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from "@nestjs/common";
import { ThrottlerException } from "@nestjs/throttler";
import { Response } from "express";

/**
 * Structured error envelope returned for EVERY failed request.
 *
 * Shape (kept backward-compatible with the old NestJS default):
 *   { statusCode, code, message, error: { message }, retryAfterMs? }
 *
 * - `message` at the top level is what the mobile client surfaces.
 * - `error.message` mirrors it so the web dashboards (which read
 *   `error.message`) keep working unchanged.
 * - `code` is a stable machine-readable identifier (EMAIL_NOT_VERIFIED,
 *   RATE_LIMITED, VERIFICATION_EMAIL_LIMIT, INVALID_CREDENTIALS, …) so
 *   clients can branch instead of parsing prose.
 * - `retryAfterMs` is set on rate-limit errors so the app can show an
 *   exact countdown ("try again in 47 minutes").
 *
 * Unknown errors become a generic 500 — internal details never leak to
 * the client (they're logged server-side).
 */
interface ErrorEnvelope {
  statusCode: number;
  code: string;
  message: string | string[];
  error: { message: string | string[] };
  retryAfterMs?: number;
}

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger("Exceptions");

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse<Response>();
    const body = this.toEnvelope(exception);
    res.status(body.statusCode).json(body);
  }

  private toEnvelope(exception: unknown): ErrorEnvelope {
    // Rate limiting (global + @Throttle decorators) — 429.
    if (exception instanceof ThrottlerException) {
      return this.envelope(
        HttpStatus.TOO_MANY_REQUESTS,
        "RATE_LIMITED",
        "Too many requests. Please wait a moment and try again.",
      );
    }

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const response = exception.getResponse();

      if (typeof response === "object" && response !== null) {
        const r = response as Record<string, unknown>;

        // Structured responses thrown by services: { code, message, retryAfterMs }
        if (typeof r.code === "string") {
          const message =
            typeof r.message === "string"
              ? r.message
              : this.defaultMessage(status, r.code);
          return this.envelope(
            status,
            r.code,
            message,
            typeof r.retryAfterMs === "number" ? r.retryAfterMs : undefined,
          );
        }

        // class-validator failures: { message: string[] }
        if (Array.isArray(r.message)) {
          const messages = r.message.filter(
            (m): m is string => typeof m === "string",
          );
          return this.envelope(
            status,
            "VALIDATION_FAILED",
            messages.length > 0 ? messages : "Please check your details.",
          );
        }

        if (typeof r.message === "string") {
          return this.envelope(
            status,
            this.codeForStatus(status),
            r.message,
          );
        }
      }

      if (typeof response === "string") {
        return this.envelope(status, this.codeForStatus(status), response);
      }

      return this.envelope(
        status,
        this.codeForStatus(status),
        `Request failed (HTTP ${status})`,
      );
    }

    // Unknown error — 500 with nothing sensitive leaked.
    const err =
      exception instanceof Error ? exception : new Error(String(exception));
    this.logger.error(`Unhandled exception: ${err.stack ?? err.message}`);
    return this.envelope(
      HttpStatus.INTERNAL_SERVER_ERROR,
      "INTERNAL",
      "Something went wrong on our side. Please try again in a few minutes, and contact the admin if it keeps happening.",
    );
  }

  private envelope(
    statusCode: number,
    code: string,
    message: string | string[],
    retryAfterMs?: number,
  ): ErrorEnvelope {
    return {
      statusCode,
      code,
      message,
      error: { message },
      ...(retryAfterMs !== undefined && { retryAfterMs }),
    };
  }

  private codeForStatus(status: number): string {
    switch (status) {
      case HttpStatus.BAD_REQUEST:
      case HttpStatus.UNPROCESSABLE_ENTITY:
        return "VALIDATION_FAILED";
      case HttpStatus.UNAUTHORIZED:
        return "UNAUTHORIZED";
      case HttpStatus.FORBIDDEN:
        return "FORBIDDEN";
      case HttpStatus.NOT_FOUND:
        return "NOT_FOUND";
      case HttpStatus.CONFLICT:
        return "CONFLICT";
      case HttpStatus.TOO_MANY_REQUESTS:
        return "RATE_LIMITED";
      default:
        return "REQUEST_FAILED";
    }
  }

  private defaultMessage(status: number, code: string): string {
    if (status === HttpStatus.TOO_MANY_REQUESTS) {
      return "Too many requests. Please wait and try again.";
    }
    return `Request failed (HTTP ${status}${code ? ` · ${code}` : ""})`;
  }
}
