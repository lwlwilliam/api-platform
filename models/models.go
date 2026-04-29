package models

import "time"

type HistoryEntry struct {
	ID          string            `json:"id"`
	Method      string            `json:"method"`
	URL         string            `json:"url"`
	Headers     map[string]string `json:"headers"`
	BodyType    string            `json:"bodyType"`
	Body        string            `json:"body,omitempty"`
	FormFields  []FormField       `json:"formFields,omitempty"`
	URLEncoded  []KV              `json:"urlEncoded,omitempty"`
	RequestAt   time.Time         `json:"requestAt"`
	StatusCode  int               `json:"statusCode"`
	Response    string            `json:"response"`
	RespHeaders map[string]string `json:"respHeaders"`
	Duration    int64             `json:"duration"`
	Note        string            `json:"note,omitempty"`
	RawRequest  string            `json:"rawRequest,omitempty"`
	RawResponse string            `json:"rawResponse,omitempty"`
}

type FormField struct {
	Key         string `json:"key"`
	Value       string `json:"value"`
	IsFile      bool   `json:"isFile"`
	FileName    string `json:"fileName,omitempty"`
	Content     string `json:"content,omitempty"`
	Description string `json:"description,omitempty"`
}

type KV struct {
	Key         string `json:"key"`
	Value       string `json:"value"`
	Description string `json:"description,omitempty"`
}

type ProxyRequest struct {
	Method     string            `json:"method"`
	URL        string            `json:"url"`
	Headers    map[string]string `json:"headers"`
	BodyType   string            `json:"bodyType"`
	Body       string            `json:"body,omitempty"`
	FormFields []FormField       `json:"formFields,omitempty"`
	URLEncoded []KV              `json:"urlEncoded,omitempty"`
	Note       string            `json:"note,omitempty"`
}

type ProxyResponse struct {
	StatusCode int               `json:"statusCode"`
	StatusText string            `json:"statusText"`
	Headers    map[string]string `json:"headers"`
	Body       string            `json:"body"`
	Duration   int64             `json:"duration"`
	RawRequest string            `json:"rawRequest,omitempty"`
	RawResponse string           `json:"rawResponse,omitempty"`
}

type DocEntry struct {
	ID         string    `json:"id"`
	Alias      string    `json:"alias"`
	Title      string    `json:"title"`
	Content    string    `json:"content"`
	HistoryIDs []string  `json:"historyIds"`
	CreatedAt  time.Time `json:"createdAt"`
	UpdatedAt  time.Time `json:"updatedAt"`
}

type Config struct {
	Timeout int `json:"timeout"` // seconds, default 60
}
