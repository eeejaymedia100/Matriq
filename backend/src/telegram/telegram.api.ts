/**
 * Hand-rolled Telegram Bot API client — no new dependencies.
 *
 * Uses the global fetch (Node 18+) and mirrors the repo's existing patterns:
 * ConfigService-driven, structured logging, small and typed. Only the
 * methods the Telegram interface actually needs are implemented.
 */

const API_ROOT = "https://api.telegram.org";

export interface TgUser {
  id: number;
  is_bot?: boolean;
  first_name?: string;
  last_name?: string;
  username?: string;
  language_code?: string;
}

export interface TgChat {
  id: number;
  type: "private" | "group" | "supergroup" | "channel";
  title?: string;
  username?: string;
  first_name?: string;
  last_name?: string;
}

export interface TgPhotoSize {
  file_id: string;
  file_size?: number;
  width: number;
  height: number;
}

export interface TgDocument {
  file_id: string;
  file_name?: string;
  file_size?: number;
  mime_type?: string;
}

export interface TgMessage {
  message_id: number;
  from?: TgUser;
  chat: TgChat;
  date: number;
  text?: string;
  caption?: string;
  document?: TgDocument;
  photo?: TgPhotoSize[];
}

export interface TgCallbackQuery {
  id: string;
  from: TgUser;
  message?: TgMessage;
  data?: string;
}

export interface TgUpdate {
  update_id: number;
  message?: TgMessage;
  edited_message?: TgMessage;
  callback_query?: TgCallbackQuery;
}

export type TgReplyMarkup =
  | { keyboard: { text: string; web_app?: { url: string } }[][]; resize_keyboard?: boolean; one_time_keyboard?: boolean }
  | { inline_keyboard: { text: string; callback_data?: string; url?: string; web_app?: { url: string } }[][] }
  | { remove_keyboard: true };

export interface TgChatMember {
  status: "creator" | "administrator" | "member" | "restricted" | "left" | "kicked";
  user: TgUser;
}

interface ApiResponse<T> {
  ok: boolean;
  result?: T;
  description?: string;
  error_code?: number;
}

export class TelegramApiError extends Error {
  constructor(
    message: string,
    public readonly code?: number,
  ) {
    super(message);
    this.name = "TelegramApiError";
  }
}

export class TelegramApi {
  constructor(
    private readonly botToken: string,
    private readonly log: (msg: string) => void,
  ) {}

