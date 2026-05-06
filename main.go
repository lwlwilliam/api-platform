package main

import (
	"context"
	"embed"
	"encoding/json"
	"flag"
	"fmt"
	"io/fs"
	"log"
	"net/http"
	"os"
	"os/signal"
	"path/filepath"
	"runtime/debug"
	"strings"
	"syscall"
	"time"

	"api-platform/handlers"
	"api-platform/models"
	"api-platform/storage"
)

//go:embed web/*
var webFiles embed.FS

//go:embed lang/*
var langFiles embed.FS

func main() {
	devMode := flag.Bool("dev", false, "Serve static files from disk (development mode)")
	port := flag.String("port", "9999", "Server port")
	flag.Parse()

	if envPort := os.Getenv("PORT"); envPort != "" && *port == "9999" {
		*port = envPort
	}

	execDir, _ := os.Getwd()
	dataDir := filepath.Join(execDir, "api-platform-data")

	store, err := storage.New(dataDir)
	if err != nil {
		fmt.Fprintf(os.Stderr, "Failed to initialize storage: %v\n", err)
		os.Exit(1)
	}

	proxyHandler := handlers.NewProxyHandler(store)
	historyHandler := handlers.NewHistoryHandler(store)
	docsHandler := handlers.NewDocsHandler(store)

	coreConfigHandler, err := handlers.SetupCoreConfig(execDir, langFiles)
	if err != nil {
		fmt.Fprintf(os.Stderr, "Failed to initialize core config: %v\n", err)
		os.Exit(1)
	}

	mux := http.NewServeMux()

	mux.HandleFunc("/api/core-config", withRecovery(coreConfigHandler.ServeHTTP))
	mux.HandleFunc("/api/core-config/", withRecovery(coreConfigHandler.ServeHTTP))
	mux.HandleFunc("/api/proxy", withRecovery(proxyHandler.Handle))
	mux.HandleFunc("/api/history", withRecovery(historyHandler.ServeHTTP))
	mux.HandleFunc("/api/history/", withRecovery(historyHandler.ServeHTTP))
	mux.HandleFunc("/api/docs/generate", withRecovery(docsHandler.ServeHTTP))
	mux.HandleFunc("/api/docs/save", withRecovery(docsHandler.ServeHTTP))
	mux.HandleFunc("/api/docs/list", withRecovery(docsHandler.ServeHTTP))
	mux.HandleFunc("/api/docs/batch-delete", withRecovery(docsHandler.ServeHTTP))
	mux.HandleFunc("/api/docs/", withRecovery(docsHandler.ServeHTTP))

	mux.HandleFunc("/api/config", withRecovery(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		switch r.Method {
		case http.MethodGet:
			cfg, _ := store.LoadConfig()
			json.NewEncoder(w).Encode(cfg)
		case http.MethodPut:
			var cfg models.Config
			if err := json.NewDecoder(r.Body).Decode(&cfg); err != nil {
				http.Error(w, `{"error":"invalid config"}`, http.StatusBadRequest)
				return
			}
			if cfg.Timeout <= 0 {
				cfg.Timeout = 60
			}
			if err := store.SaveConfig(cfg); err != nil {
				http.Error(w, `{"error":"`+err.Error()+`"}`, http.StatusInternalServerError)
				return
			}
			json.NewEncoder(w).Encode(cfg)
		default:
			http.Error(w, `{"error":"method not allowed"}`, http.StatusMethodNotAllowed)
		}
	}))

	mux.HandleFunc("/share/", withRecovery(func(w http.ResponseWriter, r *http.Request) {
		alias := strings.TrimPrefix(r.URL.Path, "/share/")
		if alias == "" {
			http.Error(w, "Not found", http.StatusNotFound)
			return
		}
		doc, err := store.GetDocByAlias(alias)
		if err != nil || doc == nil || !doc.Shared {
			http.Error(w, "Not found", http.StatusNotFound)
			return
		}
		data, err := webFiles.ReadFile("web/share.html")
		if err != nil {
			if *devMode {
				http.ServeFile(w, r, "./web/share.html")
				return
			}
			http.Error(w, "Not found", http.StatusNotFound)
			return
		}
		w.Header().Set("Content-Type", "text/html; charset=utf-8")
		w.Write(data)
	}))

	if *devMode {
		fmt.Println("  [DEV MODE] Serving static files from ./web/")
		mux.Handle("/", http.FileServer(http.Dir("./web")))
	} else {
		webFS, err := fs.Sub(webFiles, "web")
		if err != nil {
			fmt.Fprintf(os.Stderr, "Failed to load embedded files: %v\n", err)
			os.Exit(1)
		}
		mux.Handle("/", withRecovery(http.FileServer(http.FS(webFS)).ServeHTTP))
	}

	addr := ":" + *port
	srv := &http.Server{
		Addr:         addr,
		Handler:      mux,
		ReadTimeout:  30 * time.Second,
		WriteTimeout: 120 * time.Second,
		IdleTimeout:  60 * time.Second,
	}

	// Graceful shutdown on SIGINT / SIGTERM
	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)

	go func() {
		sig := <-quit
		fmt.Printf("\n  Received signal: %v, shutting down...\n", sig)
		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		srv.Shutdown(ctx)
	}()

	fmt.Printf("\n  === API Platform ===\n")
	fmt.Printf("  URL: http://localhost%s\n", addr)
	fmt.Printf("  Data: %s\n\n", dataDir)

	if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
		fmt.Fprintf(os.Stderr, "Server error: %v\n", err)
		os.Exit(1)
	}
	fmt.Println("  Server stopped.")
}

// withRecovery wraps an http.HandlerFunc to catch panics and log them.
func withRecovery(next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		defer func() {
			if rec := recover(); rec != nil {
				log.Printf("PANIC: %v\n%s", rec, debug.Stack())
				http.Error(w, `{"error":"internal server error"}`, http.StatusInternalServerError)
			}
		}()
		next(w, r)
	}
}
