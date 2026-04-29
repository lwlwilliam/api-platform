# API Platform

A self-contained, single-binary API management platform built with Go (stdlib only). Similar to Postman, but runs entirely locally — persists history and documents to files, generates interactive API documentation, and offers a standalone read-only shareable doc viewer.

## Quick Start

```bash
go build -o api-platform . && ./api-platform
# → http://localhost:8080
```

Custom port: `./api-platform -port=3000`  
Dev mode (edit frontend live): `./api-platform -dev`

---

## Features

### Request Builder
- All HTTP methods: GET / POST / PUT / PATCH / DELETE / HEAD / OPTIONS
- Body types: **raw** (JSON / XML / Text / HTML), **form-data** (with file upload), **x-www-form-urlencoded**
- Arbitrary headers via key-value editor
- **Request note** — add a note/comment to each request (shown in history and generated docs)
- **Form field descriptions** — add annotations to body fields (rendered in documentation tables)
- `Ctrl+Enter` / `Cmd+Enter` to send

### Response Viewer
- **Body** — auto-detects JSON/XML/HTML with syntax highlighting
- **Headers** — full response header dump
- **Request** — raw HTTP request that was sent (method line + all headers + body)
- **Pretty / Raw toggle** — switch between formatted (indented JSON) and raw original bytes
- Response areas clear on each new request (no stale data)

### History
- Every request auto-saved: URL, method, headers, body, response, status, duration, note
- Click any entry to reload it into the request builder
- Checkboxes with **Select All / None** for batch document generation
- Search by URL or method
- Max 1000 entries (oldest evicted)
- **Clearing history does NOT affect saved documents**

### Documents
- Generate Markdown API docs from selected history entries
- Each endpoint rendered as a styled card with method badge and status
- **Load & Send** button on each endpoint — reloads the original request into the builder
- **Edit Title** inline
- **Copy Link** — copies internal `/#/docs/{id}` for the main app
- Batch select with **Select All / None** and **Delete**
- **Independent from history** — deleting history entries does not affect existing documents

### Share Page (`/share/{id}`)
- Standalone **read-only** page
- Clean layout with method badges, status colors, and syntax highlighting
- No editing, no interactive Load & Send buttons
- Light/dark theme toggle
- Share the URL directly — recipient sees documentation only

### Light / Dark Theme
- Toggle via ☀️/🌙 button in the header
- **Defaults to light theme**
- Preference saved to `localStorage`
- Applies to both main app and share page

### Configurable Timeout
- Request timeout configurable via the sidebar (seconds, 1–300)
- Saved to `api-platform-data/config.json`
- Default: 60 seconds

---

## Architecture

```
api-platform/
├── main.go                 # Entry point, embedded files, routes
├── handlers/
│   ├── proxy.go            # HTTP proxy (reads config timeout, saves history+notes)
│   ├── history.go          # History CRUD + note update
│   └── docs.go             # Doc generation with descriptions, better truncation
├── models/models.go         # HistoryEntry, DocEntry, FormField (with Description), Config
├── storage/storage.go       # JSON file persistence (history.json, docs/{id}.json, config.json)
└── web/                     # Static frontend (embedded into binary)
    ├── index.html           # Main SPA
    ├── share.html           # Standalone read-only doc viewer
    ├── style.css            # Dark + light theme styles
    └── app.js               # All frontend logic
```

### Request flow
```
Browser → /api/proxy (JSON) → Go HTTP client → target API → Response → Browser
                                                    ↓
                                           /api/history (stored)
```

---

## Data Storage

All data lives in `api-platform-data/` (created automatically in working directory).

| Path | Format | Purpose |
|------|--------|---------|
| `api-platform-data/history.json` | Single JSON array | Request history (max 1000) |
| `api-platform-data/docs/{id}.json` | One file per document | Saved API docs (permanent) |
| `api-platform-data/config.json` | Single JSON object | Settings (timeout) |

### Data independence
- History in `history.json` — clearing it has **zero impact** on saved documents
- Documents in `docs/{id}.json` — each contains full generated Markdown, no runtime dependency on history
- Even if you delete ALL history, previously saved documents remain intact and viewable

---

## API Routes

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/proxy` | Execute a proxied request |
| GET | `/api/history` | List all history entries |
| DELETE | `/api/history` | Clear all history |
| DELETE | `/api/history/{id}` | Delete single entry |
| PUT | `/api/history/{id}` | Update entry note |
| POST | `/api/docs/generate` | Generate Markdown from history IDs |
| POST | `/api/docs/save` | Save a new document |
| GET | `/api/docs/list` | List all saved documents |
| GET | `/api/docs/{id}` | Get a single document |
| PUT | `/api/docs/{id}` | Update document title |
| DELETE | `/api/docs/{id}` | Delete a document |
| POST | `/api/docs/batch-delete` | Batch delete documents |
| GET | `/api/config` | Get config |
| PUT | `/api/config` | Update config |
| GET | `/share/{id}` | Read-only doc viewer |

## Client Libraries

- **highlight.js** (CDN) — syntax highlighting
- **marked.js** (CDN) — Markdown rendering

Core functionality works without CDN access.

## Tech Stack

- **Backend**: Go stdlib only (`net/http`, `embed`, `encoding/json`, `mime/multipart`)
- **Frontend**: Vanilla JS, no framework or build step
- **Storage**: Local JSON files

## License

MIT
