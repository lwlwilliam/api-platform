package handlers

import (
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
	"time"

	"api-platform/models"
	"api-platform/storage"
)

type DocsHandler struct {
	storage *storage.Storage
}

func NewDocsHandler(s *storage.Storage) *DocsHandler {
	return &DocsHandler{storage: s}
}

func (h *DocsHandler) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	path := strings.TrimPrefix(r.URL.Path, "/api/docs")
	path = strings.TrimPrefix(path, "/")

	switch {
	case path == "generate" && r.Method == http.MethodPost:
		h.generate(w, r)
	case path == "save" && r.Method == http.MethodPost:
		h.save(w, r)
	case path == "list" && r.Method == http.MethodGet:
		h.list(w, r)
	case path == "batch-delete" && r.Method == http.MethodPost:
		h.batchDelete(w, r)
	case path != "" && !strings.Contains(path, "/"):
		switch r.Method {
		case http.MethodGet:
			h.getDoc(path, w)
		case http.MethodPut:
			h.update(path, w, r)
		case http.MethodDelete:
			h.delete(path, w)
		default:
			http.Error(w, `{"error":"method not allowed"}`, http.StatusMethodNotAllowed)
		}
	default:
		http.Error(w, `{"error":"not found"}`, http.StatusNotFound)
	}
}

func (h *DocsHandler) generate(w http.ResponseWriter, r *http.Request) {
	var req struct{ IDs []string `json:"ids"` }
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, `{"error":"invalid request"}`, http.StatusBadRequest)
		return
	}
	entries, err := h.storage.LoadHistory()
	if err != nil {
		http.Error(w, `{"error":"`+err.Error()+`"}`, http.StatusInternalServerError)
		return
	}
	idSet := make(map[string]bool)
	for _, id := range req.IDs {
		idSet[id] = true
	}
	var selected []models.HistoryEntry
	for _, e := range entries {
		if idSet[e.ID] {
			selected = append(selected, e)
		}
	}
	if len(selected) == 0 {
		http.Error(w, `{"error":"no matching"}`, http.StatusBadRequest)
		return
	}
	md := buildMarkdown(selected)
	w.Header().Set("Content-Type", "text/markdown; charset=utf-8")
	w.Write([]byte(md))
}

