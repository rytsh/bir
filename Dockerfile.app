FROM ghcr.io/pnpm/pnpm:12 AS web

ARG VERSION=dev

WORKDIR /src

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile

COPY . .

ENV PUBLIC_VERSION=${VERSION} \
    PUBLIC_API_URL=/api \
    PUBLIC_DISABLE_FEEDBACK=true

RUN pnpm build

FROM golang:1.27-alpine AS builder

ARG VERSION=dev

WORKDIR /src

COPY api/ .

RUN CGO_ENABLED=0 go build -trimpath -ldflags="-s -w -X main.version=${VERSION}" -o /bir_api ./cmd/bir/main.go

FROM ghcr.io/rytsh/dock/curl:latest AS external

RUN curl -fSL https://github.com/rakunlabs/turna/releases/download/v0.9.12/turna_Linux_x86_64.tar.gz | tar -xz --overwrite -C / turna

FROM gcr.io/distroless/static:nonroot

COPY --from=builder /bir_api /bir_api
COPY --from=external /turna /turna
COPY --from=web /src/dist /dist
COPY api/turna.app.yaml /etc/turna.yaml

EXPOSE 8080

ENTRYPOINT ["/turna"]
