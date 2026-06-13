FROM golang:1.26-alpine AS builder

ARG VERSION=dev

COPY . .

RUN CGO_ENABLED=0 go build -trimpath -ldflags="-s -w -X main.version=${VERSION}" -o /bir_api ./cmd/bir/main.go
RUN sed -i '/http:\/\/localhost:4321/d' /turna.yaml

FROM ghcr.io/rytsh/dock/curl:latest AS external

RUN curl -fSL https://github.com/rakunlabs/turna/releases/download/v0.8.26/turna_Linux_x86_64.tar.gz | tar -xz --overwrite -C / turna

FROM gcr.io/distroless/static:nonroot

COPY --from=builder /bir_api /bir_api
COPY --from=builder /turna.yaml /etc/turna.yaml
COPY --from=external /turna /turna

ENTRYPOINT ["/turna"]
