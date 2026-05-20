/* ══════════════════════════════════════════════════════════════
   KOS ULTIMATE 2026 — apps/photos.js  (optimised build)
   ══════════════════════════════════════════════════════════════

   Memory contract
   ───────────────
   • _idbMeta[]   : metadata only — NO src/buf in RAM ever
   • _blobCache   : LRU Map<id, objectURL>, capped at BLOB_CAP
   • _currentImgs : index array rebuilt once per render cycle
   • _kbHandler   : tracked so it is removed on cleanup
   • _lazyObs     : IntersectionObserver disconnected on cleanup
   All blob URLs are revoked when evicted or on window close.
   ══════════════════════════════════════════════════════════════ */

'use strict';
window.KOSApps = window.KOSApps || {};

/* ─── Constants ─── */
const IDB_NAME   = 'kos-photos';
const IDB_VER    = 2;              // v2 stores ArrayBuffer, not base64
const IDB_STORE  = 'uploads';
const BLOB_CAP   = 40;             // max cached objectURLs at once

/* ─── Module-level state ─── */
let _idbConn     = null;           // IDB singleton — opened once
let _idbMeta     = [];             // [{id,name,size,width,height,date,mime,itype}] — NO image data
let _blobCache   = new Map();      // LRU  id→objectURL
let _currentImgs = [];             // filtered list for current render
let _lazyObs     = null;           // IntersectionObserver ref
let _kbHandler   = null;           // keydown ref for clean removal
let _renderTimer = null;           // debounce handle

let _sidebarAlbum = 'library';
let _galleryView  = 'grid';
let _favourites   = new Set(JSON.parse(localStorage.getItem('kos_photo_favs') || '[]'));

let _lbIdx  = -1;   // index into _currentImgs
let _lbSrc  = '';   // resolved src (objectURL or plain URL)

/* ══════════════════════════════════════════════════════════════
   1. IndexedDB — singleton connection + typed operations
   ══════════════════════════════════════════════════════════════ */
async function getDB() {
  if (_idbConn) return _idbConn;
  _idbConn = await new Promise((res, rej) => {
    const req = indexedDB.open(IDB_NAME, IDB_VER);
    req.onupgradeneeded = e => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(IDB_STORE))
        db.createObjectStore(IDB_STORE, { keyPath: 'id', autoIncrement: true });
    };
    req.onsuccess = e => res(e.target.result);
    req.onerror   = e => rej(e.target.error);
  });
  return _idbConn;
}

/** Cursor-walk IDB — pulls every field EXCEPT src/buf into RAM */
async function idbLoadMeta() {
  const db = await getDB();
  return new Promise((res, rej) => {
    const records = [];
    const req = db.transaction(IDB_STORE, 'readonly')
                  .objectStore(IDB_STORE).openCursor();
    req.onsuccess = e => {
      const cursor = e.target.result;
      if (!cursor) { res(records); return; }
      /* Exclude heavy payload keys — they stay in IDB, not RAM */
      const { src: _s, buf: _b, ...meta } = cursor.value;
      records.push(meta);
      cursor.continue();
    };
    req.onerror = e => rej(e.target.error);
  });
}

/** Fetch the image payload for ONE record only when we actually need it */
async function idbGetPayload(id) {
  const db = await getDB();
  return new Promise((res, rej) => {
    const req = db.transaction(IDB_STORE, 'readonly')
                  .objectStore(IDB_STORE).get(id);
    req.onsuccess = e => {
      const r = e.target.result;
      if (!r) { res(null); return; }
      res({ buf: r.buf ?? null, src: r.src ?? null, mime: r.mime });
    };
    req.onerror = e => rej(e.target.error);
  });
}

async function idbAdd(record) {
  const db = await getDB();
  return new Promise((res, rej) => {
    const req = db.transaction(IDB_STORE, 'readwrite')
                  .objectStore(IDB_STORE).add(record);
    req.onsuccess = e => res(e.target.result);
    req.onerror   = e => rej(e.target.error);
  });
}

async function idbDeleteRecord(id) {
  const db = await getDB();
  return new Promise((res, rej) => {
    const req = db.transaction(IDB_STORE, 'readwrite')
                  .objectStore(IDB_STORE).delete(id);
    req.onsuccess = () => res();
    req.onerror   = e => rej(e.target.error);
  });
}

