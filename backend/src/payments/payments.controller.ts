import {
  Controller,
  Post,
  Get,
  Body,
  Param,
  UseGuards,
  HttpCode,
  HttpStatus,
  Req,
  Headers,
} from "@nestjs/common";
import { Request } from "express";
import { Throttle } from "@nestjs/throttler";
import { PaymentsService, InitiatePaymentDto } from "./payments.service";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { JwtPayload } from "../auth/auth.service";

@Controller("v1")
export class PaymentsController {
  constructor(private readonly paymentsService: PaymentsService) {}

  @Post("payments/initiate")
  @UseGuards(JwtAuthGuard)
  @Throttle({ default: { ttl: 60000, limit: 10 } })
  initiate(
    @CurrentUser() user: JwtPayload,
    @Body() dto: InitiatePaymentDto,
    @Req() req: Request,
    @Headers("idempotency-key") idempotencyKey?: string,
  ) {
    const ip = (req.ip || req.socket.remoteAddress || "unknown") as string;
    return this.paymentsService.initiate(
      user.sub,
      dto,
      ip,
      idempotencyKey ? idempotencyKey.slice(0, 128) : undefined,
    );
  }

  @Post("payments/webhook/paystack")
  @HttpCode(HttpStatus.OK)
  handleWebhook(
    @Headers("x-paystack-signature") signature: string,
    @Body() body: Record<string, unknown>,
  ) {
    return this.paymentsService.handlePaystackWebhook(signature, body);
  }

  @Get("payments/:id")
  @UseGuards(JwtAuthGuard)
  getPayment(@Param("id") id: string, @CurrentUser() user: JwtPayload) {
    return this.paymentsService.getPayment(id, user.sub);
  }

  @Get("payments/:id/receipt")
  @UseGuards(JwtAuthGuard)
  getReceipt(@Param("id") id: string, @CurrentUser() user: JwtPayload) {
    return this.paymentsService.getReceipt(id, user.sub);
  }

  @Post("payments/:id/share-card")
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  shareCard(@Param("id") id: string, @CurrentUser() user: JwtPayload) {
    return this.paymentsService.generateShareCard(id, user.sub);
  }
}
