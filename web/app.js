(function() {
  'use strict';

  // ==================== State ====================
  const state = {
    method: 'GET', url: '',
    headers: [{ key: 'User-Agent', value: 'API-Platform/1.0', _default: true }, { key: '', value: '' }],
    bodyType: 'raw', rawContentType: 'application/json', rawBody: '',
    formFields: [{ key: '', value: '', isFile: false, fileName: '', content: '', description: '' }],
    urlEncoded: [{ key: '', value: '', description: '' }],
    response: null, activeRespTab: 'body', activeHistoryId: null,
    selectedHistoryIds: new Set(), selectedDocIds: new Set(),
    sidebarTab: 'history', viewingDocId: null, currentDocMd: '',
    theme: 'light', responseViewMode: 'pretty', savedDocId: null,
    configTimeout: 60, _confirmResolve: null,
    _urlEncodedRawMode: false,
    _lang: 'En', _translations: {},
  };

  // ==================== i18n ====================
  var _t = function(key) {
    if (state._translations && state._translations[key]) return state._translations[key];
    return key;
  };

  async function loadCoreConfig() {
    var saved = localStorage.getItem('api-platform-lang');
    try {
      var r = await fetch('/api/core-config');
      var cfg = await r.json();
      state.configTimeout = cfg.timeout || 60;
      if (els.configTimeout) els.configTimeout.value = state.configTimeout;
      state._lang = saved || cfg.lang || 'En';
    } catch(e) { state._lang = saved || 'En'; }
    if (els.langSelect) els.langSelect.value = state._lang;
  }

  function detectLang() {
    if (state._lang && state._lang !== 'En') return;
    var navLang = (navigator.language || navigator.userLanguage || '').toLowerCase();
    if (navLang.startsWith('zh')) state._lang = '中文';
    else state._lang = 'En';
    if (els.langSelect) els.langSelect.value = state._lang;
  }

  function detectLang() {
    var saved = localStorage.getItem('api-platform-lang');
    if (saved) { state._lang = saved; return; }
    if (state._lang && state._lang !== 'En') return;
    var navLang = (navigator.language || navigator.userLanguage || '').toLowerCase();
    if (navLang.startsWith('zh')) state._lang = '中文';
    else state._lang = 'En';
  }

  async function loadTranslations() {
    try {
      var r = await fetch('/api/core-config/translations?lang=' + encodeURIComponent(state._lang));
      state._translations = await r.json();
    } catch(e) { state._translations = {}; }
  }

  function applyLang() {
    document.querySelectorAll('[data-i18n]').forEach(function(el) {
      var key = el.dataset.i18n;
      var text = _t(key);
      if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') {
        el.placeholder = text;
      } else {
        el.textContent = text;
      }
    });
  }

  async function switchLang(lang) {
    state._lang = lang;
    localStorage.setItem('api-platform-lang', lang);
    await fetch('/api/core-config', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ lang: lang, timeout: state.configTimeout }) });
    await loadTranslations();
    applyLang();
    if (state.viewingDocId && state._currentDocMd) {
      els.docViewerContent.innerHTML = renderDocContent(state._currentDocMd);
      rehighlight();
    }
    // Re-render dynamic content with new language
    renderHistory();
    renderDocs();
    renderHeaders();
    renderFormFields();
    renderUrlEncoded();
    // Update body type tabs text
    document.querySelectorAll('.body-type-tab').forEach(function(t) {
      if (t.dataset.btype === 'raw') t.textContent = _t('raw');
      else if (t.dataset.btype === 'form-data') t.textContent = _t('formData');
      else if (t.dataset.btype === 'url-form-encoded') t.textContent = _t('urlEncoded');
    });
  }

  // ==================== DOM Refs ====================
  const $ = (s) => document.getElementById(s);
  const els = {};

  function cacheDom() {
    const ids = [
      'method-select','url-input','btn-send','request-tabs','tab-headers','tab-body',
      'headers-editor','btn-add-header','body-raw','body-formdata','body-urlencoded',
      'raw-content-type','raw-body','formdata-editor','btn-add-formdata',
      'urlencoded-editor','btn-add-urlencoded','urlencoded-raw','btn-toggle-urlencoded-mode','response-status','response-time','response-size',
      'response-body','response-headers-view','response-request-view','response-raw-view',
      'response-headers-content','response-request-content','response-raw-content',
      'history-list','history-search','btn-select-all','btn-deselect-all','btn-delete-selected','btn-generate-docs',
      'panel-history','panel-docs','docs-list','btn-docs-select-all','btn-docs-deselect-all','btn-docs-batch-share','btn-docs-batch-unshare','btn-docs-batch-delete',
      'view-request','view-doc','doc-viewer-title','doc-viewer-content',
      'btn-back-editor','btn-copy-doc-link','btn-toggle-share','btn-download-doc',
      'docs-modal','docs-save-title','docs-modal-content','btn-copy-docs','btn-download-docs','btn-save-docs',
      'save-mode-select','append-doc-picker','append-doc-select','btn-append-docs',
      'btn-theme','toast','hljs-theme',
      'btn-view-pretty','btn-view-raw','share-info-box','share-url-text','btn-copy-share',
      'config-timeout', 'btn-save-config', 'btn-clear', 'lang-select',
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
    window.addEventListener('hashchange', handleHash);
    loadCoreConfig().then(function() {
      detectLang();
      return loadTranslations();
    }).then(function() {
      applyLang();
      return Promise.all([loadHistory(), loadDocs()]);
    }).then(function() { handleHash(); document.getElementById('app').classList.add('ready'); });
  }

  // ==================== Theme ====================
  function loadTheme() { state.theme = localStorage.getItem('api-platform-theme') || 'light'; applyTheme(); }
  function applyTheme() {
    document.documentElement.setAttribute('data-theme', state.theme);
    els.btnTheme.textContent = state.theme === 'dark' ? '☀️' : '🌙';
    els.btnTheme.title = state.theme === 'dark' ? _t('switchToLight') : _t('switchToDark');
    els.hljsTheme.href = state.theme === 'dark'
      ? 'https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.11.0/styles/atom-one-dark.min.css'
      : 'https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.11.0/styles/atom-one-light.min.css';
    if (state.viewingDocId && state._currentDocMd) { els.docViewerContent.innerHTML = renderDocContent(state._currentDocMd); rehighlight(); }
    if (!els.docsModal.classList.contains('hidden') && state.currentDocMd) { els.docsModalContent.innerHTML = renderDocContent(state.currentDocMd, true); rehighlight(); }
    if (state.response) renderResponseBody(state.response);
  }
  function toggleTheme() { state.theme = state.theme === 'dark' ? 'light' : 'dark'; localStorage.setItem('api-platform-theme', state.theme); applyTheme(); }
  function rehighlight() { setTimeout(function() { document.querySelectorAll('pre code').forEach(function(el) { delete el.dataset.highlighted; if (typeof hljs !== 'undefined') hljs.highlightElement(el); }); }, 50); }

  // ==================== Config ====================
  async function loadConfig() {
    // Timeout is loaded by loadCoreConfig now
  }
  async function saveConfig() {
    const t = parseInt(els.configTimeout.value) || 60;
    try {
      await fetch('/api/core-config', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ lang: state._lang, timeout: t }) });
      state.configTimeout = t;
      showToast(_t('timeout') + ': ' + t + 's', 'success');
    } catch(e) { showToast(_t('failed'), 'error'); }
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
        syncAllInputs();
        state.bodyType = t.dataset.btype;
        document.querySelectorAll('.body-type-tab').forEach(function(x) { x.classList.remove('active'); });
        t.classList.add('active');
        els.bodyRaw.classList.toggle('hidden', state.bodyType !== 'raw');
        els.bodyFormdata.classList.toggle('hidden', state.bodyType !== 'form-data');
        els.bodyUrlencoded.classList.toggle('hidden', state.bodyType !== 'url-form-encoded');
        ensureContentTypeHeader(state.bodyType);
      });
    });

    els.rawContentType.addEventListener('change', function() { state.rawContentType = els.rawContentType.value; });
    els.rawBody.addEventListener('input', function() { state.rawBody = els.rawBody.value; });
    els.btnAddHeader.addEventListener('click', function() { syncAllInputs(); state.headers.push({ key: '', value: '' }); renderHeaders(); });
    els.btnAddFormdata.addEventListener('click', function() { syncAllInputs(); state.formFields.push({ key: '', value: '', isFile: false, fileName: '', content: '', description: '' }); renderFormFields(); });
    els.btnAddUrlencoded.addEventListener('click', function() { syncAllInputs(); state.urlEncoded.push({ key: '', value: '', description: '' }); renderUrlEncoded(); });
    els.btnToggleUrlencodedMode.addEventListener('click', toggleUrlEncodedMode);

    // Config save
    if (els.btnSaveConfig) els.btnSaveConfig.addEventListener('click', saveConfig);

    // Language
    if (els.langSelect) els.langSelect.addEventListener('change', function() { switchLang(els.langSelect.value); });

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
    els.btnDeleteSelected.addEventListener('click', async function() {
      if (!state.selectedHistoryIds.size) { showToast(_t('noEntriesSelected'), 'error'); return; }
      if (!(await confirmDialog(_t('deleteConfirmTitle'), _t('deleteHistoryConfirm').replace('{count}', state.selectedHistoryIds.size), _t('deleteConfirmTitle')))) return;
      var ids = Array.from(state.selectedHistoryIds);
      for (var i = 0; i < ids.length; i++) {
        await fetch('/api/history/' + ids[i], { method: 'DELETE' });
      }
      state.selectedHistoryIds.clear();
      await loadHistory();
      showToast(_t('deletedEntries').replace('{count}', ids.length));
    });
    els.btnGenerateDocs.addEventListener('click', openDocsModal);

    els.docsModalClose.addEventListener('click', closeDocsModal);
    els.docsModal.addEventListener('click', function(e) { if (e.target === els.docsModal) closeDocsModal(); });
    els.btnCopyDocs.addEventListener('click', copyDocs);
    els.btnDownloadDocs.addEventListener('click', downloadDocs);
    els.btnSaveDocs.addEventListener('click', saveDocs);
    els.btnAppendDocs.addEventListener('click', appendDocs);
    els.saveModeSelect.addEventListener('change', function() {
      var isAppend = els.saveModeSelect.value === 'append';
      els.appendDocPicker.classList.toggle('hidden', !isAppend);
      els.btnSaveDocs.classList.toggle('hidden', isAppend);
      els.btnAppendDocs.classList.toggle('hidden', !isAppend);
    });
    els.btnCopyShare.addEventListener('click', function() { if (state.savedDocId) copyShareLink(state.savedDocId); });

    els.btnBackEditor.addEventListener('click', closeDocViewer);
    els.btnCopyDocLink.addEventListener('click', function() { copyShareLink(state.viewingDocId); });

    // Doc title auto-save on blur/enter
    els.docViewerTitle.addEventListener('blur', autoSaveDocTitle);
    els.docViewerTitle.addEventListener('keydown', function(e) { if (e.key === 'Enter') { e.preventDefault(); els.docViewerTitle.blur(); } });

    els.btnDocsSelectAll.addEventListener('click', function() { (state._docs || []).forEach(function(d) { state.selectedDocIds.add(d.id); }); renderDocs(); });
    els.btnDocsDeselectAll.addEventListener('click', function() { state.selectedDocIds.clear(); renderDocs(); });
    els.btnDocsBatchDelete.addEventListener('click', batchDeleteDocs);
    els.btnDocsBatchShare.addEventListener('click', batchShareDocs);
    els.btnDocsBatchUnshare.addEventListener('click', batchUnshareDocs);
    els.btnToggleShare.addEventListener('click', toggleShareDoc);
    els.btnDownloadDoc.addEventListener('click', downloadCurrentDoc);

    document.querySelectorAll('.sidebar-tab').forEach(function(t) {
      t.addEventListener('click', function() {
        var s = t.dataset.stab;
        if (s === state.sidebarTab) return;
        state.sidebarTab = s;
        document.querySelectorAll('.sidebar-tab').forEach(function(x) { x.classList.toggle('active', x.dataset.stab === s); });
        els.panelHistory.classList.toggle('hidden', s !== 'history');
        els.panelDocs.classList.toggle('hidden', s !== 'docs');
        if (s === 'history') {
          if (state.viewingDocId) closeDocViewer();
          clearAll();
        } else if (s === 'docs') {
          loadDocs().then(function() {
            if (state._docs && state._docs.length) {
              window.location.hash = '#/docs/' + state._docs[0].id;
            }
          });
        }
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
    if (!state._urlEncodedRawMode) {
      els.urlencodedEditor.querySelectorAll('.kv-row').forEach(function(row, i) {
        var k = row.querySelector('.kv-key'), v = row.querySelector('.kv-value'), d = row.querySelector('.form-desc');
        if (state.urlEncoded[i]) { if (k) state.urlEncoded[i].key = k.value; if (v) state.urlEncoded[i].value = v.value; if (d) state.urlEncoded[i].description = d.value; }
      });
    } else {
      parseUrlEncodedRaw();
    }
  }

  // ==================== Hash Routing ====================
  function handleHash() {
    var hash = window.location.hash;
    if (hash.startsWith('#/docs/')) { state.sidebarTab = 'docs'; switchSidebar('docs'); openDocById(hash.slice('#/docs/'.length)); }
    else if (hash.startsWith('#/share/')) { state.sidebarTab = 'docs'; switchSidebar('docs'); openDocById(hash.slice('#/share/'.length), true); }
    else if (hash.startsWith('#/history/')) {
      var id = hash.slice('#/history/'.length);
      state.sidebarTab = 'history'; switchSidebar('history');
      if (state.viewingDocId) closeDocViewer();
      if (state._history) {
        var entry = state._history.find(function(e) { return e.id === id; });
        if (entry) { loadEntry(entry); return; }
      }
      clearAll();
    }
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
    if (!url) { showToast(_t('pleaseEnterUrl'), 'error'); els.urlInput.focus(); return; }
    syncAllInputs();
    state.url = url; state.method = els.methodSelect.value;
    collectHeaders(); collectFormFields(); collectUrlEncoded();
    state.rawBody = els.rawBody.value; state.rawContentType = els.rawContentType.value;

    els.btnSend.disabled = true; els.btnSend.innerHTML = '<span class="spinner"></span> ' + _t('sending');
    els.responseStatus.textContent = ''; els.responseTime.textContent = ''; els.responseSize.textContent = '';
    els.responseBody.innerHTML = '<div class="response-placeholder"><span class="spinner"></span> ' + _t('sending') + '</div>';
    els.responseHeadersContent.textContent = ''; els.responseRequestContent.textContent = '';

    try {
      var body = buildRequestBody();
      var resp = await fetch('/api/proxy', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      var data = await resp.json();
      state.response = data;
      renderResponse(data);
      await loadHistory();
    } catch(err) {
      state.response = { statusCode: 0, statusText: _t('error') + ': ' + err.message, headers: {}, body: '', duration: 0, rawRequest: '' };
      renderResponse(state.response);
      showToast(_t('requestFailed') + ': ' + err.message, 'error');
    } finally { els.btnSend.disabled = false; els.btnSend.textContent = _t('send'); }
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
    if (state._urlEncodedRawMode) {
      parseUrlEncodedRaw();
    } else {
      state.urlEncoded = [];
      els.urlencodedEditor.querySelectorAll('.kv-row').forEach(function(row) {
        var d = row.querySelector('.form-desc');
        state.urlEncoded.push({ key: row.querySelector('.kv-key').value.trim(), value: row.querySelector('.kv-value').value.trim(), description: d ? d.value : '' });
      });
    }
  }

  function buildRequestBody() {
    var b = { method: state.method, url: state.url, headers: {}, bodyType: state.bodyType };
    var seen = {};
    state.headers.forEach(function(h) { if (h.key) { b.headers[h.key] = h.value; seen[h.key.toLowerCase()] = true; } });
    // Auto-compute Content-Length for raw body
    if (state.bodyType === 'raw' && state.rawBody) {
      if (!seen['content-type']) b.headers['Content-Type'] = state.rawContentType;
      if (!seen['content-length']) b.headers['Content-Length'] = String(new Blob([state.rawBody]).size);
      b.body = state.rawBody;
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
    state.activeHistoryId = null;
    if (window.location.hash.startsWith('#/history/')) window.location.hash = '';
    state.headers = [{ key: 'User-Agent', value: 'API-Platform/1.0', _default: true }, { key: '', value: '' }]; renderHeaders();
    state.bodyType = 'raw'; state.rawBody = ''; state.rawContentType = 'application/json';
    els.rawBody.value = '';
    document.querySelectorAll('.body-type-tab').forEach(function(t) { t.classList.toggle('active', t.dataset.btype === 'raw'); });
    els.bodyRaw.classList.remove('hidden'); els.bodyFormdata.classList.add('hidden'); els.bodyUrlencoded.classList.add('hidden');
    state.formFields = [{ key: '', value: '', isFile: false, fileName: '', content: '', description: '' }]; renderFormFields();
    state._urlEncodedRawMode = false; state.urlEncoded = [{ key: '', value: '', description: '' }]; renderUrlEncoded();
    els.requestTabs.querySelectorAll('.tab').forEach(function(t) { t.classList.remove('active'); });
    var ht = els.requestTabs.querySelector('[data-tab="headers"]');
    if (ht) ht.classList.add('active');
    els.tabHeaders.classList.remove('hidden'); els.tabBody.classList.add('hidden');
    els.responseStatus.textContent = ''; els.responseTime.textContent = ''; els.responseSize.textContent = '';
    els.responseBody.innerHTML = '<div class="response-placeholder">' + _t('sendPlaceholder') + '</div>';
    els.responseHeadersContent.textContent = ''; els.responseRequestContent.textContent = ''; els.responseRawContent.textContent = '';
    state.response = null;
    renderHistorySelection();
  }

  // ==================== Response ====================
  function renderResponse(resp) {
    var sc = resp.statusCode || 0, cls = 'info';
    if (sc >= 200 && sc < 300) cls = 'success';
    else if (sc >= 300 && sc < 400) cls = 'redirect';
    else if (sc >= 400 || sc === 0) cls = 'error';
    els.responseStatus.textContent = resp.statusText || _t('error'); els.responseStatus.className = 'response-status ' + cls;
    els.responseTime.textContent = resp.duration != null ? _t('time') + ': ' + resp.duration + 'ms' : '';
    var bytes = resp.body ? new Blob([resp.body]).size : 0;
    els.responseSize.textContent = bytes > 0 ? _t('size') + ': ' + formatSize(bytes) : '';
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
    } else if (state.activeRespTab === 'response') {
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
      } else { els.responseBody.innerHTML = '<div class="response-placeholder">' + _t('noResponseBody') + '</div>'; }
    } else {
      els.responseBody.innerHTML = body ? '<pre style="white-space:pre-wrap;word-break:break-word;font-family:var(--font-mono);font-size:13px;padding:16px;margin:0;">' + esc(body) + '</pre>' : '<div class="response-placeholder">' + _t('noResponseBody') + '</div>';
    }
  }

  function renderResponseHeaders(resp) {
    var h = resp.headers || {};
    els.responseHeadersContent.textContent = Object.entries(h).map(function(e) { return e[0] + ': ' + e[1]; }).join('\n') || _t('noHeaders');
  }

  function renderRequestView(resp) {
    els.responseRequestContent.textContent = resp.rawRequest || _t('requestDataNotAvailable');
  }
  function renderRawView(resp) {
    els.responseRawContent.textContent = resp.rawResponse || _t('rawResponseNotAvailable');
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
    if (!entries.length) { els.historyList.innerHTML = '<div class="sidebar-empty">' + (q ? _t('noMatching') : _t('noHistory')) + '</div>'; return; }
    els.historyList.innerHTML = entries.map(function(e) {
      var c = state.selectedHistoryIds.has(e.id) ? 'checked' : '';
      var a = state.activeHistoryId === e.id ? ' active' : '';
      var sc = e.statusCode >= 200 && e.statusCode < 300 ? 'success' : (e.statusCode >= 400 ? 'error' : (e.statusCode >= 300 ? 'redirect' : 'error'));
      return '<div class="history-item' + a + '" data-id="' + e.id + '">' +
        '<input type="checkbox" class="hi-checkbox" data-id="' + e.id + '" ' + c + '>' +
        '<span class="hi-method ' + e.method.toLowerCase() + '">' + e.method + '</span>' +
        '<div class="hi-info"><div class="hi-url">' + esc(e.url) + '</div>' +
        '<div class="hi-meta"><span class="hi-status ' + sc + '">' + (e.statusCode || '-') + '</span>' +
        '<span>' + e.duration + 'ms</span><span>' + new Date(e.requestAt).toLocaleString() + '</span>' +
        '</div><div class="hi-note"><input class="hi-note-input" data-id="' + e.id + '" value="' + esc(e.note || '') + '" placeholder="' + _t('addRemark') + '"></div></div></div>';
    }).join('');
    els.historyList.querySelectorAll('.history-item').forEach(function(item) {
      item.addEventListener('click', function(ev) {
        if (ev.target.classList.contains('hi-checkbox') || ev.target.classList.contains('hi-note-input')) return;
        var e = (state._history || []).find(function(x) { return x.id === item.dataset.id; });
        if (e) window.location.hash = '#/history/' + e.id;
      });
    });
    els.historyList.querySelectorAll('.hi-checkbox').forEach(function(cb) {
      cb.addEventListener('click', function(ev) { ev.stopPropagation(); cb.checked ? state.selectedHistoryIds.add(cb.dataset.id) : state.selectedHistoryIds.delete(cb.dataset.id); renderHistorySelection(); });
    });
    // Note input events: save on blur/enter, debounce on input
    els.historyList.querySelectorAll('.hi-note-input').forEach(function(inp) {
      inp.addEventListener('blur', function() { saveHistoryNote(inp); });
      inp.addEventListener('keydown', function(ev) { if (ev.key === 'Enter') { ev.preventDefault(); inp.blur(); } });
      inp.addEventListener('input', function() {
        clearTimeout(inp._noteTimer);
        inp._noteTimer = setTimeout(function() { saveHistoryNote(inp); }, 800);
      });
    });
    renderHistorySelection();
  }
  function renderHistorySelection() {
    els.historyList.querySelectorAll('.hi-checkbox').forEach(function(cb) { cb.checked = state.selectedHistoryIds.has(cb.dataset.id); });
    els.historyList.querySelectorAll('.history-item').forEach(function(it) {
      it.classList.toggle('selected', state.selectedHistoryIds.has(it.dataset.id));
      it.classList.toggle('active', it.dataset.id === state.activeHistoryId);
    });
  }

  function loadEntry(entry) {
    if (state.viewingDocId) closeDocViewer();
    state.activeHistoryId = entry.id;
    els.methodSelect.value = entry.method; state.method = entry.method;
    els.urlInput.value = entry.url; state.url = entry.url;
    state.headers = [];
    if (entry.headers) {
      Object.entries(entry.headers).forEach(function(e) {
        state.headers.push({ key: e[0], value: e[1] });
      });
    }
    if (!state.headers.some(function(h) { return h.key === 'User-Agent'; })) {
      state.headers.unshift({ key: 'User-Agent', value: 'API-Platform/1.0', _default: true });
    }
    state.headers.push({ key: '', value: '' }); renderHeaders();
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
    state._urlEncodedRawMode = false; renderUrlEncoded();
    if (entry.response) {
      state.response = { statusCode: entry.statusCode, statusText: entry.statusCode + ' ' + getStatusText(entry.statusCode), headers: entry.respHeaders || {}, body: entry.response, duration: entry.duration, rawRequest: entry.rawRequest || '', rawResponse: entry.rawResponse || '' };
      renderResponse(state.response);
    }
    els.requestTabs.querySelectorAll('.tab').forEach(function(t) { t.classList.remove('active'); });
    var bt = els.requestTabs.querySelector('[data-tab="body"]');
    if (bt) bt.classList.add('active');
    els.tabHeaders.classList.add('hidden'); els.tabBody.classList.remove('hidden');
    showToast(_t('requestLoadedClickSend'));
    renderHistorySelection();
  }
  function getStatusText(code) { var t = { 200: 'OK', 201: 'Created', 204: 'No Content', 301: 'Moved', 302: 'Found', 400: 'Bad Request', 401: 'Unauthorized', 403: 'Forbidden', 404: 'Not Found', 500: 'Internal Server Error', 502: 'Bad Gateway', 503: 'Service Unavailable' }; return t[code] || ''; }

  function saveHistoryNote(inp) {
    var id = inp.dataset.id;
    if (!id) return;
    fetch('/api/history/' + id, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ note: inp.value }) }).then(function(r) {
      if (!r.ok) return;
      // Update local state
      var entry = (state._history || []).find(function(e) { return e.id === id; });
      if (entry) entry.note = inp.value;
    }).catch(function() {});
  }

  function ensureContentTypeHeader(bodyType) {
    var ct = null;
    if (bodyType === 'raw') {
      ct = state.rawContentType || 'application/json';
    } else if (bodyType === 'url-form-encoded') {
      ct = 'application/x-www-form-urlencoded';
    }
    if (!ct) return;
    if (state.headers.some(function(h) { return h.key.toLowerCase() === 'content-type'; })) return;
    var last = state.headers.length - 1;
    state.headers.splice(last, 0, { key: 'Content-Type', value: ct });
    renderHeaders();
  }

  // ==================== Rendering helpers ====================
  function renderHeaders() {
    var _pHKey = _t('key'), _pHVal = _t('value');
    els.headersEditor.innerHTML = state.headers.map(function(h, i) {
      return '<div class="kv-row"><input type="text" class="kv-key" placeholder="' + _pHKey + '" value="' + esc(h.key) + '" data-idx="' + i + '" data-field="key"><input type="text" class="kv-value" placeholder="' + _pHVal + '" value="' + esc(h.value) + '" data-idx="' + i + '" data-field="value"><button class="btn btn-sm btn-icon kv-remove" data-idx="' + i + '">×</button></div>';
    }).join('');
    els.headersEditor.querySelectorAll('.kv-key,.kv-value').forEach(function(inp) { inp.addEventListener('input', function() { if (state.headers[+inp.dataset.idx]) state.headers[+inp.dataset.idx][inp.dataset.field] = inp.value; }); });
    els.headersEditor.querySelectorAll('.kv-remove').forEach(function(btn) { btn.addEventListener('click', function() { syncAllInputs(); var i = +btn.dataset.idx; if (isNaN(i)) return; if (state.headers.length > 1) { state.headers.splice(i, 1); } else { state.headers[0] = { key: '', value: '' }; } renderHeaders(); }); });
  }

  function renderFormFields() {
    var _pFKey = _t('key'), _pFVal = _t('value'), _pFDesc = _t('desc');
    state._formFileContents = state._formFileContents || {};
    els.formdataEditor.innerHTML = state.formFields.map(function(f, i) {
      var isF = f.isFile;
      return '<div class="kv-row form-row" data-idx="' + i + '">' +
        '<input type="text" class="kv-key" placeholder="' + _pFKey + '" value="' + esc(f.key) + '" data-idx="' + i + '" data-field="key">' +
        '<div class="form-value-group">' +
          '<input type="text" class="kv-value form-text-value ' + (isF ? 'hidden' : '') + '" placeholder="' + _pFVal + '" value="' + esc(isF ? '' : f.value) + '" data-idx="' + i + '" data-field="value">' +
          '<input type="file" class="form-file-input ' + (isF ? '' : 'hidden') + '" data-idx="' + i + '">' +
          '<span class="form-file-name ' + (isF && f.fileName ? '' : 'hidden') + '">' + esc(f.fileName || '') + '</span>' +
          '<button class="btn btn-xs btn-toggle-file" data-idx="' + i + '" title="' + (isF ? _t('switchToText') : _t('switchToFile')) + '">' + (isF ? '✎' : '📁') + '</button>' +
          '<input type="text" class="form-desc" placeholder="' + _pFDesc + '" value="' + esc(f.description || '') + '" data-idx="' + i + '" data-field="description" style="width:80px;font-size:11px;">' +
        '</div>' +
        '<button class="btn btn-sm btn-icon kv-remove" data-idx="' + i + '">×</button></div>';
    }).join('');
    els.formdataEditor.querySelectorAll('.kv-key').forEach(function(inp) { inp.addEventListener('input', function() { if (state.formFields[+inp.dataset.idx]) state.formFields[+inp.dataset.idx].key = inp.value; }); });
    els.formdataEditor.querySelectorAll('.form-text-value').forEach(function(inp) { inp.addEventListener('input', function() { if (state.formFields[+inp.dataset.idx]) state.formFields[+inp.dataset.idx].value = inp.value; }); });
    els.formdataEditor.querySelectorAll('.form-desc').forEach(function(inp) { inp.addEventListener('input', function() { if (state.formFields[+inp.dataset.idx]) state.formFields[+inp.dataset.idx].description = inp.value; }); });
    els.formdataEditor.querySelectorAll('.form-file-input').forEach(function(inp) { inp.addEventListener('change', function() { var i = +inp.dataset.idx; var f = inp.files[0]; if (f && state.formFields[i]) { state.formFields[i].fileName = f.name; readFileAsBase64(f).then(function(b64) { state._formFileContents[i] = b64; if (state.formFields[i]) state.formFields[i].content = b64; }); var r = inp.closest('.kv-row'); var ne = r.querySelector('.form-file-name'); ne.textContent = f.name; ne.classList.remove('hidden'); } }); });
    els.formdataEditor.querySelectorAll('.btn-toggle-file').forEach(function(btn) { btn.addEventListener('click', function() { syncAllInputs(); var i = +btn.dataset.idx; var r = btn.closest('.kv-row'); var ti = r.querySelector('.form-text-value'); var fi = r.querySelector('.form-file-input'); var ne = r.querySelector('.form-file-name'); var cur = !fi.classList.contains('hidden');       if (cur) { fi.classList.add('hidden'); ne.classList.add('hidden'); ti.classList.remove('hidden'); btn.textContent = '📁'; btn.title = _t('switchToFile'); if (state.formFields[i]) { state.formFields[i].isFile = false; state.formFields[i].fileName = ''; state.formFields[i].content = ''; delete state._formFileContents[i]; } } else { ti.classList.add('hidden'); fi.classList.remove('hidden'); btn.textContent = '✎'; btn.title = _t('switchToText'); if (state.formFields[i]) { state.formFields[i].isFile = true; state.formFields[i].value = ''; } } }); });
    els.formdataEditor.querySelectorAll('.kv-remove').forEach(function(btn) { btn.addEventListener('click', function() { syncAllInputs(); var i = +btn.dataset.idx; if (isNaN(i)) return; if (state.formFields.length > 1) { state.formFields.splice(i, 1); } else { state.formFields[0] = { key: '', value: '', isFile: false, fileName: '', content: '', description: '' }; } renderFormFields(); }); });
  }

  function renderUrlEncoded() {
    if (state._urlEncodedRawMode) {
      els.urlencodedEditor.classList.add('hidden');
      els.btnAddUrlencoded.classList.add('hidden');
      els.urlencodedRaw.classList.remove('hidden');
      els.btnToggleUrlencodedMode.textContent = _t('tableEdit');
      var raw = urlEncodedToRaw(state.urlEncoded);
      if (els.urlencodedRaw.querySelector('textarea').value === '' || raw !== '') {
        els.urlencodedRaw.querySelector('textarea').value = raw;
      }
    } else {
      els.urlencodedEditor.classList.remove('hidden');
      els.btnAddUrlencoded.classList.remove('hidden');
      els.urlencodedRaw.classList.add('hidden');
      els.btnToggleUrlencodedMode.textContent = _t('bulkEdit');
      els.urlencodedEditor.innerHTML = state.urlEncoded.map(function(kv, i) {
        return '<div class="kv-row"><input type="text" class="kv-key" placeholder="' + _t('key') + '" value="' + esc(kv.key) + '" data-idx="' + i + '" data-field="key"><input type="text" class="kv-value" placeholder="' + _t('value') + '" value="' + esc(kv.value) + '" data-idx="' + i + '" data-field="value"><input type="text" class="form-desc" placeholder="' + _t('desc') + '" value="' + esc(kv.description || '') + '" data-idx="' + i + '" data-field="description" style="width:80px;font-size:11px;"><button class="btn btn-sm btn-icon kv-remove" data-idx="' + i + '">×</button></div>';
      }).join('');
      els.urlencodedEditor.querySelectorAll('.kv-key,.kv-value').forEach(function(inp) { inp.addEventListener('input', function() { if (state.urlEncoded[+inp.dataset.idx]) state.urlEncoded[+inp.dataset.idx][inp.dataset.field] = inp.value; }); });
      els.urlencodedEditor.querySelectorAll('.form-desc').forEach(function(inp) { inp.addEventListener('input', function() { if (state.urlEncoded[+inp.dataset.idx]) state.urlEncoded[+inp.dataset.idx].description = inp.value; }); });
      els.urlencodedEditor.querySelectorAll('.kv-remove').forEach(function(btn) { btn.addEventListener('click', function() { syncAllInputs(); var i = +btn.dataset.idx; if (isNaN(i)) return; if (state.urlEncoded.length > 1) { state.urlEncoded.splice(i, 1); } else { state.urlEncoded[0] = { key: '', value: '', description: '' }; } renderUrlEncoded(); }); });
    }
  }

  function urlEncodedToRaw(arr) {
    return arr.filter(function(kv) { return kv.key; }).map(function(kv) {
      return kv.key + '=' + kv.value;
    }).join('&');
  }

  function parseUrlEncodedRaw() {
    var raw = els.urlencodedRaw.querySelector('textarea').value;
    state.urlEncoded = [];
    raw.split('&').forEach(function(pair) {
      pair = pair.trim();
      if (!pair) return;
      var eq = pair.indexOf('=');
      if (eq < 0) {
        state.urlEncoded.push({ key: pair, value: '', description: '' });
      } else {
        state.urlEncoded.push({
          key: pair.substring(0, eq),
          value: pair.substring(eq + 1),
          description: ''
        });
      }
    });
    if (!state.urlEncoded.length) {
      state.urlEncoded.push({ key: '', value: '', description: '' });
    }
  }

  function toggleUrlEncodedMode() {
    syncAllInputs();
    state._urlEncodedRawMode = !state._urlEncodedRawMode;
    renderUrlEncoded();
  }

  // ==================== Documents ====================
  async function loadDocs() { try { var r = await fetch('/api/docs/list'); state._docs = await r.json() || []; renderDocs(); } catch(e) {} }
  function renderDocs() {
    var docs = state._docs || [];
    if (!docs.length) { els.docsList.innerHTML = '<div class="sidebar-empty">' + _t('noDocuments') + '</div>'; return; }
    els.docsList.innerHTML = docs.map(function(d) {
      var a = state.viewingDocId === d.id ? ' active' : '';
      return '<div class="doc-item' + a + '" data-id="' + d.id + '">' +
        '<input type="checkbox" class="doc-checkbox" data-id="' + d.id + '" ' + (state.selectedDocIds.has(d.id) ? 'checked' : '') + '>' +
        '<div class="doc-info"><div class="doc-title">' + esc(d.title) + (d.shared ? ' <span class="shared-badge" title="Shared">🔗</span>' : '') + '</div><div class="doc-meta">' + new Date(d.createdAt).toLocaleString() + '</div></div></div>';
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
    els.docsList.querySelectorAll('.doc-item').forEach(function(it) {
      it.classList.toggle('selected', state.selectedDocIds.has(it.dataset.id));
      it.classList.toggle('active', it.dataset.id === state.viewingDocId);
    });
  }
  async function batchDeleteDocs() {
    if (!state.selectedDocIds.size) { showToast(_t('noDocumentsSelected'), 'error'); return; }
    if (!(await confirmDialog(_t('deleteConfirmTitle'), _t('deleteDocConfirm').replace('{count}', state.selectedDocIds.size), _t('deleteConfirmTitle')))) return;
    await fetch('/api/docs/batch-delete', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ids: Array.from(state.selectedDocIds) }) });
    state.selectedDocIds.clear(); await loadDocs(); showToast(_t('deletedDocs'));
  }
  async function batchShareDocs() {
    if (!state.selectedDocIds.size) { showToast(_t('noDocumentsSelected'), 'error'); return; }
    var count = state.selectedDocIds.size;
    await fetch('/api/docs/batch-share', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ids: Array.from(state.selectedDocIds) }) });
    state.selectedDocIds.clear(); await loadDocs(); showToast(_t('sharedCount').replace('{count}', count));
  }
  async function batchUnshareDocs() {
    if (!state.selectedDocIds.size) { showToast(_t('noDocumentsSelected'), 'error'); return; }
    var count = state.selectedDocIds.size;
    await fetch('/api/docs/batch-unshare', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ids: Array.from(state.selectedDocIds) }) });
    state.selectedDocIds.clear(); await loadDocs(); showToast(_t('unsharedCount').replace('{count}', count));
  }
  async function toggleShareDoc() {
    if (!state.viewingDocId) return;
    var doc = (state._docs || []).find(function(d) { return d.id === state.viewingDocId; });
    if (!doc) return;
    var ids = [state.viewingDocId];
    if (doc.shared) {
      await fetch('/api/docs/batch-unshare', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ids: ids }) });
      showToast(_t('unshared'));
    } else {
      await fetch('/api/docs/batch-share', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ids: ids }) });
      showToast(_t('shared'));
    }
    await loadDocs();
    updateToggleShareBtn();
  }
  function updateToggleShareBtn() {
    if (!state.viewingDocId || !state._docs) return;
    var doc = (state._docs || []).find(function(d) { return d.id === state.viewingDocId; });
    if (doc && doc.shared) {
      els.btnToggleShare.textContent = _t('unshare');
      els.btnToggleShare.className = 'btn btn-sm btn-danger';
      els.btnCopyDocLink.style.display = '';
    } else {
      els.btnToggleShare.textContent = _t('share');
      els.btnToggleShare.className = 'btn btn-sm btn-outline';
      els.btnCopyDocLink.style.display = 'none';
    }
  }

  // ==================== Doc Viewer ====================
  async function openDocById(id, readOnly) {
    try {
      var r = await fetch('/api/docs/' + id);
      if (!r.ok) { showToast(_t('docNotFound'), 'error'); window.location.hash = ''; return; }
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
      if (readOnly) { els.docViewerTitle.readOnly = true; els.btnCopyDocLink.style.display = 'none'; els.btnToggleShare.style.display = 'none'; }
      else { els.docViewerTitle.readOnly = false; updateToggleShareBtn(); }
      rehighlight(); els.docViewerContent.scrollTop = 0;
      renderDocsSelection();
    } catch(e) { showToast(_t('failed') + ': ' + e.message, 'error'); }
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
      var em = t.match(/^##\s+\d+\.\s+(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\s+(.+?)(?:\s+-\s+(.*))?$/m);
      if (em) {
        var method = em[1], url = em[2].trim(), docTitle = (em[3] || '').trim(), hid = historyIds[hi] || ''; hi++;
        var he = histEntries.find(function(e) { return e.id === hid; });
        var body = t.split('\n').slice(1).join('\n');
        var bodyHtml = marked.parse(translateDocMd(body));
        // Colorize status codes in blockquotes (e.g. > Status 200)
        bodyHtml = bodyHtml.replace(
          /<blockquote>\s*<p>([^<]+?)\s*(\d{3})\s*<\/p>\s*<\/blockquote>/g,
          function(m, prefix, code) {
            var sc = parseInt(code);
            var cls = sc >= 200 && sc < 300 ? 'success' : (sc >= 400 ? 'error' : (sc >= 300 ? 'redirect' : 'info'));
            return '<blockquote><p>' + prefix + ' <span class="response-status ' + cls + '" style="display:inline-block;vertical-align:middle">' + code + '</span></p></blockquote>';
          }
        );
        if (!readOnly) {
          bodyHtml = injectDescEdits(bodyHtml, he, hid);
        }
        // Title field (on endpoint header) - default to URL if no title
        var titleVal = docTitle || url;
        var titleHtml = '';
        if (!readOnly) {
          titleHtml = '<div class="endpoint-title-row"><span class="title-icon">📌</span><input class="title-edit" data-hid="' + hid + '" value="' + esc(docTitle) + '" placeholder="' + esc(url) + '"></div>';
        } else if (titleVal) {
          titleHtml = '<div class="endpoint-title-row"><span class="title-icon">📌</span><span class="title-text">' + esc(titleVal) + '</span></div>';
        }
        html += '<div class="doc-endpoint">' + titleHtml + '<div class="doc-endpoint-header"><span class="doc-endpoint-method ' + method.toLowerCase() + '">' + method + '</span><span class="doc-endpoint-url">' + esc(url) + '</span>' + (!readOnly ? '<button class="btn btn-sm btn-primary btn-try" data-history-id="' + hid + '">' + _t('loadSend') + '</button><button class="btn btn-sm btn-icon btn-endpoint-del" data-history-id="' + hid + '" title="Delete endpoint">×</button>' : '') + '</div>' + '<div class="doc-endpoint-body">' + bodyHtml + '</div></div>';
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
        if (/description|描述/i.test(th.textContent)) descColIdx = ci;
      });
      if (descColIdx < 0) return;

      var rows = table.querySelectorAll('tr');
      var dataIdx = 0;

      for (var ri = 1; ri < rows.length; ri++) {
        var cells = rows[ri].querySelectorAll('td');
        if (descColIdx >= cells.length) continue;
        var cell = cells[descColIdx];
        var val = cell.textContent.trim();
        if (val === '-') val = '';
        cell.innerHTML = '<input class="desc-edit" data-hid="' + hid + '" data-idx="' + dataIdx + '" data-tbl="' + tableIdx + '" value="' + esc(val) + '" placeholder="' + _t('desc') + '">';
        dataIdx++;
      }
    });
    return div.innerHTML;
  }

  // Auto-save description on blur (delegated)
  document.addEventListener('blur', function(e) {
    var inp = e.target.closest('.desc-edit');
    if (inp) saveDescEdit(inp);
    var tinp = e.target.closest('.title-edit');
    if (tinp) saveTitleEdit(tinp);
  }, true);

  // Auto-save description on input (debounced)
  document.addEventListener('input', function(e) {
    var inp = e.target.closest('.desc-edit');
    if (inp) {
      clearTimeout(inp._descTimer);
      inp._descTimer = setTimeout(function() { saveDescEdit(inp); }, 600);
    }
    var tinp = e.target.closest('.title-edit');
    if (tinp) {
      clearTimeout(tinp._titleTimer);
      tinp._titleTimer = setTimeout(function() { saveTitleEdit(tinp); }, 600);
    }
  }, true);

  // Translate doc markdown from English/Chinese base to current language (before marked.parse)
  function translateDocMd(md) {
    var t = function(k) { return _t(k); };
    // Old Chinese strings (existing docs)
    md = md
      .replace(/^>\s*状态\s*(\d+)/gm, '> ' + t('status') + ' $1')
      .replace(/^###\s+请求头\b/gm, '### ' + t('requestHeaders'))
      .replace(/^###\s+请求体\b/gm, '### ' + t('requestBody'))
      .replace(/^###\s+响应示例\b/gm, '### ' + t('responseExample'))
      .replace(/\*\*类型\*\*/g, '**' + t('type') + '**')
      .replace(/\(响应过长已截断\)/g, '(' + t('responseTruncated') + ')');
    // New English strings
    md = md
      .replace(/^>\s*Status\b/gm, '> ' + t('status'))
      .replace(/\bRequest Headers\b/g, t('requestHeaders'))
      .replace(/\bRequest Body\b/g, t('requestBody'))
      .replace(/\bResponse Example\b/g, t('responseExample'))
      .replace(/\*\*Type\*\*/g, '**' + t('type') + '**')
      .replace(/\(response truncated\)/g, '(' + t('responseTruncated') + ')');
    // Table headers (both old and new docs)
    md = md
      .replace(/\|\s*\n\|[- \|]+\n\|/g, function(m) { return m; })
      .replace(/^\|[\s]*Key[\s]*\|/gm, '| ' + t('key') + ' |')
      .replace(/\|[\s]*Value[\s]*\|/g, '| ' + t('value') + ' |')
      .replace(/\|[\s]*Type[\s]*\|/g, '| ' + t('type') + ' |')
      .replace(/\|[\s]*Description[\s]*\|/g, '| ' + t('description') + ' |');
    // "desc" placeholder inside doc table cells (the value, not the header)
    return md;
  }

  // ==================== Doc Content Editing ====================
  // Update title in markdown content for a specific history-id section
  function updateMarkdownTitle(md, hid, title) {
    var marker = '<!--history-id:' + hid + '-->';
    var sections = md.split(/(?=^## )/m);
    for (var si = 0; si < sections.length; si++) {
      if (sections[si].indexOf(marker) >= 0) {
        sections[si] = sections[si].replace(
          /^(##\s+\d+\.\s+(?:GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\s+\S+)(?:\s+-\s+.*)?$/m,
          function(m, header) { return title ? header + ' - ' + title : header; }
        );
        break;
      }
    }
    return sections.join('');
  }

  // Update description in markdown content for a specific history-id section
  function updateMarkdownDescription(md, hid, tableIdx, fieldIdx, value) {
    var marker = '<!--history-id:' + hid + '-->';
    var sections = md.split(/(?=^## )/m);
    for (var si = 0; si < sections.length; si++) {
      if (sections[si].indexOf(marker) >= 0) {
        var lines = sections[si].split('\n');
        var currentTable = -1, rowCount = -1, inTable = false, headerLines = 0;

        for (var li = 0; li < lines.length; li++) {
          var line = lines[li];
          if (/^\|/.test(line.trim())) {
            if (!inTable) { inTable = true; headerLines = 1; currentTable++; rowCount = -1; continue; }
            if (headerLines === 1) { headerLines = 2; continue; }
            rowCount++;
            if (currentTable === tableIdx && rowCount === fieldIdx) {
              var cells = line.split('|');
              cells[cells.length - 2] = ' ' + value + ' ';
              lines[li] = cells.join('|');
              break;
            }
          } else {
            if (inTable) { inTable = false; headerLines = 0; }
          }
        }
        sections[si] = lines.join('\n');
        break;
      }
    }
    return sections.join('');
  }

  function saveDescEdit(inp) {
    var hid = inp.dataset.hid, idx = parseInt(inp.dataset.idx), tbl = parseInt(inp.dataset.tbl) || 0;
    if (!hid || !state.viewingDocId || !state._currentDocMd) return;
    state._currentDocMd = updateMarkdownDescription(state._currentDocMd, hid, tbl, idx, inp.value);
    fetch('/api/docs/' + state.viewingDocId, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ content: state._currentDocMd }) }).catch(function() {});
  }

  async function saveTitleEdit(inp) {
    var hid = inp.dataset.hid;
    if (!hid || !state.viewingDocId || !state._currentDocMd) return;
    state._currentDocMd = updateMarkdownTitle(state._currentDocMd, hid, inp.value);
    try {
      await fetch('/api/docs/' + state.viewingDocId, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ content: state._currentDocMd }) });
      if (state._currentDocMd && state.viewingDocId) {
        els.docViewerContent.innerHTML = renderDocContent(state._currentDocMd);
        rehighlight();
      }
    } catch(e) {}
  }

  function regenerateCurrentDoc() {
    if (!state.viewingDocId) return Promise.resolve();
    return fetch('/api/docs/' + state.viewingDocId + '/regenerate', { method: 'POST' }).then(function(r) { return r.json(); }).then(function(doc) {
      state._currentDocMd = doc.content;
    }).catch(function() {});
  }

  function closeDocViewer() { state.viewingDocId = null; state._currentDocMd = null; state._docHistory = null; state._docAlias = null; els.viewRequest.classList.remove('hidden'); els.viewDoc.classList.add('hidden'); window.location.hash = ''; if (!els.panelDocs.classList.contains('hidden')) renderDocsSelection(); }

  function copyShareLink(id) {
    var alias = state._docAlias;
    if (!alias && state._docs) {
      var d = (state._docs || []).find(function(x) { return x.id === id; });
      if (d) alias = d.alias;
    }
    var url = window.location.origin + '/share/' + (alias || id);
    navigator.clipboard.writeText(url).then(function() { showToast(_t('shareLinkCopied'), 'success'); }).catch(function() { showToast(_t('copyFailed'), 'error'); });
  }

  function downloadCurrentDoc() {
    if (!state._currentDocMd || !state.viewingDocId) return;
    var title = els.docViewerTitle.value.trim() || 'api-docs';
    var b = new Blob([state._currentDocMd], { type: 'text/markdown' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(b);
    a.download = title.replace(/[^a-zA-Z0-9\u4e00-\u9fa5\-_]/g, '_') + '.md';
    a.click();
    URL.revokeObjectURL(a.href);
    showToast(_t('downloaded'), 'success');
  }

  // ==================== Docs Modal ====================
  function defaultDocTitle() {
    var d = new Date();
    var pad = function(n) { return String(n).padStart(2, '0'); };
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) + ' ' +
           pad(d.getHours()) + ':' + pad(d.getMinutes()) + ':' + pad(d.getSeconds());
  }
  function uniqueDocTitle(base) {
    var titles = new Set((state._docs || []).map(function(d) { return d.title; }));
    if (!titles.has(base)) return base;
    var i = 2;
    while (titles.has(base + ' (' + i + ')')) i++;
    return base + ' (' + i + ')';
  }

  async function openDocsModal() {
    if (!state.selectedHistoryIds.size) { showToast(_t('selectEntriesFirst'), 'error'); return; }
    state._autoDocTitle = uniqueDocTitle(defaultDocTitle());
    els.docsSaveTitle.value = state._autoDocTitle;
    els.saveModeSelect.value = 'new';
    els.appendDocPicker.classList.add('hidden');
    els.btnSaveDocs.classList.remove('hidden');
    els.btnAppendDocs.classList.add('hidden');
    // Populate doc picker
    var picker = els.appendDocSelect;
    picker.innerHTML = '';
    (state._docs || []).forEach(function(d) {
      var opt = document.createElement('option');
      opt.value = d.id;
      opt.textContent = d.title;
      picker.appendChild(opt);
    });
    els.docsModal.classList.remove('hidden'); els.shareInfoBox.classList.add('hidden');
    els.docsModalContent.innerHTML = '<div style="text-align:center;padding:40px;"><span class="spinner"></span> ' + _t('sending') + '</div>';
    try {
      var r = await fetch('/api/docs/generate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ids: Array.from(state.selectedHistoryIds) }) });
      var md = await r.text(); state.currentDocMd = md;
      els.docsModalContent.innerHTML = renderDocContent(md, true);
      rehighlight();
    } catch(e) { els.docsModalContent.innerHTML = '<p style="color:var(--danger)">' + _t('failed') + ': ' + e.message + '</p>'; }
  }
  function closeDocsModal() { els.docsModal.classList.add('hidden'); els.shareInfoBox.classList.add('hidden'); state.currentDocMd = ''; state.savedDocId = null; state._autoDocTitle = null; }

  async function appendDocs() {
    var docId = els.appendDocSelect.value;
    if (!docId) { showToast(_t('noDocumentsSelected'), 'error'); return; }
    try {
      var r = await fetch('/api/docs/' + docId + '/append', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ historyIds: Array.from(state.selectedHistoryIds) }) });
      if (!r.ok) { showToast(_t('failed'), 'error'); return; }
      els.docsModal.classList.add('hidden');
      state.selectedHistoryIds.clear(); renderHistory();
      await loadDocs();
      window.location.hash = '#/docs/' + docId;
      showToast(_t('savedNotShared'), 'success');
    } catch(e) { showToast(_t('failed'), 'error'); }
  }
  async function copyDocs() { try { var r = await fetch('/api/docs/generate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ids: Array.from(state.selectedHistoryIds) }) }); await navigator.clipboard.writeText(await r.text()); showToast(_t('copied'), 'success'); } catch(e) { showToast(_t('failed'), 'error'); } }
  async function downloadDocs() { try { var r = await fetch('/api/docs/generate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ids: Array.from(state.selectedHistoryIds) }) }); var b = new Blob([await r.text()], { type: 'text/markdown' }); var a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = 'api-docs.md'; a.click(); URL.revokeObjectURL(a.href); showToast(_t('downloaded'), 'success'); } catch(e) { showToast(_t('failed'), 'error'); } }
  async function saveDocs() {
    var title = els.docsSaveTitle.value.trim();
    if (!title) { showToast(_t('enterTitle'), 'error'); els.docsSaveTitle.focus(); return; }
    if (title !== state._autoDocTitle) {
      var dup = (state._docs || []).some(function(d) { return d.title === title; });
      if (dup) { showToast(_t('titleExists'), 'error'); return; }
    }
    try {
      var r = await fetch('/api/docs/save', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title: title, historyIds: Array.from(state.selectedHistoryIds) }) });
      var doc = await r.json(); state.savedDocId = doc.id;
      els.shareInfoBox.classList.add('hidden');
      state.selectedHistoryIds.clear(); renderHistory(); showToast(_t('savedNotShared'), 'success');
      state.sidebarTab = 'docs'; switchSidebar('docs'); await loadDocs();
    } catch(e) { showToast(_t('failed') + ': ' + e.message, 'error'); }
  }

  // Load & Send / Delete endpoint from doc viewer
  document.addEventListener('click', async function(e) {
    var btn = e.target.closest('.btn-try');
    if (btn) {
      var hid = btn.dataset.historyId; if (!hid) return;
      try {
        var r = await fetch('/api/history'); var entries = await r.json();
        var entry = entries.find(function(x) { return x.id === hid; });
        if (entry) { closeDocViewer(); window.location.hash = '#/history/' + hid; showToast(_t('requestLoadedClickSend')); }
        else { showToast(_t('historyNotFound'), 'error'); }
      } catch(ex) { showToast(_t('failed'), 'error'); }
      return;
    }
    var del = e.target.closest('.btn-endpoint-del');
    if (del) {
      var hid = del.dataset.historyId; if (!hid || !state.viewingDocId || !state._currentDocMd) return;
      var marker = '<!--history-id:' + hid + '-->';
      var sections = state._currentDocMd.split(/(?=^## )/m);
      var found = -1;
      for (var si = 0; si < sections.length; si++) {
        if (sections[si].indexOf(marker) >= 0) { found = si; break; }
      }
      if (found < 0) return;
      sections.splice(found, 1);
      state._currentDocMd = sections.join('');
      try {
        await fetch('/api/docs/' + state.viewingDocId, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ content: state._currentDocMd }) });
        await loadDocs();
        els.docViewerContent.innerHTML = renderDocContent(state._currentDocMd);
        rehighlight();
      } catch(ex) { showToast(_t('failed'), 'error'); }
    }
  });

  // ==================== Utilities ====================
  function readFileAsBase64(file) { return new Promise(function(resolve, reject) { var r = new FileReader(); r.onload = function() { resolve(r.result.split(',')[1]); }; r.onerror = reject; r.readAsDataURL(file); }); }
  function esc(str) { if (!str) return ''; var d = document.createElement('div'); d.textContent = str; return d.innerHTML; }
  function showToast(msg, type) { els.toast.textContent = msg; els.toast.className = 'toast ' + (type || ''); els.toast.classList.remove('hidden'); clearTimeout(state._toastTimer); state._toastTimer = setTimeout(function() { els.toast.classList.add('hidden'); }, 2500); }
  function confirmDialog(title, message, okText) {
    title = title || _t('confirmTitle'); message = message || ''; okText = okText || _t('deleteConfirmTitle');
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
