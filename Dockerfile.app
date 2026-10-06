FROM --platform=$BUILDPLATFORM ghcr.io/pnpm/pnpm:12 AS web

ARG VERSION=dev

WORKDIR /src

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile

COPY . .

ENV PUBLIC_VERSION=${VERSION} \
    PUBLIC_API_URL=/api \
    PUBLIC_DISABLE_FEEDBACK=true

RUN pnpm build

FROM --platform=$BUILDPLATFORM golang:1.27-alpine AS builder

ARG VERSION=dev
ARG TARGETOS
ARG TARGETARCH

WORKDIR /src

COPY api/ .

RUN CGO_ENABLED=0 GOOS=${TARGETOS} GOARCH=${TARGETARCH} go build -trimpath -ldflags="-s -w -X main.version=${VERSION}" -o /bir_api ./cmd/bir/main.go

FROM --platform=$BUILDPLATFORM ghcr.io/rytsh/dock/curl:latest AS external

ARG TARGETARCH

RUN case "${TARGETARCH}" in \
      amd64) TURNA_ARCH=x86_64 ;; \
      arm64) TURNA_ARCH=arm64 ;; \
      *) echo "unsupported arch: ${TARGETARCH}" && exit 1 ;; \
    esac && \
    curl -fSL https://github.com/rakunlabs/turna/releases/download/v0.9.12/turna_Linux_${TURNA_ARCH}.tar.gz | tar -xz --overwrite -C / turna

FROM gcr.io/distroless/static:nonroot

COPY --from=builder /bir_api /bir_api
COPY --from=external /turna /turna
COPY --from=web /src/dist /dist
COPY api/turna.app.yaml /etc/turna.yaml

EXPOSE 8080

ENTRYPOINT ["/turna"]
