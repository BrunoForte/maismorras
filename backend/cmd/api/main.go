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
	"vtt-backend/internal/notes"
	"vtt-backend/internal/npcs"
	"vtt-backend/internal/realtime"
	"vtt-backend/internal/scenes"
	"vtt-backend/internal/tokens"
)

func main() {
	cfg := config.Load()
	logger := slog.New(slog.NewJSONHandler(os.Stdout, nil))
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
	imageService := tokens.NewPollinationsService(client, cfg.PollinationsBaseURL, cfg.MaxImageBytes)
	hub := realtime.NewHub()
	handler := apphttp.NewRouter(cfg, logger, tokens.NewHandler(imageService), campaigns.NewHandler(campaigns.NewRepository(pool)), scenes.NewHandler(scenes.NewRepository(pool)), characters.NewHandler(characters.NewRepository(pool)), compendium.NewHandler(compendium.NewRepository(pool)), notes.NewHandler(pool), npcs.NewHandler(npcs.NewRepository(pool)), events.NewHandler(pool), realtime.NewHandler(cfg, pool, hub))

	server := &http.Server{
		Addr:              ":" + cfg.Port,
		Handler:           handler,
		ReadHeaderTimeout: 5 * time.Second,
		ReadTimeout:       10 * time.Second,
		WriteTimeout:      30 * time.Second,
		IdleTimeout:       60 * time.Second,
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