/* ══════════════════════════════════════════════════════════════
   2. Blob URL LRU cache — cap at BLOB_CAP, evict oldest
   ══════════════════════════════════════════════════════════════ */
async function getBlobUrl(id) {
  if (_blobCache.has(id)) {
    /* LRU hit: bubble to end */
    const url = _blobCache.get(id);
    _blobCache.delete(id);
    _blobCache.set(id, url);
    return url;
  }

  if (_blobCache.size >= BLOB_CAP) {
    const oldest = _blobCache.keys().next().value;
    URL.revokeObjectURL(_blobCache.get(oldest));
    _blobCache.delete(oldest);
  }

  const payload = await idbGetPayload(id);
  if (!payload) return null;

  let blob;
  if (payload.buf) {
    /* v2: ArrayBuffer */
    blob = new Blob([payload.buf], { type: payload.mime });
  } else if (payload.src) {
    /* v1 legacy: base64 data URL */
    const resp = await fetch(payload.src);
    blob = await resp.blob();
  } else return null;

  const url = URL.createObjectURL(blob);
  _blobCache.set(id, url);
  return url;
}

function revokeAllBlobs() {
  _blobCache.forEach(url => URL.revokeObjectURL(url));
  _blobCache.clear();
}

/* ══════════════════════════════════════════════════════════════
   3. App object
   ══════════════════════════════════════════════════════════════ */
window.KOSApps.gallery = {
  async init() {
    const body = document.getElementById('gallery-body');
    if (!body) return;
    _idbMeta = await idbLoadMeta().catch(() => []);
    renderShell(body);
    attachStaticListeners();
    scheduleRender();
  },

  async refresh() {
    const body = document.getElementById('gallery-body');
    if (!body || !WM?.registry['gallery']?.open) return;
    _idbMeta = await idbLoadMeta().catch(() => _idbMeta);
    updateSidebarCounts();
    scheduleRender();
  },
};

/* ══════════════════════════════════════════════════════════════
   4. Shell — rendered once per open, never on refresh
   ══════════════════════════════════════════════════════════════ */
function renderShell(body) {
  body.innerHTML = `
    <div class="ph-app" id="ph-app">
      <aside class="ph-sidebar">
        <div class="ph-sidebar-section-label">Library</div>
        <nav class="ph-sidebar-nav" id="ph-sidenav">
          <div class="ph-nav-item" data-album="library">
            <i class="fa-solid fa-photo-film"></i><span>Photos</span>
          </div>
          <div class="ph-nav-item" data-album="favourites">
            <i class="fa-solid fa-heart"></i><span>Favourites</span>
            <span class="ph-sidebar-badge" id="sb-favs"></span>
          </div>
        </nav>
        <div class="ph-sidebar-section-label">Albums</div>
        <nav class="ph-sidebar-nav" id="ph-sidenav2">
          <div class="ph-nav-item" data-album="uploads">
            <i class="fa-solid fa-cloud-arrow-up"></i><span>Uploads</span>
            <span class="ph-sidebar-badge" id="sb-uploads"></span>
          </div>
          <div class="ph-nav-item" data-album="avatars">
            <i class="fa-solid fa-user-circle"></i><span>Avatars</span>
            <span class="ph-sidebar-badge" id="sb-avatars"></span>
          </div>
          <div class="ph-nav-item" data-album="wallpapers">
            <i class="fa-solid fa-panorama"></i><span>Wallpapers</span>
            <span class="ph-sidebar-badge" id="sb-walls"></span>
          </div>
        </nav>
        <div class="ph-sidebar-bottom">
          <button class="ph-upload-btn" id="ph-upload-btn">
            <i class="fa-solid fa-plus"></i> Import
          </button>
        </div>
      </aside>

      <main class="ph-main">
        <div class="ph-toolbar">
          <div class="ph-toolbar-title" id="ph-toolbar-title">Photos</div>
          <div class="ph-toolbar-actions">
            <div class="ph-view-toggle" id="ph-view-toggle">
              <button class="ph-view-btn" data-view="grid"   title="Grid"><i class="fa-solid fa-grid-2"></i></button>
              <button class="ph-view-btn" data-view="months" title="Months"><i class="fa-solid fa-calendar-days"></i></button>
            </div>
            <button class="ph-import-fab" id="ph-import-fab" title="Import Photos">
              <i class="fa-solid fa-plus"></i>
            </button>
          </div>
        </div>
        <div class="ph-scroll-area" id="ph-scroll-area"></div>
      </main>

      <div class="ph-lightbox" id="gallery-lightbox" aria-hidden="true">
        <div class="ph-lb-topbar" id="ph-lb-topbar">
          <button class="ph-lb-btn" data-lb="close" title="Close"><i class="fa-solid fa-chevron-left"></i></button>
          <span class="ph-lb-title" id="lb-label">Photo</span>
          <div class="ph-lb-actions-right">
            <button class="ph-lb-btn" data-lb="fav"   title="Favourite"><i class="fa-regular fa-heart"></i></button>
            <button class="ph-lb-btn" data-lb="open"  title="Open in new tab"><i class="fa-solid fa-arrow-up-right-from-square"></i></button>
            <button class="ph-lb-btn" data-lb="setwp" title="Set as wallpaper"><i class="fa-solid fa-display"></i></button>
            <button class="ph-lb-btn ph-lb-danger lb-hidden" data-lb="del" title="Delete"><i class="fa-solid fa-trash"></i></button>
          </div>
        </div>
        <div class="ph-lb-body">
          <div class="ph-lb-img-wrap">
            <img class="ph-lb-img" id="lb-img" src="" alt="" decoding="async">
          </div>
          <aside class="ph-lb-info">
            <div class="ph-lb-info-title">Info</div>
            <div id="lb-exif"></div>
          </aside>
        </div>
      </div>

      <div class="ph-toast" id="ph-toast" aria-live="polite"></div>
      <input type="file" id="ph-file-input" accept="image/*" multiple style="display:none">
    </div>`;

  _syncSidebarUI();
  _syncViewUI();
  updateSidebarCounts();
}

