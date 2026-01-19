package main

import (
	"context"
	"log/slog"

	"github.com/rakunlabs/ada"
	"github.com/rakunlabs/chu"
	"github.com/rakunlabs/chu/loader"
	"github.com/rakunlabs/chu/loader/loaderenv"
	"github.com/rakunlabs/into"
	"github.com/rakunlabs/logi"

	mcors "github.com/rakunlabs/ada/middleware/cors"

	"github.com/rytsh/bir/api/tools/dns"
	"github.com/rytsh/bir/api/tools/ip"
	"github.com/rytsh/bir/api/tools/ssl"
	"github.com/rytsh/bir/api/tools/whois"
)

var (
	version = "dev"
)

func main() {
	into.Init(
		run,
		into.WithMsgf("Bir API Server [%s]", version),
		into.WithLogger(logi.InitializeLog(logi.WithCaller(false))),
	)
}

type config struct {
	Address    string     `cfg:"address" default:":8080"`
	Middleware Middleware `cfg:"middleware"`
}

type Middleware struct {
	Enabled bool       `cfg:"enabled" default:"true"`
	Cors    mcors.Cors `cfg:"cors"`
}

func run(ctx context.Context) error {
	cfg, err := getConfig(ctx)
	if err != nil {
		return err
	}

	server := ada.New()

	setMiddleware(server, cfg.Middleware)

	// tools endpoints
	server.GET("/ip", ip.IP)
	server.GET("/dns", dns.DNS)
	server.GET("/ssl", ssl.SSL)
	server.GET("/whois", whois.Whois)

	return server.StartWithContext(ctx, cfg.Address)
}

func getConfig(ctx context.Context) (*config, error) {
	cfg := config{
		Middleware: Middleware{
			Cors: mcors.Cors{
				AllowOrigins:     []string{"*"},
				AllowMethods:     []string{"GET", "POST"},
				AllowHeaders:     []string{"Content-Type", "Authorization"},
				AllowCredentials: true,
				MaxAge:           3600,
			},
		},
	}

	if err := chu.Load(
		ctx, "bir-api", &cfg,
		chu.WithLoaderOption(loader.NameEnv, loaderenv.New(
			loaderenv.WithPrefix("BIR_API_"),
		)),
	); err != nil {
		return nil, err
	}

	return &cfg, nil
}

func setMiddleware(s *ada.Server, mw Middleware) {
	if mw.Enabled {
		s.Use(
			mcors.Middleware(mcors.WithConfig(mw.Cors)),
		)

		slog.Info("Middleware CORS configured",
			"allow_origins", mw.Cors.AllowOrigins,
			"allow_methods", mw.Cors.AllowMethods,
			"allow_headers", mw.Cors.AllowHeaders,
			"allow_credentials", mw.Cors.AllowCredentials,
			"max_age", mw.Cors.MaxAge,
		)
	}
}