  private async call<T>(method: string, body?: Record<string, unknown>): Promise<T> {
    const res = await fetch(`${API_ROOT}/bot${this.botToken}/${method}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: body ? JSON.stringify(body) : undefined,
    });
    const json = (await res.json()) as ApiResponse<T>;
    if (!json.ok) {
      throw new TelegramApiError(
        `${method} failed: ${json.description ?? "unknown"} (${json.error_code ?? res.status})`,
        json.error_code,
      );
    }
    return json.result as T;
  }

  /** Calls that must not crash the update loop (send-side failures are logged). */
  async safe<T>(method: string, body?: Record<string, unknown>): Promise<T | null> {
    try {
      return await this.call<T>(method, body);
    } catch (err) {
      this.log(`telegram safe-call failed: ${method}: ${String(err)}`);
      return null;
    }
  }

  async getMe(): Promise<TgUser> {
    return this.call<TgUser>("getMe");
  }

  async setWebhook(url: string, secretToken: string): Promise<boolean> {
    return this.call<boolean>("setWebhook", {
      url,
      secret_token: secretToken,
      allowed_updates: ["message", "callback_query"],
      drop_pending_updates: false,
    });
  }

  async deleteWebhook(): Promise<boolean> {
    return this.call<boolean>("deleteWebhook", { drop_pending_updates: false });
  }

  async getUpdates(offset: number, timeoutSec = 25): Promise<TgUpdate[]> {
    return this.call<TgUpdate[]>("getUpdates", {
      offset,
      timeout: timeoutSec,
      allowed_updates: ["message", "callback_query"],
    });
  }

  async sendMessage(
    chatId: number | string,
    text: string,
    replyMarkup?: TgReplyMarkup,
  ): Promise<TgMessage | null> {
    return this.safe<TgMessage>("sendMessage", {
      chat_id: chatId,
      text,
      parse_mode: "HTML",
      reply_markup: replyMarkup,
      link_preview_options: { is_disabled: true },
    });
  }

  /**
   * Send a file to a chat — multipart upload of raw bytes. Used to hand the
   * reviewer the actual document (not just a reference) when a submission
   * reaches human review.
   */
  async sendDocument(
    chatId: number | string,
    file: { filename: string; buffer: Buffer; mimeType?: string },
    caption?: string,
    replyMarkup?: TgReplyMarkup,
  ): Promise<TgMessage | null> {
    try {
      const form = new FormData();
      form.append("chat_id", String(chatId));
      if (caption) {
        form.append("caption", caption.slice(0, 1000));
        form.append("parse_mode", "HTML");
      }
      if (replyMarkup) form.append("reply_markup", JSON.stringify(replyMarkup));
      form.append(
        "document",
        new Blob([new Uint8Array(file.buffer)], { type: file.mimeType ?? "application/octet-stream" }),
        file.filename,
      );
      const res = await fetch(`${API_ROOT}/bot${this.botToken}/sendDocument`, {
        method: "POST",
        body: form,
      });
      const json = (await res.json()) as ApiResponse<TgMessage>;
      if (!json.ok) {
        throw new TelegramApiError(
          `sendDocument failed: ${json.description ?? "unknown"} (${json.error_code ?? res.status})`,
          json.error_code,
        );
      }
      return json.result as TgMessage;
    } catch (err) {
      this.log(`telegram safe-call failed: sendDocument: ${String(err)}`);
      return null;
    }
  }

  /**
   * Send an image to a chat — multipart upload, same contract as
   * sendDocument. Photos render INLINE in every Telegram client: a reviewer
   * can read the first pages of a submitted PDF right in the chat, without
   * tapping (downloading) the original file.
   */
  async sendPhoto(
    chatId: number | string,
    file: { filename: string; buffer: Buffer; mimeType?: string },
    caption?: string,
    replyMarkup?: TgReplyMarkup,
  ): Promise<TgMessage | null> {
    try {
      const form = new FormData();
      form.append("chat_id", String(chatId));
      if (caption) {
        form.append("caption", caption.slice(0, 1000));
        form.append("parse_mode", "HTML");
      }
      if (replyMarkup) form.append("reply_markup", JSON.stringify(replyMarkup));
      form.append(
        "photo",
        new Blob([new Uint8Array(file.buffer)], { type: file.mimeType ?? "image/jpeg" }),
        file.filename,
      );
      const res = await fetch(`${API_ROOT}/bot${this.botToken}/sendPhoto`, {
        method: "POST",
        body: form,
      });
      const json = (await res.json()) as ApiResponse<TgMessage>;
      if (!json.ok) {
        throw new TelegramApiError(
          `sendPhoto failed: ${json.description ?? "unknown"} (${json.error_code ?? res.status})`,
          json.error_code,
        );
      }
      return json.result as TgMessage;
    } catch (err) {
      this.log(`telegram safe-call failed: sendPhoto: ${String(err)}`);
      return null;
    }
  }

  async answerCallbackQuery(id: string, text?: string): Promise<void> {
    await this.safe("answerCallbackQuery", {
      callback_query_id: id,
      text,
      show_alert: false,
    });
  }

  async getChatMember(chatId: string, userId: number): Promise<TgChatMember | null> {
    return this.safe<TgChatMember>("getChatMember", {
      chat_id: chatId,
      user_id: userId,
    });
  }

  async getFileId(fileId: string): Promise<{ file_path?: string; file_size?: number } | null> {
    return this.safe<{ file_path?: string; file_size?: number }>("getFile", { file_id: fileId });
  }

  /** Download a file's bytes via the bot file API (up to 20 MB per Telegram). */
  async downloadFile(filePath: string): Promise<Buffer | null> {
    try {
      const res = await fetch(`${API_ROOT}/file/bot${this.botToken}/${filePath}`);
      if (!res.ok) {
        this.log(`telegram file download failed: HTTP ${res.status}`);
        return null;
      }
      return Buffer.from(await res.arrayBuffer());
    } catch (err) {
      this.log(`telegram file download error: ${String(err)}`);
      return null;
    }
  }

  /** Two-step convenience: resolve a file_id then download its bytes. */
  async downloadFileById(fileId: string): Promise<Buffer | null> {
    const meta = await this.getFileId(fileId);
    if (!meta?.file_path) {
      this.log(`telegram getFile returned no path for ${fileId.slice(0, 12)}…`);
      return null;
    }
    return this.downloadFile(meta.file_path);
  }
}
