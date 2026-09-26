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
	"vtt-backend/internal/overlayaccess"
	"vtt-backend/internal/realtime"
	"vtt-backend/internal/scenes"
	"vtt-backend/internal/tokens"
	"vtt-backend/internal/translation"
)

func main() {
	cfg := config.Load()
	logger := slog.New(slog.NewJSONHandler(os.Stdout, nil)).With("cloud_run_revision", os.Getenv("K_REVISION"), "service", os.Getenv("K_SERVICE"))
	pool, err := database.Open(context.Background(), cfg.DatabaseURL)
	if err != nil {
		logger.Error("database connection failed", "error", err)
		os.Exit(1)
	}
	if pool != nil {
		defer pool.Close()
		logger.Info("PostgreSQL pool connected")
	}

	client := &http.Client{Timeout: cfg.UpstreamTimeout}
	var imageService tokens.ImageGenerator
	if cfg.CloudflareAccountID != "" && cfg.CloudflareAPIToken != "" {
		imageService = tokens.NewCloudflareService(client, cfg.CloudflareAccountID, cfg.CloudflareAPIToken, cfg.CloudflareImageModel, cfg.MaxImageBytes)
		logger.Info("image generation provider selected", "provider", "cloudflare_workers_ai", "model", cfg.CloudflareImageModel)
	} else {
		imageService = tokens.NewPollinationsService(client, cfg.PollinationsBaseURL, cfg.MaxImageBytes)
		logger.Info("image generation provider selected", "provider", "pollinations", "reason", "Cloudflare Workers AI credentials are not configured")
	}
	translationClient := &http.Client{Timeout: cfg.TranslationTimeout}
	var translationService compendium.Translator
	if cfg.DeepLAPIKey != "" {
		translationService = translation.NewDeepLService(translationClient, cfg.DeepLTranslateURL, cfg.DeepLAPIKey)
		logger.Info("compendium translation provider selected", "provider", "deepl")
	} else {
		translationService = translation.NewService(translationClient, cfg.PollinationsTextURL, cfg.PollinationsAPIKey, cfg.TranslationModel)
		logger.Info("compendium translation provider selected", "provider", "pollinations", "reason", "DeepL API key is not configured")
	}
	hub := realtime.NewHub()
	handler := apphttp.NewRouter(cfg, logger, tokens.NewHandler(imageService, tokens.NewPostgresGenerationPolicy(pool)), campaigns.NewHandler(campaigns.NewRepository(pool)), scenes.NewHandler(scenes.NewRepository(pool)), characters.NewHandler(characters.NewRepository(pool)), compendium.NewHandler(compendium.NewRepository(pool), translationService), notes.NewHandler(pool), npcs.NewHandler(npcs.NewRepository(pool)), events.NewHandler(pool), library.NewHandler(pool, cfg, hub), realtime.NewHandler(cfg, pool, hub), overlayaccess.NewHandler(pool, cfg))

	server := &http.Server{
		Addr:              ":" + cfg.Port,
		Handler:           handler,
		ReadHeaderTimeout: 5 * time.Second,
	}

	go func() {
		logger.Info("HTTP server started", "address", server.Addr)
		if err := server.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
			logger.Error("HTTP server failed", "error", err)
			os.Exit(1)
		}
	}()

	shutdownSignal := make(chan os.Signal, 1)
	signal.Notify(shutdownSignal, os.Interrupt, syscall.SIGTERM)
	<-shutdownSignal

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	if err := server.Shutdown(ctx); err != nil {
		logger.Error("graceful shutdown failed", "error", err)
	}
}