/* ══════════════════════════════════════════════════════════════
   5. Event listeners — attached ONCE per shell; use delegation
   ══════════════════════════════════════════════════════════════ */
function attachStaticListeners() {
  const triggerUpload = () => document.getElementById('ph-file-input')?.click();

  /* Sidebar nav — two navs, one delegated handler each */
  document.getElementById('ph-sidenav')?.addEventListener('click', e => {
    const item = e.target.closest('.ph-nav-item');
    if (item) phSetAlbum(item.dataset.album);
  });
  document.getElementById('ph-sidenav2')?.addEventListener('click', e => {
    const item = e.target.closest('.ph-nav-item');
    if (item) phSetAlbum(item.dataset.album);
  });

  /* View toggle */
  document.getElementById('ph-view-toggle')?.addEventListener('click', e => {
    const btn = e.target.closest('.ph-view-btn');
    if (btn) phSetView(btn.dataset.view);
  });

  /* Import buttons */
  document.getElementById('ph-upload-btn')?.addEventListener('click', triggerUpload);
  document.getElementById('ph-import-fab')?.addEventListener('click', triggerUpload);

  /* File input */
  document.getElementById('ph-file-input')?.addEventListener('change', handleFileInput);

  /* Grid — single delegated handler for cell + delete clicks */
  document.getElementById('ph-scroll-area')?.addEventListener('click', e => {
    const del  = e.target.closest('.ph-cell-del');
    const cell = e.target.closest('.ph-cell');
    if (del && cell) {
      e.stopPropagation();
      deleteCell(+cell.dataset.idx);
    } else if (cell) {
      openLightboxAtIdx(+cell.dataset.idx);
    }
  });

  /* Lightbox topbar — delegated */
  document.getElementById('ph-lb-topbar')?.addEventListener('click', e => {
    const btn = e.target.closest('[data-lb]');
    if (!btn) return;
    ({ close: closeLightbox, fav: _toggleFav,
       open: () => _lbSrc && window.open(_lbSrc, '_blank'),
       setwp: _setAsWallpaper, del: _deleteCurrent })[btn.dataset.lb]?.();
  });

  /* Keyboard — tracked for removal on cleanup */
  if (_kbHandler) document.removeEventListener('keydown', _kbHandler);
  _kbHandler = e => { if (e.key === 'Escape') closeLightbox(); };
  document.addEventListener('keydown', _kbHandler);
}