func (h *DocsHandler) save(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Title      string   `json:"title"`
		HistoryIDs []string `json:"historyIds"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, `{"error":"invalid request"}`, http.StatusBadRequest)
		return
	}
	if req.Title == "" {
		req.Title = "Untitled"
	}
	if len(req.HistoryIDs) == 0 {
		http.Error(w, `{"error":"no history IDs"}`, http.StatusBadRequest)
		return
	}
	entries, err := h.storage.LoadHistory()
	if err != nil {
		http.Error(w, `{"error":"`+err.Error()+`"}`, http.StatusInternalServerError)
		return
	}
	idSet := make(map[string]bool)
	for _, id := range req.HistoryIDs {
		idSet[id] = true
	}
	var selected []models.HistoryEntry
	for _, e := range entries {
		if idSet[e.ID] {
			selected = append(selected, e)
		}
	}
	if len(selected) == 0 {
		http.Error(w, `{"error":"no matching"}`, http.StatusBadRequest)
		return
	}
	now := time.Now()
	alias := generateAlias()
	doc := models.DocEntry{
		ID:         fmt.Sprintf("%d", now.UnixNano()),
		Alias:      alias,
		Title:      req.Title,
		Content:    buildMarkdown(selected),
		HistoryIDs: req.HistoryIDs,
		CreatedAt:  now,
		UpdatedAt:  now,
	}
	if err := h.storage.AddDoc(doc); err != nil {
		http.Error(w, `{"error":"`+err.Error()+`"}`, http.StatusInternalServerError)
		return
	}
	json.NewEncoder(w).Encode(doc)
}

func (h *DocsHandler) list(w http.ResponseWriter, _ *http.Request) {
	docs, err := h.storage.LoadDocs()
	if err != nil {
		http.Error(w, `{"error":"`+err.Error()+`"}`, http.StatusInternalServerError)
		return
	}
	json.NewEncoder(w).Encode(docs)
}

func (h *DocsHandler) getDoc(id string, w http.ResponseWriter) {
	doc, err := h.storage.GetDoc(id)
	if err != nil || doc == nil {
		http.Error(w, `{"error":"not found"}`, http.StatusNotFound)
		return
	}
	json.NewEncoder(w).Encode(doc)
}

func (h *DocsHandler) update(id string, w http.ResponseWriter, r *http.Request) {
	var req struct{ Title string `json:"title"` }
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.Title == "" {
		http.Error(w, `{"error":"title required"}`, http.StatusBadRequest)
		return
	}
	doc, err := h.storage.UpdateDoc(id, req.Title)
	if err != nil || doc == nil {
		http.Error(w, `{"error":"not found"}`, http.StatusNotFound)
		return
	}
	json.NewEncoder(w).Encode(doc)
}

func (h *DocsHandler) delete(id string, w http.ResponseWriter) {
	h.storage.DeleteDoc(id)
	w.WriteHeader(http.StatusNoContent)
}

func (h *DocsHandler) batchDelete(w http.ResponseWriter, r *http.Request) {
	var req struct{ IDs []string `json:"ids"` }
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || len(req.IDs) == 0 {
		http.Error(w, `{"error":"invalid request"}`, http.StatusBadRequest)
		return
	}
	h.storage.DeleteDocs(req.IDs)
	w.WriteHeader(http.StatusNoContent)
}

func buildMarkdown(entries []models.HistoryEntry) string {
	var md strings.Builder

	for i, e := range entries {
		md.WriteString(fmt.Sprintf("## %d. %s %s\n\n", i+1, e.Method, e.URL))

		// Metadata as blockquote
		meta := fmt.Sprintf("> 状态 %d", e.StatusCode)
		if e.Duration > 0 {
			meta += fmt.Sprintf(" · %dms", e.Duration)
		}
		if e.Note != "" {
			meta += fmt.Sprintf(" · %s", e.Note)
		}
		md.WriteString(meta + "\n\n")

		md.WriteString(fmt.Sprintf("<!--history-id:%s-->\n\n", e.ID))

		if len(e.Headers) > 0 {
			md.WriteString("### 请求头\n\n| Key | Value |\n|-----|-------|\n")
			for k, v := range e.Headers {
				if v == "" {
					v = "-"
				}
				md.WriteString(fmt.Sprintf("| %s | %s |\n", k, v))
			}
			md.WriteString("\n")
		}

		md.WriteString("### 请求体\n\n**类型**: " + e.BodyType + "\n\n")
		switch e.BodyType {
		case "form-data":
			if len(e.FormFields) > 0 {
				md.WriteString("| Key | Value | Type | Description |\n|-----|-------|------|-------------|\n")
				for _, f := range e.FormFields {
					ftype := "text"
					if f.IsFile {
						ftype = "file"
					}
					val := f.Value
					if f.FileName != "" {
						val = f.FileName
					}
					if val == "" {
						val = "-"
					}
					desc := f.Description
					if desc == "" {
						desc = "-"
					}
					md.WriteString(fmt.Sprintf("| %s | %s | %s | %s |\n", f.Key, val, ftype, desc))
				}
				md.WriteString("\n")
			}
		case "url-form-encoded":
			if len(e.URLEncoded) > 0 {
				md.WriteString("| Key | Value | Description |\n|-----|-------|-------------|\n")
				for _, kv := range e.URLEncoded {
					val := kv.Value
					if val == "" {
						val = "-"
					}
					desc := kv.Description
					if desc == "" {
						desc = "-"
					}
					md.WriteString(fmt.Sprintf("| %s | %s | %s |\n", kv.Key, val, desc))
				}
				md.WriteString("\n")
			}
		default:
			if e.Body != "" {
				md.WriteString("```\n" + e.Body + "\n```\n\n")
			}
		}

		if e.Response != "" {
			respPreview := e.Response
			if len(respPreview) > 5000 {
				if idx := strings.LastIndex(respPreview[:5000], "\n"); idx > 4000 {
					respPreview = respPreview[:idx]
				} else {
					respPreview = respPreview[:5000]
				}
				respPreview += "\n\n... (响应过长已截断)"
			}
			md.WriteString("### 响应示例\n\n```json\n" + respPreview + "\n```\n\n")
		}
		md.WriteString("---\n\n")
	}
	return md.String()
}

func generateAlias() string {
	b := make([]byte, 8)
	rand.Read(b)
	return hex.EncodeToString(b)
}
