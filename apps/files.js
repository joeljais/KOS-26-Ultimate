/* ══════════════════════════════════════════════════════════════
   KOS ULTIMATE 2026 — apps/files.js
   Files App — sidebar-driven file browser
   Folders: System · Photos · Videos · Audios · Documents · Custom Apps

   IDB contracts (all use store name 'uploads'):
     kos-photos  v2  — {id, buf, name, mime, size, width, height, date, itype}
     kos-videos  v1  — {id, buf, name, mime, size, date}
     kos-audios  v1  — {id, buf, name, mime, size, date}
     kos-documents v1— {id, text, name, size, date}

   Custom apps: localStorage key  'kos-studio-apps'  (studio.js)
   System files: global AppManifest[]
   ══════════════════════════════════════════════════════════════ */

'use strict';
window.KOSApps = window.KOSApps || {};

/* ─────────────────── IDB helpers ─────────────────── */
const _idbConns = {};

async function _openIDB(name, version = 1) {
  if (_idbConns[name]) return _idbConns[name];
  _idbConns[name] = await new Promise((res, rej) => {
    const req = indexedDB.open(name, version);
    req.onupgradeneeded = e => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains('uploads'))
        db.createObjectStore('uploads', { keyPath: 'id', autoIncrement: true });
    };
    req.onsuccess = e => res(e.target.result);
    req.onerror   = e => rej(e.target.error);
  });
  return _idbConns[name];
}

async function _idbGetAll(dbName, version) {
  const db = await _openIDB(dbName, version);
  return new Promise((res, rej) => {
    const records = [];
    const req = db.transaction('uploads', 'readonly').objectStore('uploads').openCursor();
    req.onsuccess = e => {
      const c = e.target.result;
      if (!c) { res(records); return; }
      // Exclude heavy binary payload from the index list
      const { buf: _b, ...meta } = c.value;
      records.push(meta);
      c.continue();
    };
    req.onerror = e => rej(e.target.error);
  });
}

async function _idbGetPayload(dbName, id, version) {
  const db = await _openIDB(dbName, version);
  return new Promise((res, rej) => {
    const req = db.transaction('uploads', 'readonly').objectStore('uploads').get(id);
    req.onsuccess = e => res(e.target.result || null);
    req.onerror   = e => rej(e.target.error);
  });
}

async function _idbAdd(dbName, record, version) {
  const db = await _openIDB(dbName, version);
  return new Promise((res, rej) => {
    const req = db.transaction('uploads', 'readwrite').objectStore('uploads').add(record);
    req.onsuccess = e => res(e.target.result);
    req.onerror   = e => rej(e.target.error);
  });
}

async function _idbDelete(dbName, id, version) {
  const db = await _openIDB(dbName, version);
  return new Promise((res, rej) => {
    const req = db.transaction('uploads', 'readwrite').objectStore('uploads').delete(id);
    req.onsuccess = () => res();
    req.onerror   = e => rej(e.target.error);
  });
}

/* ─────────────────── Blob URL cache (simple) ─────────────────── */
const _blobMap = {};   // dbName:id → objectURL

async function _getBlobUrl(dbName, id, version) {
  const key = `${dbName}:${id}`;
  if (_blobMap[key]) return _blobMap[key];
  const row = await _idbGetPayload(dbName, id, version);
  if (!row) return null;
  let blob;
  if (row.buf) {
    blob = new Blob([row.buf], { type: row.mime || 'application/octet-stream' });
  } else {
    return null;
  }
  const url = URL.createObjectURL(blob);
  _blobMap[key] = url;
  return url;
}

function _revokeBlobCache() {
  Object.values(_blobMap).forEach(u => URL.revokeObjectURL(u));
  Object.keys(_blobMap).forEach(k => delete _blobMap[k]);
}

