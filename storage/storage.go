package storage

import (
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"sync"
	"time"

	"api-platform/models"
)

type Storage struct {
	mu      sync.RWMutex
	baseDir string
}

func New(dataDir string) (*Storage, error) {
	if err := os.MkdirAll(dataDir, 0755); err != nil {
		return nil, err
	}
	if err := os.MkdirAll(filepath.Join(dataDir, "docs"), 0755); err != nil {
		return nil, err
	}
	return &Storage{baseDir: dataDir}, nil
}

func (s *Storage) histPath() string   { return filepath.Join(s.baseDir, "history.json") }
func (s *Storage) docsDir() string    { return filepath.Join(s.baseDir, "docs") }
func (s *Storage) configPath() string { return filepath.Join(s.baseDir, "config.json") }

// ==================== Config ====================

func (s *Storage) LoadConfig() (*models.Config, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	cfg, err := readSingleJSON[models.Config](s.configPath())
	if err != nil {
		return defaultConfig(), nil
	}
	if cfg == nil {
		return defaultConfig(), nil
	}
	if cfg.Timeout <= 0 {
		cfg.Timeout = 60
	}
	return cfg, nil
}

func (s *Storage) SaveConfig(cfg models.Config) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	return writeJSON(s.configPath(), cfg)
}

func defaultConfig() *models.Config {
	return &models.Config{Timeout: 60}
}

// ==================== History ====================

func (s *Storage) LoadHistory() ([]models.HistoryEntry, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return readJSON[models.HistoryEntry](s.histPath())
}

func (s *Storage) SaveHistory(entries []models.HistoryEntry) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	return writeJSON(s.histPath(), entries)
}

func (s *Storage) AddHistory(entry models.HistoryEntry) error {
	entries, err := s.LoadHistory()
	if err != nil {
		return err
	}
	entries = append([]models.HistoryEntry{entry}, entries...)
	if len(entries) > 1000 {
		entries = entries[:1000]
	}
	return s.SaveHistory(entries)
}

func (s *Storage) DeleteHistory(id string) error {
	entries, err := s.LoadHistory()
	if err != nil {
		return err
	}
	idx := -1
	for i, e := range entries {
		if e.ID == id {
			idx = i
			break
		}
	}
	if idx < 0 {
		return nil
	}
	entries = append(entries[:idx], entries[idx+1:]...)
	return s.SaveHistory(entries)
}

func (s *Storage) ClearHistory() error {
	return s.SaveHistory([]models.HistoryEntry{})
}

func (s *Storage) UpdateHistoryEntry(id, note string, formFields []models.FormField, urlEncoded []models.KV) (*models.HistoryEntry, error) {
	entries, err := s.LoadHistory()
	if err != nil {
		return nil, err
	}
	for i, e := range entries {
		if e.ID == id {
			if note != "" || len(formFields) > 0 || len(urlEncoded) > 0 {
				entries[i].Note = note
			}
			if len(formFields) > 0 {
				entries[i].FormFields = formFields
			}
			if len(urlEncoded) > 0 {
				entries[i].URLEncoded = urlEncoded
			}
			if err := s.SaveHistory(entries); err != nil {
				return nil, err
			}
			return &entries[i], nil
		}
	}
	return nil, nil
}

// ==================== Documents ====================

func (s *Storage) docPath(id string) string { return filepath.Join(s.docsDir(), id+".json") }

func (s *Storage) LoadDocs() ([]models.DocEntry, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.loadDocsLocked()
}

func (s *Storage) AddDoc(doc models.DocEntry) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	if doc.Alias == "" {
		doc.Alias = generateAlias()
	}
	return writeJSON(s.docPath(doc.ID), doc)
}

func (s *Storage) GetDoc(id string) (*models.DocEntry, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return readSingleJSON[models.DocEntry](s.docPath(id))
}

func (s *Storage) GetDocByAlias(alias string) (*models.DocEntry, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	docs, _ := s.loadDocsLocked()
	for _, d := range docs {
		if d.Alias == alias {
			return &d, nil
		}
	}
	return nil, nil
}

func (s *Storage) loadDocsLocked() ([]models.DocEntry, error) {
	entries, err := os.ReadDir(s.docsDir())
	if err != nil {
		if os.IsNotExist(err) {
			return []models.DocEntry{}, nil
		}
		return nil, err
	}
	var docs []models.DocEntry
	for _, entry := range entries {
		if entry.IsDir() || !strings.HasSuffix(entry.Name(), ".json") {
			continue
		}
		data, err := os.ReadFile(filepath.Join(s.docsDir(), entry.Name()))
		if err != nil {
			continue
		}
		var doc models.DocEntry
		if err := json.Unmarshal(data, &doc); err != nil {
			continue
		}
		docs = append(docs, doc)
	}
	if docs == nil {
		docs = []models.DocEntry{}
	}
	sort.Slice(docs, func(i, j int) bool { return docs[i].CreatedAt.After(docs[j].CreatedAt) })
	return docs, nil
}

func generateAlias() string {
	b := make([]byte, 8)
	rand.Read(b)
	return hex.EncodeToString(b)
}

func (s *Storage) UpdateDoc(id, title string) (*models.DocEntry, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	doc, err := readSingleJSON[models.DocEntry](s.docPath(id))
	if err != nil || doc == nil {
		return nil, err
	}
	doc.Title = title
	doc.UpdatedAt = time.Now()
	if err := writeJSON(s.docPath(id), *doc); err != nil {
		return nil, err
	}
	return doc, nil
}

func (s *Storage) DeleteDoc(id string) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	return os.Remove(s.docPath(id))
}

func (s *Storage) DeleteDocs(ids []string) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	for _, id := range ids {
		os.Remove(s.docPath(id))
	}
	return nil
}

// ==================== Helpers ====================

func readJSON[T any](path string) ([]T, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		if os.IsNotExist(err) {
			return []T{}, nil
		}
		return nil, err
	}
	var result []T
	if len(data) > 0 {
		if err := json.Unmarshal(data, &result); err != nil {
			return nil, err
		}
	}
	if result == nil {
		result = []T{}
	}
	return result, nil
}

func readSingleJSON[T any](path string) (*T, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		if os.IsNotExist(err) {
			return nil, nil
		}
		return nil, err
	}
	var result T
	if err := json.Unmarshal(data, &result); err != nil {
		return nil, err
	}
	return &result, nil
}

func writeJSON[T any](path string, data T) error {
	if err := os.MkdirAll(filepath.Dir(path), 0755); err != nil {
		return err
	}
	b, err := json.MarshalIndent(data, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(path, b, 0644)
}