/* ══════════════════════════════════════════════════════════════
   6. Data layer — builds _currentImgs ONCE per render cycle
   ══════════════════════════════════════════════════════════════ */
function buildImageList() {
  const list = [];

  (window.STOCK_AVATARS || []).forEach(a => list.push({
    src: a.src, label: a.label, type: 'avatar', deletable: false, idbId: null,
    name: a.label, size: null, width: null, height: null, date: null, mime: null,
  }));

  list.push({
    src: 'documents/dfw.jpg', label: 'Default Wallpaper', type: 'wallpaper',
    deletable: false, idbId: null,
    name: 'DFW Default', size: null, width: null, height: null, date: null, mime: null,
  });

  if (typeof getCustomAvatars === 'function')
    getCustomAvatars().forEach(src => list.push({
      src, label: 'Avatar', type: 'avatar', deletable: true, idbId: null,
      name: src.split('/').pop(), size: null, width: null, height: null, date: null, mime: null,
    }));

  if (typeof getCustomWallpapers === 'function')
    getCustomWallpapers().forEach(src => list.push({
      src, label: 'Wallpaper', type: 'wallpaper', deletable: true, idbId: null,
      name: src.split('/').pop(), size: null, width: null, height: null, date: null, mime: null,
    }));

  /* IDB: metadata only — src is null, resolved lazily */
  _idbMeta.forEach(m => list.push({
    src: null, label: m.name, type: m.itype || 'upload',
    deletable: true, idbId: m.id,
    name: m.name, size: m.size, width: m.width,
    height: m.height, date: m.date, mime: m.mime,
  }));

  return list;
}

function filterImages(all) {
  const favKey = i => i.src || String(i.idbId);
  switch (_sidebarAlbum) {
    case 'uploads':    return all.filter(i => i.idbId != null);
    case 'avatars':    return all.filter(i => i.type === 'avatar');
    case 'wallpapers': return all.filter(i => i.type === 'wallpaper');
    case 'favourites': return all.filter(i => _favourites.has(favKey(i)));
    default:           return all;
  }
}

/* ══════════════════════════════════════════════════════════════
   7. Sidebar counts — derived from _idbMeta, not full list rebuild
   ══════════════════════════════════════════════════════════════ */
function updateSidebarCounts() {
  const all     = buildImageList();
  const favKey  = i => i.src || String(i.idbId);
  const set     = (id, n) => { const el = document.getElementById(id); if (el) el.textContent = n || ''; };
  set('sb-uploads', _idbMeta.length);
  set('sb-avatars',  all.filter(i => i.type === 'avatar').length);
  set('sb-walls',    all.filter(i => i.type === 'wallpaper').length);
  set('sb-favs',     all.filter(i => _favourites.has(favKey(i))).length);
}

/* ══════════════════════════════════════════════════════════════
   8. Render — debounced 1 frame, rebuilds only scroll area
   ══════════════════════════════════════════════════════════════ */
function scheduleRender() {
  clearTimeout(_renderTimer);
  _renderTimer = setTimeout(doRender, 16);
}

function doRender() {
  const scroll = document.getElementById('ph-scroll-area');
  if (!scroll) return;

  _lazyObs?.disconnect();

  const all = buildImageList();
  _currentImgs = filterImages(all);

  if (!_currentImgs.length) {
    scroll.innerHTML = `
      <div class="ph-empty">
        <i class="fa-regular fa-images"></i>
        <p>No photos here yet.</p>
        <button class="ph-empty-import" id="ph-empty-import">Import Photos</button>
      </div>`;
    document.getElementById('ph-empty-import')
      ?.addEventListener('click', () => document.getElementById('ph-file-input')?.click());
    return;
  }

  scroll.innerHTML = _galleryView === 'months'
    ? _buildMonthsHTML(_currentImgs)
    : _buildGridHTML(_currentImgs);

  _setupLazyLoader(scroll);
}

function _buildGridHTML(imgs) {
  return `<div class="ph-count-bar">${imgs.length} photo${imgs.length !== 1 ? 's' : ''}</div>
          <div class="ph-grid">${imgs.map(_cellHTML).join('')}</div>`;
}

