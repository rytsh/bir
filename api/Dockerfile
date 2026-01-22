FROM golang:1.25-alpine AS builder

ARG VERSION=dev

COPY . .

RUN CGO_ENABLED=0 go build -trimpath -ldflags="-s -w -X main.version=${VERSION}" -o /bir_api ./cmd/bir/main.go

FROM ghcr.io/rytsh/dock/curl:latest AS external

RUN curl -fSL https://github.com/rakunlabs/turna/releases/download/v0.8.20/turna_Linux_x86_64.tar.gz | tar -xz --overwrite -C / turna

FROM gcr.io/distroless/static:nonroot

COPY --from=builder /bir_api /bir_api
COPY --from=external /turna /turna

COPY turna.yaml /etc/turna.yaml

ENTRYPOINT ["/turna"]
