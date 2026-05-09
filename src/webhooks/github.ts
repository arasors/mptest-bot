import { Hono } from "hono";
import { config } from "../config";
import { escapeHtml, sendTelegramMessage } from "../telegram";
import { verifyHmacSha256 } from "../utils/signature";

type GitHubUser = { login?: string; html_url?: string };

type GitHubPayload = {
  action?: string;
  sender?: GitHubUser;
  repository?: { full_name?: string; html_url?: string };
  issue?: { number?: number; title?: string; html_url?: string };
  pull_request?: { number?: number; title?: string; html_url?: string; merged?: boolean };
  ref?: string;
  commits?: Array<{ message?: string; url?: string; author?: { name?: string } }>;
  pusher?: { name?: string };
  release?: { name?: string; tag_name?: string; html_url?: string };
};

function formatRepo(payload: GitHubPayload): string {
  const repo = payload.repository?.full_name;
  const url = payload.repository?.html_url;
  if (!repo) return "";
  return url
    ? `<a href="${escapeHtml(url)}">${escapeHtml(repo)}</a>`
    : escapeHtml(repo);
}

function formatGitHubMessage(event: string, payload: GitHubPayload): string {
  const repo = formatRepo(payload);
  const sender = payload.sender?.login ? escapeHtml(payload.sender.login) : "biri";

  switch (event) {
    case "issues": {
      const issue = payload.issue;
      const link = issue?.html_url
        ? `<a href="${escapeHtml(issue.html_url)}">#${issue.number} ${escapeHtml(issue.title ?? "")}</a>`
        : `#${issue?.number ?? "?"}`;
      return `<b>🐛 GitHub Issue ${escapeHtml(payload.action ?? "")}</b>\n${repo} · ${link}\n<i>by ${sender}</i>`;
    }
    case "pull_request": {
      const pr = payload.pull_request;
      const action = pr?.merged ? "merged" : (payload.action ?? "");
      const link = pr?.html_url
        ? `<a href="${escapeHtml(pr.html_url)}">#${pr.number} ${escapeHtml(pr.title ?? "")}</a>`
        : `#${pr?.number ?? "?"}`;
      return `<b>🔀 GitHub PR ${escapeHtml(action)}</b>\n${repo} · ${link}\n<i>by ${sender}</i>`;
    }
    case "push": {
      const branch = payload.ref?.replace(/^refs\/heads\//, "") ?? "";
      const count = payload.commits?.length ?? 0;
      const lines = [
        `<b>⬆️ GitHub Push</b>`,
        `${repo} · <code>${escapeHtml(branch)}</code> (${count} commit)`,
        `<i>by ${escapeHtml(payload.pusher?.name ?? sender)}</i>`,
      ];
      const previews = (payload.commits ?? []).slice(0, 5).map((c) => {
        const msg = (c.message ?? "").split("\n")[0]?.slice(0, 100) ?? "";
        return `• ${escapeHtml(msg)}`;
      });
      return [...lines, ...previews].join("\n");
    }
    case "release": {
      const r = payload.release;
      const link = r?.html_url
        ? `<a href="${escapeHtml(r.html_url)}">${escapeHtml(r.name ?? r.tag_name ?? "")}</a>`
        : escapeHtml(r?.name ?? r?.tag_name ?? "");
      return `<b>🚀 GitHub Release ${escapeHtml(payload.action ?? "")}</b>\n${repo} · ${link}\n<i>by ${sender}</i>`;
    }
    default:
      return `<b>🔔 GitHub ${escapeHtml(event)}</b>${payload.action ? ` ${escapeHtml(payload.action)}` : ""}\n${repo}\n<i>by ${sender}</i>`;
  }
}

export const githubRouter = new Hono();

githubRouter.post("/", async (c) => {
  if (!config.webhook.githubSecret) {
    return c.json({ error: "github webhook not configured" }, 503);
  }

  const rawBody = await c.req.text();
  const signature = c.req.header("x-hub-signature-256");

  if (!verifyHmacSha256(rawBody, config.webhook.githubSecret, signature)) {
    return c.json({ error: "invalid signature" }, 401);
  }

  const event = c.req.header("x-github-event") ?? "unknown";
  if (event === "ping") {
    return c.json({ ok: true });
  }

  let payload: GitHubPayload;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return c.json({ error: "invalid json" }, 400);
  }

  const message = formatGitHubMessage(event, payload);

  try {
    await sendTelegramMessage(message);
  } catch (err) {
    console.error("[github] telegram send failed", err);
    return c.json({ error: "telegram send failed" }, 502);
  }

  return c.json({ ok: true });
});