function _buildMonthsHTML(imgs) {
  const groups = new Map();
  const noDate = [];

  imgs.forEach((img, i) => {
    if (!img.date) { noDate.push(i); return; }
    const d   = new Date(img.date);
    const key = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
    if (!groups.has(key)) groups.set(key, {
      label: d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' }),
      idxs: [],
    });
    groups.get(key).idxs.push(i);
  });

  let html = `<div class="ph-count-bar">${imgs.length} photo${imgs.length !== 1 ? 's' : ''}</div>`;

  [...groups.keys()].sort().reverse().forEach(k => {
    const g = groups.get(k);
    html += `<div class="ph-month-group">
      <div class="ph-month-label">${g.label}</div>
      <div class="ph-grid">${g.idxs.map(i => _cellHTML(imgs[i], i)).join('')}</div>
    </div>`;
  });

  if (noDate.length)
    html += `<div class="ph-month-group">
      <div class="ph-month-label">Other</div>
      <div class="ph-grid">${noDate.map(i => _cellHTML(imgs[i], i)).join('')}</div>
    </div>`;

  return html;
}

/* ── cellHTML — only index in DOM; no JSON, no base64, no src for IDB images ── */
function _cellHTML(img, idx) {
  const isIDB  = img.idbId != null;
  const favKey = img.src || String(img.idbId);
  const isFav  = _favourites.has(favKey);

  return `<div class="ph-cell" data-idx="${idx}"${isIDB ? ` data-idb-id="${img.idbId}"` : ''}>
    <img${isIDB ? '' : ` src="${img.src}" loading="lazy"`} alt="${img.label}">
    ${isFav ? `<span class="ph-cell-fav"><i class="fa-solid fa-heart"></i></span>` : ''}
    <div class="ph-cell-overlay">
      <span class="ph-cell-type">${img.type}</span>
      ${img.deletable ? `<button class="ph-cell-del" title="Delete"><i class="fa-solid fa-trash"></i></button>` : ''}
    </div>
  </div>`;
}

/* ══════════════════════════════════════════════════════════════
   9. Lazy loader — IntersectionObserver fills IDB img srcs
   ══════════════════════════════════════════════════════════════ */
function _setupLazyLoader(root) {
  const cells = root.querySelectorAll('.ph-cell[data-idb-id]');
  if (!cells.length) return;

  _lazyObs = new IntersectionObserver(async (entries, obs) => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      const cell = entry.target;
      obs.unobserve(cell);
      const el = cell.querySelector('img');
      if (!el || el.src) continue;
      const url = await getBlobUrl(+cell.dataset.idbId);
      if (url && el.isConnected) el.src = url;
    }
  }, { root, rootMargin: '300px 0px' });

  cells.forEach(c => _lazyObs.observe(c));
}

/* ══════════════════════════════════════════════════════════════
   10. Lightbox
   ══════════════════════════════════════════════════════════════ */
async function openLightboxAtIdx(idx) {
  if (idx < 0 || idx >= _currentImgs.length) return;
  const img = _currentImgs[idx];
  let src = img.src;
  if (!src && img.idbId != null) src = await getBlobUrl(img.idbId);
  if (!src) return;

  _lbIdx = idx;
  _lbSrc = src;

  const lb    = document.getElementById('gallery-lightbox');
  const lbImg = document.getElementById('lb-img');
  if (lbImg)  lbImg.src = src;
  const lbl   = document.getElementById('lb-label');
  if (lbl)    lbl.textContent = img.label || img.type;

  lb?.querySelector('[data-lb="del"]')?.classList.toggle('lb-hidden', !img.deletable);
  _updateFavBtn();
  _renderExif(img);
  lb?.classList.add('lb-open');
  lb?.setAttribute('aria-hidden', 'false');
}

function closeLightbox() {
  const lb    = document.getElementById('gallery-lightbox');
  const lbImg = document.getElementById('lb-img');
  lb?.classList.remove('lb-open');
  lb?.setAttribute('aria-hidden', 'true');
  if (lbImg) lbImg.src = '';   // release decoded bitmap
  _lbIdx = -1;
  _lbSrc = '';
}

function _toggleFav() {
  const img = _currentImgs[_lbIdx];
  if (!img) return;
  const key = img.src || String(img.idbId);
  _favourites.has(key) ? _favourites.delete(key) : _favourites.add(key);
  localStorage.setItem('kos_photo_favs', JSON.stringify([..._favourites]));
  _updateFavBtn();
  scheduleRender();
}

