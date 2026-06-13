# Bir API

To run the bir API server, use the following command:

```sh
go run cmd/bir/main.go
```

Local build container and run:

```sh
docker build -t bir_api:dev .
docker run -p 8080:8080 bir_api:dev
```

## Endpoints

| Method | Path                  | Description                             |
| ------ | --------------------- | --------------------------------------- |
| GET    | `/ip`                 | Caller IP                               |
| GET    | `/dns`                | DNS lookup                              |
| GET    | `/ssl`                | SSL certificate info                    |
| GET    | `/whois`              | WHOIS lookup                            |
| POST   | `/webrtc/...`         | WebRTC signaling                        |
| GET    | `/feedback/challenge` | Issues an ALTCHA captcha challenge      |
| POST   | `/feedback`           | Submits feedback (forwarded to Discord) |

## Feedback endpoint

The `/feedback` endpoints power the "Send Feedback" form on the site
(`/feedback` page). Submissions are validated, captcha-checked, and forwarded
to a Discord channel webhook. Only coarse, non-identifying metadata is included
(country, device, browser, OS, origin) — **no IP address or raw user-agent**.

Spam protection uses [ALTCHA](https://altcha.org) (v2 proof-of-work, SHA-256
algorithm) — self-hosted, privacy-friendly, no third-party service. The browser
solves a small proof-of-work challenge issued by `/feedback/challenge`, and the
server verifies the solution on `/feedback`.

### Configuration

Config is loaded via [chu] with the `BIR_API_` env prefix.

| Env variable                           | Required | Description                                                        |
| -------------------------------------- | -------- | ------------------------------------------------------------------ |
| `BIR_API_FEEDBACK_DISCORD_WEBHOOK_URL` | yes      | Discord channel webhook URL the feedback is posted to.             |
| `BIR_API_FEEDBACK_HMAC_KEY`            | yes      | Secret used to sign/verify ALTCHA challenges. **Any value works.** |

> If either value is empty, the feedback endpoints return `503 feedback is not configured`.

**HMAC key** — can be literally any string. The server normalizes it through
SHA-256 into a fixed 32-byte key internally, so length/charset don't matter
(e.g. `hello`, a passphrase, or a random hex are all fine). A random secret is
still recommended:

```sh
openssl rand -hex 32
```

**Create the Discord webhook** — in your Discord server: Channel → Edit Channel →
Integrations → Webhooks → New Webhook → Copy Webhook URL.

### Running locally

```sh
export BIR_API_FEEDBACK_HMAC_KEY="$(openssl rand -hex 32)"
export BIR_API_FEEDBACK_DISCORD_WEBHOOK_URL="https://discord.com/api/webhooks/..."
go run cmd/bir/main.go
```

Quick check:

```sh
curl http://127.0.0.1:8080/feedback/challenge   # returns challenge JSON
```

### Production (Cloud Run via GitHub CI)

`turna.yaml` runs the API as a child process with `inherit_env: true`, so any
env var set on the Cloud Run service is passed through to the Go binary. Do
**not** commit secret values to the repo.

The GitHub workflow (`.github/workflows/api.yml`) injects them at deploy time.
Two options:

#### Option A — GCP Secret Manager (recommended)

The workflow's `deploy-cloudrun` step already references two secrets:

```yaml
secrets: |-
  BIR_API_FEEDBACK_DISCORD_WEBHOOK_URL=bir-feedback-discord-webhook:latest
  BIR_API_FEEDBACK_HMAC_KEY=bir-feedback-hmac-key:latest
```

One-time setup (run locally with gcloud, authenticated to the project):

```sh
# 1. Create the secrets (values are read from stdin, never shown in shell history)
printf '%s' 'https://discord.com/api/webhooks/XXX/YYY' \
  | gcloud secrets create bir-feedback-discord-webhook --data-file=-
printf '%s' "$(openssl rand -hex 32)" \
  | gcloud secrets create bir-feedback-hmac-key --data-file=-

# 2. Grant the Cloud Run RUNTIME service account read access.
#    (Default runtime SA is PROJECT_NUMBER-compute@developer.gserviceaccount.com
#     unless the service uses a custom one.)
RUNTIME_SA="PROJECT_NUMBER-compute@developer.gserviceaccount.com"
for s in bir-feedback-discord-webhook bir-feedback-hmac-key; do
  gcloud secrets add-iam-policy-binding "$s" \
    --member="serviceAccount:${RUNTIME_SA}" \
    --role="roles/secretmanager.secretAccessor"
done
```

Update a value later (creates a new version; `:latest` picks it up on next deploy):

```sh
printf '%s' 'NEW_VALUE' | gcloud secrets versions add bir-feedback-hmac-key --data-file=-
```

#### Option B — GitHub repository secrets (simpler)

Store the values as GitHub repo secrets (Settings → Secrets and variables →
Actions), then pass them as plain env vars in the deploy step instead of the
`secrets:` block:

```yaml
        with:
          service: bir-api
          region: ${{ secrets.GCP_REGION }}
          image: ...
          env_vars: |-
            BIR_API_FEEDBACK_DISCORD_WEBHOOK_URL=${{ secrets.FEEDBACK_DISCORD_WEBHOOK_URL }}
            BIR_API_FEEDBACK_HMAC_KEY=${{ secrets.FEEDBACK_HMAC_KEY }}
```

GitHub masks the values in logs, but they pass through the CI runner. Secret
Manager (Option A) keeps them entirely in GCP, so it is preferred.

### Frontend wiring

The site reads the API base URL from the `PUBLIC_API_URL` env var:

- `.env` (dev): `PUBLIC_API_URL=http://127.0.0.1:8080`
- `.env.production`: `PUBLIC_API_URL=https://api.1.tools`

The form posts to `${PUBLIC_API_URL}/feedback` and the ALTCHA widget fetches
`${PUBLIC_API_URL}/feedback/challenge`.

[chu]: https://github.com/rakunlabs/chu
