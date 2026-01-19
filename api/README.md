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
