FROM go:1.25-alpine

ARG VERSION=dev

COPY . .

RUN CGO_ENABLED=0 go build -trimpath -ldflags="-s -w -X main.version=${VERSION}" -o /bir-server ./cmd/bir/main.go
