import { Hono } from "hono";
import { config } from "../config";
import { escapeHtml, sendTelegramMessage } from "../telegram";
import { verifyHmacSha256 } from "../utils/signature";

type LinearActor = { name?: string; email?: string };

type LinearIssueData = {
  identifier?: string;
  title?: string;
  description?: string;
  url?: string;
  priorityLabel?: string;
  state?: { name?: string };
  team?: { name?: string; key?: string };
  assignee?: { name?: string } | null;
  creator?: { name?: string } | null;
  labels?: Array<{ name: string }>;
};

type LinearCommentData = {
  body?: string;
  url?: string;
  user?: { name?: string };
  issue?: { identifier?: string; title?: string; url?: string };
};

type LinearProjectData = {
  name?: string;
  url?: string;
  state?: string;
  description?: string;
};

type LinearWebhookPayload = {
  action?: "create" | "update" | "remove" | string;
  type?: string;
  createdAt?: string;
  actor?: LinearActor;
  data?: LinearIssueData & LinearCommentData & LinearProjectData & Record<string, unknown>;
  url?: string;
};

const ACTION_LABEL: Record<string, string> = {
  create: "oluşturuldu",
  update: "güncellendi",
  remove: "silindi",
};

function formatActor(actor?: LinearActor): string {
  if (!actor?.name) return "Bilinmiyor";
  return escapeHtml(actor.name);
}

function formatIssue(payload: LinearWebhookPayload): string {
  const data = payload.data as LinearIssueData;
  const action = ACTION_LABEL[payload.action ?? ""] ?? payload.action ?? "değişti";
  const id = data.identifier ?? "?";
  const title = data.title ?? "(başlıksız)";
  const url = data.url ?? payload.url ?? "";
  const state = data.state?.name;
  const priority = data.priorityLabel;
  const assignee = data.assignee?.name;
  const labels = data.labels?.map((l) => l.name).join(", ");

  const lines = [
    `<b>📌 Linear Issue ${escapeHtml(action)}</b>`,
    url
      ? `<b>${escapeHtml(id)}</b> · <a href="${escapeHtml(url)}">${escapeHtml(title)}</a>`
      : `<b>${escapeHtml(id)}</b> · ${escapeHtml(title)}`,
  ];

  const meta: string[] = [];
  if (state) meta.push(`Durum: <b>${escapeHtml(state)}</b>`);
  if (priority) meta.push(`Öncelik: ${escapeHtml(priority)}`);
  if (assignee) meta.push(`Atanan: ${escapeHtml(assignee)}`);
  if (labels) meta.push(`Etiketler: ${escapeHtml(labels)}`);
  if (meta.length > 0) lines.push(meta.join(" · "));

  lines.push(`<i>by ${formatActor(payload.actor)}</i>`);
  return lines.join("\n");
}

function formatComment(payload: LinearWebhookPayload): string {
  const data = payload.data as LinearCommentData;
  const issue = data.issue;
  const issueLine = issue?.identifier
    ? issue.url
      ? `<a href="${escapeHtml(issue.url)}">${escapeHtml(issue.identifier)} ${escapeHtml(issue.title ?? "")}</a>`
      : `${escapeHtml(issue.identifier)} ${escapeHtml(issue.title ?? "")}`
    : "(bilinmeyen issue)";

  const body = (data.body ?? "").trim();
  const trimmed = body.length > 800 ? body.slice(0, 800) + "…" : body;

  return [
    `<b>💬 Linear Yeni Yorum</b>`,
    issueLine,
    trimmed ? `<blockquote>${escapeHtml(trimmed)}</blockquote>` : "",
    `<i>by ${formatActor(payload.actor)}</i>`,
  ]
    .filter(Boolean)
    .join("\n");
}

function formatProject(payload: LinearWebhookPayload): string {
  const data = payload.data as LinearProjectData;
  const action = ACTION_LABEL[payload.action ?? ""] ?? payload.action ?? "değişti";
  const url = data.url;
  const title = data.name ?? "(isimsiz proje)";

  return [
    `<b>📁 Linear Proje ${escapeHtml(action)}</b>`,
    url
      ? `<a href="${escapeHtml(url)}">${escapeHtml(title)}</a>`
      : escapeHtml(title),
    data.state ? `Durum: <b>${escapeHtml(data.state)}</b>` : "",
    `<i>by ${formatActor(payload.actor)}</i>`,
  ]
    .filter(Boolean)
    .join("\n");
}

function formatGeneric(payload: LinearWebhookPayload): string {
  return [
    `<b>🔔 Linear ${escapeHtml(payload.type ?? "Event")}</b>`,
    payload.action ? `Aksiyon: ${escapeHtml(payload.action)}` : "",
    `<i>by ${formatActor(payload.actor)}</i>`,
  ]
    .filter(Boolean)
    .join("\n");
}

function formatLinearMessage(payload: LinearWebhookPayload): string {
  switch (payload.type) {
    case "Issue":
      return formatIssue(payload);
    case "Comment":
      return formatComment(payload);
    case "Project":
      return formatProject(payload);
    default:
      return formatGeneric(payload);
  }
}

export const linearRouter = new Hono();

linearRouter.post("/", async (c) => {
  const rawBody = await c.req.text();
  const signature = c.req.header("linear-signature");

  if (!verifyHmacSha256(rawBody, config.webhook.linearSecret, signature)) {
    return c.json({ error: "invalid signature" }, 401);
  }

  let payload: LinearWebhookPayload;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return c.json({ error: "invalid json" }, 400);
  }

  const message = formatLinearMessage(payload);

  try {
    await sendTelegramMessage(message);
  } catch (err) {
    console.error("[linear] telegram send failed", err);
    return c.json({ error: "telegram send failed" }, 502);
  }

  return c.json({ ok: true });
});
