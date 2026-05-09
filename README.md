# Telegram Webhook Relay

Linear, GitHub ve generic webhook'ları alır, Telegram bot'una iletir. Bun + Hono ile yazılmıştır, Coolify üzerinde Dockerfile ile deploy edilebilir.

## Endpoints

| Yol                   | Doğrulama                                      | Kullanım                              |
| --------------------- | ---------------------------------------------- | ------------------------------------- |
| `GET  /health`        | -                                              | Health check (Coolify, Docker)        |
| `POST /webhooks/linear`  | `linear-signature` HMAC-SHA256              | Linear webhook hedefi                 |
| `POST /webhooks/github`  | `x-hub-signature-256` HMAC-SHA256           | GitHub webhook hedefi (opsiyonel)     |
| `POST /webhooks/generic` | `x-webhook-secret` header veya `?secret=`   | Diğer servisler / custom entegrasyon  |

## Env değişkenleri

`.env.example` dosyasını `.env` olarak kopyalayıp doldurun:

```
PORT=3000
TELEGRAM_BOT_TOKEN=...        # @BotFather'dan alın
TELEGRAM_CHAT_ID=...          # mesajların gönderileceği chat / group ID
WEBHOOK_SECRET=...            # generic endpoint için paylaşılan secret
LINEAR_WEBHOOK_SECRET=...     # Linear → Settings → API → Webhook signing secret
GITHUB_WEBHOOK_SECRET=        # opsiyonel
```

`TELEGRAM_CHAT_ID` öğrenmek için: bot'u kanala/gruba ekleyin, kanala mesaj atın, sonra `https://api.telegram.org/bot<TOKEN>/getUpdates` adresinden `chat.id` değerini alın.

## Lokal çalıştırma

```bash
bun install
cp .env.example .env  # ve doldur
bun run dev
```

Hızlı test:

```bash
curl -X POST http://localhost:3000/webhooks/generic \
  -H "x-webhook-secret: $WEBHOOK_SECRET" \
  -H "content-type: application/json" \
  -d '{"title":"Selam","message":"Test mesajı","level":"info"}'
```

## Coolify deploy

1. Bu repoyu git üzerine pushlayın.
2. Coolify → **+ New Resource → Application → Public/Private Repository**.
3. Build Pack: **Dockerfile** (Coolify Dockerfile'ı otomatik bulur).
4. **Port**: `3000` (Dockerfile içinde `EXPOSE 3000` zaten ayarlı).
5. **Environment Variables** bölümüne `.env.example`'daki tüm değişkenleri ekleyin.
6. **Health Check Path**: `/health` (Coolify'ın UI'ında set edilebilir; Dockerfile'da da tanımlı).
7. Domain bağlayın, Linear webhook URL'i olarak `https://<domain>/webhooks/linear` verin.

### Linear webhook ayarı

Linear → **Settings → API → Webhooks → New webhook**:

- URL: `https://<domain>/webhooks/linear`
- Secret üretmesine izin verin, üretilen secret'ı `LINEAR_WEBHOOK_SECRET` olarak Coolify env'ine girip yeniden deploy edin.
- Events: ihtiyaca göre Issue / Comment / Project seçin.

### GitHub webhook ayarı (opsiyonel)

Repo → **Settings → Webhooks → Add webhook**:

- Payload URL: `https://<domain>/webhooks/github`
- Content type: `application/json`
- Secret: `GITHUB_WEBHOOK_SECRET` ile aynı değer.

### Generic webhook (Sentry, Grafana, custom servis vs.)

```bash
curl -X POST https://<domain>/webhooks/generic \
  -H "x-webhook-secret: <WEBHOOK_SECRET>" \
  -H "content-type: application/json" \
  -d '{
    "title": "Production deploy",
    "message": "v1.4.2 yayınlandı",
    "level": "success",
    "fields": { "branch": "main", "actor": "ci" },
    "url": "https://example.com/deploys/123"
  }'
```

## Yapı

```
src/
├── config.ts            # env okuma + validation
├── telegram.ts          # Telegram Bot API client
├── index.ts             # Hono server + routing
├── utils/signature.ts   # HMAC + constant-time compare
└── webhooks/
    ├── linear.ts
    ├── github.ts
    └── generic.ts
```
