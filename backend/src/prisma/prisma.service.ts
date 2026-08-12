import {
  Injectable,
  OnModuleDestroy,
  OnModuleInit,
  Logger,
} from "@nestjs/common";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../generated/prisma/client";

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(PrismaService.name);

  constructor() {
    // Prisma 7 requires a driver adapter — the generated client no longer
    // connects via the legacy binary engine.
    const connectionString =
      process.env.DATABASE_URL ??
      "postgresql://matriq:matriq@localhost:5432/matriq";
    // Cap the pool per worker: the backend now runs clustered (one worker per
    // CPU core), so N workers × this max = total DB connections. Default 5 per
    // worker keeps a 2-worker box at ~10 connections instead of pg's default
    // 10-per-worker (20 total) on a 3.8GB VM.
    const rawPoolMax = Number(process.env.DATABASE_POOL_MAX ?? 5);
    const poolMax = Number.isFinite(rawPoolMax) ? Math.max(1, rawPoolMax) : 5;
    const adapter = new PrismaPg({ connectionString, max: poolMax });
    super({ adapter });
  }

  async onModuleInit(): Promise<void> {
    await this.$connect();
    this.logger.log("Connected to database");
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
    this.logger.log("Disconnected from database");
  }
}
