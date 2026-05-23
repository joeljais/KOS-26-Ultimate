/* ═══════════════════════════════════════════════════════════
   KOS ULTIMATE 2026 — apps/files.js
   Files App — KOSFS Liquid Glass Windows Explorer Edition

   Storage: kos-filesystem (unified IDB via KOSFS kernel)
   Permissions: '*'  — can read/write all file types
   UI Concept: Windows Explorer blended with Liquid Glass OS
   ═══════════════════════════════════════════════════════════ */

'use strict';
window.KOSApps = window.KOSApps || {};

/* ═══════════════════════════════════════════════════════════
   §1  CONSTANTS & CONFIG
═══════════════════════════════════════════════════════════ */
const FILES_APP_ID = 'files';

const FOLDER_TO_TYPE = {
  photos    : 'image',
  videos    : 'video',
  audios    : 'audio',
  documents : 'document',
};

const FOLDERS = [
  { id: 'system',      label: 'System',      icon: 'fa-microchip',       iconClass: 'fi-icon-system', uploadable: false, deletable: false, downloadable: false },
  { id: 'photos',      label: 'Photos',      icon: 'fa-image',           iconClass: 'fi-icon-image',  uploadable: true,  deletable: true,  downloadable: true  },
  { id: 'videos',      label: 'Videos',      icon: 'fa-film',            iconClass: 'fi-icon-video',  uploadable: true,  deletable: true,  downloadable: true  },
  { id: 'audios',      label: 'Audios',      icon: 'fa-music',           iconClass: 'fi-icon-audio',  uploadable: true,  deletable: true,  downloadable: true  },
  { id: 'documents',   label: 'Documents',   icon: 'fa-file-lines',      iconClass: 'fi-icon-doc',    uploadable: true,  deletable: true,  downloadable: true  },
  { id: 'custom-apps', label: 'Custom Apps', icon: 'fa-window-maximize', iconClass: 'fi-icon-app',    uploadable: false, deletable: false, downloadable: false },
];

const FOLDER_ACCEPT = {
  photos    : 'image/*',
  videos    : 'video/*',
  audios    : 'audio/*',
  documents : '.txt,.md,.csv,.json,text/plain,text/markdown',
};

/* ═══════════════════════════════════════════════════════════
   §2  APP STATE
═══════════════════════════════════════════════════════════ */
const FI = {
  _folder       : 'photos',   
  _view         : 'grid',     
  _counts       : {},
  _items        : [],          
  _loading      : false,
  _search       : '',          
  _blobCache    : new Map(),   
  _busOff       : [],
  _modalResolve : null, // Resolution trigger wrapper for custom modal handler
};

const BLOB_CACHE_MAX = 30;

/* ═══════════════════════════════════════════════════════════
   §3  BLOB URL CACHE
═══════════════════════════════════════════════════════════ */
function _cacheGetURL(id) { return FI._blobCache.get(id) ?? null; }

function _cacheSetURL(id, url) {
  if (FI._blobCache.size >= BLOB_CACHE_MAX) {
    const firstKey = FI._blobCache.keys().next().value;
    URL.revokeObjectURL(FI._blobCache.get(firstKey));
    FI._blobCache.delete(firstKey);
  }
  FI._blobCache.set(id, url);
}

function _cacheEvict(id) {
  const url = FI._blobCache.get(id);
  if (url) { URL.revokeObjectURL(url); FI._blobCache.delete(id); }
}

function _cacheFlush() {
  FI._blobCache.forEach(url => URL.revokeObjectURL(url));
  FI._blobCache.clear();
}

async function _getBlobURL(fileId) {
  const cached = _cacheGetURL(fileId);
  if (cached) return cached;
  const url = await KOSFS.readObjectURL(FILES_APP_ID, fileId);
  _cacheSetURL(fileId, url);
  return url;
}

