package handlers

import (
	"encoding/json"
	"fmt"
	"io/fs"
	"net/http"
	"os"
	"path/filepath"
	"strings"

	"api-platform/models"
)

type CoreConfigHandler struct {
	baseDir  string
	langDir  string
	confPath string
	embedFS  fs.FS
}

func NewCoreConfigHandler(baseDir string, embedFS fs.FS) *CoreConfigHandler {
	h := &CoreConfigHandler{
		baseDir:  baseDir,
		langDir:  filepath.Join(baseDir, "lang"),
		confPath: filepath.Join(baseDir, "config.json"),
		embedFS:  embedFS,
	}
	h.init()
	return h
}

func (h *CoreConfigHandler) init() {
	os.MkdirAll(h.langDir, 0755)
	entries, _ := fs.ReadDir(h.embedFS, "lang")
	for _, entry := range entries {
		if entry.IsDir() || !strings.HasSuffix(entry.Name(), ".json") {
			continue
		}
		dest := filepath.Join(h.langDir, entry.Name())
		if _, err := os.Stat(dest); os.IsNotExist(err) {
			data, err := fs.ReadFile(h.embedFS, "lang/"+entry.Name())
			if err == nil {
				os.WriteFile(dest, data, 0644)
			}
		}
	}
	if _, err := os.Stat(h.confPath); os.IsNotExist(err) {
		os.WriteFile(h.confPath, []byte(`{"lang":"En","timeout":60}`), 0644)
	}
}

func (h *CoreConfigHandler) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	path := strings.TrimPrefix(r.URL.Path, "/api/core-config")
	path = strings.TrimPrefix(path, "/")

	switch {
	case path == "" || path == "config":
		switch r.Method {
		case http.MethodGet:
			h.getConfig(w)
		case http.MethodPut:
			h.putConfig(w, r)
		default:
			http.Error(w, `{"error":"method not allowed"}`, http.StatusMethodNotAllowed)
		}
	case path == "translations":
		h.getTranslations(w, r)
	case strings.HasPrefix(path, "lang/"):
		h.getLangFile(w, strings.TrimPrefix(path, "lang/"))
	default:
		http.Error(w, `{"error":"not found"}`, http.StatusNotFound)
	}
}

func (h *CoreConfigHandler) getConfig(w http.ResponseWriter) {
	data, _ := os.ReadFile(h.confPath)
	if len(data) == 0 {
		data = []byte(`{"lang":"En","timeout":60}`)
	}
	w.Write(data)
}

func (h *CoreConfigHandler) putConfig(w http.ResponseWriter, r *http.Request) {
	var cfg models.CoreConfig
	if err := json.NewDecoder(r.Body).Decode(&cfg); err != nil {
		http.Error(w, `{"error":"invalid config"}`, http.StatusBadRequest)
		return
	}
	if cfg.Timeout <= 0 {
		cfg.Timeout = 60
	}
	if cfg.Lang == "" {
		cfg.Lang = "En"
	}
	data, _ := json.Marshal(cfg)
	os.WriteFile(h.confPath, data, 0644)
	json.NewEncoder(w).Encode(cfg)
}

var knownLangs []string

func (h *CoreConfigHandler) getLangFile(w http.ResponseWriter, name string) {
	if !strings.HasSuffix(name, ".json") {
		name += ".json"
	}
	if strings.Contains(name, "..") || strings.Contains(name, "/") {
		http.Error(w, `{"error":"invalid"}`, http.StatusBadRequest)
		return
	}
	data, err := os.ReadFile(filepath.Join(h.langDir, name))
	if err != nil {
		http.Error(w, `{"error":"not found"}`, http.StatusNotFound)
		return
	}
	w.Write(data)
}

func (h *CoreConfigHandler) getTranslations(w http.ResponseWriter, r *http.Request) {
	lang := r.URL.Query().Get("lang")
	if lang == "" {
		var cfg models.CoreConfig
		data, _ := os.ReadFile(h.confPath)
		json.Unmarshal(data, &cfg)
		lang = cfg.Lang
	}
	if lang == "" {
		lang = "En"
	}

	// Load English as base (fallback)
	enData, _ := os.ReadFile(filepath.Join(h.langDir, "En.json"))
	base := make(map[string]string)
	if enData != nil {
		json.Unmarshal(enData, &base)
	}

	// Override with user's language
	if lang != "En" {
		langData, _ := os.ReadFile(filepath.Join(h.langDir, lang+".json"))
		if langData != nil {
			overrides := make(map[string]string)
			json.Unmarshal(langData, &overrides)
			for k, v := range overrides {
				base[k] = v
			}
		}
	}

	json.NewEncoder(w).Encode(base)
}

func (h *CoreConfigHandler) ListLangs() []string {
	entries, _ := os.ReadDir(h.langDir)
	var langs []string
	for _, entry := range entries {
		if !entry.IsDir() && strings.HasSuffix(entry.Name(), ".json") {
			langs = append(langs, strings.TrimSuffix(entry.Name(), ".json"))
		}
	}
	if langs == nil {
		langs = []string{}
	}
	return langs
}

// SetupCoreConfig creates the core config directory and returns the handler.
func SetupCoreConfig(execDir string, embedFS fs.FS) (*CoreConfigHandler, error) {
	coreDir := filepath.Join(execDir, "api-platform-core")
	if err := os.MkdirAll(coreDir, 0755); err != nil {
		return nil, fmt.Errorf("failed to create core config dir: %w", err)
	}
	return NewCoreConfigHandler(coreDir, embedFS), nil
}
