package handlers

import (
	"encoding/json"
	"net/http"
	"strings"

	"api-platform/models"
	"api-platform/storage"
)

type HistoryHandler struct {
	storage *storage.Storage
}

func NewHistoryHandler(s *storage.Storage) *HistoryHandler {
	return &HistoryHandler{storage: s}
}

func (h *HistoryHandler) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")

	path := strings.TrimPrefix(r.URL.Path, "/api/history")
	path = strings.TrimPrefix(path, "/")

	switch r.Method {
	case http.MethodGet:
		h.list(w, r)
	case http.MethodDelete:
		if path == "" {
			h.clear(w, r)
		} else {
			h.delete(path, w)
		}
	case http.MethodPut:
		if path != "" {
			h.updateNote(path, w, r)
		} else {
			http.Error(w, `{"error":"method not allowed"}`, http.StatusMethodNotAllowed)
		}
	default:
		http.Error(w, `{"error":"method not allowed"}`, http.StatusMethodNotAllowed)
	}
}

func (h *HistoryHandler) list(w http.ResponseWriter, _ *http.Request) {
	entries, err := h.storage.LoadHistory()
	if err != nil {
		http.Error(w, `{"error":"`+err.Error()+`"}`, http.StatusInternalServerError)
		return
	}
	json.NewEncoder(w).Encode(entries)
}

func (h *HistoryHandler) delete(id string, w http.ResponseWriter) {
	if err := h.storage.DeleteHistory(id); err != nil {
		http.Error(w, `{"error":"`+err.Error()+`"}`, http.StatusInternalServerError)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (h *HistoryHandler) clear(w http.ResponseWriter, _ *http.Request) {
	if err := h.storage.ClearHistory(); err != nil {
		http.Error(w, `{"error":"`+err.Error()+`"}`, http.StatusInternalServerError)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (h *HistoryHandler) updateNote(id string, w http.ResponseWriter, r *http.Request) {
	var req struct {
		Note       string             `json:"note"`
		FormFields []models.FormField `json:"formFields,omitempty"`
		URLEncoded []models.KV        `json:"urlEncoded,omitempty"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, `{"error":"invalid request"}`, http.StatusBadRequest)
		return
	}
	entry, err := h.storage.UpdateHistoryEntry(id, req.Note, req.FormFields, req.URLEncoded)
	if err != nil {
		http.Error(w, `{"error":"`+err.Error()+`"}`, http.StatusInternalServerError)
		return
	}
	if entry == nil {
		http.Error(w, `{"error":"not found"}`, http.StatusNotFound)
		return
	}
	json.NewEncoder(w).Encode(entry)
}
