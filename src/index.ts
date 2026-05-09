import { Hono } from "hono";
import { config } from "./config";
import { getBotInfo } from "./telegram";
import { genericRouter } from "./webhooks/generic";
import { githubRouter } from "./webhooks/github";
import { linearRouter } from "./webhooks/linear";

const app = new Hono();

app.use("*", async (c, next) => {
  const start = Date.now();
  await next();
  console.log(
    `[${new Date().toISOString()}] ${c.req.method} ${c.req.path} -> ${c.res.status} (${Date.now() - start}ms)`,
  );
});

app.get("/", (c) =>
  c.json({
    name: "telegram-webhook-relay",
    endpoints: ["/health", "/webhooks/linear", "/webhooks/github", "/webhooks/generic"],
  }),
);

app.get("/health", (c) => c.json({ status: "ok", uptime: process.uptime() }));

app.route("/webhooks/linear", linearRouter);
app.route("/webhooks/github", githubRouter);
app.route("/webhooks/generic", genericRouter);

app.notFound((c) => c.json({ error: "not found" }, 404));

app.onError((err, c) => {
  console.error("[server] unhandled error", err);
  return c.json({ error: "internal server error" }, 500);
});

const server = Bun.serve({
  port: config.port,
  hostname: "0.0.0.0",
  fetch: app.fetch,
});

console.log(`✅ Webhook relay listening on http://${server.hostname}:${server.port}`);

getBotInfo()
  .then((bot) => console.log(`🤖 Telegram bot bağlandı: @${bot.username} (id ${bot.id})`))
  .catch((err) => console.warn(`⚠️  Telegram getMe başarısız: ${err.message}`));

const shutdown = (signal: string) => {
  console.log(`Received ${signal}, shutting down...`);
  server.stop();
  setTimeout(() => process.exit(0), 500);
};

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
