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
	case path == "batch-share" && r.Method == http.MethodPost:
		h.batchShare(w, r)
	case path == "batch-unshare" && r.Method == http.MethodPost:
		h.batchUnshare(w, r)
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
	case strings.HasSuffix(path, "/regenerate") && r.Method == http.MethodPost:
		id := strings.TrimSuffix(path, "/regenerate")
		h.regenerate(id, w, r)
	case strings.HasSuffix(path, "/append") && r.Method == http.MethodPost:
		id := strings.TrimSuffix(path, "/append")
		h.appendContent(id, w, r)
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
		Shared:     false,
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
	var req struct {
		Title   string `json:"title"`
		Content string `json:"content,omitempty"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, `{"error":"invalid request"}`, http.StatusBadRequest)
		return
	}
	if req.Title == "" && req.Content == "" {
		http.Error(w, `{"error":"title or content required"}`, http.StatusBadRequest)
		return
	}
	doc, err := h.storage.UpdateDoc(id, req.Title, req.Content)
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

func (h *DocsHandler) regenerate(id string, w http.ResponseWriter, r *http.Request) {
	doc, err := h.storage.GetDoc(id)
	if err != nil || doc == nil {
		http.Error(w, `{"error":"not found"}`, http.StatusNotFound)
		return
	}
	entries, err := h.storage.LoadHistory()
	if err != nil {
		http.Error(w, `{"error":"`+err.Error()+`"}`, http.StatusInternalServerError)
		return
	}
	idSet := make(map[string]bool)
	for _, hid := range doc.HistoryIDs {
		idSet[hid] = true
	}
	var selected []models.HistoryEntry
	for _, e := range entries {
		if idSet[e.ID] {
			selected = append(selected, e)
		}
	}
	doc.Content = buildMarkdown(selected)
	doc.UpdatedAt = time.Now()
	h.storage.UpdateDocContent(id, doc.Content)
	json.NewEncoder(w).Encode(doc)
}

func (h *DocsHandler) appendContent(id string, w http.ResponseWriter, r *http.Request) {
	var req struct{ HistoryIDs []string `json:"historyIds"` }
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, `{"error":"invalid request"}`, http.StatusBadRequest)
		return
	}
	doc, err := h.storage.GetDoc(id)
	if err != nil || doc == nil {
		http.Error(w, `{"error":"not found"}`, http.StatusNotFound)
		return
	}
	entries, err := h.storage.LoadHistory()
	if err != nil {
		http.Error(w, `{"error":"`+err.Error()+`"}`, http.StatusInternalServerError)
		return
	}
	idSet := make(map[string]bool)
	for _, hid := range req.HistoryIDs {
		idSet[hid] = true
	}
	var selected []models.HistoryEntry
	for _, e := range entries {
		if idSet[e.ID] {
			selected = append(selected, e)
		}
	}
	if len(selected) == 0 {
		http.Error(w, `{"error":"no matching history entries"}`, http.StatusBadRequest)
		return
	}
	newMd := buildMarkdown(selected)
	if doc.Content != "" {
		doc.Content += newMd
	} else {
		doc.Content = newMd
	}
	existingSet := make(map[string]bool)
	for _, hid := range doc.HistoryIDs {
		existingSet[hid] = true
	}
	for _, hid := range req.HistoryIDs {
		if !existingSet[hid] {
			doc.HistoryIDs = append(doc.HistoryIDs, hid)
		}
	}
	doc.UpdatedAt = time.Now()
	h.storage.AddDoc(*doc)
	json.NewEncoder(w).Encode(doc)
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

func (h *DocsHandler) batchShare(w http.ResponseWriter, r *http.Request) {
	var req struct{ IDs []string `json:"ids"` }
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || len(req.IDs) == 0 {
		http.Error(w, `{"error":"invalid request"}`, http.StatusBadRequest)
		return
	}
	for _, id := range req.IDs {
		doc, _ := h.storage.GetDoc(id)
		if doc == nil {
			continue
		}
		doc.Shared = true
		if doc.Alias == "" {
			doc.Alias = generateAlias()
		}
		doc.UpdatedAt = time.Now()
		h.storage.AddDoc(*doc)
	}
	w.WriteHeader(http.StatusNoContent)
}

func (h *DocsHandler) batchUnshare(w http.ResponseWriter, r *http.Request) {
	var req struct{ IDs []string `json:"ids"` }
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || len(req.IDs) == 0 {
		http.Error(w, `{"error":"invalid request"}`, http.StatusBadRequest)
		return
	}
	h.storage.SetDocsShared(req.IDs, false)
	w.WriteHeader(http.StatusNoContent)
}

func buildMarkdown(entries []models.HistoryEntry) string {
	var md strings.Builder

	for i, e := range entries {
		title := e.URL
		if e.Note != "" {
			title = e.URL + " - " + e.Note
		}
		md.WriteString(fmt.Sprintf("## %d. %s %s\n\n", i+1, e.Method, title))

		// Metadata as blockquote
		meta := fmt.Sprintf("> Status %d", e.StatusCode)
		if e.Duration > 0 {
			meta += fmt.Sprintf(" · %dms", e.Duration)
		}
		md.WriteString(meta + "\n\n")

		md.WriteString(fmt.Sprintf("<!--history-id:%s-->\n\n", e.ID))

		if len(e.Headers) > 0 {
			md.WriteString("### Request Headers\n\n| Key | Value |\n|-----|-------|\n")
			for k, v := range e.Headers {
				if v == "" {
					v = "-"
				}
				md.WriteString(fmt.Sprintf("| %s | %s |\n", k, v))
			}
			md.WriteString("\n")
		}

		md.WriteString("### Request Body\n\n**Type**: " + e.BodyType + "\n\n")
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
					md.WriteString(fmt.Sprintf("| %s | %s | %s | %s |\n", f.Key, val, ftype, f.Description))
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
					md.WriteString(fmt.Sprintf("| %s | %s | %s |\n", kv.Key, val, kv.Description))
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
				respPreview += "\n\n... (response truncated)"
			}
			md.WriteString("### Response Example\n\n```json\n" + respPreview + "\n```\n\n")
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
