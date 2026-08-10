import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Resend } from "resend";

export interface SendEmailParams {
  to: string;
  subject: string;
  html: string;
  text?: string;
  replyTo?: string;
}

export interface SendEmailResult {
  success: boolean;
  messageId?: string;
  error?: string;
}

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private readonly resend: Resend;
  private readonly fromAddress: string;

  constructor(private readonly configService: ConfigService) {
    const apiKey = this.configService.get<string>("RESEND_API_KEY");

    if (!apiKey) {
      this.logger.warn(
        "RESEND_API_KEY not configured — email sending is disabled. " +
          "Set RESEND_API_KEY in environment to enable transactional email.",
      );
      this.resend = null as unknown as Resend;
      this.fromAddress = "Matriq <onboarding@resend.dev>";
      return;
    }

    this.resend = new Resend(apiKey);
    // Default "from" address: use Resend shared domain until a custom domain is verified.
    this.fromAddress =
      this.configService.get<string>("EMAIL_FROM") ||
      "Matriq <onboarding@resend.dev>";
  }

  /**
   * Send a transactional email via Resend.
   *
   * @returns Result with success flag and the Resend message ID on success,
   *          or the error message on failure.
   */
  async send(params: SendEmailParams): Promise<SendEmailResult> {
    if (!this.resend) {
      this.logger.warn(
        `Email not sent (no API key configured): "${params.subject}" to ${params.to}`,
      );
      return { success: false, error: "Email service not configured" };
    }

    try {
      const { data, error } = await this.resend.emails.send({
        from: this.fromAddress,
        to: [params.to],
        subject: params.subject,
        html: params.html,
        text: params.text,
        reply_to: params.replyTo,
      });

      if (error) {
        this.logger.error(
          `Resend send failed for "${params.subject}" to ${params.to}: ${error.message}`,
        );
        return { success: false, error: error.message };
      }

      this.logger.log(
        `Email sent: "${params.subject}" to ${params.to} (id: ${data?.id})`,
      );
      return { success: true, messageId: data?.id };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error(
        `Email send exception for "${params.subject}" to ${params.to}: ${message}`,
      );
      return { success: false, error: message };
    }
  }

  /**
   * Send a test email to verify the Resend integration is working.
   * Call this once to validate the API key before building auth flows on top.
   */
  async sendTestEmail(to: string): Promise<SendEmailResult> {
    return this.send({
      to,
      subject: "Matriq — Email Integration Test",
      html: `
        <div style="font-family: Inter, sans-serif; max-width: 480px; margin: 0 auto;">
          <h2 style="color: #0D0620;">Matriq Email Service</h2>
          <p style="color: #5C4D82;">
            This is a test email from the Matriq backend. If you're reading this,
            the Resend integration is configured correctly and sending real email.
          </p>
          <hr style="border: none; border-top: 1px solid #E8E0F0; margin: 24px 0;" />
          <p style="font-size: 12px; color: #8B7AAE;">
            Sent at ${new Date().toISOString()} &middot; Matriq Phase 0 infrastructure verification
          </p>
        </div>
      `,
    });
  }
}