function _updateFavBtn() {
  const img = _currentImgs[_lbIdx];
  if (!img) return;
  const btn = document.querySelector('[data-lb="fav"]');
  if (!btn) return;
  const isFav = _favourites.has(img.src || String(img.idbId));
  btn.querySelector('i').className = isFav ? 'fa-solid fa-heart' : 'fa-regular fa-heart';
  btn.classList.toggle('ph-lb-faved', isFav);
}

function _setAsWallpaper() {
  if (!_lbSrc) return;
  const img = _currentImgs[_lbIdx];
  if (img?.type === 'wallpaper') {
    const key = img.src === 'documents/dfw.jpg' ? 'default' : _lbSrc;
    if (typeof selectWallpaper === 'function') selectWallpaper(key);
  } else {
    if (typeof addCustomWallpaper === 'function') addCustomWallpaper(_lbSrc);
    if (typeof selectWallpaper    === 'function') selectWallpaper(_lbSrc);
  }
  showToast('Wallpaper set');
  closeLightbox();
  window.KOSApps.gallery.refresh();
}

async function _deleteCurrent() {
  const idx = _lbIdx;
  closeLightbox();
  await deleteCell(idx);
}

function _renderExif(img) {
  const el = document.getElementById('lb-exif');
  if (!el) return;
  const rows = [
    img.name              && ['File name',  img.name],
    img.mime              && ['Type',        img.mime],
    img.size              && ['Size',        _fmtBytes(img.size)],
    img.width && img.height && ['Dimensions', `${img.width} × ${img.height} px`],
    img.date              && ['Date',        _fmtDate(img.date)],
    img.type              && ['Album',       img.type[0].toUpperCase() + img.type.slice(1)],
  ].filter(Boolean);
  el.innerHTML = rows.length
    ? rows.map(([k, v]) =>
        `<div class="ph-exif-row"><span class="ph-exif-key">${k}</span><span class="ph-exif-val">${v}</span></div>`
      ).join('')
    : `<div class="ph-exif-na">No metadata available</div>`;
}

/* ══════════════════════════════════════════════════════════════
   11. Delete
   ══════════════════════════════════════════════════════════════ */
async function deleteCell(idx) {
  const img = _currentImgs[idx];
  if (!img?.deletable) return;

  if (img.idbId != null) {
    if (_blobCache.has(img.idbId)) {
      URL.revokeObjectURL(_blobCache.get(img.idbId));
      _blobCache.delete(img.idbId);
    }
    await idbDeleteRecord(img.idbId);
  } else {
    if (img.type === 'avatar'    && typeof deleteCustomAvatar    === 'function') deleteCustomAvatar(img.src);
    if (img.type === 'wallpaper' && typeof deleteCustomWallpaper === 'function') deleteCustomWallpaper(img.src);
  }

  const key = img.src || String(img.idbId);
  _favourites.delete(key);
  localStorage.setItem('kos_photo_favs', JSON.stringify([..._favourites]));

  _idbMeta = await idbLoadMeta().catch(() => _idbMeta);
  scheduleRender();
}

/* ══════════════════════════════════════════════════════════════
   12. Upload — ArrayBuffer storage (33% smaller than base64 in IDB)
   ══════════════════════════════════════════════════════════════ */
async function handleFileInput(e) {
  const inp   = e.currentTarget;
  const files = Array.from(inp.files || []);
  inp.value   = '';   // reset immediately so browser can free file references

  for (const file of files) await _importFile(file);

  _idbMeta = await idbLoadMeta().catch(() => _idbMeta);
  scheduleRender();
  showToast(`${files.length} photo${files.length !== 1 ? 's' : ''} imported`);
}

async function _importFile(file) {
  /* Object URL for dimension reading — no base64 decode needed */
  const objUrl = URL.createObjectURL(file);
  const { width, height } = await _readDimensions(objUrl);
  URL.revokeObjectURL(objUrl);   // revoke immediately — we don't need it anymore

  const buf = await file.arrayBuffer();
  await idbAdd({
    buf, name: file.name, mime: file.type, size: file.size, width, height,
    date: new Date(file.lastModified || Date.now()).toISOString(),
    itype: 'upload',
  });
}

