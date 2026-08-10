import { NestFactory } from "@nestjs/core";
import { ValidationPipe } from "@nestjs/common";
import { ExpressAdapter } from "@nestjs/platform-express";
import { AppModule } from "./app.module";

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);

  // Global validation — every DTO gets validated automatically
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  // Per security.md: CORS locked to actual origins, not '*'
  app.enableCors({
    origin: process.env.CORS_ORIGIN?.split(",") || ["http://localhost:8081"],
    credentials: true,
  });

  // Trust the reverse proxy (caddy) for rate limiting IP detection
  const httpAdapter = app.getHttpAdapter();
  if (httpAdapter instanceof ExpressAdapter) {
    httpAdapter.getInstance().set("trust proxy", 1);
  }

  const port = process.env.PORT || 3000;
  await app.listen(port);
  console.log(`Matriq backend listening on :${port}`);
}

bootstrap().catch((err) => {
  console.error("Failed to bootstrap:", err);
  process.exit(1);
});
