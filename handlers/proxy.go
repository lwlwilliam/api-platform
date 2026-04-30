package handlers

import (
	"bytes"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"mime/multipart"
	"net/http"
	"net/url"
	"strings"
	"time"

	"api-platform/models"
	"api-platform/storage"
)

type ProxyHandler struct {
	storage *storage.Storage
}

func NewProxyHandler(s *storage.Storage) *ProxyHandler {
	return &ProxyHandler{storage: s}
}

func (h *ProxyHandler) Handle(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var req models.ProxyRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid request body: "+err.Error(), http.StatusBadRequest)
		return
	}
	if req.URL == "" {
		http.Error(w, "URL is required", http.StatusBadRequest)
		return
	}
	if req.Method == "" {
		req.Method = "GET"
	}

	cfg, _ := h.storage.LoadConfig()
	timeout := 60 * time.Second
	if cfg != nil && cfg.Timeout > 0 {
		timeout = time.Duration(cfg.Timeout) * time.Second
	}

	start := time.Now()

	var bodyReader io.Reader
	contentType := ""

	switch req.BodyType {
	case "form-data":
		buf := &bytes.Buffer{}
		writer := multipart.NewWriter(buf)
		for _, f := range req.FormFields {
			if f.IsFile {
				data, err := base64.StdEncoding.DecodeString(f.Content)
				if err != nil {
					http.Error(w, "Invalid file content: "+err.Error(), http.StatusBadRequest)
					return
				}
				part, err := writer.CreateFormFile(f.Key, f.FileName)
				if err != nil {
					http.Error(w, err.Error(), http.StatusInternalServerError)
					return
				}
				part.Write(data)
			} else {
				writer.WriteField(f.Key, f.Value)
			}
		}
		writer.Close()
		bodyReader = buf
		contentType = writer.FormDataContentType()

	case "url-form-encoded":
		var pairs []string
		for _, f := range req.URLEncoded {
			if f.Key != "" {
				pairs = append(pairs, f.Key+"="+f.Value)
			}
		}
		bodyReader = strings.NewReader(strings.Join(pairs, "&"))
		contentType = "application/x-www-form-urlencoded"

	default:
		if req.Body != "" {
			bodyReader = strings.NewReader(req.Body)
		}
	}

	proxyReq, err := http.NewRequest(req.Method, req.URL, bodyReader)
	if err != nil {
		http.Error(w, "Failed to create request: "+err.Error(), http.StatusBadRequest)
		return
	}
	for k, v := range req.Headers {
		if k != "" && v != "" {
			proxyReq.Header.Set(k, v)
		}
	}
	if contentType != "" && proxyReq.Header.Get("Content-Type") == "" {
		proxyReq.Header.Set("Content-Type", contentType)
	}

	client := &http.Client{
		Timeout: timeout,
		CheckRedirect: func(r *http.Request, via []*http.Request) error {
			if len(via) >= 10 {
				return fmt.Errorf("too many redirects")
			}
			return nil
		},
	}

	resp, err := client.Do(proxyReq)
	if err != nil {
		result := models.ProxyResponse{
			StatusCode: 0,
			StatusText: "Error: " + err.Error(),
			Headers:    map[string]string{},
			Body:       err.Error(),
			Duration:   time.Since(start).Milliseconds(),
			RawRequest: buildRawRequestStr(req),
		}
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(result)
		return
	}
	defer resp.Body.Close()

	body, _ := io.ReadAll(io.LimitReader(resp.Body, 10*1024*1024))
	duration := time.Since(start).Milliseconds()

	respHeaders := make(map[string]string)
	for k := range resp.Header {
		respHeaders[k] = resp.Header.Get(k)
	}

	result := models.ProxyResponse{
		StatusCode: resp.StatusCode,
		StatusText: resp.Status,
		Headers:    respHeaders,
		Body:       string(body),
		Duration:   duration,
		RawRequest: buildRawRequestStr(req),
		RawResponse: buildRawResponseStr(resp, string(body)),
	}

	entry := models.HistoryEntry{
		ID:          fmt.Sprintf("%d", time.Now().UnixNano()),
		Method:      req.Method,
		URL:         req.URL,
		Headers:     req.Headers,
		BodyType:    req.BodyType,
		Body:        req.Body,
		FormFields:  req.FormFields,
		URLEncoded:  req.URLEncoded,
		RequestAt:   time.Now(),
		StatusCode:  resp.StatusCode,
		Response:    string(body),
		RespHeaders: respHeaders,
		Duration:    duration,
		Note:        req.Note,
		RawRequest:  buildRawRequestStr(req),
		RawResponse: buildRawResponseStr(resp, string(body)),
	}
	h.storage.AddHistory(entry)

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(result)
}

func buildRawRequestStr(req models.ProxyRequest) string {
	u, err := url.Parse(req.URL)
	path := "/"
	host := ""
	if err == nil {
		host = u.Host
		path = u.Path
		if u.RawQuery != "" {
			path += "?" + u.RawQuery
		}
		if path == "" {
			path = "/"
		}
	}

	var sb strings.Builder
	sb.WriteString(req.Method + " " + path + " HTTP/1.1\n")
	if host != "" {
		sb.WriteString("Host: " + host + "\n")
	}
	for k, v := range req.Headers {
		if k != "" && !strings.EqualFold(k, "Host") {
			sb.WriteString(k + ": " + v + "\n")
		}
	}
	sb.WriteString("\n")

	if req.BodyType == "raw" && req.Body != "" {
		sb.WriteString(req.Body)
	} else if req.BodyType == "url-form-encoded" {
		parts := []string{}
		for _, f := range req.URLEncoded {
			if f.Key != "" {
				parts = append(parts, url.QueryEscape(f.Key)+"="+url.QueryEscape(f.Value))
			}
		}
		sb.WriteString(strings.Join(parts, "&"))
	} else if req.BodyType == "form-data" {
		sb.WriteString("[multipart/form-data]\n")
		for _, f := range req.FormFields {
			if f.Key != "" {
				if f.IsFile {
					sb.WriteString(f.Key + ": [file] " + f.FileName + "\n")
				} else {
					sb.WriteString(f.Key + ": " + f.Value + "\n")
				}
			}
		}
	}
	return sb.String()
}

func buildRawResponseStr(resp *http.Response, body string) string {
	var sb strings.Builder
	sb.WriteString(resp.Proto + " " + resp.Status + "\n")
	for k, vs := range resp.Header {
		for _, v := range vs {
			sb.WriteString(k + ": " + v + "\n")
		}
	}
	sb.WriteString("\n")
	sb.WriteString(body)
	return sb.String()
}
