(function() {
  'use strict';

  // ==================== State ====================
  const state = {
    method: 'GET', url: '',
    headers: [{ key: '', value: '' }],
    bodyType: 'raw', rawContentType: 'application/json', rawBody: '',
    formFields: [{ key: '', value: '', isFile: false, fileName: '', content: '', description: '' }],
    urlEncoded: [{ key: '', value: '', description: '' }],
    response: null, activeRespTab: 'body',
    selectedHistoryIds: new Set(), selectedDocIds: new Set(),
    sidebarTab: 'history', viewingDocId: null, currentDocMd: '',
    theme: 'light', responseViewMode: 'pretty', savedDocId: null,
    configTimeout: 60, _confirmResolve: null,
  };

  // ==================== DOM Refs ====================
  const $ = (s) => document.getElementById(s);
  const els = {};

  function cacheDom() {
    const ids = [
      'method-select','url-input','btn-send','request-tabs','tab-headers','tab-body',
      'headers-editor','btn-add-header','body-raw','body-formdata','body-urlencoded',
      'raw-content-type','raw-body','formdata-editor','btn-add-formdata',
      'urlencoded-editor','btn-add-urlencoded','response-status','response-time','response-size',
      'response-body','response-headers-view','response-request-view','response-raw-view',
      'response-headers-content','response-request-content','response-raw-content',
      'history-list','history-search','btn-select-all','btn-deselect-all','btn-clear-history','btn-generate-docs',
      'panel-history','panel-docs','docs-list','btn-docs-select-all','btn-docs-deselect-all','btn-docs-batch-delete',
      'view-request','view-doc','doc-viewer-title','doc-viewer-content',
      'btn-back-editor','btn-copy-doc-link',
      'docs-modal','docs-save-title','docs-modal-content','btn-copy-docs','btn-download-docs','btn-save-docs',
      'btn-theme','toast','hljs-theme',
      'btn-view-pretty','btn-view-raw','share-info-box','share-url-text','btn-copy-share',
      'config-timeout', 'btn-save-config', 'btn-clear',
      'confirm-modal','confirm-title','confirm-message','confirm-cancel','confirm-ok',
    ];
    ids.forEach(function(id) { els[camel(id)] = $(id); });
    els.docsModalClose = els.docsModal.querySelector('.modal-close');
  }

  function camel(s) {
    return s.replace(/-([a-z])/g, function(_,c) { return c.toUpperCase(); });
  }

  // ==================== Init ====================
  function init() {
    cacheDom();
    loadTheme();
    loadConfig();
    bindEvents();
    loadHistory();
    loadDocs();
    window.addEventListener('hashchange', handleHash);
    handleHash();
  }

  // ==================== Theme ====================
  function loadTheme() { state.theme = localStorage.getItem('api-platform-theme') || 'light'; applyTheme(); }
  function applyTheme() {
    document.documentElement.setAttribute('data-theme', state.theme);
    els.btnTheme.textContent = state.theme === 'dark' ? '☀️' : '🌙';
    els.btnTheme.title = state.theme === 'dark' ? 'Switch to light' : 'Switch to dark';
    els.hljsTheme.href = state.theme === 'dark'
      ? 'https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.11.0/styles/atom-one-dark.min.css'
      : 'https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.11.0/styles/atom-one-light.min.css';
    if (state.viewingDocId && state._currentDocMd) { els.docViewerContent.innerHTML = renderDocContent(state._currentDocMd); rehighlight(); }
    if (!els.docsModal.classList.contains('hidden') && state.currentDocMd) { els.docsModalContent.innerHTML = marked.parse(state.currentDocMd); rehighlight(); }
    if (state.response) renderResponseBody(state.response);
  }
  function toggleTheme() { state.theme = state.theme === 'dark' ? 'light' : 'dark'; localStorage.setItem('api-platform-theme', state.theme); applyTheme(); }
  function rehighlight() { setTimeout(function() { document.querySelectorAll('pre code').forEach(function(el) { delete el.dataset.highlighted; if (typeof hljs !== 'undefined') hljs.highlightElement(el); }); }, 50); }

  // ==================== Config ====================
  async function loadConfig() {
    try {
      const r = await fetch('/api/config');
      const cfg = await r.json();
      state.configTimeout = cfg.timeout || 60;
      if (els.configTimeout) els.configTimeout.value = state.configTimeout;
    } catch(e) {}
  }
  async function saveConfig() {
    const t = parseInt(els.configTimeout.value) || 60;
    try {
      await fetch('/api/config', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ timeout: t }) });
      state.configTimeout = t;
      showToast('Timeout saved: ' + t + 's', 'success');
    } catch(e) { showToast('Failed to save config', 'error'); }
  }

  // ==================== Events ====================
  function bindEvents() {
    els.btnTheme.addEventListener('click', toggleTheme);
    els.methodSelect.addEventListener('change', function() { state.method = els.methodSelect.value; });
    els.urlInput.addEventListener('input', function() { state.url = els.urlInput.value; });
    els.btnSend.addEventListener('click', sendRequest);
    els.btnClear.addEventListener('click', clearAll);
    els.urlInput.addEventListener('keydown', function(e) { if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); sendRequest(); } });
    els.rawBody.addEventListener('keydown', function(e) { if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); sendRequest(); } });

    els.requestTabs.querySelectorAll('.tab').forEach(function(t) {
      t.addEventListener('click', function() {
        var n = t.dataset.tab;
        els.requestTabs.querySelectorAll('.tab').forEach(function(x) { x.classList.remove('active'); });
        t.classList.add('active');
        els.tabHeaders.classList.toggle('hidden', n !== 'headers');
        els.tabBody.classList.toggle('hidden', n !== 'body');
      });
    });

    document.querySelectorAll('.body-type-tab').forEach(function(t) {
      t.addEventListener('click', function() {
        state.bodyType = t.dataset.btype;
        document.querySelectorAll('.body-type-tab').forEach(function(x) { x.classList.remove('active'); });
        t.classList.add('active');
        els.bodyRaw.classList.toggle('hidden', state.bodyType !== 'raw');
        els.bodyFormdata.classList.toggle('hidden', state.bodyType !== 'form-data');
        els.bodyUrlencoded.classList.toggle('hidden', state.bodyType !== 'url-form-encoded');
      });
    });

    els.rawContentType.addEventListener('change', function() { state.rawContentType = els.rawContentType.value; });
    els.rawBody.addEventListener('input', function() { state.rawBody = els.rawBody.value; });
    els.btnAddHeader.addEventListener('click', function() { syncAllInputs(); state.headers.push({ key: '', value: '' }); renderHeaders(); });
    els.btnAddFormdata.addEventListener('click', function() { syncAllInputs(); state.formFields.push({ key: '', value: '', isFile: false, fileName: '', content: '', description: '' }); renderFormFields(); });
    els.btnAddUrlencoded.addEventListener('click', function() { syncAllInputs(); state.urlEncoded.push({ key: '', value: '', description: '' }); renderUrlEncoded(); });

    // Config save
    if (els.btnSaveConfig) els.btnSaveConfig.addEventListener('click', saveConfig);

    // Response tabs
    document.querySelectorAll('.resp-tab').forEach(function(t) {
      t.addEventListener('click', function() {
        state.activeRespTab = t.dataset.rtab;
        document.querySelectorAll('.resp-tab').forEach(function(x) { x.classList.remove('active'); });
        t.classList.add('active');
        updateResponseView();
      });
    });

    // View toggle
    els.btnViewPretty.addEventListener('click', function() {
      state.responseViewMode = 'pretty';
      els.btnViewPretty.classList.add('active'); els.btnViewRaw.classList.remove('active');
      if (state.response) renderResponseBody(state.response);
    });
    els.btnViewRaw.addEventListener('click', function() {
      state.responseViewMode = 'raw';
      els.btnViewRaw.classList.add('active'); els.btnViewPretty.classList.remove('active');
      if (state.response) renderResponseBody(state.response);
    });

    els.historySearch.addEventListener('input', function() { renderHistory(); });
    els.btnSelectAll.addEventListener('click', function() {
      (state._history || []).forEach(function(e) {
        if (!els.historySearch.value || e.url.toLowerCase().includes(els.historySearch.value.toLowerCase())) state.selectedHistoryIds.add(e.id);
      });
      renderHistory();
    });
    els.btnDeselectAll.addEventListener('click', function() { state.selectedHistoryIds.clear(); renderHistory(); });
    els.btnClearHistory.addEventListener('click', async function() {
      if (!(await confirmDialog('Clear History', 'Clear all history entries? This cannot be undone.', 'Clear'))) return;
      await fetch('/api/history', { method: 'DELETE' });
      state.selectedHistoryIds.clear();
      await loadHistory();
    });
    els.btnGenerateDocs.addEventListener('click', openDocsModal);

    els.docsModalClose.addEventListener('click', closeDocsModal);
    els.docsModal.addEventListener('click', function(e) { if (e.target === els.docsModal) closeDocsModal(); });
    els.btnCopyDocs.addEventListener('click', copyDocs);
    els.btnDownloadDocs.addEventListener('click', downloadDocs);
    els.btnSaveDocs.addEventListener('click', saveDocs);
    els.btnCopyShare.addEventListener('click', function() { if (state.savedDocId) copyShareLink(state.savedDocId); });

    els.btnBackEditor.addEventListener('click', closeDocViewer);
    els.btnCopyDocLink.addEventListener('click', function() { copyShareLink(state.viewingDocId); });

    // Doc title auto-save on blur/enter
    els.docViewerTitle.addEventListener('blur', autoSaveDocTitle);
    els.docViewerTitle.addEventListener('keydown', function(e) { if (e.key === 'Enter') { e.preventDefault(); els.docViewerTitle.blur(); } });

    els.btnDocsSelectAll.addEventListener('click', function() { (state._docs || []).forEach(function(d) { state.selectedDocIds.add(d.id); }); renderDocs(); });
    els.btnDocsDeselectAll.addEventListener('click', function() { state.selectedDocIds.clear(); renderDocs(); });
    els.btnDocsBatchDelete.addEventListener('click', batchDeleteDocs);

    document.querySelectorAll('.sidebar-tab').forEach(function(t) {
      t.addEventListener('click', function() {
        var s = t.dataset.stab;
        if (s === state.sidebarTab) return;
        state.sidebarTab = s;
        document.querySelectorAll('.sidebar-tab').forEach(function(x) { x.classList.toggle('active', x.dataset.stab === s); });
        els.panelHistory.classList.toggle('hidden', s !== 'history');
        els.panelDocs.classList.toggle('hidden', s !== 'docs');
        if (s === 'docs') loadDocs();
      });
    });

    // Config save
    if (els.btnSaveConfig) els.btnSaveConfig.addEventListener('click', saveConfig);

    // Confirm dialog
    els.confirmCancel.addEventListener('click', function() { els.confirmModal.classList.add('hidden'); if (state._confirmResolve) { state._confirmResolve(false); state._confirmResolve = null; } });
    els.confirmOk.addEventListener('click', function() { els.confirmModal.classList.add('hidden'); if (state._confirmResolve) { state._confirmResolve(true); state._confirmResolve = null; } });
    els.confirmModal.addEventListener('click', function(e) { if (e.target === els.confirmModal) { els.confirmModal.classList.add('hidden'); if (state._confirmResolve) { state._confirmResolve(false); state._confirmResolve = null; } } });
  }

  // ==================== Input Sync ====================
  function syncAllInputs() {
    els.headersEditor.querySelectorAll('.kv-row').forEach(function(row, i) {
      var k = row.querySelector('.kv-key'), v = row.querySelector('.kv-value');
      if (state.headers[i]) { if (k) state.headers[i].key = k.value; if (v) state.headers[i].value = v.value; }
    });
    els.formdataEditor.querySelectorAll('.kv-row').forEach(function(row, i) {
      var k = row.querySelector('.kv-key'), v = row.querySelector('.form-text-value'), d = row.querySelector('.form-desc');
      if (state.formFields[i]) {
        if (k) state.formFields[i].key = k.value;
        if (v && !state.formFields[i].isFile) state.formFields[i].value = v.value;
        if (d) state.formFields[i].description = d.value;
      }
    });
    els.urlencodedEditor.querySelectorAll('.kv-row').forEach(function(row, i) {
      var k = row.querySelector('.kv-key'), v = row.querySelector('.kv-value'), d = row.querySelector('.form-desc');
      if (state.urlEncoded[i]) { if (k) state.urlEncoded[i].key = k.value; if (v) state.urlEncoded[i].value = v.value; if (d) state.urlEncoded[i].description = d.value; }
    });
  }

  // ==================== Hash Routing ====================
  function handleHash() {
    var hash = window.location.hash;
    if (hash.startsWith('#/docs/')) { state.sidebarTab = 'docs'; switchSidebar('docs'); openDocById(hash.slice('#/docs/'.length)); }
    else if (hash.startsWith('#/share/')) { state.sidebarTab = 'docs'; switchSidebar('docs'); openDocById(hash.slice('#/share/'.length), true); }
    else if (hash === '#/docs') { state.sidebarTab = 'docs'; switchSidebar('docs'); loadDocs(); }
    else { state.sidebarTab = 'history'; switchSidebar('history'); }
  }
  function switchSidebar(s) {
    document.querySelectorAll('.sidebar-tab').forEach(function(t) { t.classList.toggle('active', t.dataset.stab === s); });
    els.panelHistory.classList.toggle('hidden', s !== 'history');
    els.panelDocs.classList.toggle('hidden', s !== 'docs');
  }

  // ==================== Send Request ====================
  async function sendRequest() {
    var url = els.urlInput.value.trim();
    if (!url) { showToast('Please enter a URL', 'error'); els.urlInput.focus(); return; }
    syncAllInputs();
    state.url = url; state.method = els.methodSelect.value;
    collectHeaders(); collectFormFields(); collectUrlEncoded();
    state.rawBody = els.rawBody.value; state.rawContentType = els.rawContentType.value;

    els.btnSend.disabled = true; els.btnSend.innerHTML = '<span class="spinner"></span> Sending...';
    els.responseStatus.textContent = ''; els.responseTime.textContent = ''; els.responseSize.textContent = '';
    els.responseBody.innerHTML = '<div class="response-placeholder"><span class="spinner"></span> Sending...</div>';
    els.responseHeadersContent.textContent = ''; els.responseRequestContent.textContent = '';

    try {
      var body = buildRequestBody();
      var resp = await fetch('/api/proxy', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      var data = await resp.json();
      state.response = data;
      renderResponse(data);
      await loadHistory();
    } catch(err) {
      state.response = { statusCode: 0, statusText: 'Error: ' + err.message, headers: {}, body: '', duration: 0, rawRequest: '' };
      renderResponse(state.response);
      showToast('Request failed: ' + err.message, 'error');
    } finally { els.btnSend.disabled = false; els.btnSend.textContent = 'Send'; }
  }

  function collectHeaders() {
    state.headers = [];
    els.headersEditor.querySelectorAll('.kv-row').forEach(function(row) {
      state.headers.push({ key: row.querySelector('.kv-key').value.trim(), value: row.querySelector('.kv-value').value.trim() });
    });
  }
  function collectFormFields() {
    state.formFields = [];
    els.formdataEditor.querySelectorAll('.kv-row').forEach(function(row) {
      var key = row.querySelector('.kv-key').value.trim();
      var ti = row.querySelector('.form-text-value');
      var fi = row.querySelector('.form-file-input');
      var di = row.querySelector('.form-desc');
      var isF = !fi.classList.contains('hidden');
      var idx = row.dataset.idx;
      var desc = di ? di.value : '';
      if (isF) {
        state.formFields.push({ key: key, value: '', isFile: true, fileName: fi.files && fi.files[0] ? fi.files[0].name : '', content: (state._formFileContents && state._formFileContents[idx]) || '', description: desc });
      } else {
        state.formFields.push({ key: key, value: ti ? ti.value : '', isFile: false, fileName: '', content: '', description: desc });
      }
    });
  }
  function collectUrlEncoded() {
    state.urlEncoded = [];
    els.urlencodedEditor.querySelectorAll('.kv-row').forEach(function(row) {
      var d = row.querySelector('.form-desc');
      state.urlEncoded.push({ key: row.querySelector('.kv-key').value.trim(), value: row.querySelector('.kv-value').value.trim(), description: d ? d.value : '' });
    });
  }

  function buildRequestBody() {
    var b = { method: state.method, url: state.url, headers: {}, bodyType: state.bodyType };
    state.headers.forEach(function(h) { if (h.key) b.headers[h.key] = h.value; });
    if (state.bodyType === 'raw') {
      if (state.rawBody) { b.headers['Content-Type'] = state.rawContentType; b.body = state.rawBody; }
    } else if (state.bodyType === 'form-data') {
      b.formFields = state.formFields.filter(function(f) { return f.key; });
    } else if (state.bodyType === 'url-form-encoded') {
      b.urlEncoded = state.urlEncoded.filter(function(f) { return f.key; });
    }
    return b;
  }

  function clearAll() {
    els.methodSelect.value = 'GET'; state.method = 'GET';
    els.urlInput.value = ''; state.url = '';
    state.headers = [{ key: '', value: '' }]; renderHeaders();
    state.bodyType = 'raw'; state.rawBody = ''; state.rawContentType = 'application/json';
    els.rawBody.value = '';
    document.querySelectorAll('.body-type-tab').forEach(function(t) { t.classList.toggle('active', t.dataset.btype === 'raw'); });
    els.bodyRaw.classList.remove('hidden'); els.bodyFormdata.classList.add('hidden'); els.bodyUrlencoded.classList.add('hidden');
    state.formFields = [{ key: '', value: '', isFile: false, fileName: '', content: '', description: '' }]; renderFormFields();
    state.urlEncoded = [{ key: '', value: '', description: '' }]; renderUrlEncoded();
    els.requestTabs.querySelectorAll('.tab').forEach(function(t) { t.classList.remove('active'); });
    var ht = els.requestTabs.querySelector('[data-tab="headers"]');
    if (ht) ht.classList.add('active');
    els.tabHeaders.classList.remove('hidden'); els.tabBody.classList.add('hidden');
    els.responseStatus.textContent = ''; els.responseTime.textContent = ''; els.responseSize.textContent = '';
    els.responseBody.innerHTML = '<div class="response-placeholder">Send a request to see the response here.</div>';
    els.responseHeadersContent.textContent = ''; els.responseRequestContent.textContent = '';
    state.response = null;
  }

  // ==================== Response ====================
  function renderResponse(resp) {
    var sc = resp.statusCode || 0, cls = 'info';
    if (sc >= 200 && sc < 300) cls = 'success';
    else if (sc >= 300 && sc < 400) cls = 'redirect';
    else if (sc >= 400 || sc === 0) cls = 'error';
    els.responseStatus.textContent = resp.statusText || 'Error'; els.responseStatus.className = 'response-status ' + cls;
    els.responseTime.textContent = resp.duration != null ? 'Time: ' + resp.duration + 'ms' : '';
    var bytes = resp.body ? new Blob([resp.body]).size : 0;
    els.responseSize.textContent = bytes > 0 ? 'Size: ' + formatSize(bytes) : '';
    updateResponseView();
  }

  function updateResponseView() {
    els.responseBody.classList.add('hidden'); els.responseHeadersView.classList.add('hidden'); els.responseRequestView.classList.add('hidden'); els.responseRawView.classList.add('hidden');
    var sub = document.querySelector('.sub-header');
    if (state.activeRespTab === 'body') {
      els.responseBody.classList.remove('hidden');
      if (sub) sub.style.display = 'flex';
      if (state.response) renderResponseBody(state.response);
    } else if (state.activeRespTab === 'headers') {
      els.responseHeadersView.classList.remove('hidden');
      if (sub) sub.style.display = 'none';
      if (state.response) renderResponseHeaders(state.response);
    } else if (state.activeRespTab === 'request') {
      els.responseRequestView.classList.remove('hidden');
      if (sub) sub.style.display = 'none';
      if (state.response) renderRequestView(state.response);
    } else if (state.activeRespTab === 'raw') {
      els.responseRawView.classList.remove('hidden');
      if (sub) sub.style.display = 'none';
      if (state.response) renderRawView(state.response);
    }
  }

  function renderResponseBody(resp) {
    var body = resp.body || '';
    var ct = (resp.headers && resp.headers['Content-Type']) || '';
    var lang = detectLanguage(ct, body);
    if (state.responseViewMode === 'pretty') {
      var formatted = body;
      if (lang === 'json') { try { formatted = JSON.stringify(JSON.parse(body), null, 2); } catch(e) {} }
      if (body) {
        var pre = document.createElement('pre'), code = document.createElement('code');
        code.className = 'language-' + lang; code.textContent = formatted; pre.appendChild(code);
        els.responseBody.innerHTML = ''; els.responseBody.appendChild(pre);
        if (typeof hljs !== 'undefined') hljs.highlightElement(code);
      } else { els.responseBody.innerHTML = '<div class="response-placeholder">No response body</div>'; }
    } else {
      els.responseBody.innerHTML = body ? '<pre style="white-space:pre-wrap;word-break:break-word;font-family:var(--font-mono);font-size:13px;padding:16px;margin:0;">' + esc(body) + '</pre>' : '<div class="response-placeholder">No response body</div>';
    }
  }

  function renderResponseHeaders(resp) {
    var h = resp.headers || {};
    els.responseHeadersContent.textContent = Object.entries(h).map(function(e) { return e[0] + ': ' + e[1]; }).join('\n') || 'No headers';
  }

  function renderRequestView(resp) {
    els.responseRequestContent.textContent = resp.rawRequest || '(Request data not available)';
  }
  function renderRawView(resp) {
    var req = resp.rawRequest || '(Request data not available)';
    var raw = resp.rawResponse || '(Raw response not available)';
    els.responseRawContent.textContent = '=== Request ===\n' + req + '\n\n=== Response ===\n' + raw;
  }

  function detectLanguage(ct, body) {
    if (/json/i.test(ct)) return 'json'; if (/xml/i.test(ct)) return 'xml'; if (/html/i.test(ct)) return 'xml';
    if (/markdown/i.test(ct)) return 'markdown';
    var t = body.trim();
    if (t.startsWith('{') || t.startsWith('[')) { try { JSON.parse(t); return 'json'; } catch(e) {} }
    if (/^<[?!a-zA-Z]/.test(t)) return 'xml';
    return 'plaintext';
  }
  function formatSize(b) { if (b < 1024) return b + ' B'; if (b < 1024 * 1024) return (b / 1024).toFixed(1) + ' KB'; return (b / (1024 * 1024)).toFixed(1) + ' MB'; }

  // ==================== History ====================
  async function loadHistory() { try { var r = await fetch('/api/history'); state._history = await r.json() || []; renderHistory(); } catch(e) {} }
  function renderHistory() {
    var q = els.historySearch.value.toLowerCase();
    var entries = (state._history || []).filter(function(e) { return !q || e.url.toLowerCase().includes(q) || e.method.toLowerCase().includes(q); });
    if (!entries.length) { els.historyList.innerHTML = '<div class="sidebar-empty">' + (q ? 'No matching entries.' : 'No history yet.') + '</div>'; return; }
    els.historyList.innerHTML = entries.map(function(e) {
      var c = state.selectedHistoryIds.has(e.id) ? 'checked' : '';
      var sc = e.statusCode >= 200 && e.statusCode < 300 ? 'success' : (e.statusCode >= 400 ? 'error' : (e.statusCode >= 300 ? 'redirect' : 'error'));
      return '<div class="history-item" data-id="' + e.id + '">' +
        '<input type="checkbox" class="hi-checkbox" data-id="' + e.id + '" ' + c + '>' +
        '<span class="hi-method ' + e.method.toLowerCase() + '">' + e.method + '</span>' +
        '<div class="hi-info"><div class="hi-url">' + esc(e.url) + '</div>' +
        '<div class="hi-meta"><span class="hi-status ' + sc + '">' + (e.statusCode || '-') + '</span>' +
        '<span>' + e.duration + 'ms</span><span>' + new Date(e.requestAt).toLocaleString() + '</span>' +
        (e.note ? '<span title="' + esc(e.note) + '">📝</span>' : '') + '</div></div></div>';
    }).join('');
    els.historyList.querySelectorAll('.history-item').forEach(function(item) {
      item.addEventListener('click', function(ev) {
        if (ev.target.classList.contains('hi-checkbox')) return;
        var e = (state._history || []).find(function(x) { return x.id === item.dataset.id; });
        if (e) loadEntry(e);
      });
    });
    els.historyList.querySelectorAll('.hi-checkbox').forEach(function(cb) {
      cb.addEventListener('click', function(ev) { ev.stopPropagation(); cb.checked ? state.selectedHistoryIds.add(cb.dataset.id) : state.selectedHistoryIds.delete(cb.dataset.id); renderHistorySelection(); });
    });
    renderHistorySelection();
  }
  function renderHistorySelection() {
    els.historyList.querySelectorAll('.hi-checkbox').forEach(function(cb) { cb.checked = state.selectedHistoryIds.has(cb.dataset.id); });
    els.historyList.querySelectorAll('.history-item').forEach(function(it) { it.classList.toggle('selected', state.selectedHistoryIds.has(it.dataset.id)); });
  }

  function loadEntry(entry) {
    if (state.viewingDocId) closeDocViewer();
    els.methodSelect.value = entry.method; state.method = entry.method;
    els.urlInput.value = entry.url; state.url = entry.url;
    state.headers = []; if (entry.headers) { Object.entries(entry.headers).forEach(function(e) { state.headers.push({ key: e[0], value: e[1] }); }); }
    if (!state.headers.length) state.headers.push({ key: '', value: '' }); renderHeaders();
    state.bodyType = entry.bodyType || 'raw';
    document.querySelectorAll('.body-type-tab').forEach(function(t) { t.classList.toggle('active', t.dataset.btype === state.bodyType); });
    els.bodyRaw.classList.toggle('hidden', state.bodyType !== 'raw');
    els.bodyFormdata.classList.toggle('hidden', state.bodyType !== 'form-data');
    els.bodyUrlencoded.classList.toggle('hidden', state.bodyType !== 'url-form-encoded');
    els.rawBody.value = entry.body || ''; state.rawBody = entry.body || '';
    if (entry.formFields && entry.formFields.length) {
      state.formFields = entry.formFields.map(function(f) { return { key: f.key, value: f.value || '', isFile: f.isFile || false, fileName: f.fileName || '', content: f.content || '', description: f.description || '' }; });
    } else { state.formFields = [{ key: '', value: '', isFile: false, fileName: '', content: '', description: '' }]; }
    renderFormFields();
    if (entry.urlEncoded && entry.urlEncoded.length) {
      state.urlEncoded = entry.urlEncoded.map(function(kv) { return { key: kv.key, value: kv.value || '', description: kv.description || '' }; });
    } else { state.urlEncoded = [{ key: '', value: '', description: '' }]; }
    renderUrlEncoded();
    if (entry.response) {
      state.response = { statusCode: entry.statusCode, statusText: entry.statusCode + ' ' + getStatusText(entry.statusCode), headers: entry.respHeaders || {}, body: entry.response, duration: entry.duration, rawRequest: entry.rawRequest || '', rawResponse: entry.rawResponse || '' };
      renderResponse(state.response);
    }
    els.requestTabs.querySelectorAll('.tab').forEach(function(t) { t.classList.remove('active'); });
    var bt = els.requestTabs.querySelector('[data-tab="body"]');
    if (bt) bt.classList.add('active');
    els.tabHeaders.classList.add('hidden'); els.tabBody.classList.remove('hidden');
    showToast('Request loaded from history');
  }
  function getStatusText(code) { var t = { 200: 'OK', 201: 'Created', 204: 'No Content', 301: 'Moved', 302: 'Found', 400: 'Bad Request', 401: 'Unauthorized', 403: 'Forbidden', 404: 'Not Found', 500: 'Internal Server Error', 502: 'Bad Gateway', 503: 'Service Unavailable' }; return t[code] || ''; }

  // ==================== Rendering helpers ====================
  function renderHeaders() {
    syncAllInputs();
    els.headersEditor.innerHTML = state.headers.map(function(h, i) {
      return '<div class="kv-row"><input type="text" class="kv-key" placeholder="Key" value="' + esc(h.key) + '" data-idx="' + i + '" data-field="key"><input type="text" class="kv-value" placeholder="Value" value="' + esc(h.value) + '" data-idx="' + i + '" data-field="value"><button class="btn btn-sm btn-icon kv-remove" data-idx="' + i + '">×</button></div>';
    }).join('');
    els.headersEditor.querySelectorAll('.kv-key,.kv-value').forEach(function(inp) { inp.addEventListener('input', function() { if (state.headers[+inp.dataset.idx]) state.headers[+inp.dataset.idx][inp.dataset.field] = inp.value; }); });
    els.headersEditor.querySelectorAll('.kv-remove').forEach(function(btn) { btn.addEventListener('click', function() { var i = +btn.dataset.idx; if (isNaN(i)) return; if (state.headers.length > 1) { state.headers.splice(i, 1); } else { state.headers[0] = { key: '', value: '' }; } renderHeaders(); }); });
  }

  function renderFormFields() {
    syncAllInputs(); state._formFileContents = state._formFileContents || {};
    els.formdataEditor.innerHTML = state.formFields.map(function(f, i) {
      var isF = f.isFile;
      return '<div class="kv-row form-row" data-idx="' + i + '">' +
        '<input type="text" class="kv-key" placeholder="Key" value="' + esc(f.key) + '" data-idx="' + i + '" data-field="key">' +
        '<div class="form-value-group">' +
          '<input type="text" class="kv-value form-text-value ' + (isF ? 'hidden' : '') + '" placeholder="Value" value="' + esc(isF ? '' : f.value) + '" data-idx="' + i + '" data-field="value">' +
          '<input type="file" class="form-file-input ' + (isF ? '' : 'hidden') + '" data-idx="' + i + '">' +
          '<span class="form-file-name ' + (isF && f.fileName ? '' : 'hidden') + '">' + esc(f.fileName || '') + '</span>' +
          '<button class="btn btn-xs btn-toggle-file" data-idx="' + i + '" title="' + (isF ? 'Switch to text' : 'Switch to file') + '">' + (isF ? '✎' : '📁') + '</button>' +
          '<input type="text" class="form-desc" placeholder="description" value="' + esc(f.description || '') + '" data-idx="' + i + '" data-field="description" style="width:80px;font-size:11px;">' +
        '</div>' +
        '<button class="btn btn-sm btn-icon kv-remove" data-idx="' + i + '">×</button></div>';
    }).join('');
    els.formdataEditor.querySelectorAll('.kv-key').forEach(function(inp) { inp.addEventListener('input', function() { if (state.formFields[+inp.dataset.idx]) state.formFields[+inp.dataset.idx].key = inp.value; }); });
    els.formdataEditor.querySelectorAll('.form-text-value').forEach(function(inp) { inp.addEventListener('input', function() { if (state.formFields[+inp.dataset.idx]) state.formFields[+inp.dataset.idx].value = inp.value; }); });
    els.formdataEditor.querySelectorAll('.form-desc').forEach(function(inp) { inp.addEventListener('input', function() { if (state.formFields[+inp.dataset.idx]) state.formFields[+inp.dataset.idx].description = inp.value; }); });
    els.formdataEditor.querySelectorAll('.form-file-input').forEach(function(inp) { inp.addEventListener('change', function() { var i = +inp.dataset.idx; var f = inp.files[0]; if (f && state.formFields[i]) { state.formFields[i].fileName = f.name; readFileAsBase64(f).then(function(b64) { state._formFileContents[i] = b64; if (state.formFields[i]) state.formFields[i].content = b64; }); var r = inp.closest('.kv-row'); var ne = r.querySelector('.form-file-name'); ne.textContent = f.name; ne.classList.remove('hidden'); } }); });
    els.formdataEditor.querySelectorAll('.btn-toggle-file').forEach(function(btn) { btn.addEventListener('click', function() { syncAllInputs(); var i = +btn.dataset.idx; var r = btn.closest('.kv-row'); var ti = r.querySelector('.form-text-value'); var fi = r.querySelector('.form-file-input'); var ne = r.querySelector('.form-file-name'); var cur = !fi.classList.contains('hidden'); if (cur) { fi.classList.add('hidden'); ne.classList.add('hidden'); ti.classList.remove('hidden'); btn.textContent = '📁'; btn.title = 'Switch to file'; if (state.formFields[i]) { state.formFields[i].isFile = false; state.formFields[i].fileName = ''; state.formFields[i].content = ''; delete state._formFileContents[i]; } } else { ti.classList.add('hidden'); fi.classList.remove('hidden'); btn.textContent = '✎'; btn.title = 'Switch to text'; if (state.formFields[i]) { state.formFields[i].isFile = true; state.formFields[i].value = ''; } } }); });
    els.formdataEditor.querySelectorAll('.kv-remove').forEach(function(btn) { btn.addEventListener('click', function() { var i = +btn.dataset.idx; if (isNaN(i)) return; if (state.formFields.length > 1) { state.formFields.splice(i, 1); } else { state.formFields[0] = { key: '', value: '', isFile: false, fileName: '', content: '', description: '' }; } renderFormFields(); }); });
  }

  function renderUrlEncoded() {
    syncAllInputs();
    els.urlencodedEditor.innerHTML = state.urlEncoded.map(function(kv, i) {
      return '<div class="kv-row"><input type="text" class="kv-key" placeholder="Key" value="' + esc(kv.key) + '" data-idx="' + i + '" data-field="key"><input type="text" class="kv-value" placeholder="Value" value="' + esc(kv.value) + '" data-idx="' + i + '" data-field="value"><input type="text" class="form-desc" placeholder="desc" value="' + esc(kv.description || '') + '" data-idx="' + i + '" data-field="description" style="width:80px;font-size:11px;"><button class="btn btn-sm btn-icon kv-remove" data-idx="' + i + '">×</button></div>';
    }).join('');
    els.urlencodedEditor.querySelectorAll('.kv-key,.kv-value').forEach(function(inp) { inp.addEventListener('input', function() { if (state.urlEncoded[+inp.dataset.idx]) state.urlEncoded[+inp.dataset.idx][inp.dataset.field] = inp.value; }); });
    els.urlencodedEditor.querySelectorAll('.form-desc').forEach(function(inp) { inp.addEventListener('input', function() { if (state.urlEncoded[+inp.dataset.idx]) state.urlEncoded[+inp.dataset.idx].description = inp.value; }); });
    els.urlencodedEditor.querySelectorAll('.kv-remove').forEach(function(btn) { btn.addEventListener('click', function() { var i = +btn.dataset.idx; if (isNaN(i)) return; if (state.urlEncoded.length > 1) { state.urlEncoded.splice(i, 1); } else { state.urlEncoded[0] = { key: '', value: '', description: '' }; } renderUrlEncoded(); }); });
  }

  // ==================== Documents ====================
  async function loadDocs() { try { var r = await fetch('/api/docs/list'); state._docs = await r.json() || []; renderDocs(); } catch(e) {} }
  function renderDocs() {
    var docs = state._docs || [];
    if (!docs.length) { els.docsList.innerHTML = '<div class="sidebar-empty">No documents yet.</div>'; return; }
    els.docsList.innerHTML = docs.map(function(d) {
      return '<div class="doc-item" data-id="' + d.id + '">' +
        '<input type="checkbox" class="doc-checkbox" data-id="' + d.id + '" ' + (state.selectedDocIds.has(d.id) ? 'checked' : '') + '>' +
        '<div class="doc-info"><div class="doc-title">' + esc(d.title) + '</div><div class="doc-meta">' + new Date(d.createdAt).toLocaleString() + '</div></div></div>';
    }).join('');
    els.docsList.querySelectorAll('.doc-item').forEach(function(item) {
      item.addEventListener('click', function(ev) { if (ev.target.classList.contains('doc-checkbox')) return; window.location.hash = '#/docs/' + item.dataset.id; });
    });
    els.docsList.querySelectorAll('.doc-checkbox').forEach(function(cb) {
      cb.addEventListener('click', function(ev) { ev.stopPropagation(); cb.checked ? state.selectedDocIds.add(cb.dataset.id) : state.selectedDocIds.delete(cb.dataset.id); renderDocsSelection(); });
    });
    renderDocsSelection();
  }
  function renderDocsSelection() {
    els.docsList.querySelectorAll('.doc-checkbox').forEach(function(cb) { cb.checked = state.selectedDocIds.has(cb.dataset.id); });
    els.docsList.querySelectorAll('.doc-item').forEach(function(it) { it.classList.toggle('selected', state.selectedDocIds.has(it.dataset.id)); });
  }
  async function batchDeleteDocs() {
    if (!state.selectedDocIds.size) { showToast('No documents selected', 'error'); return; }
    if (!(await confirmDialog('Delete Documents', 'Delete ' + state.selectedDocIds.size + ' document(s)? This cannot be undone.', 'Delete'))) return;
    await fetch('/api/docs/batch-delete', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ids: Array.from(state.selectedDocIds) }) });
    state.selectedDocIds.clear(); await loadDocs(); showToast('Documents deleted');
  }

  // ==================== Doc Viewer ====================
  async function openDocById(id, readOnly) {
    try {
      var r = await fetch('/api/docs/' + id);
      if (!r.ok) { showToast('Document not found', 'error'); window.location.hash = ''; return; }
      var doc = await r.json();
      state.viewingDocId = doc.id; state._currentDocMd = doc.content; state._docAlias = doc.alias;
      els.docViewerTitle.value = doc.title;
      // Load all history entries for this doc to get live notes/descriptions
      var allHist = await fetch('/api/history');
      var entries = await allHist.json() || [];
      var idSet = {};
      (doc.historyIds || []).forEach(function(id) { idSet[id] = true; });
      state._docHistory = entries.filter(function(e) { return idSet[e.id]; });
      els.docViewerContent.innerHTML = renderDocContent(doc.content, readOnly);
      els.viewRequest.classList.add('hidden'); els.viewDoc.classList.remove('hidden');
      if (readOnly) { els.docViewerTitle.readOnly = true; els.btnCopyDocLink.style.display = 'none'; }
      else { els.docViewerTitle.readOnly = false; els.btnCopyDocLink.style.display = ''; }
      rehighlight(); els.docViewerContent.scrollTop = 0;
    } catch(e) { showToast('Failed: ' + e.message, 'error'); }
  }

  async function autoSaveDocTitle() {
    var t = els.docViewerTitle.value.trim();
    if (!t || !state.viewingDocId) return;
    try {
      await fetch('/api/docs/' + state.viewingDocId, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title: t }) });
      await loadDocs();
    } catch(e) { /* silent */ }
  }

  function renderDocContent(md, readOnly) {
    if (typeof marked === 'undefined') return '<pre>' + esc(md) + '</pre>';
    var historyIds = []; var re = /<!--history-id:(\d+)-->/g; var m;
    while ((m = re.exec(md)) !== null) historyIds.push(m[1]);
    var clean = md.replace(/<!--history-id:\d+-->/g, '');
    var sections = clean.split(/(?=^## )/m);
    var html = '', hi = 0;
    var histEntries = state._docHistory || [];
    sections.forEach(function(s) {
      var t = s.trim(); if (!t) return;
      var em = t.match(/^##\s+\d+\.\s+(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\s+(.+)/m);
      if (em) {
        var method = em[1], url = em[2].trim(), hid = historyIds[hi] || ''; hi++;
        var he = histEntries.find(function(e) { return e.id === hid; });
        var body = t.split('\n').slice(1).join('\n');
        // Render body with editable description cells if we have history data
        var bodyHtml;
        if (he && !readOnly) {
          bodyHtml = marked.parse(body);
          bodyHtml = injectDescEdits(bodyHtml, he, hid);
        } else {
          bodyHtml = marked.parse(body);
        }
        // Note field
        var noteVal = he ? (he.note || '') : '';
        var noteHtml = '';
        if (!readOnly) {
          noteHtml = '<div class="endpoint-note-row"><span class="note-icon">📝</span><input class="note-edit" data-hid="' + hid + '" value="' + esc(noteVal) + '" placeholder="Add endpoint note..."></div>';
        } else if (noteVal) {
          noteHtml = '<div class="endpoint-note-row"><span class="note-icon">📝</span><span class="note-text">' + esc(noteVal) + '</span></div>';
        }
        html += '<div class="doc-endpoint"><div class="doc-endpoint-header"><span class="doc-endpoint-method ' + method.toLowerCase() + '">' + method + '</span><span class="doc-endpoint-url">' + esc(url) + '</span>' + (!readOnly ? '<button class="btn btn-sm btn-primary btn-try" data-history-id="' + hid + '">Load &amp; Send</button>' : '') + '</div>' + noteHtml + '<div class="doc-endpoint-body">' + bodyHtml + '</div></div>';
      } else {
        html += marked.parse(t);
      }
    });
    return html;
  }

  // Inject editable description inputs into form-data and url-encoded tables
  function injectDescEdits(bodyHtml, historyEntry, hid) {
    var div = document.createElement('div');
    div.innerHTML = bodyHtml;
    var tables = div.querySelectorAll('table');
    tables.forEach(function(table, tableIdx) {
      var headerCells = table.querySelectorAll('th');
      var descColIdx = -1;
      headerCells.forEach(function(th, ci) {
        if (/description/i.test(th.textContent)) descColIdx = ci;
      });
      if (descColIdx < 0) return;

      var rows = table.querySelectorAll('tr');
      var dataIdx = 0; // which form field or url-encoded entry
      var fields = (tableIdx === 0 && historyEntry.formFields && historyEntry.formFields.length)
        ? historyEntry.formFields : historyEntry.urlEncoded || [];

      for (var ri = 1; ri < rows.length; ri++) {
        var cells = rows[ri].querySelectorAll('td');
        if (descColIdx >= cells.length) continue;
        var cell = cells[descColIdx];
        var val = '';
        if (fields[dataIdx]) {
          val = fields[dataIdx].description || '';
          if (!val && historyEntry.note && dataIdx === 0 && tableIdx === 0) val = historyEntry.note;
        }
        cell.innerHTML = '<input class="desc-edit" data-hid="' + hid + '" data-idx="' + dataIdx + '" data-tbl="' + tableIdx + '" value="' + esc(val) + '" placeholder="desc">';
        dataIdx++;
      }
    });
    return div.innerHTML;
  }

  // Auto-save description on blur (delegated)
  document.addEventListener('blur', function(e) {
    var inp = e.target.closest('.desc-edit');
    if (inp) saveDescEdit(inp);
    var ninp = e.target.closest('.note-edit');
    if (ninp) saveNoteEdit(ninp);
  }, true);

  // Auto-save description on input (debounced)
  document.addEventListener('input', function(e) {
    var inp = e.target.closest('.desc-edit');
    if (inp) {
      clearTimeout(inp._descTimer);
      inp._descTimer = setTimeout(function() { saveDescEdit(inp); }, 600);
    }
    var ninp = e.target.closest('.note-edit');
    if (ninp) {
      clearTimeout(ninp._noteTimer);
      ninp._noteTimer = setTimeout(function() { saveNoteEdit(ninp); }, 600);
    }
  }, true);

  function saveDescEdit(inp) {
    var hid = inp.dataset.hid, idx = parseInt(inp.dataset.idx), tbl = parseInt(inp.dataset.tbl);
    if (!hid) return;
    fetch('/api/history').then(function(r) { return r.json(); }).then(function(entries) {
      var entry = entries.find(function(e) { return e.id === hid; });
      if (!entry) return;
      if (tbl === 0 && entry.formFields && entry.formFields[idx]) {
        entry.formFields[idx].description = inp.value;
      } else if (tbl === 1 && entry.urlEncoded && entry.urlEncoded[idx]) {
        entry.urlEncoded[idx].description = inp.value;
      }
      var body = { note: entry.note, formFields: entry.formFields, urlEncoded: entry.urlEncoded };
      fetch('/api/history/' + hid, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    }).catch(function() {});
  }

  async function saveNoteEdit(inp) {
    var hid = inp.dataset.hid;
    if (!hid) return;
    var note = inp.value;
    try {
      await fetch('/api/history/' + hid, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ note: note }) });
      if (state._docHistory) {
        var entry = state._docHistory.find(function(e) { return e.id === hid; });
        if (entry) entry.note = note;
      }
    } catch(e) {}
  }

  function closeDocViewer() { state.viewingDocId = null; state._currentDocMd = null; state._docHistory = null; state._docAlias = null; els.viewRequest.classList.remove('hidden'); els.viewDoc.classList.add('hidden'); window.location.hash = ''; }

  function copyShareLink(id) {
    var alias = state._docAlias;
    if (!alias && state._docs) {
      var d = (state._docs || []).find(function(x) { return x.id === id; });
      if (d) alias = d.alias;
    }
    var url = window.location.origin + '/share/' + (alias || id);
    navigator.clipboard.writeText(url).then(function() { showToast('Share link copied!', 'success'); }).catch(function() { showToast('Failed to copy', 'error'); });
  }

  // ==================== Docs Modal ====================
  async function openDocsModal() {
    if (!state.selectedHistoryIds.size) { showToast('Please select history entries first', 'error'); return; }
    els.docsSaveTitle.value = 'API Docs ' + new Date().toLocaleDateString();
    els.docsModal.classList.remove('hidden'); els.shareInfoBox.classList.add('hidden');
    els.docsModalContent.innerHTML = '<div style="text-align:center;padding:40px;"><span class="spinner"></span> Generating...</div>';
    try {
      var r = await fetch('/api/docs/generate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ids: Array.from(state.selectedHistoryIds) }) });
      var md = await r.text(); state.currentDocMd = md;
      els.docsModalContent.innerHTML = marked.parse(md);
      rehighlight();
    } catch(e) { els.docsModalContent.innerHTML = '<p style="color:var(--danger)">Failed: ' + e.message + '</p>'; }
  }
  function closeDocsModal() { els.docsModal.classList.add('hidden'); els.shareInfoBox.classList.add('hidden'); state.currentDocMd = ''; state.savedDocId = null; }
  async function copyDocs() { try { var r = await fetch('/api/docs/generate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ids: Array.from(state.selectedHistoryIds) }) }); await navigator.clipboard.writeText(await r.text()); showToast('Copied!', 'success'); } catch(e) { showToast('Failed', 'error'); } }
  async function downloadDocs() { try { var r = await fetch('/api/docs/generate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ids: Array.from(state.selectedHistoryIds) }) }); var b = new Blob([await r.text()], { type: 'text/markdown' }); var a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = 'api-docs.md'; a.click(); URL.revokeObjectURL(a.href); showToast('Downloaded', 'success'); } catch(e) { showToast('Failed', 'error'); } }
  async function saveDocs() {
    var title = els.docsSaveTitle.value.trim(); if (!title) { showToast('Please enter a title', 'error'); els.docsSaveTitle.focus(); return; }
    try {
      var r = await fetch('/api/docs/save', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title: title, historyIds: Array.from(state.selectedHistoryIds) }) });
      var doc = await r.json(); state.savedDocId = doc.id;
      els.shareUrlText.textContent = window.location.origin + '/share/' + (doc.alias || doc.id);
      els.shareInfoBox.classList.remove('hidden');
      state.selectedHistoryIds.clear(); renderHistory(); showToast('Document saved!');
      state.sidebarTab = 'docs'; switchSidebar('docs'); await loadDocs();
    } catch(e) { showToast('Failed: ' + e.message, 'error'); }
  }

  // Load & Send from doc viewer
  document.addEventListener('click', async function(e) {
    var btn = e.target.closest('.btn-try'); if (!btn) return;
    var hid = btn.dataset.historyId; if (!hid) return;
    try {
      var r = await fetch('/api/history'); var entries = await r.json();
      var entry = entries.find(function(x) { return x.id === hid; });
      if (entry) { loadEntry(entry); closeDocViewer(); showToast('Request loaded. Click Send.'); }
      else { showToast('History entry not found', 'error'); }
    } catch(ex) { showToast('Failed', 'error'); }
  });

  // ==================== Utilities ====================
  function readFileAsBase64(file) { return new Promise(function(resolve, reject) { var r = new FileReader(); r.onload = function() { resolve(r.result.split(',')[1]); }; r.onerror = reject; r.readAsDataURL(file); }); }
  function esc(str) { if (!str) return ''; var d = document.createElement('div'); d.textContent = str; return d.innerHTML; }
  function showToast(msg, type) { els.toast.textContent = msg; els.toast.className = 'toast ' + (type || ''); els.toast.classList.remove('hidden'); clearTimeout(state._toastTimer); state._toastTimer = setTimeout(function() { els.toast.classList.add('hidden'); }, 2500); }
  function confirmDialog(title, message, okText) {
    title = title || 'Confirm'; message = message || ''; okText = okText || 'Delete';
    els.confirmTitle.textContent = title; els.confirmMessage.textContent = message; els.confirmOk.textContent = okText;
    els.confirmModal.classList.remove('hidden');
    return new Promise(function(resolve) { state._confirmResolve = resolve; });
  }
  document.addEventListener('keydown', function(e) {
    if ((e.ctrlKey || e.metaKey) && e.key === 's') { e.preventDefault(); sendRequest(); }
    if (e.key === 'Escape') {
      if (!els.confirmModal.classList.contains('hidden')) { els.confirmModal.classList.add('hidden'); if (state._confirmResolve) { state._confirmResolve(false); state._confirmResolve = null; } }
      else if (!els.docsModal.classList.contains('hidden')) closeDocsModal();
      else if (state.viewingDocId) closeDocViewer();
    }
  });
  init();
})();
