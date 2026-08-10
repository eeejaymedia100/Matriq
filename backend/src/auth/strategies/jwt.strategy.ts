import { Injectable } from "@nestjs/common";
import { PassportStrategy } from "@nestjs/passport";
import { ExtractJwt, Strategy } from "passport-jwt";
import { ConfigService } from "@nestjs/config";
import { JwtPayload, ExecutiveRole } from "../auth.service";
import { PrismaService } from "../../prisma/prisma.service";

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    configService: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    const secret = configService.get<string>("JWT_SECRET");
    if (!secret) {
      throw new Error("JWT_SECRET is not configured");
    }

    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: secret,
    });
  }

  async validate(payload: JwtPayload): Promise<JwtPayload> {
    // Enrich the payload with executive roles from the DB.
    // This ensures role changes take effect immediately (no need to wait
    // for token expiry) and keeps the JWT itself small.
    const executives = await this.prisma.associationExecutive.findMany({
      where: { userId: payload.sub },
      select: {
        id: true,
        associationId: true,
        role: true,
      },
    });

    const executive: ExecutiveRole[] = executives.map((e) => ({
      id: e.id,
      associationId: e.associationId,
      role: e.role as ExecutiveRole["role"],
    }));

    return { ...payload, executive };
  }
}