/* ═══════════════════════════════════════════════════════════
   §4  UTILITIES
═══════════════════════════════════════════════════════════ */
function _fmtDate(ts) {
  if (!ts) return '—';
  try {
    const d = typeof ts === 'number' ? new Date(ts) : new Date(ts);
    return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
  } catch { return String(ts); }
}

function _esc(s) {
  return (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function _iconClass(type) {
  return { image: 'fi-icon-image', video: 'fi-icon-video', audio: 'fi-icon-audio', document: 'fi-icon-doc', app: 'fi-icon-app' }[type] ?? 'fi-icon-system';
}

function _faIcon(type, fallbackIcon) {
  if (fallbackIcon) return `<i class="fa-solid ${fallbackIcon}"></i>`;
  return {
    image    : '<i class="fa-solid fa-image"></i>',
    video    : '<i class="fa-solid fa-film"></i>',
    audio    : '<i class="fa-solid fa-music"></i>',
    document : '<i class="fa-solid fa-file-lines"></i>',
    app      : '<i class="fa-solid fa-window-maximize"></i>',
  }[type] ?? '<i class="fa-solid fa-file"></i>';
}

/* ═══════════════════════════════════════════════════════════
   §5  MAIN APP OBJECT
═══════════════════════════════════════════════════════════ */
window.KOSApps.files = {
  async init() {
    const body = document.getElementById('files-body');
    if (!body) return;

    const manifest = (typeof AppManifest !== 'undefined') ? AppManifest.find(a => a.id === FILES_APP_ID) : null;
    KOSFS.registerApp(FILES_APP_ID, manifest?.permissions ?? ['*']);

    await KOSFS.ready;
    _renderShell(body);
    await _loadFolder(FI._folder);

    const onWrite = ({ writtenBy }) => { if (writtenBy !== FILES_APP_ID) _refreshSilent(); };
    const onDelete = ({ writtenBy }) => { if (writtenBy !== FILES_APP_ID) _refreshSilent(); };
    const onUpdate = ({ id, patch }) => { if (patch.name) _patchItemName(id, patch.name); };

    KOSBus.on('kos:fs-write',  onWrite);
    KOSBus.on('kos:fs-delete', onDelete);
    KOSBus.on('kos:fs-update', onUpdate);

    FI._busOff = [
      () => KOSBus.off?.('kos:fs-write',  onWrite),
      () => KOSBus.off?.('kos:fs-delete', onDelete),
      () => KOSBus.off?.('kos:fs-update', onUpdate),
    ];
  },
  refresh() { _loadFolder(FI._folder); },
};

/* ═══════════════════════════════════════════════════════════
   §6  SHELL RENDER STRUCTURAL OVERHAUL
═══════════════════════════════════════════════════════════ */
function _renderShell(body) {
  body.innerHTML = `
    <div class="fi-app" id="fi-app">
      <input type="file" id="fi-file-input" multiple style="display:none">

      <!-- TOP CONTAINER: Windows Ribbon Command Bar Integration -->
      <header class="fi-ribbon">
        <button class="fi-ribbon-btn" id="fi-btn-import" onclick="window._fiTriggerUpload()">
          <i class="fa-solid fa-cloud-arrow-up" style="color:#0078d4"></i> Import
        </button>
        <button class="fi-ribbon-btn" id="fi-btn-download" disabled onclick="window._fiTriggerDownloadSelected()">
          <i class="fa-solid fa-download" style="color:#107c41"></i> Download
        </button>
        <button class="fi-ribbon-btn" id="fi-btn-delete" disabled onclick="window._fiTriggerDeleteSelected()">
          <i class="fa-solid fa-trash" style="color:#e81123"></i> Delete
        </button>
        <div class="fi-ribbon-sep"></div>
        <button class="fi-ribbon-btn" id="fi-btn-view-toggle" onclick="window._fiToggleViewMode()">
          <i class="fa-solid fa-table-cells"></i> Change View
        </button>
      </header>

      <!-- NAVIGATION ROW: Address Line and Dynamic Target Queries -->
      <section class="fi-nav-bar">
        <div class="fi-history-controls">
          <button class="fi-hist-btn" title="Back"><i class="fa-solid fa-arrow-left"></i></button>
          <button class="fi-hist-btn" title="Forward"><i class="fa-solid fa-arrow-right"></i></button>
          <button class="fi-hist-btn" title="Up"><i class="fa-solid fa-arrow-up"></i></button>
        </div>
        
        <div class="fi-address-box">
          <i class="fa-solid fa-display fi-address-pc-icon"></i>
          <span class="fi-address-sep"><i class="fa-solid fa-chevron-right"></i></span>
          <span>This PC</span>
          <span class="fi-address-sep"><i class="fa-solid fa-chevron-right"></i></span>
          <span id="fi-address-current-node" style="font-weight: 500;">Photos</span>
        </div>

        <div class="fi-search-container">
          <i class="fa-solid fa-magnifying-glass fi-search-glass"></i>
          <input type="text" id="fi-search-input" placeholder="Search files..." autocomplete="off" oninput="window._fiOnSearch(this.value)">
        </div>

        <button class="fi-hist-btn" onclick="window.KOSApps.files.refresh()" title="Refresh Explorer"><i class="fa-solid fa-rotate-right"></i></button>
      </section>

      <!-- TWO-PANE EXPLORER WORKSPACE -->
      <div class="fi-workspace">
        <!-- Sidebar Navigation Pane -->
        <aside class="fi-nav-pane">
          <div class="fi-nav-header">Quick Access</div>
          <div id="fi-nav-pane-list">
            ${FOLDERS.map(f => `
              <div class="fi-nav-item${f.id === FI._folder ? ' active' : ''}" data-folder-id="${f.id}" onclick="window._fiSetFolder('${f.id}')">
                <i class="fa-solid ${f.icon} ${f.iconClass || ''}"></i>
                <span>${f.label}</span>
                <span class="fi-nav-badge" id="fi-pane-count-${f.id}">0</span>
              </div>
            `).join('')}
          </div>
        </aside>

        <!-- Dynamic Content Engine Window -->
        <main class="fi-explorer-view" id="fi-explorer-view"
              ondragover="event.preventDefault(); event.currentTarget.classList.add('fi-drag-over-zone')"
              ondragleave="event.currentTarget.classList.remove('fi-drag-over-zone')"
              ondrop="event.preventDefault(); event.currentTarget.classList.remove('fi-drag-over-zone'); window._fiHandleDrop(event.dataTransfer.files)">
          <div class="fi-content-wrapper" id="fi-content-wrapper"></div>
        </main>
      </div>

      <!-- STATUS BAR SYSTEM FOOTER -->
      <footer class="fi-status-bar">
        <div class="fi-status-segment" id="fi-status-left">0 items</div>
        <div class="fi-status-segment" id="fi-status-right">Liquid Glass UI Engine v2.6</div>
      </footer>

      <!-- IN-APP INTEGRATED LIQUID GLASS DIALOG MODAL -->
      <div class="fi-modal-overlay" id="fi-modal-overlay">
        <div class="fi-dialog-box">
          <div class="fi-dialog-header">
            <i class="fa-solid fa-triangle-exclamation" style="color:#e81123"></i>
            <span>Confirm File Operation</span>
          </div>
          <div class="fi-dialog-body" id="fi-dialog-message">
            Are you sure you want to permanently delete this object?
          </div>
          <div class="fi-dialog-footer">
            <button class="fi-dialog-btn fi-dialog-btn-cancel" onclick="window._fiCloseModal(false)">Cancel</button>
            <button class="fi-dialog-btn fi-dialog-btn-danger" id="fi-dialog-confirm-btn" onclick="window._fiCloseModal(true)">Delete</button>
          </div>
        </div>
      </div>

      <div class="fi-toast" id="fi-toast"></div>
    </div>
  `;

  document.getElementById('fi-file-input').addEventListener('change', e => {
    _handleUpload(Array.from(e.currentTarget.files || []));
    e.currentTarget.value = '';
  });

  _syncToolbar(FI._folder);
}

/* ═══════════════════════════════════════════════════════════
   §7  APP-BOUND DIALOG COMPONENT RUNTIME ENGINE
═══════════════════════════════════════════════════════════ */
function _showConfirmModal(message) {
  return new Promise((resolve) => {
    const overlay = document.getElementById('fi-modal-overlay');
    const msgBox = document.getElementById('fi-dialog-message');
    if (!overlay || !msgBox) {
      resolve(false); // Fallback configuration safety rule
      return;
    }
    msgBox.textContent = message;
    overlay.classList.add('active');
    FI._modalResolve = resolve;
  });
}

window._fiCloseModal = function (value) {
  const overlay = document.getElementById('fi-modal-overlay');
  if (overlay) overlay.classList.remove('active');
  if (FI._modalResolve) {
    FI._modalResolve(value);
    FI._modalResolve = null;
  }
};

/* ═══════════════════════════════════════════════════════════
   §8  FOLDER NAVIGATION RUNTIME
═══════════════════════════════════════════════════════════ */
window._fiSetFolder = async function (id) {
  FI._folder = id;
  FI._search = '';
  FI._selectedId = null;

  document.querySelectorAll('.fi-nav-item').forEach(el => {
    el.classList.toggle('active', el.dataset.folderId === id);
  });

  const folder = FOLDERS.find(f => f.id === id);
  const addrNode = document.getElementById('fi-address-current-node');
  if (addrNode) addrNode.textContent = folder?.label || id;

  _syncToolbar(id);
  await _loadFolder(id);
};

function _syncToolbar(id) {
  const folder = FOLDERS.find(f => f.id === id);
  const importBtn = document.getElementById('fi-btn-import');
  const searchInput = document.getElementById('fi-search-input');

  if (importBtn) importBtn.style.disabled = !folder?.uploadable;
  if (importBtn) importBtn.style.opacity = folder?.uploadable ? "1" : "0.4";
  if (searchInput) searchInput.value = '';

  const input = document.getElementById('fi-file-input');
  if (input && FOLDER_ACCEPT[id]) input.accept = FOLDER_ACCEPT[id];
  _updateActionRibbon();
}

window._fiToggleViewMode = function () {
  FI._view = (FI._view === 'grid') ? 'list' : 'grid';
  _renderItems();
};

window._fiSetView = function (view) {
  FI._view = view;
  _renderItems();
};

window._fiOnSearch = function (val) {
  FI._search = val.trim().toLowerCase();
  _renderItems();
};

/* ═══════════════════════════════════════════════════════════
   §9  CORE EXPLORER DATA SYSTEM
═══════════════════════════════════════════════════════════ */
async function _loadFolder(id) {
  const wrapper = document.getElementById('fi-content-wrapper');
  if (!wrapper || FI._loading) return;
  FI._loading = true;

  wrapper.innerHTML = `<div class="fi-loading-box"><div class="fi-spinner-ring"></div><span>Reading volume metrics...</span></div>`;

  try {
    switch (id) {
      case 'system':      FI._items = _loadSystem();            break;
      case 'custom-apps': FI._items = _loadCustomApps();        break;
      default: {
        const type = FOLDER_TO_TYPE[id];
        if (type) {
          FI._items = await KOSFS.list(FILES_APP_ID, { type });
        } else {
          FI._items = [];
        }
      }
    }
  } catch (err) {
    FI._items = [];
    console.warn('[Files Explorer] Loading anomaly encountered:', err);
  }

  FI._loading = false;
  _updateCount(id, FI._items.length);
  _renderItems();
  _updateStatusBar();
}

async function _refreshSilent() {
  const id = FI._folder;
  const type = FOLDER_TO_TYPE[id];
  if (!type) return;

  try {
    FI._items = await KOSFS.list(FILES_APP_ID, { type });
    _updateCount(id, FI._items.length);
    _renderItems();
    _updateStatusBar();
  } catch (err) {
    console.warn('[Files Explorer] Silent sync deferred:', err);
  }
}

function _patchItemName(fileId, newName) {
  const item = FI._items.find(f => f.id === fileId);
  if (!item) return;
  item.name = newName;
  document.querySelectorAll(`[data-file-id="${fileId}"] .fi-win-label, [data-file-id="${fileId}"] .fi-list-title-text`)
    .forEach(el => { el.textContent = newName; el.title = newName; });
}

function _loadSystem() {
  if (typeof AppManifest === 'undefined') return [];
  return AppManifest.map(a => ({
    id         : a.id,
    type       : 'system',
    name       : a.name,
    icon       : a.faIcon  || 'fa-square',
    iconClass  : a.iconClass || '',
    meta       : a.metadata?.isSystemApp ? 'System Architecture' : 'User Module',
    size       : 0,
    createdAt  : Date.now()
  }));
}

function _loadCustomApps() {
  try {
    const apps = JSON.parse(localStorage.getItem('kos-studio-apps') || '[]');
    return apps.map(a => ({
      id          : a.id,
      type        : 'app',
      name        : a.name || 'Untitled Container',
      published   : a.published,
      publishType : a.publishType,
      size        : 1024,
      createdAt   : Date.now()
    }));
  } catch { return []; }
}

function _updateCount(folderId, count) {
  const badge = document.getElementById(`fi-pane-count-${folderId}`);
  if (badge) badge.textContent = count;
}

/* ═══════════════════════════════════════════════════════════
   §10  EXPLORER RENDERING INTERACTION CONTROLS
═══════════════════════════════════════════════════════════ */
function _renderItems() {
  const wrapper = document.getElementById('fi-content-wrapper');
  if (!wrapper) return;

  let filtered = FI._items;
  if (FI._search) {
    filtered = filtered.filter(f => (f.name || '').toLowerCase().includes(FI._search));
  }

  if (filtered.length === 0) {
    wrapper.innerHTML = `
      <div class="fi-empty-box">
        <i class="fa-solid fa-folder-open" style="font-size: 32px; color: #0078d4; opacity: 0.5;"></i>
        <span>This folder is empty.</span>
      </div>`;
    _updateStatusBar();
    return;
  }

  if (FI._view === 'grid') {
    wrapper.innerHTML = `<div class="fi-explorer-grid">${filtered.map(f => _buildGridCardHTML(f)).join('')}</div>`;
    filtered.forEach(f => { if (f.type === 'image') _lazyLoadThumbnail(f.id); });
  } else {
    wrapper.innerHTML = `
      <div class="fi-explorer-list">
        <div class="fi-list-header-row">
          <span>Name</span>
          <span>Date Modified</span>
          <span>Size</span>
        </div>
        ${filtered.map(f => _buildListRowHTML(f)).join('')}
      </div>`;
  }
  _updateActionRibbon();
}

function _buildGridCardHTML(item) {
  const isSel = FI._selectedId === item.id;
  const iClass = _iconClass(item.type || 'system');
  
  return `
    <div class="fi-win-card${isSel ? ' selected' : ''}" 
         data-file-id="${item.id}" 
         onclick="window._fiSelectItem('${item.id}', event)" 
         ondblclick="window._fiOpenItem('${item.id}')">
      <div class="fi-win-thumb ${iClass}" id="fi-thumb-${item.id}">
        ${item.icon ? `<i class="fa-solid ${item.icon}"></i>` : _faIcon(item.type)}
      </div>
      <div class="fi-win-label" title="${_esc(item.name)}">${_esc(item.name)}</div>
    </div>
  `;
}

function _buildListRowHTML(item) {
  const isSel = FI._selectedId === item.id;
  const iClass = _iconClass(item.type || 'system');
  const sizeStr = item.size ? KOSFS.formatSize(item.size) : '—';
  const dateStr = _fmtDate(item.createdAt || item.date);

  return `
    <div class="fi-list-row${isSel ? ' selected' : ''}" 
         data-file-id="${item.id}" 
         onclick="window._fiSelectItem('${item.id}', event)" 
         ondblclick="window._fiOpenItem('${item.id}')">
      <div class="fi-list-file-meta">
        <span class="${iClass}" style="margin-right: 4px;">
          ${item.icon ? `<i class="fa-solid ${item.icon}"></i>` : _faIcon(item.type)}
        </span>
        <span class="fi-list-title-text" title="${_esc(item.name)}" style="overflow:hidden; text-overflow:ellipsis;">${_esc(item.name)}</span>
      </div>
      <div>${dateStr}</div>
      <div>${sizeStr}</div>
    </div>
  `;
}

async function _lazyLoadThumbnail(id) {
  try {
    const url = await _getBlobURL(id);
    const container = document.getElementById(`fi-thumb-${id}`);
    if (container) {
      container.innerHTML = `<img src="${url}" alt="thumb" loading="lazy">`;
    }
  } catch (err) {
    console.warn("[Files Thumb] Failed processing image thumbnail asset mapping:", err);
  }
}

/* ═══════════════════════════════════════════════════════════
   §11  SELECTION & CONTROL MANAGEMENT
═══════════════════════════════════════════════════════════ */
window._fiSelectItem = function (id, event) {
  event.stopPropagation();
  
  if (FI._selectedId) {
    document.querySelectorAll(`[data-file-id="${FI._selectedId}"]`).forEach(el => el.classList.remove('selected'));
  }

  if (FI._selectedId === id) {
    FI._selectedId = null; 
  } else {
    FI._selectedId = id;
    document.querySelectorAll(`[data-file-id="${id}"]`).forEach(el => el.classList.add('selected'));
  }
  
  _updateActionRibbon();
  _updateStatusBar();
};

function _updateActionRibbon() {
  const folder = FOLDERS.find(f => f.id === FI._folder);
  const hasSel = FI._selectedId !== null && FI._selectedId !== undefined;
  
  const dwnBtn = document.getElementById('fi-btn-download');
  const delBtn = document.getElementById('fi-btn-delete');

  if (dwnBtn) dwnBtn.disabled = !(hasSel && folder?.downloadable);
  if (delBtn) delBtn.disabled = !(hasSel && folder?.deletable);
}

function _updateStatusBar() {
  const totalItems = FI._items.length;
  let textLeft = `${totalItems} item${totalItems === 1 ? '' : 's'}`;
  
  if (FI._selectedId) {
    const matched = FI._items.find(f => String(f.id) === String(FI._selectedId));
    if (matched) {
      textLeft += ` &nbsp;|&nbsp; 1 item selected &nbsp; (${matched.size ? KOSFS.formatSize(matched.size) : '0 B'})`;
    }
  }
  
  const leftBar = document.getElementById('fi-status-left');
  if (leftBar) leftBar.innerHTML = textLeft;
}

/* ═══════════════════════════════════════════════════════════
   §12  EXECUTION AND BACKEND TRUCKING PROXIES (UPDATED)
═══════════════════════════════════════════════════════════ */
window._fiOpenItem = async function (id) {
  const item = FI._items.find(f => String(f.id) === String(id));
  if (!item) return;

  if (FI._folder === 'system') {
    if (typeof WM !== 'undefined') WM.launch(item.id);
    return;
  }
  if (FI._folder === 'custom-apps') {
    if (typeof WM !== 'undefined') WM.launch(item.id);
    return;
  }

  // INTER-APP ROUTING: Route audio streams directly to the new Spotify-style Music App
  if (item.type === 'audio') {
    if (typeof WM !== 'undefined') {
      // 1. Wake up or shift focus to the Music App window frame
      WM.launch('music'); 
      
      // 2. Allow a brief 600ms window layout rendering pause, then push the track target
      setTimeout(() => {
        if (window.KOSApps.music && typeof window.KOSApps.music.playTrackDirectly === 'function') {
          window.KOSApps.music.playTrackDirectly(item.id);
        }
      }, 600);
    }
    return;
  }

  try {
    // Route image and video handling to native browser previews
    if (item.type === 'image' || item.type === 'video') {
      const url = await _getBlobURL(item.id);
      const win = window.open(url, '_blank');
      if (win) win.focus();
    } else if (item.type === 'document') {
      // Route textual nodes directly to the Notes workspace stack
      if (typeof WM !== 'undefined') {
        WM.launch('notes');
        setTimeout(() => {
          if (window.KOSApps.notes?.loadNote) {
            window.KOSApps.notes.loadNote(item.id);
          }
        }, 600);
      }
    }
  } catch (err) {
    _showToast('Unable to open target entry source stack file.');
  }
};

window._fiTriggerUpload = function () {
  const folder = FOLDERS.find(f => f.id === FI._folder);
  if (!folder || !folder.uploadable) return;
  document.getElementById('fi-file-input')?.click();
};

async function _handleUpload(files) {
  if (!files.length) return;
  _showToast(`Importing ${files.length} volumes...`);

  let successCount = 0;
  for (const file of files) {
    try {
      await KOSFS.write(FILES_APP_ID, file);
      successCount++;
    } catch (err) {
      console.error('[Files System Core Upload Exception Tracker]', err);
    }
  }

  if (successCount > 0) {
    _showToast(`Successfully registered ${successCount} volume components.`);
    await _loadFolder(FI._folder);
  } else {
    _showToast('Files pipeline asset allocation rejected by KOSFS.');
  }
}

window._fiHandleDrop = function (fileList) {
  const folder = FOLDERS.find(f => f.id === FI._folder);
  if (!folder || !folder.uploadable) {
    _showToast('This workspace root does not accept runtime payloads.');
    return;
  }
  _handleUpload(Array.from(fileList || []));
};

window._fiTriggerDownloadSelected = async function () {
  if (!FI._selectedId) return;
  const item = FI._items.find(f => String(f.id) === String(FI._selectedId));
  if (!item) return;

  try {
    _showToast('Assembling volume array buffers...');
    const url = await KOSFS.readObjectURL(FILES_APP_ID, item.id);
    const a = document.createElement('a');
    a.href = url;
    a.download = item.name || 'download';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 3000);
  } catch (err) {
    _showToast('Failed tracking resource address vectors download streams.');
  }
};

window._fiTriggerDeleteSelected = async function () {
  if (!FI._selectedId) return;
  const item = FI._items.find(f => String(f.id) === String(FI._selectedId));
  if (!item) return;

  // Uses the non-blocking embedded layout engine instead of native prompt popup
  const userConfirmed = await _showConfirmModal(`Are you sure you want to permanently purge "${item.name}" from storage?`);
  if (!userConfirmed) return;

  try {
    _cacheEvict(item.id);
    await KOSFS.delete(FILES_APP_ID, item.id);
    FI._selectedId = null;
    _showToast('Selected entries purged.');
    await _loadFolder(FI._folder);
  } catch (err) {
    _showToast('Access denied during file object deletion.');
  }
};

function _showToast(msg) {
  const toast = document.getElementById('fi-toast');
  if (!toast) return;
  toast.textContent = msg;
  toast.classList.add('visible');
  clearTimeout(FI._toastTimer);
  FI._toastTimer = setTimeout(() => toast.classList.remove('visible'), 2500);
}