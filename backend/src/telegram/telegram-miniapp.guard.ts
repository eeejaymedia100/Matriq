import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { Request } from "express";
import { MiniAppSession } from "./telegram-miniapp-auth";

export const MINIAPP_SESSION_KEY = "tgMiniAppSession";

/**
 * Guard for Mini App endpoints: verifies the scoped JWT minted by
 * POST /telegram/miniapp/auth (which itself validated Telegram initData).
 * The session carries only { telegramId, username, scope } — it is NOT a
 * Matriq account credential.
 */
@Injectable()
export class TelegramMiniAppGuard implements CanActivate {
  constructor(private readonly jwt: JwtService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    const header = request.headers.authorization;
    if (!header?.startsWith("Bearer ")) {
      throw new UnauthorizedException("Missing Mini App session token.");
    }
    try {
      const payload = this.jwt.verify(header.slice(7), {
        secret: process.env.JWT_SECRET,
      }) as { tgId?: string; username?: string; scope?: string };
      if (payload.scope !== "telegram_miniapp" || !payload.tgId) {
        throw new UnauthorizedException("Invalid session scope.");
      }
      const session: MiniAppSession = {
        telegramId: payload.tgId,
        telegramUsername: payload.username ?? null,
        scope: "telegram_miniapp",
      };
      (request as Request & { [MINIAPP_SESSION_KEY]?: unknown })[MINIAPP_SESSION_KEY] = session;
      return true;
    } catch {
      throw new UnauthorizedException("Mini App session expired or invalid.");
    }
  }
}