function _readDimensions(url) {
  return new Promise(res => {
    const img = new Image();
    img.onload  = () => { res({ width: img.naturalWidth, height: img.naturalHeight }); img.src = ''; };
    img.onerror = () => res({ width: 0, height: 0 });
    img.src = url;
  });
}

/* ══════════════════════════════════════════════════════════════
   13. Sidebar / toolbar state
   ══════════════════════════════════════════════════════════════ */
function phSetAlbum(album) {
  _sidebarAlbum = album;
  _syncSidebarUI();
  const titles = { library:'Photos', uploads:'Uploads', avatars:'Avatars', wallpapers:'Wallpapers', favourites:'Favourites' };
  const tb = document.getElementById('ph-toolbar-title');
  if (tb) tb.textContent = titles[album] || 'Photos';
  scheduleRender();
}

function phSetView(view) {
  _galleryView = view;
  _syncViewUI();
  scheduleRender();
}

function _syncSidebarUI() {
  document.querySelectorAll('.ph-nav-item').forEach(el =>
    el.classList.toggle('active', el.dataset.album === _sidebarAlbum)
  );
}

function _syncViewUI() {
  document.querySelectorAll('.ph-view-btn').forEach(b =>
    b.classList.toggle('active', b.dataset.view === _galleryView)
  );
}

/* ══════════════════════════════════════════════════════════════
   14. Toast
   ══════════════════════════════════════════════════════════════ */
function showToast(msg) {
  const t = document.getElementById('ph-toast');
  if (!t) return;
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(t._t);
  t._t = setTimeout(() => t.classList.remove('show'), 2400);
}

/* ══════════════════════════════════════════════════════════════
   15. Cleanup — called by WM on window close
   ══════════════════════════════════════════════════════════════ */
function cleanup() {
  revokeAllBlobs();
  _lazyObs?.disconnect();
  _lazyObs = null;
  if (_kbHandler) { document.removeEventListener('keydown', _kbHandler); _kbHandler = null; }
  clearTimeout(_renderTimer);
  _renderTimer = null;
  _currentImgs = [];
  _idbMeta     = [];
  _lbIdx = -1;
  _lbSrc = '';
  /* IDB connection intentionally kept — cheap singleton, reopening is costly */
}

/* ══════════════════════════════════════════════════════════════
   16. Utilities
   ══════════════════════════════════════════════════════════════ */
function _fmtBytes(n) {
  if (n < 1024)    return `${n} B`;
  if (n < 1048576) return `${(n/1024).toFixed(1)} KB`;
  return `${(n/1048576).toFixed(2)} MB`;
}
function _fmtDate(iso) {
  try {
    return new Date(iso).toLocaleDateString('en-US', {
      year:'numeric', month:'long', day:'numeric', hour:'2-digit', minute:'2-digit',
    });
  } catch { return iso; }
}

/* ══════════════════════════════════════════════════════════════
   17. Legacy global shims
   ══════════════════════════════════════════════════════════════ */
window.openLightbox  = (encSrc) => {
  const src = decodeURIComponent(encSrc);
  const idx = _currentImgs.findIndex(i => i.src === src);
  if (idx >= 0) openLightboxAtIdx(idx);
};
window.setGalleryTab = tab => phSetAlbum(
  ({ all:'library', avatar:'avatars', wallpaper:'wallpapers' })[tab] || 'library'
);
window.galleryDelete = async (encSrc, type) => {
  const src = decodeURIComponent(encSrc);
  const idx = _currentImgs.findIndex(i => i.src === src);
  if (idx >= 0) await deleteCell(idx);
};
window.phTriggerUpload = () => document.getElementById('ph-file-input')?.click();
window.phSetAlbum   = phSetAlbum;
window.phSetView    = phSetView;
window.phDeleteCell = async (encSrc, type, idbId) => {
  const idx = idbId >= 0
    ? _currentImgs.findIndex(i => i.idbId === idbId)
    : _currentImgs.findIndex(i => i.src === decodeURIComponent(encSrc));
  if (idx >= 0) await deleteCell(idx);
};

/* ══════════════════════════════════════════════════════════════
   18. WM registration
   ══════════════════════════════════════════════════════════════ */
if (typeof WM !== 'undefined') {
  WM.setOnOpen('gallery',    () => window.KOSApps.gallery.init());
  WM.setOnClose?.('gallery', cleanup);
}