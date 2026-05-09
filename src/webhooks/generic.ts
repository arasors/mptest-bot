import { Hono } from "hono";
import { config } from "../config";
import { escapeHtml, sendTelegramMessage } from "../telegram";
import { constantTimeEquals } from "../utils/signature";

type GenericPayload = {
  title?: string;
  message?: string;
  text?: string;
  source?: string;
  url?: string;
  level?: "info" | "warn" | "error" | "success" | string;
  fields?: Record<string, string | number | boolean>;
};

const LEVEL_ICON: Record<string, string> = {
  info: "ℹ️",
  warn: "⚠️",
  error: "🚨",
  success: "✅",
};

function formatGenericMessage(payload: GenericPayload): string {
  const icon = LEVEL_ICON[payload.level ?? "info"] ?? "🔔";
  const title = payload.title ?? payload.source ?? "Webhook";
  const body = payload.message ?? payload.text ?? "";

  const lines = [`<b>${icon} ${escapeHtml(title)}</b>`];
  if (body) lines.push(escapeHtml(body));

  if (payload.fields && typeof payload.fields === "object") {
    for (const [key, value] of Object.entries(payload.fields)) {
      lines.push(`<b>${escapeHtml(key)}:</b> ${escapeHtml(String(value))}`);
    }
  }

  if (payload.url) {
    lines.push(`<a href="${escapeHtml(payload.url)}">Detay</a>`);
  }

  return lines.join("\n");
}

export const genericRouter = new Hono();

genericRouter.post("/", async (c) => {
  const provided = c.req.header("x-webhook-secret") ?? c.req.query("secret") ?? "";
  if (!constantTimeEquals(provided, config.webhook.genericSecret)) {
    return c.json({ error: "invalid secret" }, 401);
  }

  let payload: GenericPayload;
  try {
    payload = await c.req.json();
  } catch {
    return c.json({ error: "invalid json" }, 400);
  }

  const message = formatGenericMessage(payload);

  try {
    await sendTelegramMessage(message);
  } catch (err) {
    console.error("[generic] telegram send failed", err);
    return c.json({ error: "telegram send failed" }, 502);
  }

  return c.json({ ok: true });
});