/* ─────────────────── Utilities ─────────────────── */
function _fmtBytes(n) {
  if (!n) return '—';
  if (n < 1024)    return `${n} B`;
  if (n < 1048576) return `${(n/1024).toFixed(1)} KB`;
  return `${(n/1048576).toFixed(2)} MB`;
}
function _fmtDate(iso) {
  try { return new Date(iso).toLocaleDateString('en-US', { year:'numeric', month:'short', day:'numeric' }); }
  catch { return iso || ''; }
}
function _esc(s) {
  return (s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

/* ─────────────────── State ─────────────────── */
const FI = {
  _folder:  'photos',   // active folder id
  _view:    'grid',     // 'grid' | 'list'
  _counts:  {},
  _items:   [],         // items loaded for current folder
  _loading: false,
};

/* ─────────────────── Folder registry ─────────────────── */
const FOLDERS = [
  { id: 'system',     label: 'System',       icon: 'fa-microchip',      iconClass: 'fi-icon-system',  uploadable: false, deletable: false },
  { id: 'photos',     label: 'Photos',       icon: 'fa-image',          iconClass: 'fi-icon-image',   uploadable: true,  deletable: true  },
  { id: 'videos',     label: 'Videos',       icon: 'fa-film',           iconClass: 'fi-icon-video',   uploadable: true,  deletable: true  },
  { id: 'audios',     label: 'Audios',       icon: 'fa-music',          iconClass: 'fi-icon-audio',   uploadable: true,  deletable: true  },
  { id: 'documents',  label: 'Documents',    icon: 'fa-file-lines',     iconClass: 'fi-icon-doc',     uploadable: true,  deletable: true  },
  { id: 'custom-apps',label: 'Custom Apps',  icon: 'fa-window-maximize',iconClass: 'fi-icon-app',     uploadable: false, deletable: false },
];

/* ─────────────────── App object ─────────────────── */
window.KOSApps.files = {
  async init() {
    const body = document.getElementById('files-body');
    if (!body) return;
    _renderShell(body);
    await _loadFolder(FI._folder);
  },
  refresh() { _loadFolder(FI._folder); },
};

/* ─────────────────── Shell ─────────────────── */
function _renderShell(body) {
  body.innerHTML = `
    <div class="fi-app" id="fi-app">
      <!-- Hidden file inputs -->
      <input type="file" id="fi-img-input"   accept="image/*" multiple style="display:none">
      <input type="file" id="fi-vid-input"   accept="video/*" multiple style="display:none">
      <input type="file" id="fi-aud-input"   accept="audio/*" multiple style="display:none">
      <input type="file" id="fi-doc-input"   accept=".txt,text/plain"  multiple style="display:none">

      <!-- SIDEBAR -->
      <aside class="fi-sidebar">
        <div class="fi-sidebar-section">Locations</div>
        ${FOLDERS.map(f => `
          <div class="fi-sidebar-item${f.id === FI._folder ? ' active' : ''}"
               data-folder="${f.id}" onclick="window._fiSetFolder('${f.id}')">
            <i class="fa-solid ${f.icon}"></i>
            <span>${f.label}</span>
            <span class="fi-sb-count" id="fi-count-${f.id}"></span>
          </div>
        `).join('')}
      </aside>

      <!-- MAIN -->
      <div class="fi-main">
        <!-- Toolbar -->
        <div class="fi-toolbar" id="fi-toolbar">
          <div class="fi-breadcrumb">
            <span class="fi-breadcrumb-root">Files</span>
            <span class="fi-breadcrumb-sep"><i class="fa-solid fa-chevron-right" style="font-size:9px"></i></span>
            <span class="fi-breadcrumb-cur" id="fi-bc-cur">Photos</span>
          </div>
          <div class="fi-toolbar-right">
            <button class="fi-view-btn${FI._view==='grid'?' active':''}" id="fi-view-grid"
                    title="Grid view" onclick="window._fiSetView('grid')">
              <i class="fa-solid fa-grid-2"></i>
            </button>
            <button class="fi-view-btn${FI._view==='list'?' active':''}" id="fi-view-list"
                    title="List view" onclick="window._fiSetView('list')">
              <i class="fa-solid fa-list"></i>
            </button>
            <button class="fi-upload-btn" id="fi-upload-btn" style="display:none"
                    onclick="window._fiTriggerUpload()">
              <i class="fa-solid fa-plus"></i> Import
            </button>
          </div>
        </div>

        <!-- Content -->
        <div class="fi-content" id="fi-content">
          <div class="fi-loading">
            <div class="fi-spinner"></div> Loading…
          </div>
        </div>

        <!-- Status bar -->
        <div class="fi-statusbar">
          <span id="fi-status-left"></span>
          <span id="fi-status-right"></span>
        </div>
      </div>

      <!-- Toast -->
      <div class="fi-toast" id="fi-toast"></div>
    </div>
  `;

  /* Wire up file inputs */
  document.getElementById('fi-img-input').addEventListener('change', e => _handleImgUpload(e));
  document.getElementById('fi-vid-input').addEventListener('change', e => _handleVidUpload(e));
  document.getElementById('fi-aud-input').addEventListener('change', e => _handleAudUpload(e));
  document.getElementById('fi-doc-input').addEventListener('change', e => _handleDocUpload(e));

  _updateUploadBtn(FI._folder);
}

/* ─────────────────── Set folder ─────────────────── */
window._fiSetFolder = async function(id) {
  FI._folder = id;
  document.querySelectorAll('.fi-sidebar-item').forEach(el =>
    el.classList.toggle('active', el.dataset.folder === id)
  );
  const folder = FOLDERS.find(f => f.id === id);
  const cur = document.getElementById('fi-bc-cur');
  if (cur) cur.textContent = folder?.label || id;
  _updateUploadBtn(id);
  await _loadFolder(id);
};

function _updateUploadBtn(id) {
  const folder = FOLDERS.find(f => f.id === id);
  const btn = document.getElementById('fi-upload-btn');
  if (btn) btn.style.display = folder?.uploadable ? '' : 'none';
}

/* ─────────────────── Set view ─────────────────── */
window._fiSetView = function(view) {
  FI._view = view;
  document.getElementById('fi-view-grid')?.classList.toggle('active', view === 'grid');
  document.getElementById('fi-view-list')?.classList.toggle('active', view === 'list');
  _renderItems();
};

/* ─────────────────── Load folder ─────────────────── */
async function _loadFolder(id) {
  const content = document.getElementById('fi-content');
  if (!content) return;
  content.innerHTML = `<div class="fi-loading"><div class="fi-spinner"></div> Loading…</div>`;

  try {
    switch (id) {
      case 'system':      FI._items = await _loadSystem();     break;
      case 'photos':      FI._items = await _loadPhotos();     break;
      case 'videos':      FI._items = await _loadVideos();     break;
      case 'audios':      FI._items = await _loadAudios();     break;
      case 'documents':   FI._items = await _loadDocuments();  break;
      case 'custom-apps': FI._items = await _loadCustomApps(); break;
      default:            FI._items = [];
    }
  } catch(err) {
    FI._items = [];
    console.warn('[Files] load error', err);
  }

  _updateCount(id, FI._items.length);
  _renderItems();
}

function _updateCount(id, n) {
  FI._counts[id] = n;
  const el = document.getElementById(`fi-count-${id}`);
  if (el) el.textContent = n > 0 ? n : '';
  const st = document.getElementById('fi-status-left');
  if (st) st.textContent = `${n} item${n !== 1 ? 's' : ''}`;
}

/* ─────────────────── Data loaders ─────────────────── */

async function _loadSystem() {
  if (typeof AppManifest === 'undefined') return [];
  return AppManifest.map(a => ({
    _type: 'system',
    id:    a.id,
    name:  a.name,
    icon:  a.faIcon || 'fa-square',
    iconClass: a.iconClass || '',
    meta:  a.metadata?.isSystemApp ? 'System App' : 'User App',
  }));
}

async function _loadPhotos() {
  const rows = await _idbGetAll('kos-photos', 2);
  return rows.map(r => ({
    _type:  'photo',
    idbId:  r.id,
    name:   r.name || `Photo ${r.id}`,
    mime:   r.mime,
    size:   r.size,
    date:   r.date,
    width:  r.width,
    height: r.height,
  }));
}

async function _loadVideos() {
  const rows = await _idbGetAll('kos-videos', 1);
  return rows.map(r => ({
    _type: 'video',
    idbId: r.id,
    name:  r.name || `Video ${r.id}`,
    mime:  r.mime,
    size:  r.size,
    date:  r.date,
  }));
}

async function _loadAudios() {
  const rows = await _idbGetAll('kos-audios', 1);
  return rows.map(r => ({
    _type: 'audio',
    idbId: r.id,
    name:  r.name || `Audio ${r.id}`,
    mime:  r.mime,
    size:  r.size,
    date:  r.date,
  }));
}

async function _loadDocuments() {
  const rows = await _idbGetAll('kos-documents', 1);
  return rows.map(r => ({
    _type: 'document',
    idbId: r.id,
    name:  r.name || `Document ${r.id}`,
    size:  r.size,
    date:  r.date,
    preview: (r.text || '').slice(0, 80),
  }));
}

async function _loadCustomApps() {
  try {
    const apps = JSON.parse(localStorage.getItem('kos-studio-apps') || '[]');
    return apps.map(a => ({
      _type:     'app',
      id:        a.id,
      name:      a.name || 'Untitled App',
      published: a.published,
      publishType: a.publishType,
    }));
  } catch { return []; }
}

/* ─────────────────── Render ─────────────────── */
function _renderItems() {
  const content = document.getElementById('fi-content');
  if (!content) return;

  const folder = FOLDERS.find(f => f.id === FI._folder);
  const items  = FI._items;

  if (items.length === 0) {
    content.innerHTML = _emptyState(folder);
    return;
  }

  switch (FI._folder) {
    case 'system':      content.innerHTML = _renderSystem(items);     break;
    case 'custom-apps': content.innerHTML = _renderCustomApps(items); break;
    default:
      content.innerHTML = FI._view === 'grid'
        ? _renderGrid(items, folder)
        : _renderList(items, folder);
  }
}

/* ─── Grid ─── */
function _renderGrid(items, folder) {
  const cells = items.map((item, idx) => {
    const iconHtml = _gridIcon(item);
    const del = folder.deletable
      ? `<button class="fi-cell-del" title="Delete" onclick="event.stopPropagation();window._fiDelete(${idx})">
           <i class="fa-solid fa-xmark"></i>
         </button>`
      : '';
    return `
      <div class="fi-cell" onclick="window._fiPreview(${idx})">
        <div class="fi-icon ${_iconClass(item)}">${iconHtml}</div>
        <div class="fi-cell-name" title="${_esc(item.name)}">${_esc(item.name)}</div>
        <div class="fi-cell-meta">${_fmtBytes(item.size)}</div>
        ${del}
      </div>`;
  }).join('');
  return `<div class="fi-grid">${cells}</div>`;
}

/* ─── List ─── */
function _renderList(items, folder) {
  const rows = items.map((item, idx) => {
    const iconHtml = _gridIcon(item);
    const del = folder.deletable
      ? `<button class="fi-list-del" title="Delete" onclick="event.stopPropagation();window._fiDelete(${idx})">
           <i class="fa-solid fa-trash"></i>
         </button>`
      : '';
    return `
      <div class="fi-list-row" onclick="window._fiPreview(${idx})">
        <div class="fi-list-icon ${_iconClass(item)}">${iconHtml}</div>
        <div class="fi-list-info">
          <div class="fi-list-name">${_esc(item.name)}</div>
          <div class="fi-list-sub">${_fmtDate(item.date)}</div>
        </div>
        <div class="fi-list-size">${_fmtBytes(item.size)}</div>
        ${del}
      </div>`;
  }).join('');
  return `<div class="fi-list">${rows}</div>`;
}

/* ─── System folder ─── */
function _renderSystem(items) {
  const cards = items.map(item => {
    const iconStyle = item.iconClass
      ? `class="fi-sys-icon ${item.iconClass}" style="font-size:20px"`
      : `class="fi-sys-icon fi-icon-system"`;
    return `
      <div class="fi-sys-card">
        <div ${iconStyle}><i class="fa-solid ${item.icon}"></i></div>
        <div class="fi-sys-info">
          <div class="fi-sys-name">${_esc(item.name)}</div>
          <div class="fi-sys-type">${_esc(item.meta)}</div>
        </div>
      </div>`;
  }).join('');
  return `
    <div class="fi-section-label">System Files (${items.length})</div>
    <div class="fi-sys-grid">${cards}</div>`;
}

/* ─── Custom Apps folder ─── */
function _renderCustomApps(items) {
  const cards = items.map(item => {
    const badge = item.published
      ? `<span class="fi-app-badge published"><i class="fa-solid fa-circle-check"></i> ${item.publishType === 'system' ? 'System' : 'Published'}</span>`
      : `<span class="fi-app-badge draft"><i class="fa-regular fa-circle"></i> Draft</span>`;
    return `
      <div class="fi-app-card">
        <div class="fi-app-icon-wrap"><i class="fa-solid fa-window-maximize"></i></div>
        <div>
          <div class="fi-app-name">${_esc(item.name)}</div>
          <div>${badge}</div>
        </div>
      </div>`;
  }).join('');
  return `
    <div class="fi-section-label">Studio Apps (${items.length})</div>
    <div class="fi-apps-grid">${cards}</div>`;
}

/* ─── Empty state ─── */
function _emptyState(folder) {
  const msgs = {
    system:       ['No system apps found', 'AppManifest is empty or unavailable.'],
    photos:       ['No Photos', 'Import photos to see them here. They also appear in the Photos app.'],
    videos:       ['No Videos', 'Import video files using the Import button above.'],
    audios:       ['No Audios', 'Import audio files using the Import button above.'],
    documents:    ['No Documents', 'Import .txt files to store them here.'],
    'custom-apps':['No Custom Apps', 'Create apps in KOS Studio to see them here.'],
  };
  const [title, desc] = msgs[folder?.id] || ['Empty folder', ''];
  const icon = folder?.icon || 'fa-folder';
  return `
    <div class="fi-empty">
      <div class="fi-empty-icon"><i class="fa-solid ${icon}"></i></div>
      <h3>${title}</h3>
      <p>${desc}</p>
    </div>`;
}

/* ─────────────────── Icon helpers ─────────────────── */
function _iconClass(item) {
  switch(item._type) {
    case 'photo':    return 'fi-icon-image';
    case 'video':    return 'fi-icon-video';
    case 'audio':    return 'fi-icon-audio';
    case 'document': return 'fi-icon-doc';
    case 'app':      return 'fi-icon-app';
    case 'system':   return 'fi-icon-system';
    default:         return 'fi-icon-system';
  }
}

function _gridIcon(item) {
  switch(item._type) {
    case 'photo':    return '<i class="fa-solid fa-image"></i>';
    case 'video':    return '<i class="fa-solid fa-film"></i>';
    case 'audio':    return '<i class="fa-solid fa-music"></i>';
    case 'document': return '<i class="fa-solid fa-file-lines"></i>';
    case 'app':      return '<i class="fa-solid fa-window-maximize"></i>';
    case 'system':   return `<i class="fa-solid ${item.icon || 'fa-microchip'}"></i>`;
    default:         return '<i class="fa-solid fa-file"></i>';
  }
}

/* ─────────────────── Preview ─────────────────── */
window._fiPreview = async function(idx) {
  const item = FI._items[idx];
  if (!item) return;

  const app = document.getElementById('fi-app');
  if (!app) return;

  // Remove existing overlay
  app.querySelector('.fi-preview-overlay')?.remove();

  const overlay = document.createElement('div');
  overlay.className = 'fi-preview-overlay';

  let contentHtml = '';

  try {
    switch(item._type) {
      case 'photo': {
        const url = await _getBlobUrl('kos-photos', item.idbId, 2);
        contentHtml = url
          ? `<img src="${url}" alt="${_esc(item.name)}" onclick="event.stopPropagation()">`
          : `<p style="color:var(--fi-text-secondary)">Could not load image</p>`;
        break;
      }
      case 'video': {
        const url = await _getBlobUrl('kos-videos', item.idbId, 1);
        contentHtml = url
          ? `<video src="${url}" controls onclick="event.stopPropagation()"></video>`
          : `<p style="color:var(--fi-text-secondary)">Could not load video</p>`;
        break;
      }
      case 'audio': {
        const url = await _getBlobUrl('kos-audios', item.idbId, 1);
        contentHtml = url
          ? `<audio src="${url}" controls onclick="event.stopPropagation()"></audio>`
          : `<p style="color:var(--fi-text-secondary)">Could not load audio</p>`;
        break;
      }
      case 'document': {
        const row = await _idbGetPayload('kos-documents', item.idbId, 1);
        const text = row?.text || '(empty)';
        contentHtml = `<pre onclick="event.stopPropagation()">${_esc(text)}</pre>`;
        break;
      }
      default:
        return; // system / app — no preview
    }
  } catch(e) {
    contentHtml = `<p style="color:var(--fi-text-secondary)">Preview unavailable</p>`;
  }

  overlay.innerHTML = `
    <div class="fi-preview-box" onclick="event.stopPropagation()">
      <div class="fi-preview-header">
        <span class="fi-preview-title">${_esc(item.name)}</span>
        <button class="fi-preview-close" onclick="this.closest('.fi-preview-overlay').remove()">
          <i class="fa-solid fa-xmark"></i>
        </button>
      </div>
      <div class="fi-preview-content">${contentHtml}</div>
    </div>`;

  overlay.addEventListener('click', () => overlay.remove());
  app.appendChild(overlay);
};

/* ─────────────────── Delete ─────────────────── */
window._fiDelete = async function(idx) {
  const item   = FI._items[idx];
  const folder = FOLDERS.find(f => f.id === FI._folder);
  if (!item || !folder?.deletable) return;

  const name = item.name || 'this item';
  if (!confirm(`Delete "${name}"? This cannot be undone.`)) return;

  try {
    switch(item._type) {
      case 'photo':
        await _idbDelete('kos-photos', item.idbId, 2);
        // Notify Photos app if open
        window.KOSApps.gallery?.refresh?.();
        break;
      case 'video':
        await _idbDelete('kos-videos', item.idbId, 1);
        break;
      case 'audio':
        await _idbDelete('kos-audios', item.idbId, 1);
        break;
      case 'document':
        await _idbDelete('kos-documents', item.idbId, 1);
        break;
    }
    // Revoke any cached blob URL
    const key = `${_dbNameForType(item._type)}:${item.idbId}`;
    if (_blobMap[key]) { URL.revokeObjectURL(_blobMap[key]); delete _blobMap[key]; }

    _fiToast(`"${name}" deleted`);
    await _loadFolder(FI._folder);
  } catch(e) {
    _fiToast('Delete failed');
    console.warn('[Files] delete error', e);
  }
};

function _dbNameForType(type) {
  return { photo:'kos-photos', video:'kos-videos', audio:'kos-audios', document:'kos-documents' }[type] || '';
}

/* ─────────────────── Upload trigger ─────────────────── */
window._fiTriggerUpload = function() {
  const map = {
    photos:    'fi-img-input',
    videos:    'fi-vid-input',
    audios:    'fi-aud-input',
    documents: 'fi-doc-input',
  };
  const inputId = map[FI._folder];
  if (inputId) document.getElementById(inputId)?.click();
};

/* ─────────────────── Upload handlers ─────────────────── */
async function _handleImgUpload(e) {
  const files = Array.from(e.currentTarget.files || []);
  e.currentTarget.value = '';
  if (!files.length) return;
  _fiToast('Importing…');

  for (const file of files) {
    const objUrl = URL.createObjectURL(file);
    const { width, height } = await _readDimensions(objUrl);
    URL.revokeObjectURL(objUrl);
    const buf = await file.arrayBuffer();
    await _idbAdd('kos-photos', {
      buf, name: file.name, mime: file.type, size: file.size,
      width, height,
      date: new Date(file.lastModified || Date.now()).toISOString(),
      itype: 'upload',
    }, 2);
  }

  // Notify Photos app if open
  window.KOSApps.gallery?.refresh?.();
  _fiToast(`${files.length} photo${files.length !== 1 ? 's' : ''} imported`);
  await _loadFolder('photos');
}

async function _handleVidUpload(e) {
  const files = Array.from(e.currentTarget.files || []);
  e.currentTarget.value = '';
  if (!files.length) return;
  _fiToast('Importing…');

  for (const file of files) {
    const buf = await file.arrayBuffer();
    await _idbAdd('kos-videos', {
      buf, name: file.name, mime: file.type, size: file.size,
      date: new Date(file.lastModified || Date.now()).toISOString(),
    }, 1);
  }

  _fiToast(`${files.length} video${files.length !== 1 ? 's' : ''} imported`);
  await _loadFolder('videos');
}

async function _handleAudUpload(e) {
  const files = Array.from(e.currentTarget.files || []);
  e.currentTarget.value = '';
  if (!files.length) return;
  _fiToast('Importing…');

  for (const file of files) {
    const buf = await file.arrayBuffer();
    await _idbAdd('kos-audios', {
      buf, name: file.name, mime: file.type, size: file.size,
      date: new Date(file.lastModified || Date.now()).toISOString(),
    }, 1);
  }

  _fiToast(`${files.length} audio${files.length !== 1 ? 's' : ''} imported`);
  await _loadFolder('audios');
}

async function _handleDocUpload(e) {
  const files = Array.from(e.currentTarget.files || []);
  e.currentTarget.value = '';
  if (!files.length) return;
  _fiToast('Importing…');

  for (const file of files) {
    const text = await file.text();
    await _idbAdd('kos-documents', {
      text, name: file.name, size: file.size,
      date: new Date(file.lastModified || Date.now()).toISOString(),
    }, 1);
  }

  _fiToast(`${files.length} document${files.length !== 1 ? 's' : ''} imported`);
  await _loadFolder('documents');
}

/* ─────────────────── Dimension helper ─────────────────── */
function _readDimensions(url) {
  return new Promise(res => {
    const img = new Image();
    img.onload  = () => { res({ width: img.naturalWidth, height: img.naturalHeight }); img.src=''; };
    img.onerror = () => res({ width:0, height:0 });
    img.src = url;
  });
}

/* ─────────────────── Toast ─────────────────── */
function _fiToast(msg) {
  const t = document.getElementById('fi-toast');
  if (!t) return;
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(t._timer);
  t._timer = setTimeout(() => t.classList.remove('show'), 2500);
}

/* ─────────────────── Cleanup ─────────────────── */
function _filesCleanup() {
  _revokeBlobCache();
  FI._items = [];
}

/* ─────────────────── WM registration ─────────────────── */
if (typeof WM !== 'undefined') {
  WM.setOnOpen('files',    () => window.KOSApps.files.init());
  WM.setOnClose?.('files', _filesCleanup);
}
