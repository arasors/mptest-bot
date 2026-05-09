function required(name: string): string {
  const value = process.env[name];
  if (!value || value.trim() === "") {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function optional(name: string): string | undefined {
  const value = process.env[name];
  return value && value.trim() !== "" ? value : undefined;
}

export const config = {
  port: Number(process.env.PORT ?? 3000),
  telegram: {
    botToken: required("TELEGRAM_BOT_TOKEN"),
    chatId: required("TELEGRAM_CHAT_ID"),
  },
  webhook: {
    genericSecret: required("WEBHOOK_SECRET"),
    linearSecret: required("LINEAR_WEBHOOK_SECRET"),
    githubSecret: optional("GITHUB_WEBHOOK_SECRET"),
  },
} as const;
