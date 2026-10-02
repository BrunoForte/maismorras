package main

import (
	"context"
	"errors"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"vtt-backend/internal/campaigns"
	"vtt-backend/internal/characters"
	"vtt-backend/internal/compendium"
	"vtt-backend/internal/config"
	"vtt-backend/internal/database"
	"vtt-backend/internal/events"
	apphttp "vtt-backend/internal/http"
	"vtt-backend/internal/library"
	"vtt-backend/internal/notes"
	"vtt-backend/internal/npcs"
	"vtt-backend/internal/observability"
	"vtt-backend/internal/overlayaccess"
	"vtt-backend/internal/realtime"
	"vtt-backend/internal/scenes"
	"vtt-backend/internal/tokens"
	"vtt-backend/internal/translation"
)

func main() {
	cfg := config.Load()
	logLevel := slog.LevelInfo
	switch os.Getenv("LOG_LEVEL") {
	case "debug", "DEBUG":
		logLevel = slog.LevelDebug
	case "warn", "WARN":
		logLevel = slog.LevelWarn
	case "error", "ERROR":
		logLevel = slog.LevelError
	}
	logger := slog.New(observability.NewCloudLoggingHandler(os.Stdout, &slog.HandlerOptions{Level: logLevel})).With("cloud_run_revision", os.Getenv("K_REVISION"), "service", os.Getenv("K_SERVICE"))
	slog.SetDefault(logger)
	brokerMode := cfg.RealtimeBroker
	production := os.Getenv("K_SERVICE") != ""
	if brokerMode == "" {
		if production {
			logger.Error("REALTIME_BROKER must be explicitly set in Cloud Run", "broker_mode", "unset")
			os.Exit(1)
		}
		brokerMode = "local"
	}
	if brokerMode != "local" && brokerMode != "postgres" {
		logger.Error("invalid realtime broker mode", "event", "realtime.broker.invalid_mode")
		os.Exit(1)
	}
	pool, err := database.Open(context.Background(), cfg.DatabaseURL)
	if err != nil {
		logger.Error("database connection failed", append([]any{"event", "database.connection_failed"}, observability.SafeErrorAttrs(err)...)...)
		os.Exit(1)
	}
	if pool != nil {
		defer pool.Close()
		logger.Info("PostgreSQL pool connected")
	}

	client := &http.Client{Timeout: cfg.UpstreamTimeout}
	var imageService tokens.ImageGenerator
	if cfg.ImageProvider() == "cloudflare_workers_ai" {
		imageService = tokens.NewCloudflareService(client, cfg.CloudflareAccountID, cfg.CloudflareAPIToken, cfg.CloudflareImageModel, cfg.MaxImageBytes)
		logger.Info("image generation provider selected", "provider", cfg.ImageProvider())
	} else {
		imageService = tokens.NewPollinationsService(client, cfg.PollinationsBaseURL, cfg.MaxImageBytes)
		logger.Info("image generation provider selected", "provider", cfg.ImageProvider())
	}
	translationClient := &http.Client{Timeout: cfg.TranslationTimeout}
	var translationService compendium.Translator
	if cfg.TranslationProvider() == "deepl" {
		translationService = translation.NewDeepLService(translationClient, cfg.DeepLTranslateURL, cfg.DeepLAPIKey)
		logger.Info("compendium translation provider selected", "provider", "deepl")
	} else {
		translationService = translation.NewService(translationClient, cfg.PollinationsTextURL, cfg.PollinationsAPIKey, cfg.TranslationModel)
		logger.Info("compendium translation provider selected", "provider", cfg.TranslationProvider())
	}
	hub := realtime.NewHub()
	hub.ConfigureBroker(nil)
	instanceID := hub.OriginInstanceID()
	runCtx, cancelRun := context.WithCancel(context.Background())
	defer cancelRun()
	brokerURL := cfg.RealtimeBrokerDatabaseURL
	if brokerURL == "" {
		brokerURL = cfg.DatabaseURL
	}
	if brokerMode == "postgres" {
		if pool == nil || !realtime.ListenCompatibleDatabaseURL(brokerURL) {
			logger.Error("postgres realtime broker requires a direct or session-mode PostgreSQL connection on port 5432", "broker_mode", brokerMode, "origin_instance_id", instanceID)
			os.Exit(1)
		}
		broker := realtime.NewPostgresBroker(pool, brokerURL, instanceID, logger)
		hub.ConfigureBroker(broker)
		go func() {
			if err := broker.Listen(runCtx, hub.HandleRemote, hub.RefreshLocalRooms); err != nil && runCtx.Err() == nil {
				logger.Error("realtime broker listener stopped unexpectedly", append([]any{"event", "realtime.broker.listener_stopped", "broker_mode", brokerMode, "origin_instance_id", instanceID}, observability.SafeErrorAttrs(err)...)...)
			}
		}()
	} else if pool != nil && realtime.CampaignEventsListenCompatibleDatabaseURL(brokerURL) {
		// Even with the in-memory scene broker, committed game_events must reach
		// clients connected to this process through PostgreSQL's commit-aware NOTIFY.
		broker := realtime.NewPostgresBroker(pool, brokerURL, instanceID, logger)
		go func() {
			if err := broker.ListenCampaignEvents(runCtx, hub.HandleRemote, hub.RefreshLocalRooms); err != nil && runCtx.Err() == nil {
				logger.Error("campaign event listener stopped unexpectedly", append([]any{"event", "realtime.campaign.listener_stopped", "broker_mode", brokerMode, "origin_instance_id", instanceID}, observability.SafeErrorAttrs(err)...)...)
			}
		}()
	}
	logger.Info("realtime broker initialized", "event", "realtime.broker.initialized", "broker_mode", brokerMode, "origin_instance_id", instanceID)
	handler := apphttp.NewRouter(cfg, logger, tokens.NewHandler(imageService, tokens.NewPostgresGenerationPolicy(pool)), campaigns.NewHandler(campaigns.NewRepository(pool)), scenes.NewHandler(scenes.NewRepository(pool), hub), characters.NewHandler(characters.NewRepository(pool)), compendium.NewHandler(compendium.NewRepository(pool), translationService), notes.NewHandler(pool), npcs.NewHandler(npcs.NewRepository(pool)), events.NewHandler(pool), library.NewHandler(pool, cfg, hub), realtime.NewHandler(cfg, pool, hub), overlayaccess.NewHandler(pool, cfg), hub)

	server := &http.Server{
		Addr:              ":" + cfg.Port,
		Handler:           handler,
		ReadHeaderTimeout: 5 * time.Second,
	}

	go func() {
		logger.Info("HTTP server started", "address", server.Addr)
		if err := server.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
			logger.Error("HTTP server failed", append([]any{"event", "http.server_failed"}, observability.SafeErrorAttrs(err)...)...)
			os.Exit(1)
		}
	}()

	shutdownSignal := make(chan os.Signal, 1)
	signal.Notify(shutdownSignal, os.Interrupt, syscall.SIGTERM)
	<-shutdownSignal
	cancelRun()

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	if err := server.Shutdown(ctx); err != nil {
		logger.Error("graceful shutdown failed", append([]any{"event", "http.shutdown_failed"}, observability.SafeErrorAttrs(err)...)...)
	}
}
