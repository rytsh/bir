FROM golang:1.25-alpine AS builder

ARG VERSION=dev

COPY . .

RUN CGO_ENABLED=0 go build -trimpath -ldflags="-s -w -X main.version=${VERSION}" -o /bir_api ./cmd/bir/main.go

FROM gcr.io/distroless/static:nonroot

COPY --from=builder /bir_api /bir_api

ENTRYPOINT ["/bir_api"]
