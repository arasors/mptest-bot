import { config } from "./config";

const API_BASE = `https://api.telegram.org/bot${config.telegram.botToken}`;
const MAX_TEXT = 4096;
const MAX_CAPTION = 1024;

export type ParseMode = "HTML" | "MarkdownV2";

export type InlineKeyboardButton =
  | { text: string; url: string }
  | { text: string; callback_data: string };

export type InlineKeyboard = InlineKeyboardButton[][];

export type ReplyMarkup = {
  inline_keyboard?: InlineKeyboard;
};

export type SendMessageOptions = {
  chatId?: string;
  parseMode?: ParseMode;
  disablePreview?: boolean;
  silent?: boolean;
  replyToMessageId?: number;
  replyMarkup?: ReplyMarkup;
};

export type TelegramMessage = {
  message_id: number;
  chat: { id: number };
  date: number;
};

type TelegramResponse<T> = { ok: true; result: T } | { ok: false; description: string; error_code: number };

async function callApi<T>(method: string, body: Record<string, unknown>): Promise<T> {
  const res = await fetch(`${API_BASE}/${method}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });

  const json = (await res.json().catch(() => null)) as TelegramResponse<T> | null;
  if (!json || !json.ok) {
    const desc = json && !json.ok ? json.description : `HTTP ${res.status}`;
    throw new Error(`Telegram ${method} failed: ${desc}`);
  }
  return json.result;
}

function truncate(value: string, max: number): string {
  return value.length > max ? value.slice(0, max - 1) + "…" : value;
}

export async function sendTelegramMessage(
  text: string,
  options: SendMessageOptions = {},
): Promise<TelegramMessage> {
  return callApi<TelegramMessage>("sendMessage", {
    chat_id: options.chatId ?? config.telegram.chatId,
    text: truncate(text, MAX_TEXT),
    parse_mode: options.parseMode ?? "HTML",
    disable_web_page_preview: options.disablePreview ?? true,
    disable_notification: options.silent ?? false,
    reply_to_message_id: options.replyToMessageId,
    reply_markup: options.replyMarkup,
  });
}

export type SendMediaOptions = SendMessageOptions & { caption?: string };

export async function sendTelegramPhoto(
  photo: string,
  options: SendMediaOptions = {},
): Promise<TelegramMessage> {
  return callApi<TelegramMessage>("sendPhoto", {
    chat_id: options.chatId ?? config.telegram.chatId,
    photo,
    caption: options.caption ? truncate(options.caption, MAX_CAPTION) : undefined,
    parse_mode: options.parseMode ?? "HTML",
    disable_notification: options.silent ?? false,
    reply_to_message_id: options.replyToMessageId,
    reply_markup: options.replyMarkup,
  });
}

export async function sendTelegramDocument(
  document: string,
  options: SendMediaOptions = {},
): Promise<TelegramMessage> {
  return callApi<TelegramMessage>("sendDocument", {
    chat_id: options.chatId ?? config.telegram.chatId,
    document,
    caption: options.caption ? truncate(options.caption, MAX_CAPTION) : undefined,
    parse_mode: options.parseMode ?? "HTML",
    disable_notification: options.silent ?? false,
    reply_to_message_id: options.replyToMessageId,
    reply_markup: options.replyMarkup,
  });
}

export async function editTelegramMessage(
  chatId: string | number,
  messageId: number,
  text: string,
  options: Omit<SendMessageOptions, "chatId" | "replyToMessageId" | "silent"> = {},
): Promise<void> {
  await callApi("editMessageText", {
    chat_id: chatId,
    message_id: messageId,
    text: truncate(text, MAX_TEXT),
    parse_mode: options.parseMode ?? "HTML",
    disable_web_page_preview: options.disablePreview ?? true,
    reply_markup: options.replyMarkup,
  });
}

export async function deleteTelegramMessage(
  chatId: string | number,
  messageId: number,
): Promise<void> {
  await callApi("deleteMessage", { chat_id: chatId, message_id: messageId });
}

export async function answerCallbackQuery(
  callbackQueryId: string,
  options: { text?: string; alert?: boolean; url?: string } = {},
): Promise<void> {
  await callApi("answerCallbackQuery", {
    callback_query_id: callbackQueryId,
    text: options.text,
    show_alert: options.alert ?? false,
    url: options.url,
  });
}

export type TelegramBotInfo = {
  id: number;
  username: string;
  first_name: string;
  is_bot: boolean;
};

export async function getBotInfo(): Promise<TelegramBotInfo> {
  return callApi<TelegramBotInfo>("getMe", {});
}

export const keyboard = {
  url(text: string, url: string): InlineKeyboardButton {
    return { text, url };
  },
  callback(text: string, data: string): InlineKeyboardButton {
    return { text, callback_data: data };
  },
  rows(...rows: InlineKeyboardButton[][]): ReplyMarkup {
    return { inline_keyboard: rows };
  },
  single(button: InlineKeyboardButton): ReplyMarkup {
    return { inline_keyboard: [[button]] };
  },
};

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

const MD2_SPECIALS = /([_*\[\]()~`>#+\-=|{}.!\\])/g;

export function escapeMarkdownV2(value: string): string {
  return value.replace(MD2_SPECIALS, "\\$1");
}
