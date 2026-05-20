/* ══════════════════════════════════════════════════════════════
   KOS ULTIMATE 2026 — apps/browser.js
   Chrome-style browser "Kalapurackal Smooth"
   Registered to WM as: KOSApps.browser
   ══════════════════════════════════════════════════════════════ */

window.KOSApps = window.KOSApps || {};

window.KOSApps.browser = {
  /* State */
  _tabs:    [{ url: 'https://en.wikipedia.org', title: 'Wikipedia' }],
  _active:  0,
  _history: [['https://en.wikipedia.org']],
  _histIdx: [0],
  _loading: false,

  /* Called by WM on every open */
  init() {
    this.renderTabs();
    this.updateURLBar();
    this._attachFrameEvents();
  },

  _attachFrameEvents() {
    const frame = document.getElementById('br-frame');
    if (!frame) return;
    frame.addEventListener('load', () => {
      this._setLoading(false);
      try {
        const t = frame.contentDocument?.title;
        if (t) { this._tabs[this._active].title = t; this.renderTabs(); }
      } catch (_) {}
      this.updateURLBar();
    });
  },

  _setLoading(state) {
    this._loading = state;
    const bar  = document.getElementById('br-progress-bar');
    const icon = document.getElementById('br-reload-icon');
    if (bar)  bar.classList.toggle('loading', state);
    if (icon) icon.className = state ? 'fa-solid fa-xmark' : 'fa-solid fa-rotate-right';
  },

  navigate(rawInput) {
    let url = rawInput.trim();
    if (!url) return;
    if (!/^https?:\/\//i.test(url)) {
      url = /^[\w-]+\.[\w.-]+(\/.*)?$/.test(url)
        ? 'https://' + url
        : 'https://duckduckgo.com/?q=' + encodeURIComponent(url);
    }
    const hist = this._history[this._active];
    this._history[this._active] = hist.slice(0, this._histIdx[this._active] + 1);
    this._history[this._active].push(url);
    this._histIdx[this._active] = this._history[this._active].length - 1;
    this._tabs[this._active].url   = url;
    this._tabs[this._active].title = this._getDomain(url);
    this._loadFrame(url);
    this.renderTabs();
    this.updateURLBar();
  },

  _loadFrame(url) {
    const frame = document.getElementById('br-frame');
    if (!frame) return;
    this._setLoading(true);
    frame.src = url;
  },

  back() {
    const idx = this._histIdx[this._active];
    if (idx <= 0) return;
    this._histIdx[this._active]--;
    const url = this._history[this._active][this._histIdx[this._active]];
    this._tabs[this._active].url = url;
    this._loadFrame(url);
    this.updateURLBar();
  },

  forward() {
    const hist = this._history[this._active];
    const idx  = this._histIdx[this._active];
    if (idx >= hist.length - 1) return;
    this._histIdx[this._active]++;
    const url = hist[this._histIdx[this._active]];
    this._tabs[this._active].url = url;
    this._loadFrame(url);
    this.updateURLBar();
  },

  reload() {
    const frame = document.getElementById('br-frame');
    if (!frame) return;
    if (this._loading) { frame.src = frame.src; this._setLoading(false); }
    else { this._setLoading(true); frame.src = frame.src; }
  },

  newTab(url = 'https://en.wikipedia.org') {
    this._tabs.push({ url, title: 'New Tab' });
    this._history.push([url]);
    this._histIdx.push(0);
    this.switchTab(this._tabs.length - 1);
  },

  closeTab(idx) {
    if (this._tabs.length === 1) return;
    this._tabs.splice(idx, 1);
    this._history.splice(idx, 1);
    this._histIdx.splice(idx, 1);
    if (this._active >= this._tabs.length) this._active = this._tabs.length - 1;
    else if (this._active > idx) this._active--;
    this.switchTab(this._active);
  },

  switchTab(idx) {
    this._active = idx;
    this._loadFrame(this._tabs[idx].url);
    this.renderTabs();
    this.updateURLBar();
  },

  renderTabs() {
    const row = document.getElementById('br-tabs-row');
    if (!row) return;
    row.innerHTML = this._tabs.map((tab, i) => {
      const active = i === this._active;
      const domain = this._getDomain(tab.url);
      const favicon = `https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=16`;
      return `<div class="br-tab ${active ? 'active' : ''}" onclick="Browser.switchTab(${i})">
        <img class="br-favicon" src="${favicon}" onerror="this.style.display='none'" alt="">
        <span class="br-tab-title">${tab.title || domain || 'New Tab'}</span>
        <button class="br-tab-x" onclick="event.stopPropagation();Browser.closeTab(${i})" title="Close tab">×</button>
      </div>`;
    }).join('') + `<button class="br-newtab-btn" onclick="Browser.newTab()" title="New tab">+</button>`;
  },

  updateURLBar() {
    const input  = document.getElementById('br-url-input');
    const lockEl = document.getElementById('br-lock-icon');
    if (!input) return;
    const url     = this._tabs[this._active]?.url || '';
    input.value   = url;
    const isHttps = url.startsWith('https://');
    if (lockEl) {
      lockEl.className = isHttps
        ? 'fa-solid fa-lock br-lock-icon secure'
        : 'fa-solid fa-lock-open br-lock-icon insecure';
      lockEl.title = isHttps ? 'Connection is secure' : 'Connection is not secure';
    }
    const backBtn = document.getElementById('br-btn-back');
    const fwdBtn  = document.getElementById('br-btn-fwd');
    if (backBtn) backBtn.disabled = this._histIdx[this._active] <= 0;
    if (fwdBtn)  fwdBtn.disabled  = this._histIdx[this._active] >= this._history[this._active].length - 1;
  },

  handleKey(e) { if (e.key === 'Enter') this.navigate(e.target.value); },

  bookmark() {
    const starEl = document.getElementById('br-star-icon');
    if (starEl) {
      starEl.className = 'fa-solid fa-star';
      starEl.style.color = '#f5a623';
      showToast('Bookmarked! (demo)');
      setTimeout(() => { starEl.className = 'fa-regular fa-star'; starEl.style.color = ''; }, 2000);
    }
  },

  _getDomain(url) {
    try { return new URL(url).hostname.replace('www.', ''); } catch { return url; }
  },
};

/* Expose as global alias for inline onclick compatibility */
const Browser = window.KOSApps.browser;

/* Register init hook with WM */
WM.setOnOpen('browser', () => Browser.init());