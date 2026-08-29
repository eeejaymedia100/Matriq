import { Controller, Get } from "@nestjs/common";

/**
 * Liveness probe. Served at BOTH `/health` (Caddy/external monitors) and
 * `/v1/health` — the mobile app builds its probe as `API_BASE + /health`
 * and API_BASE already includes the `v1` prefix, so it needs the alias.
 */
@Controller("health")
export class HealthController {
  @Get()
  check(): { status: string; timestamp: string } {
    return {
      status: "ok",
      timestamp: new Date().toISOString(),
    };
  }
}

@Controller("v1/health")
export class V1HealthController {
  @Get()
  check(): { status: string; timestamp: string } {
    return {
      status: "ok",
      timestamp: new Date().toISOString(),
    };
  }
}
