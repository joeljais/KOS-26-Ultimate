# KOS Ultimate 2026 — Alpha 8 Full Codebase Documentation

> **Target:** Alpha 8 codebase. The `KOSFS_INTEGRATION_GUIDE.md` documents the Alpha 9 upgrade path applied on top of this base.  
> **Architecture:** Single-page PWA running entirely in the browser. No server. No build step. Pure HTML/CSS/JS + IndexedDB + Service Worker.

---

## Table of Contents

1. [Project Overview](#1-project-overview)
2. [File & Directory Structure](#2-file--directory-structure)
3. [Script Load Order (index.html)](#3-script-load-order-indexhtml)
4. [PWA Setup — manifest.json + sw.js](#4-pwa-setup--manifestjson--swjs)
5. [kos-kernel.js — Core System Utilities](#5-kos-kerneljs--core-system-utilities)
6. [kos-manifest.js — Application Registry](#6-kos-manifestjs--application-registry)
7. [kos-wm.js — Window Manager](#7-kos-wmjs--window-manager)
8. [kos-init.js — Boot Orchestrator, Dock & Spotlight](#8-kos-initjs--boot-orchestrator-dock--spotlight)
9. [kos-fs.js — KOSFS Kernel Filesystem (Alpha 9 Module)](#9-kos-fsjs--kosfs-kernel-filesystem-alpha-9-module)
10. [kos-fs-picker.js — KOSFS File Picker (Alpha 9 Module)](#10-kos-fs-pickerjs--kosfs-file-picker-alpha-9-module)
11. [kos-contextmenu.js — Right-Click Context Menu System](#11-kos-contextmenujs--right-click-context-menu-system)
12. [apps/photos.js — Photos / Gallery App](#12-appsphotosjs--photos--gallery-app)
13. [apps/files.js — Files App](#13-appsfilesjs--files-app)
14. [apps/notes.js — Notes App](#14-appsnotesjs--notes-app)
15. [apps/ui-manager.js — Settings App](#15-appsui-managerjs--settings-app)
16. [apps/browser.js — Smooth Browser](#16-appsbrowserjs--smooth-browser)
17. [apps/studio.js — KOS Studio](#17-appsstudiojs--kos-studio)
18. [apps/task-mgr.js — Task Manager](#18-appstask-mgrjs--task-manager)
19. [apps/calculator.js — Calculator](#19-appscalculatorjs--calculator)
20. [apps/about.js — About KOS](#20-appsaboutjs--about-kos)
21. [apps/release-notes.js — Release Notes](#21-appsrelease-notesjs--release-notes)
22. [terminal.js — Root System Terminal](#22-terminaljs--root-system-terminal)
23. [KOSBus — Global Event Bus Reference](#23-kosbus--global-event-bus-reference)
24. [IndexedDB Storage Contracts (Alpha 8)](#24-indexeddb-storage-contracts-alpha-8)
25. [CSS Architecture Overview](#25-css-architecture-overview)
26. [Alpha 9 Upgrade: KOSFS Integration Summary](#26-alpha-9-upgrade-kosfs-integration-summary)

---

## 1. Project Overview

KOS Ultimate 2026 is a browser-based desktop operating system simulation. It runs entirely client-side as a Progressive Web App (PWA). There is no back-end, no bundler, and no framework — just plain HTML, CSS, and JavaScript loaded in dependency order using `defer`.

**Key design principles in this codebase:**

- **Zero cross-module direct calls.** All cross-module communication happens through `KOSBus` (a thin wrapper around `window.dispatchEvent` / `window.addEventListener`).
- **Manifest-driven everything.** Every app is registered in `AppManifest` (defined in `kos-manifest.js`). The Dock, Spotlight, Window Manager, and Settings all read directly from it — adding an app means only touching the manifest and adding the script tag.
- **Lazy asset injection.** App CSS is never loaded until the app's window is first opened. This keeps the initial page load fast.
- **Memory-safe media handling.** Photos, videos, and audio are stored as `ArrayBuffer` in IndexedDB. Only the metadata is kept in RAM. Blob Object URLs are created on demand and revoked when evicted to prevent memory leaks.
- **Debounced persistence.** `localStorage` writes (session save, spotlight filter) are debounced or passed through `requestAnimationFrame` to avoid blocking the main thread on rapid events.

---

## 2. File & Directory Structure

```
alpha 8/
├── index.html                    ← Single entry point — all HTML screens + script tags
├── manifest.json                 ← PWA manifest (name, icons, display mode)
├── sw.js                         ← Service Worker — cache-first offline strategy
│
├── kos-manifest.js               ← AppManifest[] — single source of truth for all apps
├── kos-kernel.js                 ← Core utilities: KOSBus, theme, wallpaper, avatar, clock, toast, login/power
├── kos-wm.js                     ← Window Manager: WM object — launch, open, close, minimize, maximize, drag, resize, snap, sessions
├── kos-init.js                   ← Boot orchestrator + Spotlight search + Dock module
├── kos-contextmenu.js            ← Right-click context menu system (KOSContextMenu)
├── kos-display.js                ← Display settings: zoom, text size, bold, brightness (referenced but not shown in alpha 8)
│
├── kos-fs.js                     ← [Alpha 9 module] KOSFS unified filesystem kernel (IIFE → window.KOSFS)
├── kos-fs-picker.js              ← [Alpha 9 module] KOSFS shared file picker UI component (KOSFS.Picker)
│
├── terminal.js                   ← Root System Terminal (IIFE, root directory)
│
├── apps/
│   ├── browser.js                ← Smooth Browser — multi-tab iframe browser
│   ├── calculator.js             ← Mac-style calculator
│   ├── files.js                  ← Files App — multi-type file browser with sidebar
│   ├── notes.js                  ← Notes App — KOSFS-integrated text editor
│   ├── photos.js                 ← Photos / Gallery — LRU blob cache + lazy loading
│   ├── release-notes.js          ← Release Notes viewer — changelog data-driven renderer
│   ├── studio.js                 ← KOS Studio — in-OS app builder (HTML/CSS/JS editor + publish to dock)
│   ├── task-mgr.js               ← Task Manager — live memory/CPU polling + process list
│   ├── ui-manager.js             ← Settings App — Appearance, Apps, Security, Display, About
│   └── about.js                  ← About KOS — static system info + live hardware data
│
├── css/
│   ├── core-vars.css             ← CSS variables, resets, icon gradients, keyframes
│   ├── shell.css                 ← Boot, login, desktop, topbar
│   ├── wm.css                    ← Floating windows + resize handles
│   ├── kos-contextmenu.css       ← Context menu styles
│   └── apps/
│       ├── browser.css
│       ├── calculator.css
│       ├── files.css
│       ├── notes.css
│       ├── photos.css
│       ├── release-notes.css
│       ├── studio.css
│       ├── task-mgr.css
│       ├── ui-manager.css
│       └── about.css
│
└── documents/
    ├── img_avatar.png            ← Default login avatar
    ├── img_avatar2.png           ← Second stock avatar
    ├── dfw.jpg                   ← Default wallpaper
    ├── load1.gif                 ← Boot / loading animation
    ├── restart.gif               ← Restart screen animation
    ├── shuting.gif               ← Shutdown screen animation
    ├── sleeping.gif              ← Sleep screen animation
    ├── startupsong.mp3           ← Boot sound
    ├── kos icon.png              ← PWA icon (192×192)
    ├── Gemini_Generated_Image_41g5rx41g5rx41g5.png
    └── KOS file architecture for KOS26 Ultimate.svg
```

---

## 3. Script Load Order (index.html)

The `index.html` defines a strict `defer` load order. Changing this order will break the app.

```html
<!-- 1. App registry — no dependencies -->
<script defer src="kos-manifest.js"></script>

<!-- 2. Core utilities — defines KOSBus, storage constants, theme, toast, clock -->
<script defer src="kos-kernel.js"></script>

<!-- 3. Window Manager — depends on KOSBus + AppManifest -->
<script defer src="kos-wm.js"></script>

<!-- Alpha 9 additions — insert here, after kos-kernel.js and before kos-wm.js -->
<!-- <script defer src="kos-fs.js"></script>       -->
<!-- <script defer src="kos-fs-picker.js"></script> -->

<!-- 4–5. System UI modules (Dock + Spotlight live here in Alpha 8 via kos-init) -->
<!-- Note: in Alpha 8, Dock and Spotlight logic is in kos-init.js, not separate files -->

<!-- 6. App modules — each registers with WM.setOnOpen(id, fn) -->
<script defer src="apps/browser.js"></script>
<script defer src="apps/ui-manager.js"></script>
<script defer src="apps/task-mgr.js"></script>
<script defer src="apps/photos.js"></script>
<script defer src="apps/calculator.js"></script>
<script defer src="apps/studio.js"></script>
<script defer src="apps/about.js"></script>
<script defer src="apps/release-notes.js"></script>
<script defer src="apps/files.js"></script>
<script defer src="apps/notes.js"></script>
<script defer src="terminal.js"></script>

<!-- 7. Display manager — after all apps, before boot -->
<script defer src="kos-display.js"></script>

<!-- 8. Boot orchestrator — must be absolutely last -->
<script defer src="kos-init.js"></script>
```

### HTML Screen Layers (in render order)

`index.html` defines the following fixed screen `<div>` elements, all with class `screen`. Only one has class `active` at a time (controlled by `showOnly()` in `kos-kernel.js`):

| ID | Purpose | Initial state |
|---|---|---|
| `screen-mobile-block` | Fixed overlay for viewports < 768px — CSS-only, no JS | Hidden (CSS media query) |
| `screen-boot` | Boot animation — wordmark, GIF, dots | `active` (visible on load) |
| `screen-login` | Login card with avatar, password input, system buttons | Hidden |
| `screen-sleep` | Full-screen sleep overlay — click anywhere to wake | Hidden |
| `screen-restart` | Restart animation | Hidden |
| `screen-shutdown` | Shutdown GIF + label | Hidden |
| `screen-desktop` | Main desktop — topbar, wallpaper, dock, windows, spotlight | Hidden |

The `screen-desktop` div contains:
- `#wallpaperEl` — the wallpaper background
- `.topbar.glass` — the system menu bar
  - Left: system name, File/Apps/System dropdown menus
  - Right: clock (`#clock`), theme toggle button
- `.desktop` — empty container where window `<div>`s are appended by `WM._buildWindowDOM()`
- `#spotlight-overlay` — the full-screen spotlight search panel
- `#dock-trigger-zone` — invisible hover strip at the bottom that shows the hidden dock
- `#dock.glass` — the dock bar
  - Always has Spotlight launcher icon first
  - `#dock-apps` container populated from `AppManifest` by `renderDock()`
  - `#dock-running-sep` + `#dock-running-apps` for non-pinned running apps
- `#kos-toast` — global toast notification element

---

## 4. PWA Setup — manifest.json + sw.js

### manifest.json

```json
{
  "name": "KOS Ultimate 2026",
  "short_name": "KOS 26 Ultimate (Alpha 8)",
  "start_url": "./index.html",
  "display": "standalone",
  "background_color": "#0063af",
  "theme_color": "#0063af",
  "icons": [
    {
      "src": "documents/kos icon.png",
      "sizes": "192x192",
      "type": "image/png",
      "purpose": "any maskable"
    }
  ]
}
```

The PWA manifest allows KOS to be installed on desktop and Android as a standalone app. `display: "standalone"` removes the browser chrome. `start_url: "./index.html"` ensures correct relative asset resolution.

### sw.js — Service Worker

**Cache name:** `kos-v2`

**Strategy:** Cache-first with network fallback and automatic offline stale serving.

**Pre-cached asset list** (installed on `install` event):
- All root files: `/`, `index.html`, `manifest.json`
- Core JS: `kos-manifest.js`, `kos-kernel.js`, `kos-wm.js`, `kos-init.js`, `kos-contextmenu.js`
- App JS: `apps/browser.js`, `apps/ui-manager.js`, `apps/task-mgr.js`, `apps/photos.js`, `apps/calculator.js`, `apps/studio.js`, `apps/about.js`, `apps/release-notes.js`, `apps/files.js`, `apps/notes.js`, `apps/dock.js`, `apps/spotlight.js`
- Core CSS: `css/core-vars.css`, `css/shell.css`, `css/wm.css`, `css/kos-contextmenu.css`
- App CSS: all files under `css/apps/`
- Documents/media: `img_avatar.png`, `img_avatar2.png`, `dfw.jpg`, `load1.gif`, `startupsong.mp3`

**install event:** Calls `cache.addAll(ASSETS)`, then `self.skipWaiting()` to activate immediately without waiting for old tabs to close.

**activate event:** Deletes all old caches whose key is not `kos-v2`, then calls `self.clients.claim()` to take control of all pages immediately.

**fetch event:** For each request:
1. Check `caches.match(e.request)` — if found, return cached response immediately
2. If not cached, `fetch(e.request)` from network
3. On successful same-origin response (status 200, not opaque): clone and store in cache, return original
4. If network fails and a stale entry exists (impossible after step 1 since step 1 already returned), return stale — effectively the offline fallback path only triggers if the cache lookup itself fails

**Alpha 9 note:** `kos-fs.js` and `kos-fs-picker.js` must be added to `ASSETS` when upgrading.

---

## 5. kos-kernel.js — Core System Utilities

The kernel has zero knowledge of any specific app. It defines global utility functions and constants used everywhere else.

### 5.1 localStorage Keys

| Constant | Key string | Value |
|---|---|---|
| `KEY_THEME` | `'kos-theme'` | `'light'` or `'dark'` |
| `KEY_WALLPAPER` | `'kos-wallpaper'` | `'default'`, `'stock-N'`, or a `data:` URL |
| `KEY_AVATAR` | `'kos-avatar'` | `data:` URL of selected avatar, or stock avatar SVG data URL |
| `KEY_CUSTOM_AVATARS` | `'kos-custom-avatars'` | JSON array of up to 5 custom avatar data URLs |
| `KEY_CUSTOM_WALLPAPERS` | `'kos-custom-wallpapers'` | JSON array of up to 5 custom wallpaper data URLs |
| `KEY_SESSION` | `'kos-session'` | JSON object mapping appId → window state |
| `KEY_ICON_PALETTE` | `'kos-icon-palette'` | Palette ID string (e.g. `'violet'`) |
| `KEY_SYS_OVERRIDES` | `'kos-sys-overrides'` | JSON object mapping appId → `{ css, js }` |
| `KEY_GLASS` | `'kos-glass'` | `'on'` or `'off'` |

### 5.2 KOSBus — Global Event Bus

```js
const KOSBus = {
  dispatch(event, detail = {}) { ... },  // wraps window.dispatchEvent(new CustomEvent(...))
  on(event, handler) { ... },            // wraps window.addEventListener(event, handler)
};
```

**Note on `emit` vs `dispatch`:** In `kos-kernel.js` the method is named `dispatch`. In `kos-fs.js` (Alpha 9) it is called as `KOSBus.emit(...)`. The `kos-fs.js` file ships a module that calls `emit` — the integration guide implies the Alpha 9 upgrade renames or aliases `dispatch` to `emit`, or `kos-fs.js` needs adjusting.

Events dispatched by the Window Manager via `KOSBus`:

| Event | Detail payload |
|---|---|
| `kos:app-opened` | `{ appId }` |
| `kos:app-closed` | `{ appId }` |
| `kos:app-minimized` | `{ appId }` |
| `kos:app-restored` | `{ appId }` |
| `kos:app-focused` | `{ appId }` |
| `kos:registry-changed` | `{}` — emitted by Studio on publish/remove |
| `kos:theme-changed` | `{ theme }` |
| `kos:glass-changed` | `{ enabled }` |
| `kos:request-spotlight-close` | `{}` — WM asks spotlight to close when an app launches |
| `kos:windows-visible-changed` | `{ hasVisible }` — dock auto-hide logic |

### 5.3 Stock Data

**`STOCK_AVATARS`** — 6 gradient SVG avatars generated inline by `_mkAvSVG(c1, c2)`. Each has `id`, `label`, and `src` (base64 SVG data URL). Colors: Violet, Rose, Sky, Mint, Sunset, Nebula.

**`STOCK_WALLPAPERS`** — 8 wallpapers: 1 photo (`dfw.jpg`) and 7 CSS gradients. Each has `label` and `value` (CSS `background` shorthand).

**`ICON_PALETTES`** — 8 palettes: Original, Violet, Rose, Forest, Ocean, Sunset, Gold, Mono. Each has `id`, `name`, a CSS `filter` string applied to `.app-icon` elements, and a `preview` array of 2 hex colors.

### 5.4 Functions

#### `buildAppIcon(app)`
Returns an HTML string `<div class="app-icon {iconClass}"><i class="fa-solid {faIcon}"></i></div>`. Used by Dock, Spotlight, and Settings → Apps to render app icons consistently.

#### `getCurrentPaletteId()`
Reads `KEY_ICON_PALETTE` from localStorage; defaults to `'original'`.

#### `applyIconPalette(id)`
Sets `--icon-filter` CSS variable on `document.documentElement` using the palette's `filter` value. Saves to localStorage. Calls `buildIconPaletteGrid()` if the palette grid is currently visible in Settings.

#### `buildIconPaletteGrid()`
Renders the 8-swatch palette picker grid into `#ip-grid`. Each swatch has an inline gradient background from the palette's `preview` colors. Clicking calls `applyIconPalette(id)`.

#### `applyTheme(theme)`
Toggles `dark` class on `<body>`. Updates the theme icon (`#themeIcon`) to sun/moon. Toggles `.on` on `#darkToggle`. Dispatches `kos:theme-changed`.

#### `toggleTheme()`
Reads current state from `document.body.classList`, inverts, saves to localStorage, calls `applyTheme()`.

#### `applyGlass(enabled)`
Toggles `no-glass` class on `<body>`. Syncs `#glassToggle` if it exists. Dispatches `kos:glass-changed`.

#### `toggleGlass()`
Reads state from `document.body.classList.contains('no-glass')`, inverts, saves to localStorage, calls `applyGlass()`.

#### Wallpaper Functions

`getCustomWallpapers()` — returns parsed JSON array from localStorage, or `[]`.

`saveCustomWallpapers(arr)` — JSON-stringifies and saves to `KEY_CUSTOM_WALLPAPERS`.

`addCustomWallpaper(dataURL)` — prepends to custom array (deduped), slices to 5 max.

`deleteCustomWallpaper(dataURL)` — removes from array, if it was the active wallpaper reverts to default, rebuilds grid, refreshes Photos app.

`applyWallpaper(stored)` — sets `background` style on `#wallpaperEl`:
- `null` or `'default'` → `STOCK_WALLPAPERS[0].value`
- `'stock-N'` → `STOCK_WALLPAPERS[N].value`
- anything else → treated as a `data:` URL and applied as `url('...') center/cover`

`selectWallpaper(value)` — saves to localStorage, calls `applyWallpaper()`, rebuilds grid.

`handleWallpaperUpload(event)` — reads `FileReader.readAsDataURL`, calls `addCustomWallpaper` + `selectWallpaper`. Used by the `<input id="wallpaperFileInput">` hidden input at the bottom of `index.html`.

`buildWallpaperGrid()` — renders the wallpaper picker into `#wallpaperGrid`. Stock swatches use inline CSS background. Custom thumbnails get a delete button (`event.stopPropagation()` prevents selection when clicking delete). An "Add Photo" tile triggers the hidden file input.

#### Avatar Functions

Same pattern as wallpaper: `getCustomAvatars()`, `saveCustomAvatars()`, `addCustomAvatar()`, `deleteCustomAvatar()`, `applyAvatar(src)`, `selectAvatar(src)`, `handleAvatarUpload(event)`.

`applyAvatar(src)` — updates `#loginAvatar` and `#uimAvatarPreview` img elements. Falls back to `documents/img_avatar.png` if `src` is falsy.

`buildAvatarSection()` — renders the avatar section into `#uim-avatar-section` in Settings. Shows current avatar, stock avatar grid (6 items), and recent uploads (if any) with delete buttons.

#### Screen Manager

`screens` object — populated once by `document.querySelectorAll('.screen')`.

`showOnly(id)` — removes `active` from all screens, adds it to `screens[id]`. If `id === 'screen-login'`, focuses `#passwordBox` after 100ms.

#### Login

`PASSWORD` constant: `'kosul'` (hardcoded default, overridable via Settings → Security).

`attemptLogin()` — checks `passwordBox.value` against `localStorage.getItem(KOS_PW_KEY) || PASSWORD`. On success: `showOnly('screen-desktop')`, calls `WM.restoreSession()`. On failure: adds `shake` CSS class to `#passwordBox`, removes after 500ms, clears value.

The `passwordBox` also has an `input` listener that calls `attemptLogin()` immediately when value matches, enabling passwordless auto-login.

#### Power Functions

`triggerSleep()` — calls `showOnly('screen-sleep')`. The sleep screen has a click listener that calls `showOnly('screen-login')`.

`triggerRestart()` — calls `WM.clearSession()`, `showOnly('screen-restart')`, then after 3 seconds calls `showOnly('screen-login')`.

`triggerShutdown()` — calls `WM.clearSession()`, `showOnly('screen-shutdown')`, then after 3 seconds calls `window.close()` and replaces `document.body.innerHTML` with a black div.

#### Dropdowns

`toggleMenu(el, event)` — `event.stopPropagation()`, then toggles `.active` on the `.dropdown-menu` child of `el`. Closes all other dropdowns first.

`closeAllDropdowns()` — removes `.active` from all `.dropdown-menu` elements.

A global `document.addEventListener('click', closeAllDropdowns)` closes all dropdowns on any click outside.

#### Clock

Uses manually formatted time (not `toLocaleString()`) for performance. Pre-allocated arrays `_DAYS_SHORT` and `_MONTHS_SHORT`. Cached `_clockEl` reference (no `getElementById` on every tick).

Format: `"Fri 22 May 3:45 PM"`

`updateClock()` is called immediately and on a 1-second `setInterval`.

#### Toast

`showToast(msg, duration = 2500)` — sets `textContent` on `#kos-toast`, adds `.visible` class, clears any pending timer, sets a new timer to remove `.visible` after `duration` ms. Visibility is CSS-driven (no inline style changes).

#### System App Override Engine

`getSysOverrides()` — reads `KEY_SYS_OVERRIDES` from localStorage.

`applySysOverride(appId)` — called by `WM.open(id)` on every window open. Looks up `getSysOverrides()[appId]`, and if it exists:
- CSS: injects a `<style class="sys-override-style">` into the window element
- JS: calls `new Function('winEl', 'appId', overrides.js)(winEl, appId)` — allows Studio to inject custom JS that runs in the context of the specific window element

#### Boot Sequence

At the bottom of `kos-kernel.js`:
```js
setTimeout(() => showOnly('screen-login'), 4000);  // Auto-transition from boot to login after 4 seconds
applyTheme(localStorage.getItem(KEY_THEME) || 'light');
applyGlass(localStorage.getItem(KEY_GLASS) !== 'off');
```

---

## 6. kos-manifest.js — Application Registry

Defines two globals: `winSize()` and `AppManifest`.

### `winSize(pct, [rw, rh])`

Responsive window sizing helper. Given a percentage of the viewport and an aspect ratio:
- `vw = window.innerWidth * pct / 100`
- `vh = window.innerHeight * pct / 100`
- `h = Math.min(vw * rh/rw, window.innerHeight * 0.88)` — clamped to 88% of viewport height
- Returns `{ width: Math.round(vw), height: Math.round(h) }`

### `AppManifest` — Full App Registry

Each entry is an object with the following fields:

```js
{
  id:          string,       // unique app ID — used everywhere
  name:        string,       // display name
  iconClass:   string,       // CSS class on the icon wrapper div
  faIcon:      string,       // FontAwesome icon class (e.g. 'fa-folder')
  jsPath:      string|null,  // path to JS file, or null for "coming soon" apps
  cssPath:     string|null,  // path to CSS file
  permissions: string[],     // KOSFS scope array (Alpha 9) — [] means no file access
  metadata: {
    showInDock:    boolean,  // whether to include in the dock
    searchable:    boolean,  // whether to include in Spotlight
    isSystemApp:   boolean,  // affects Studio's system apps list
  },
  initData:    object|null,  // window sizing data (from winSize()) + bodyId, ratio, offset, etc.
                             // null = no window, triggers "coming soon" bounce
}
```

#### Complete App List

| ID | Name | Dock | Permissions | Window Size |
|---|---|---|---|---|
| `uimanager` | Settings | ✓ | `['*']` | 52% @ 16:10 |
| `taskmanager` | Task Manager | ✗ | `[]` | 42% @ 4:3 |
| `about` | About KOS | ✗ | `[]` | 36% @ 3:4 |
| `releasenotes` | Release Notes | ✗ | `[]` | 40% @ 2:3 |
| `gallery` | Photos | ✓ | `['photos']` | 62% @ 16:9 |
| `files` | Files | ✓ | `['*']` | 58% @ 4:3 |
| `notes` | Notes | ✓ | `['documents']` | 52% @ 16:10 |
| `calculator` | Calculator | ✗ | `[]` | 32% @ 3:5 |
| `terminal` | Terminal | ✓ | *(none declared)* | 55% @ 3:2 |
| `browser` | Smooth Browser | ✓ | `['documents']` | 72% @ 16:10 |
| `studio` | KOS Studio | ✓ | `['apps', 'documents']` | 78% @ 16:9 |
| `music` | Music | ✓ | `['audios', 'videos']` | *coming soon* |
| `videos` | Videos | ✓ | `['videos', 'audios']` | *coming soon* |
| `voicerecorder` | Voice Recorder | ✗ | `['audios']` | *coming soon* |

**Note:** `terminal` appears twice in the manifest (duplicate entry) — this is a bug in Alpha 8.

---

## 7. kos-wm.js — Window Manager

The `WM` object is the most complex module. It is a singleton global object with the following top-level properties:

```js
const WM = {
  registry:      {},   // appId → { el, open, minimized, maximized, snapped, savedRect, onOpen, ... }
  zTop:          500,  // z-index counter, incremented on every focus
  TOPBAR_H:      54,   // desktop topbar height (used in drag clamping)
  MIN_W:         300,  // minimum window width
  MIN_H:         200,  // minimum window height
  _loadedAssets: {},   // appId → true — tracks which apps have CSS injected
  _focusedId:    null, // currently focused app ID (avoids O(n) loop on focus)
  _saveTimer:    null, // debounce handle for saveSession
};
```

### 7.1 Public API

#### `WM.launch(id)`
Entry point for opening any app. Logic:
1. Find `app` in `AppManifest`. Return if not found.
2. Dispatch `kos:request-spotlight-close` to close spotlight.
3. If `registry[id]` exists: open/restore/focus depending on current state.
4. If no `initData` (coming-soon app): `showToast()` + animate dock icon with `bounce` keyframe.
5. First launch: `_injectAssets(app, callback)` → in callback: `_buildWindowDOM(app)` → `register(app)` → `open(id)`.

#### `WM.open(id)`
- Adds `win-open` class, removes `win-minimized`.
- Sets `w.open = true`, `w.minimized = false`.
- Calls `focus(id)`.
- Calls `w.onOpen()` lifecycle hook if registered.
- Calls `applySysOverride(id)`.
- Calls `_syncDockHide()`.
- Schedules session save.
- Dispatches `kos:app-opened`.

#### `WM.close(id)`
- Removes `win-open`, `win-minimized`, `win-maximized`, `win-snapped-left`, `win-snapped-right` classes.
- Clears topbar controls if was maximized.
- Clears snap controls if was snapped.
- Resets maximize icon.
- `_syncDockHide()`, schedule save, dispatch `kos:app-closed`.

#### `WM.minimize(id)`
- Adds `win-minimized` class.
- If was maximized: clears topbar controls (but keeps `w.maximized = true` so restore re-injects them).
- If was snapped: hides snap controls (keeps `w.snapped` for restore).
- `_syncDockHide()`, schedule save, dispatch `kos:app-minimized`.

#### `WM.restore(id)`
- Removes `win-minimized`.
- If maximized: calls `_injectTopbarControls(id)`.
- If snapped: calls `_injectSnapControls(id, w.snapped)`.
- Calls `focus(id)`.
- `_syncDockHide()`, schedule save, dispatch `kos:app-restored`.

#### `WM.maximize(id)`
Two-branch logic:

**If already maximized (un-maximize):**
1. Calls `_clearTopbarControls()` first (fade out).
2. After 120ms delay: adds `win-animating`, removes `win-maximized`, restores `savedRect` geometry, resets maximize icon.
3. After 480ms: removes `win-animating`.

**If not maximized:**
1. Saves current rect to `w.savedRect`.
2. Adds `win-animating win-maximized`.
3. Sets `left: 0`, `top: 44px`, `width: 100vw`, `height: calc(100vh - 44px)`.
4. Changes maximize icon to `fa-window-restore`.
5. Adds `topbar-maximized` class to `.topbar`.
6. After 80ms: `_injectTopbarControls(id)`.
7. After 480ms: removes `win-animating`.

Schedule save after both branches.

#### `WM.focus(id)`
- Increments `zTop`, sets `w.el.style.zIndex = zTop`.
- Removes `win-focused` from the **previous** focused window only (O(1), not O(n)).
- Sets `_focusedId = id`, adds `win-focused` to `w.el`.
- Dispatches `kos:app-focused`.

#### `WM.saveSession()` / `WM.restoreSession()` / `WM.clearSession()`

**saveSession:** Iterates `registry`, saves `{ open, minimized, maximized, snapped, left, top, width, height }` per app to `KEY_SESSION` in localStorage. Called via `_scheduleSave()` which debounces it by 400ms.

**restoreSession:** Reads `KEY_SESSION`. For each entry: ensures window DOM exists (builds it if not), restores geometry, then opens/minimizes/maximizes as saved.

**clearSession:** Removes `KEY_SESSION` from localStorage. Called by restart and shutdown.

### 7.2 Topbar Controls (Maximized Window)

When a window is maximized, its own titlebar collapses. WM injects floating controls into the top-level `<body>` via `_injectTopbarControls(id)`:

- Animates `.system-name` text to show the app name (fades out, changes text, fades in).
- Creates or reuses `#topbar-win-controls` div at body level.
- Injects Minimize, Restore, Close buttons that call `WM.minimize/maximize/close(id)`.

`_clearTopbarControls()` reverses this: fades out `#topbar-win-controls`, restores system name text.

### 7.3 Window Snapping

`_snapLeft(id)` / `_snapRight(id)` — snaps a window to the left or right half of the desktop (50% width, full height minus topbar). Saves `savedRect`. Adds `win-snapped-left` or `win-snapped-right` CSS class. Calls `_injectSnapControls(id, side)` to show topbar snap controls.

`_clearSnapControls(id)` — removes snap-specific topbar controls.

### 7.4 Internal Helpers

#### `_buildWindowDOM(app)`
Builds the window `<div>` from scratch. Structure:
```html
<div id="win-{appId}" class="window" data-app-id="{appId}" style="left/top/width/height">
  <div class="win-titlebar">
    <div class="win-ctrl-group">
      <button data-action="close">...</button>
      <button data-action="minimize">...</button>
      <button data-action="maximize">...</button>
    </div>
    <span class="win-title">{app.name}</span>
  </div>
  <div id="{bodyId}" class="{bodyClass}"></div>
</div>
```
Positioning uses `initData.width/height` from the manifest, offset by `initData.offset` (stagger so multiple windows don't overlap perfectly).

After building: attaches drag, resize, focus-on-click listeners.

#### `_injectAssets(app, callback)`
If `_loadedAssets[app.id]` is already set, calls `callback()` immediately.

Otherwise, creates a `<link rel="stylesheet">` element for `app.cssPath` and appends it to `<head>`. Then dynamically creates a `<script src="{app.jsPath}">`. On script `onload`, marks `_loadedAssets[app.id] = true` and calls `callback()`.

This is the lazy CSS/JS injection system — nothing loads until the first `WM.launch()` call.

#### `_setupDrag(el, titlebar)`
Attaches `mousedown` on the titlebar to start dragging. On `mousemove`, updates `el.style.left/top` clamped so the window cannot go above the topbar or off-screen. Uses `document`-level `mousemove`/`mouseup` for smooth drag (avoids losing the mouse if cursor moves outside the window).

#### `_setupResize(el)`
Creates 8 resize handles: `n`, `s`, `e`, `w`, `ne`, `nw`, `se`, `sw`. Each is an absolutely-positioned `<div>`. On mousedown, records start geometry. On mousemove, adjusts `left/top/width/height` based on which handle is active, clamping to `MIN_W × MIN_H`.

#### `register(app)`
Stores `{ el, open: false, minimized: false, maximized: false, snapped: null, savedRect: null }` into `registry[app.id]`.

#### `setOnOpen(appId, fn)`
Stores a callback into `registry[appId].onOpen`. Called by app files (e.g. `WM.setOnOpen('calculator', () => window.KOSApps.calculator.init())`). The WM calls `w.onOpen()` inside `WM.open()`.

#### `_syncDockHide()`
Checks if any window is `open && !minimized`. Dispatches `kos:windows-visible-changed` with `{ hasVisible: boolean }`. The dock listens and auto-hides itself when there are visible windows.

---

## 8. kos-init.js — Boot Orchestrator, Dock & Spotlight

This file does three distinct things in one script:

### 8.1 First-Boot Auto-Open

Immediately at parse time (before the IIFE):
```js
if (!localStorage.getItem('kos_first_boot_complete')) {
  if (typeof WM !== 'undefined' && typeof WM.launch === 'function') {
    WM.launch('releasenotes');
    localStorage.setItem('kos_first_boot_complete', 'true');
    showToast('Welcome to KOS Ultimate 2026!');
  }
}
```
This opens Release Notes on the very first visit and never again.

### 8.2 Spotlight Search

**State variables:** `_spotlightOverlay`, `_spotlightInput`, `_spotlightGrid`, `_filterRaf` (all lazily populated).

#### `buildSpotlightGrid()`
Filters `AppManifest` to `metadata.searchable === true`. For each app, creates a `.spotlight-app` div with the app icon and name. Clicking closes spotlight and calls `WM.launch(app.id)`. Sets `dataset.appName` for filtering.

#### `openSpotlight()`
Closes dropdowns, adds `active` to `#spotlight-overlay`, focuses `#spotlight-input` after 80ms.

#### `closeSpotlight()`
Removes `active` from overlay, clears input value, calls `filterSpotlight('')`.

#### `handleSpotlightBackdrop(e)`
Called by `onclick` on `#spotlight-overlay`. Checks `e.target === overlay` (i.e. clicked the backdrop, not the panel) before calling `closeSpotlight()`.

#### `filterSpotlight(query)`
Debounced via `requestAnimationFrame` (cancels previous frame if called again before paint). In the rAF callback: hides `.spotlight-app` items where `dataset.appName` does not include the lowercased, trimmed query.

### 8.3 Dock Module

**Design:** Fully decoupled from WM. The dock only reacts to KOSBus events — never calls WM directly.

#### `renderDock()`
Clears `#dock-apps`. For each app with `metadata.showInDock`, creates a `.dock-item` div with the app icon and label. Clicking calls `WM.launch(app.id)`.

Also manages the "running apps" section:
- Creates `#dock-running-sep` (a `.dock-separator`) and `#dock-running-apps` container if they don't exist yet.
- On rebuild: clears `#dock-running-apps`, re-syncs running state from `WM.registry`.

#### `_isPinned(appId)`
Returns whether the app is in `AppManifest` with `showInDock === true`.

#### `_setRunning(appId, isRunning)`
- **Pinned apps:** Toggles `.dock-running` on the `.dock-item[data-app-id]` in `#dock-apps`.
- **Non-pinned running apps:** Adds/removes a temporary `.dock-item.dock-running` in `#dock-running-apps`. Shows/hides `#dock-running-sep` based on whether `#dock-running-apps` is non-empty.

#### KOSBus listeners in kos-init.js

| Event | Action |
|---|---|
| `kos:registry-changed` | Calls `buildSpotlightGrid()` + `renderDock()` |
| `kos:request-spotlight-close` | Calls `closeSpotlight()` |
| `kos:windows-visible-changed` | Toggles `dock-hidden` on `#dock`, updates `--spotlight-dock-clearance` CSS var |
| `kos:app-opened` | `_setRunning(appId, true)` |
| `kos:app-restored` | `_setRunning(appId, true)` |
| `kos:app-minimized` | `_setRunning(appId, true)` (still shown as running) |
| `kos:app-closed` | `_setRunning(appId, false)` |

#### Dock hover behavior
- `#dock-trigger-zone` (invisible strip at bottom): `mouseenter` removes `dock-hidden` from dock, sets `--spotlight-dock-clearance: 100px`.
- Dock `mouseleave`: if any windows are open and not minimized, adds `dock-hidden` and sets clearance to `20px`.

### 8.4 Boot Orchestrator IIFE

```js
(function init() {
  if (typeof KOSDisplay !== 'undefined') KOSDisplay.apply();  // Display settings first — prevents FOUC
  applyWallpaper(localStorage.getItem(KEY_WALLPAPER));
  applyAvatar(localStorage.getItem(KEY_AVATAR));
  applyIconPalette(getCurrentPaletteId());
  if (window.KOSDisplay) KOSDisplay.apply();  // Called again (duplicate, defensive)
  KOSStudio.restorePublished();               // Restore Studio custom apps
  renderDock();
  buildSpotlightGrid();
  _setSpotlightClearance(false);
  WM.restoreSession();
})();
```

### 8.5 Screen HTML Patch IIFE

`patchScreenHTML()` dynamically reshapes the static HTML screens post-load:

**Boot screen** (`#screen-boot`): Injects studio name, wordmark, tagline, progress bar HTML.

**Login screen** (`#screen-login`): A significant Windows 11-inspired rebuild:
1. Wraps existing `.login-card` in a `.login-center-col` div, prepended with a `.login-clock-wrap` containing large time and date displays.
2. Injects a `.login-arrow-btn` (right-arrow) into `.login-input-wrap` that proxies clicks to the hidden `.pill-btn.signin`.
3. Injects a `.login-bottom-bar` with system buttons (Sleep/Restart/Shutdown proxied from the hidden `.pill-btn` elements).
4. Starts a 1-second interval clock inside `#login-clock-time` and `#login-clock-date`. Pre-allocates day/month name arrays. Guards against double-interval if patch runs twice (via `dataset.clockInit`).

**Sleep/Restart/Shutdown screens**: Injects minimal HTML (text labels, spinner, ring animations).

---

## 9. kos-fs.js — KOSFS Kernel Filesystem (Alpha 9 Module)

`kos-fs.js` is written as an IIFE that assigns itself to `window.KOSFS`. It is the entire Alpha 9 filesystem layer — a unified IndexedDB replacing the four separate `kos-photos`, `kos-videos`, `kos-audios`, and `kos-documents` stores.

### 9.1 Constants

```js
const DB_NAME    = 'kos-filesystem';   // unified IDB database name
const DB_VERSION = 1;
const STORE      = 'files';            // single object store name
const MIGRATE_KEY = 'kos-fs-v1-migrated'; // localStorage flag to prevent re-migration
```

#### `TYPES` (frozen object)
```js
KOSFS.TYPES = {
  IMAGE:    'image',
  VIDEO:    'video',
  AUDIO:    'audio',
  DOCUMENT: 'document',
  APP:      'app',
}
```

#### `SCOPE_TO_TYPE` (frozen object)
Maps manifest permission scope strings to `TYPES` values:
```
'photos'    → 'image'
'videos'    → 'video'
'audios'    → 'audio'
'documents' → 'document'
'apps'      → 'app'
'*'         → '*'
```

#### `LEGACY_DBS`
Array of 4 objects describing the old per-type stores to migrate:
```js
[
  { dbName: 'kos-photos',    dbVersion: 2, type: TYPES.IMAGE    },
  { dbName: 'kos-videos',    dbVersion: 1, type: TYPES.VIDEO    },
  { dbName: 'kos-audios',    dbVersion: 1, type: TYPES.AUDIO    },
  { dbName: 'kos-documents', dbVersion: 1, type: TYPES.DOCUMENT },
]
```

### 9.2 Internal State

`_db` — the open `IDBDatabase` instance, set by `init()`.

`_perms` — `Map<appId, Set<fileType | '*'>>` — permission registry.

`ready` — a `Promise<void>` that resolves when `init()` completes. `_readyResolve` and `_readyReject` are captured from the Promise constructor before it's exported.

### 9.3 Low-Level IDB Helpers

#### `_openDB()`
Opens (or creates) `'kos-filesystem'` v1. The `onupgradeneeded` handler:
- Creates object store `'files'` with `keyPath: 'id'` and `autoIncrement: true`.
- Creates indexes:
  - `'by_type'` on `type` field — not unique
  - `'by_createdAt'` on `createdAt` field — not unique
  - `'by_name'` on `name` field — not unique
  - `'by_albumId'` on `albumIds` field — not unique, `multiEntry: true` (one entry per array element)
  - `'by_tag'` on `tags` field — not unique, `multiEntry: true`
- Returns promise resolving with the `IDBDatabase`.
- Rejects if blocked by another tab.

#### `_store(mode = 'readonly')`
Opens a new transaction on `STORE` and returns its object store. Every public operation calls this fresh — no transaction is reused.

#### `_p(req)`
Wraps any `IDBRequest` in a Promise. `onsuccess` resolves with `event.target.result`. `onerror` rejects with `event.target.error`.

#### `_getById(id)`
Returns `_p(_store('readonly').get(Number(id)))` — fetches one full record including `data` field.

#### `_insert(record)`
Returns `_p(_store('readwrite').add({ createdAt: Date.now(), modifiedAt: Date.now(), tags: [], albumIds: [], ...record }))`. Spread means caller-supplied `createdAt` can override default.

### 9.4 Migration (`_migrate`, `_migrateLegacyDB`)

Called once inside `init()` after `_openDB()`.

**`_migrate()`:**
- Checks `localStorage.getItem(MIGRATE_KEY)` — if set, returns immediately.
- Iterates `LEGACY_DBS`, calling `_migrateLegacyDB` for each.
- After all migrations, sets `localStorage.setItem(MIGRATE_KEY, String(Date.now()))`.

**`_migrateLegacyDB({ dbName, dbVersion, type })`:**
1. Attempts to open the legacy DB. Uses a special `onupgradeneeded` that aborts the transaction and resolves `null` — this way, if the DB has never existed, `onupgradeneeded` fires (IDB creates it), we abort, and resolve null instead of creating an empty DB.
2. If DB open fails or is null, returns 0.
3. Gets the first object store name from `legacyDB.objectStoreNames[0]`.
4. Calls `.getAll()` on it.
5. Closes `legacyDB`.
6. For each record with a valid `ArrayBuffer` in `r.data`, calls `_insert()` with normalized fields:
   - `name` from `r.name || r.fileName || 'untitled'`
   - `type` from the LEGACY_DB entry
   - `mimeType` from `r.mimeType || r.type || ''`
   - `size` from `r.size ?? data.byteLength`
   - `data` — the raw ArrayBuffer
   - `createdAt` from `r.addedAt || r.date || Date.now()`
   - `writtenBy: 'migration'`
   - `_legacyId: r.id` (preserved for debugging)
   - `_legacyDB: dbName`
7. Returns count of migrated records.
8. All errors are caught silently — migration failure is warned but never throws.

### 9.5 Permission System

#### `KOSFS.registerApp(appId, scopes[])`
Maps each scope string through `SCOPE_TO_TYPE`. Unknown scopes trigger a `console.warn` and are ignored. Stores the resulting `Set<type>` in `_perms.get(appId)`.

**Must be called inside each app's `init()` before any KOSFS operation.**

#### `KOSFS.hasPermission(appId, scope)`
Returns `boolean`. Does not throw. Used for UI-level checks (e.g. deciding whether to show an upload button).

#### `_guard(appId, fileType)` (internal)
Throws `DOMException('SecurityError')` if:
- `appId` is not in `_perms` (app didn't call `registerApp`)
- `_perms.get(appId)` doesn't contain `'*'` and doesn't contain `fileType`

Called internally before every read/write/delete operation.

### 9.6 Type Inference

#### `KOSFS.inferType(mimeType)`
- `'image/*'` → `TYPES.IMAGE`
- `'video/*'` → `TYPES.VIDEO`
- `'audio/*'` → `TYPES.AUDIO`
- Anything else → `TYPES.DOCUMENT`

### 9.7 Public File Operations

#### `KOSFS.write(appId, fileData, meta = {})`

Normalizes `fileData` to `ArrayBuffer`:

| Input type | Behavior |
|---|---|
| `File` | `file.arrayBuffer()`, inherits `type` and `name` |
| `Blob` | `blob.arrayBuffer()`, inherits `type` |
| `ArrayBuffer` | used directly, defaults to `'application/octet-stream'` |
| `string` | `TextEncoder().encode(str).buffer`, defaults to `'text/plain'` |
| anything else | throws `TypeError` |

`meta` overrides: `{ name, type, mimeType, tags, albumIds }`.

File type is determined by `meta.type ?? inferType(mimeType)`.

Calls `_guard(appId, fileType)`, then `_insert(...)`.

Emits `KOSBus.emit('kos:fs-write', { id, type, name, size, writtenBy: appId })`.

Returns `Promise<number>` — the new file's auto-incremented IDB id.

#### `KOSFS.read(appId, fileId)`
Calls `_getById(fileId)`, checks `_guard`, returns full record (including `data: ArrayBuffer`).

#### `KOSFS.readBlob(appId, fileId)`
Calls `read()`, returns `new Blob([rec.data], { type: rec.mimeType })`.

#### `KOSFS.readText(appId, fileId)`
Calls `read()`, returns `new TextDecoder().decode(rec.data)`.

#### `KOSFS.readObjectURL(appId, fileId)`
Calls `readBlob()`, returns `URL.createObjectURL(blob)`.  
**⚠️ Caller must call `URL.revokeObjectURL(url)` when done.**

#### `KOSFS.list(appId, filter = {})`
1. Gets all records via `_store('readonly').getAll()`.
2. Strips `data` field from each record (metadata only in RAM).
3. Filters by `_perms.get(appId)` — if not `'*'`, only returns records whose `type` is in the app's permission set.
4. Applies optional caller filters:
   - `filter.type` — exact match
   - `filter.albumId` — `r.albumIds.includes(albumId)`
   - `filter.tag` — `r.tags.includes(tag)`
   - `filter.name` — case-insensitive substring search on `r.name`
5. Sorts newest-first by `createdAt`.
6. Applies `filter.offset` (default 0) and `filter.limit` (default all) for pagination.
7. Returns `Promise<object[]>` — array of metadata records.

#### `KOSFS.delete(appId, fileId)` (exported as `delete`, internally named `remove`)
Reads record, checks `_guard`, calls `_store('readwrite').delete(Number(fileId))`.  
Emits `kos:fs-delete` with `{ id, type, name, deletedBy }`.

#### `KOSFS.updateMeta(appId, fileId, patch)`
Reads record, checks `_guard`.  
Only allows patching `name`, `tags`, and `albumIds` — any other keys in `patch` are silently ignored.  
Merges safe fields into record, updates `modifiedAt: Date.now()`, calls `_store('readwrite').put(updated)`.  
Emits `kos:fs-update` with `{ id, type, patch: safe, updatedBy }`.

### 9.8 Stats / Storage Info

#### `KOSFS.getStats(appId)`
Calls `list(appId)` (respects permissions), computes:
```js
{
  count: number,
  totalSize: number,  // bytes
  byType: {
    [type]: { count: number, size: number }
  }
}
```

#### `KOSFS._systemStats()`
Same computation but calls `_store('readonly').getAll()` directly — **no permission gate, all files**.  
Intended only for Settings → Storage section in `ui-manager.js`.

### 9.9 Utility Helpers

#### `KOSFS.formatSize(bytes)`
```
< 1 KB  → "N B"
< 1 MB  → "N.N KB"
< 1 GB  → "N.N MB"
≥ 1 GB  → "N.NN GB"
```

#### `KOSFS.typeIcon(type)`
Returns FontAwesome class string:
```
image    → 'fa-image'
video    → 'fa-film'
audio    → 'fa-music'
document → 'fa-file-alt'
app      → 'fa-puzzle-piece'
other    → 'fa-file'
```

### 9.10 Init

#### `KOSFS.init()`
Called once in `kos-init.js`:
```js
_db = await _openDB();
await _migrate();
_readyResolve();
KOSBus.emit('kos:fs-ready', {});
console.info('[KOSFS] Filesystem ready.');
```
On error: calls `_readyReject(err)` and re-throws.

### 9.11 Public Surface (frozen)

```js
KOSFS = Object.freeze({
  TYPES, ready, init,
  registerApp, hasPermission,
  inferType,
  write, read, readBlob, readText, readObjectURL, list,
  delete: remove,        // note: 'delete' is a reserved word, aliased here
  updateMeta,
  getStats, formatSize, typeIcon,
  _systemStats,
})
```

---

## 10. kos-fs-picker.js — KOSFS File Picker (Alpha 9 Module)

Appended to `window.KOSFS` as `KOSFS.Picker`. An IIFE that builds a full-screen modal overlay for selecting files from KOSFS or uploading new ones.

### 10.1 CSS Injection

`_injectCSS()` — injects a `<style id="kos-fs-picker-style">` into `<head>` on first call only (idempotent).

Full scoped CSS defined inline. Key classes:

| Class | Description |
|---|---|
| `.kosfs-picker-overlay` | Fixed full-screen backdrop, `z-index: 19000`, blur, fade-in animation |
| `.kosfs-picker-modal` | Centered modal container, max `720px` or `92vw`, max-height `78vh`, slide-up spring animation |
| `.kosfs-picker-header` | Title + close button row |
| `.kosfs-picker-tabs` | Browse / Upload tab bar |
| `.kosfs-picker-tab.active` | Active tab with indigo background and bottom-border trick |
| `.kosfs-picker-toolbar` | Search input + type filter dropdown |
| `.kosfs-picker-grid` | Auto-fill grid of file cards, `minmax(110px, 1fr)` |
| `.kosfs-picker-card` | Square aspect-ratio card with hover/selected states |
| `.kosfs-picker-card.selected` | Cyan border + glow + checkmark badge visible |
| `.kosfs-picker-empty` | Empty/no-results state centered in grid |
| `.kosfs-picker-upload-area` | Dashed border drag-drop zone |
| `.kosfs-picker-upload-progress` + `-bar` | 4px progress bar (hidden until upload starts) |
| `.kosfs-picker-footer` | File count + Cancel/Open buttons |
| `.kosfs-picker-btn-confirm:disabled` | 35% opacity, `cursor: not-allowed` |

Two keyframe animations: `kpFadeIn` (overlay) and `kpSlideUp` (modal with spring).

### 10.2 Internal State

```js
let _overlayEl  = null;      // root overlay DOM element
let _resolveFn  = null;      // the open() promise resolve function
let _opts       = {};        // current call's options
let _selected   = new Set(); // set of selected file IDs (numbers)
let _allFiles   = [];        // metadata from KOSFS.list(), no raw data
let _activeTab  = 'browse';
let _filterType = '';
let _searchTerm = '';
```

### 10.3 DOM Helpers

`_el(tag, cls, attrs = {})` — creates element, optionally sets `className`, `Object.assign`s attrs (covers `textContent`, `type`, etc.).

`_icon(faClass)` — creates `<i class="fas {faClass}">`.

### 10.4 Grid Rendering

#### `_buildCard(meta)`
Creates a `.kosfs-picker-card` div:
- `card.dataset.id = meta.id`
- Thumb area: if type is `IMAGE`, creates a lazy `<img>` and calls `KOSFS.readObjectURL(_opts.appId, meta.id)` async. Stores the resulting URL in `card._objectURLs[]` for later revocation. Falls back to type icon on error. Non-image types get a type icon directly.
- Label area: filename truncated with `text-overflow: ellipsis`.
- Check badge: `<div class="kosfs-picker-card-check">` with checkmark icon — shown only when card has `.selected`.
- Click listener calls `_toggleSelect(meta.id, card)`.
- If the ID is already in `_selected`, adds `.selected` immediately.

#### `_renderGrid()`
1. Revokes all existing card Object URLs (cleanup).
2. Clears grid `innerHTML`.
3. Applies `_filterType` and `_searchTerm` filters to `_allFiles`.
4. If nothing left: renders `.kosfs-picker-empty` with folder-open icon and context-aware message.
5. Otherwise: renders all cards via `DocumentFragment`.
6. Calls `_updateFooter()`.

#### `_toggleSelect(id, card)`
**Single select mode:** Deselects all other cards (removes `.selected` class from all), toggles selection on clicked card. If already selected, deselects (allows deselection).

**Multi-select mode:** Toggles the clicked card's selection independently.

Both modes call `_updateFooter()`.

#### `_updateFooter()`
- Disables confirm button if `_selected.size === 0`.
- Count label shows:
  - 0 selected: total file count
  - Multiple selected: "N selected"
  - 1 selected (single mode): "filename · size"

### 10.5 Tab Switching

`_switchTab(tab)` — shows/hides `.kosfs-picker-browse-pane` and `.kosfs-picker-upload-pane` using `style.display`. Updates `.active` class on tab buttons.

### 10.6 Upload Tab Logic

#### `_buildUploadPane()`
Creates the upload area with:
- Cloud-upload icon + instruction text
- Progress bar (hidden by default)
- Hidden `<input type="file" multiple>` — accept attribute constructed from `_opts.types` (maps to MIME wildcards like `image/*`, `video/*`, etc.)

Three ways to trigger upload:
1. Click on the area → `input.click()`
2. Drag and drop → `dragover` (prevent default + add `.drag-over`), `dragleave` (remove `.drag-over`), `drop` (prevent default, call `_handleUpload([...e.dataTransfer.files])`)
3. File input `change` event → `_handleUpload([...input.files])`

#### `_handleUpload(files, progressWrap, progressBar)`
Async. Shows progress bar. For each file:
1. `await KOSFS.write(_opts.appId, file)` — uses app's permission scope
2. Increments done counter, updates `progressBar.style.width`
3. On error: `console.error` + `showToast?.()` (optional chaining — global `showToast` may not be defined in all contexts)

After all files processed:
- Hides progress bar, resets to 0%
- If any files succeeded: shows toast, calls `_refreshFiles()`, switches to browse tab

### 10.7 File List Refresh

`_refreshFiles()` — calls `KOSFS.list(_opts.appId, filter)` where `filter.limit = 500` and `filter.type` is set if `_opts.types` has exactly one entry. Updates `_allFiles`, calls `_renderGrid()`. On error: sets `_allFiles = []`.

### 10.8 Overlay Build

`_build(opts)` — assembles the full modal DOM:
1. Overlay div (backdrop click → `_cancel()`)
2. Modal div
3. Header with title and close button
4. Tab bar (Browse + Upload) — **only added if `opts.allowUpload !== false`**
5. Browse pane:
   - Toolbar: search input + type filter `<select>` (only added if `allowedTypes.length > 1`)
   - Grid div
6. Upload pane (only if `opts.allowUpload !== false`)
7. Footer: file count label + Cancel + Confirm buttons
   - Confirm button text: "Select Files" if `multiple`, "Open" otherwise
   - Confirm disabled initially

Keyboard handler added to `document` for Escape (cancel) and Enter (confirm if selection exists).

### 10.9 Keyboard Handler

`_onKeyDown(e)` — `Escape` → `_cancel()`, `Enter` + `_selected.size > 0` → `_confirm()`.

### 10.10 Resolve / Reject

`_cancel()` — calls `_cleanup()`, resolves with `null`.

`_confirm()` — filters `_allFiles` to selected IDs, calls `_cleanup()`, resolves with:
- `multiple: true` → array of metadata objects
- `multiple: false` → single metadata object (or null if somehow empty)

`_cleanup()` — removes keyboard listener, revokes all card Object URLs, removes overlay from DOM, sets `_overlayEl = null`, clears state.

### 10.11 `KOSFS.Picker.open(opts)`

```js
KOSFS.Picker.open({
  appId:       string,   // required — must be registerApp'd
  types:       string[], // optional — restrict by KOSFS.TYPES values
  multiple:    boolean,  // optional — multi-select (default false)
  title:       string,   // optional (default 'Open File')
  allowUpload: boolean,  // optional — show Upload tab (default true)
})
// Returns Promise<metadata | metadata[] | null>
```

Throws immediately if `opts.appId` is missing or picker is already open.

Implementation: sets `_opts`, creates the promise, builds DOM, appends to body, calls `_refreshFiles()` to load the grid.

Public surface: `Object.freeze({ open })`.

---

## 11. kos-contextmenu.js — Right-Click Context Menu System

`KOSContextMenu` is an IIFE returning a frozen public API.

### 11.1 Architecture

```
Right-click anywhere
    │
    ├─ Is target inside a BLOCKED selector? → swallow, no menu
    │
    ├─ Is target inside a .window? → look up _appMenus[appId]
    │
    ├─ Is target inside a zone registered via registerZone()? → use that menu
    │
    └─ Built-in zone?
           .topbar   → TOPBAR_MENU
           .desktop  → DESKTOP_MENU
```

### 11.2 BLOCKED Selectors

Right-clicking inside any of these shows nothing (native menu suppressed by `e.preventDefault()`):
```
'#screen-boot', '#screen-login', '#screen-shutdown',
'#screen-restart', '#screen-sleep', '#dock',
'#dock-trigger-zone', '#spotlight-overlay'
```

### 11.3 Built-in Zone Menus

#### Desktop Menu (`_buildDesktopMenu`)
Items: Change Wallpaper (`WM.launch('settings')`), New Folder (dispatches `kos:desktop-new-folder`).

#### Topbar Menu (`_buildTopbarMenu`)
Items include system-level actions like opening system apps, power controls.

### 11.4 Menu Item Shape

```js
{ type: 'sep' }                         // horizontal rule
{ type: 'label', label: 'Section' }     // non-interactive heading
{
  label:    string,    // required
  icon:     string,    // optional FontAwesome class
  shortcut: string,    // optional display-only keyboard hint (e.g. '⌘S')
  variant:  string,    // optional 'danger' → red label
  disabled: boolean,   // optional
  checked:  boolean,   // optional checkmark to left of icon
  action:   Function,  // called on click
  sub:      item[],    // optional submenu array
}
```

### 11.5 Public API

```js
KOSContextMenu.register(appId, menuDef)          // App registers its own context menu
KOSContextMenu.registerZone(selector, menuDef)   // Register custom zone selector
KOSContextMenu.open(x, y, menuDef)               // Open programmatically
KOSContextMenu.close()                           // Close any open menu
```

**Adding a context menu to an app:**
```js
KOSContextMenu.register('myAppId', [
  { label: 'New File', icon: 'fa-file-plus',   action: () => myApp.newFile() },
  { label: 'Save',     icon: 'fa-floppy-disk', shortcut: '⌘S', action: () => myApp.save() },
  { type: 'sep' },
  { label: 'Close Window', icon: 'fa-xmark', variant: 'danger', action: () => WM.close(myApp.id) },
]);
```

---

## 12. apps/photos.js — Photos / Gallery App

Registered as `window.KOSApps.gallery`.

### 12.1 Constants and Module State

```js
const IDB_NAME  = 'kos-photos';
const IDB_VER   = 2;              // v2 stores ArrayBuffer, not base64
const IDB_STORE = 'uploads';
const BLOB_CAP  = 40;             // max LRU cached Object URLs at once

let _idbConn     = null;          // IDB singleton
let _idbMeta     = [];            // metadata only — NO image data in RAM
let _blobCache   = new Map();     // LRU: id → objectURL
let _currentImgs = [];            // filtered list for current render
let _lazyObs     = null;          // IntersectionObserver
let _kbHandler   = null;          // keydown handler ref for cleanup
let _renderTimer = null;          // debounce handle

let _sidebarAlbum = 'library';
let _galleryView  = 'grid';
let _favourites   = new Set(JSON.parse(localStorage.getItem('kos_photo_favs') || '[]'));
let _lbIdx  = -1;   // lightbox current index
let _lbSrc  = '';   // lightbox resolved blob URL
```

### 12.2 IndexedDB Layer

**Schema v2:** Object store `'uploads'`, keyPath `id`, autoIncrement. Fields: `id`, `buf` (ArrayBuffer), `name`, `mime`, `size`, `width`, `height`, `date`, `itype`.

`getDB()` — singleton IDB connection, opened once.

`idbLoadMeta()` — cursor-walks the entire store, destructures `{ src: _s, buf: _b, ...meta }` on each record to **exclude heavy binary fields from RAM**. Returns array of lightweight metadata objects.

`idbGetPayload(id)` — fetches one full record by ID including `buf` and `src` (only when needed for display).

`idbAdd(record)` — single add transaction.

`idbDeleteRecord(id)` — single delete transaction.

### 12.3 Blob URL LRU Cache

`getBlobUrl(id)`:
1. LRU hit → bubble to end of Map (delete + re-set), return URL.
2. LRU miss + cache full → evict oldest (first Map key), `URL.revokeObjectURL(oldest)`.
3. Fetch payload from IDB.
4. v2 (ArrayBuffer): `new Blob([payload.buf], { type: payload.mime })`.
5. v1 legacy (base64): `fetch(payload.src)` → `.blob()`.
6. `URL.createObjectURL(blob)`, store in cache, return URL.

`revokeAllBlobs()` — iterates cache, revokes all URLs, clears Map.

### 12.4 App Object

```js
window.KOSApps.gallery = {
  async init() { ... },
  async refresh() { ... },
};
```

`init()` — loads metadata, renders shell, attaches static listeners, calls `scheduleRender()`.

`refresh()` — re-loads metadata if window is open, updates sidebar counts, reschedules render.

### 12.5 Shell Structure

`renderShell(body)` — renders once per window open. HTML structure:
- `.ph-app`
  - `.ph-sidebar` (left panel)
    - Library section: Photos, Favourites nav items with badge counts
    - Albums section: Uploads, Avatars nav items with badge counts
  - `.ph-main` (right content)
    - Toolbar: view toggles (grid/list), upload button, `<input type="file" accept="image/*" multiple>` (hidden)
    - `.ph-grid` or `.ph-list` content area
  - `.ph-lightbox` — full-screen photo viewer overlay

### 12.6 Lazy Loading with IntersectionObserver

Each grid card has an `<img data-lazy-id="{id}">` with no `src`. An `IntersectionObserver` (`_lazyObs`) watches all `.ph-lazy-img` elements. When one enters the viewport, `getBlobUrl(id)` is called and `img.src` is set. The observer then unobserves that element (one-shot lazy load).

### 12.7 Lightbox

Opened by clicking any photo card. Full-screen overlay with the photo, navigation arrows (left/right), close button, keyboard support (arrow keys, Escape). `_lbIdx` tracks position in `_currentImgs`. Navigation calls `getBlobUrl(id)` for adjacent photos.

### 12.8 Sidebar Navigation

Each sidebar item has `data-album` attribute. Clicking updates `_sidebarAlbum` and calls `scheduleRender()`. Album values: `'library'` (all), `'favourites'`, `'uploads'`, `'avatars'`.

`updateSidebarCounts()` — updates badge numbers on each sidebar item.

### 12.9 Favourites

Stored in `localStorage` under `'kos_photo_favs'` as a JSON array of IDs. `_favourites` is a `Set` for O(1) lookup.

`toggleFavourite(id)` — adds/removes from Set, serializes to localStorage, updates the heart icon on the card, re-renders if in favourites album.

---

## 13. apps/files.js — Files App

Registered as `window.KOSApps.files`.

**Alpha 8 storage:** Opens four separate IDB databases directly (the Alpha 9 upgrade migrates this to KOSFS).

### 13.1 IDB Helpers (Alpha 8)

`_openIDB(name, version)` — opens an IDB, creates `'uploads'` store if needed. Cached in `_idbConns[name]`.

`_idbGetAll(dbName, version)` — cursor-walks, strips `buf` field (metadata only in RAM).

`_idbGetPayload(dbName, id, version)` — single get by ID, full record.

`_idbAdd(dbName, record, version)` / `_idbDelete(dbName, id, version)` — simple add/delete.

### 13.2 Blob URL Cache

Simple object `_blobMap` keyed by `"dbName:id"`. No LRU cap (unlike Photos).

`_getBlobUrl(dbName, id, version)` — checks cache, fetches from IDB if miss, creates Object URL, caches.

`_revokeBlobCache()` — revokes all URLs.

### 13.3 State

```js
const FI = {
  _folder:  'photos',   // active sidebar folder
  _view:    'grid',     // 'grid' | 'list'
  _counts:  {},
  _items:   [],         // currently loaded items
  _loading: false,
};
```

### 13.4 Folder Registry

```js
const FOLDERS = [
  { id: 'system',      label: 'System',      icon: 'fa-microchip',       uploadable: false, deletable: false },
  { id: 'photos',      label: 'Photos',      icon: 'fa-image',           uploadable: true,  deletable: true  },
  { id: 'videos',      label: 'Videos',      icon: 'fa-film',            uploadable: true,  deletable: true  },
  { id: 'audios',      label: 'Audios',      icon: 'fa-music',           uploadable: true,  deletable: true  },
  { id: 'documents',   label: 'Documents',   icon: 'fa-file-lines',      uploadable: true,  deletable: true  },
  { id: 'custom-apps', label: 'Custom Apps', icon: 'fa-window-maximize', uploadable: false, deletable: false },
];
```

### 13.5 Shell

`_renderShell(body)` renders the two-column layout:
- Sidebar: all `FOLDERS` as `<div class="fi-sidebar-item" data-folder onclick="_fiSetFolder">` with badge counts
- Main content area:
  - Toolbar: breadcrumb, grid/list view toggles, Import button (hidden for non-uploadable folders)
  - Content: `.fi-content` div updated by `_loadFolder()`
- 4 hidden `<input type="file">` elements (one per uploadable folder type)

### 13.6 Folder Loading (`_loadFolder`)

Dispatches to folder-specific loaders:
- `photos` → `_idbGetAll('kos-photos', 2)` → maps to unified item shape
- `videos` → `_idbGetAll('kos-videos', 1)`
- `audios` → `_idbGetAll('kos-audios', 1)`
- `documents` → `_idbGetAll('kos-documents', 1)`
- `system` → synthesized from `AppManifest` (name, size=0, date=now, jsPath as "version")
- `custom-apps` → reads `localStorage.getItem('kos-studio-apps')` (KOS Studio published apps)

Each loaded folder renders grid or list view, updates toolbar state, shows/hides import button.

### 13.7 Upload/Delete/Download

Each action is folder-specific:
- **Upload:** Triggers hidden file input, reads `file.arrayBuffer()`, stores via `_idbAdd`
- **Delete:** `_idbDelete`, refreshes view
- **Download:** `_getBlobUrl` → `URL.createObjectURL` → programmatic `<a download>` click → `revokeObjectURL` after 2 seconds

---

## 14. apps/notes.js — Notes App

Registered as `window.KOSApps.notes`. In Alpha 8, Notes is already fully integrated with KOSFS (it was the first app migrated ahead of the others).

### 14.1 `NotesApp` Object

```js
const NotesApp = {
  currentId: null,
  notes: [],           // metadata cache for UI operations
  toastTimeout: null,
  // methods...
};
window.KOSApps.notes = NotesApp;
```

### 14.2 `init()`

1. Reads permissions from manifest: `AppManifest.find(a => a.id === 'notes')`
2. Calls `KOSFS.registerApp('notes', manifest?.permissions || ['documents'])`
3. `await KOSFS.ready`
4. Builds the two-column UI:
   - Sidebar: header with "New Note" and upload buttons, `#notes-list`
   - Editor: toolbar (title input + Save + Delete), placeholder screen, `<textarea>`
5. Calls `bindEvents()`, `refreshNotesList()`, `setupKernelListeners()`

### 14.3 `refreshNotesList()`

Calls `KOSFS.list('notes')` — only sees DOCUMENT type (enforced by permission). Renders `.note-item` divs with `data-id`. Clicking calls `loadNote(id)`. Shows empty state if none found.

### 14.4 `loadNote(id)`

1. `KOSFS.readText('notes', id)` — returns plain text
2. Finds metadata from `this.notes` cache
3. Updates editor: shows textarea and controls, hides placeholder
4. Sets `textarea.value` and title input value
5. Updates `.active` class on sidebar items

### 14.5 `closeEditor()`

Sets `currentId = null`. Shows placeholder. Hides controls and textarea.

### 14.6 `bindEvents()`

**New Note button:** `KOSFS.write('notes', '', { name: 'Note N.txt', mimeType: 'text/plain', tags: ['note'] })`. Then `refreshNotesList()` → `loadNote(newId)`. Focuses and selects title input for instant rename.

**Upload button:** `filePicker.click()` → file selected → `FileReader.readAsText` → `KOSFS.write('notes', content, { name: file.name, ... })` → refresh → load.

**Save button:** Calls `persistActiveNote()`.

**Title input `blur`:** Calls `persistActiveNote()` (auto-save on focus loss).

**Title input `keydown` Enter:** Calls `titleInput.blur()` (triggers save via blur handler).

**Delete button:** `confirm()` dialog → `KOSFS.delete('notes', currentId)` → `closeEditor()` → `refreshNotesList()`.

### 14.7 `persistActiveNote()`

The overwrite pattern (KOSFS has no in-place content update):
1. Gets old metadata from `this.notes` cache
2. `KOSFS.delete('notes', this.currentId)`
3. `KOSFS.write('notes', newContent, { name: updatedTitle, mimeType: 'text/plain', tags: oldMeta.tags })`
4. Updates `this.currentId` to new ID
5. `refreshNotesList()`
6. Re-applies `.active` class to the new ID's list item
7. Shows toast

Title normalization: trims whitespace, defaults to `'Untitled Note'`, appends `.txt` if missing.

### 14.8 `setupKernelListeners()`

```js
KOSBus.on('kos:fs-write',  ({ writtenBy }) => { if (writtenBy !== 'notes') this.refreshNotesList(); });
KOSBus.on('kos:fs-delete', () => this.refreshNotesList());
KOSBus.on('kos:fs-update', () => this.refreshNotesList());
```

This keeps Notes in sync when another app (e.g. Files) creates, deletes, or renames a document.

### 14.9 `showToast(message)` / `stripExtension(filename)`

`showToast` — Uses `#notes-toast` element (the app's own toast, not the global one). Adds/removes `.show` class, debounced 2200ms.

`stripExtension` — `filename.replace(/\.[^/.]+$/, "")`.

---

## 15. apps/ui-manager.js — Settings App

Registered as `window.KOSApps.uimanager`.

### 15.1 Section Registry (`_SECTS`)

```js
const _SECTS = [
  { id:'appearance', label:'Appearance', icon:'fa-palette',       color:'#FF6B35', group:'Personal' },
  { id:'apps',       label:'Apps',       icon:'fa-table-cells',   color:'#007AFF', group:'Personal' },
  { id:'security',   label:'Password & Security', ...              group:'Personal' },
  { id:'display',    label:'Display',    icon:'fa-display',        color:'#5E5CE6', group:'System'  },
  { id:'notifications', ..., soon: true, group:'System' },
  { id:'privacy',       ..., soon: true, group:'System' },
  { id:'accessibility', ..., soon: true, group:'System' },
  { id:'network',       ..., soon: true, group:'System' },
  { id:'about',      label:'About KOS', icon:'fa-circle-info',    color:'#8E8E93', group:'About'   },
]
```

`soon: true` items render with a "Soon" pill and do not navigate when clicked.

### 15.2 Searchable Index (`_IDX`)

Array of `{ s: sectionId, label, sub }` objects. Used for in-app search. Covers all settings items with their subsection descriptions. Some entries reference `'notifications'`, `'privacy'`, etc. even though those are `soon` — searching finds them and navigates to the "soon" placeholder.

### 15.3 `init()`

Rebuilds the entire app on every `WM.open()` (settings re-initializes each time). Sets `_activeId = 'appearance'`, `_searchQ = ''`.

HTML structure:
```
.st-root
  aside.st-sidebar
    .st-sidebar-header (title "Settings")
    .st-search-wrap (search input)
    nav.st-nav (built by _buildNav())
  main.st-content (built by _renderSection(_activeId))
```

### 15.4 Navigation

`navigate(id)` — updates active section, adds `st-leaving` class to content (CSS transition out), replaces `innerHTML` with `_renderSection(id)`, removes `st-leaving`, adds `st-entering`, removes after 280ms. Calls `_runBuilders()` for appearance-specific grid builders.

`_renderSection(id)` dispatches to: `_renderAppearance`, `_renderApps`, `_renderSecurity`, `_renderDisplay`, `_renderAbout`, or `_renderSoon`.

### 15.5 `_renderAppearance()`

Cards:
1. **Theme** — Dark Mode toggle (`toggleTheme()`) + Glass UI toggle (`toggleGlass()`)
2. **Icon Style** — `<div id="ip-grid">` (populated by `buildIconPaletteGrid()` from kernel)
3. **Login Avatar** — `<div id="uim-avatar-section">` (populated by `buildAvatarSection()` from kernel)
4. **Wallpaper** — `<div id="wallpaperGrid">` (populated by `buildWallpaperGrid()` from kernel)

`_syncThemeToggles()` — re-reads body classes and syncs toggle knob states.

### 15.6 `_renderApps()`

Renders all `AppManifest` entries in rows with app icon, name, dock/spotlight pills, and an "Open" button. Includes an app-specific search input that filters visible rows via `_filterApps(q)`.

`openApp(id)` — global function (called from inline onclick): calls `WM.launch(id)`.

### 15.7 `_renderSecurity()`

Shows current password status badge (locked/unlocked). Form inputs for new password (minimum 6 characters). Buttons: Set Password, Change Password, Remove Password.

Password stored in `localStorage.getItem(KOS_PW_KEY)` (`'kos_login_password'`). If set, `attemptLogin()` in `kos-kernel.js` checks against this value instead of the default `'kosul'`.

Status message element `#uim-pw-status` shows success/error feedback.

### 15.8 `_renderDisplay()`

Delegates to `KOSDisplay` module for: Screen Zoom (50–250%), Text Size (6 levels), Bold Text toggle, Brightness slider (0–100%), Reset to Defaults button.

### 15.9 `_renderAbout()`

Shows static system info, copyright. Also calls `KOSFS._systemStats()` (Alpha 9) to show storage usage.

---

## 16. apps/browser.js — Smooth Browser

Registered as `window.KOSApps.browser` and aliased as `const Browser = window.KOSApps.browser`.

### 16.1 State

```js
_tabs:    [{ url: 'https://en.wikipedia.org', title: 'Wikipedia' }],
_active:  0,         // index of active tab
_history: [['https://en.wikipedia.org']],  // per-tab history stacks
_histIdx: [0],       // per-tab history cursor
_loading: false,
```

### 16.2 Methods

`init()` — calls `renderTabs()`, `updateURLBar()`, `_attachFrameEvents()`.

`_attachFrameEvents()` — attaches `load` listener on `#br-frame`. On load: hides loading indicator, updates tab title from `frame.contentDocument.title` (guarded by try/catch for cross-origin), calls `updateURLBar()`.

`_setLoading(state)` — toggles `.loading` on `#br-progress-bar`, changes reload icon between `fa-rotate-right` and `fa-xmark`.

`navigate(rawInput)` — URL normalization:
- Already has `http://` or `https://` → use as-is
- Looks like a domain (`word.word/...`) → prepend `https://`
- Otherwise → DuckDuckGo search: `https://duckduckgo.com/?q={encoded}`

Truncates forward history when navigating away from mid-history position. Updates tab state, calls `_loadFrame(url)`, `renderTabs()`, `updateURLBar()`.

`back()` / `forward()` — per-tab history navigation using `_histIdx`.

`reload()` — if loading, stops (reset `src`); if not loading, starts loading (reset `src`).

`newTab(url)` — appends new tab state. `closeTab(idx)` — removes tab state, adjusts `_active` if needed.

`renderTabs()` — renders the tab bar HTML. Each tab shows a `google.com/s2/favicons` 16px favicon, truncated title, and close button. Plus a `+` new tab button.

`updateURLBar()` — sets `#br-url-input.value`. Updates `#br-lock-icon` to `fa-lock` (secure) or `fa-lock-open` (insecure) based on `https://` prefix.

`_getDomain(url)` — extracts hostname from URL for favicon fetching.

---

## 17. apps/studio.js — KOS Studio

Registered as `window.KOSApps.studio` and exposed as `const KOSStudio`. Also aliased globally so Studio-published apps get a `restorePublished()` call in the boot sequence.

**Storage:** Custom apps in `localStorage` under `'kos-studio-apps'` as JSON array. System overrides in `KEY_SYS_OVERRIDES` (`'kos-sys-overrides'`).

### 17.1 State

```js
_page:        'home',      // 'home' | 'editor' | 'syseditor'
_editingId:   null,
_editingType: null,        // 'custom' | 'system'
_studioTab:   'myapps',    // 'myapps' | 'sysapps'
_activeTab:   'html',      // 'html' | 'css' | 'js'
_activeSysTab:'sys-css',
```

### 17.2 Custom App Schema

Each custom app object stored in `'kos-studio-apps'`:
```js
{
  id:          string,      // UUID-style or timestamp-based
  name:        string,
  html:        string,
  css:         string,
  js:          string,
  published:   boolean,
  publishType: string,      // 'system' or undefined
}
```

### 17.3 Home Screen

Two tabs: **My Apps** and **System Apps**.

**My Apps tab** — lists all custom apps with Edit/Open/Delete buttons. "Create New App" button creates a new empty app and navigates to editor.

**System Apps tab** — lists all `AppManifest` entries where `initData && metadata.isSystemApp` and no custom app with the same ID exists. Shows "Custom Override" / "Default" badge. Clicking "Edit" navigates to the system editor.

### 17.4 Custom App Editor

Three-panel layout:
- Left: CSS browser sidebar listing core CSS variable names from `css/core-vars.css` for reference
- Center: HTML/CSS/JS tab-switch textarea editor
- Right: Collapsible preview panel with an `<iframe sandbox="allow-scripts allow-same-origin">`

`saveCode()` — reads all three textarea values, saves to the app's entry in localStorage.

`saveName(value)` — updates the app name in real-time.

`switchTab(tab)` — shows/hides textareas.

`launchPreview()` — builds a self-contained HTML document from the app's HTML/CSS/JS, writes it to the iframe using `URL.createObjectURL(blob)`.

`publish()` — adds the app to `AppManifest` dynamically, creates a window DOM entry in `WM`, calls `KOSBus.dispatch('kos:registry-changed')` (dock and spotlight rebuild). Marks `app.published = true`.

`deleteApp(id)` — removes from localStorage array. If published, also removes from `AppManifest` + `WM.registry`, dispatches `kos:registry-changed`.

### 17.5 System App Editor

`editSysApp(appId)` — navigates to `syseditor` page.

Two tabs: **System CSS** (read-only display of the original CSS file) and **Override** (writable textarea for injecting custom CSS/JS).

`saveSysOverride(appId, css, js)` — saves to `KEY_SYS_OVERRIDES` in localStorage. These are applied by `applySysOverride(appId)` (in `kos-kernel.js`) every time the app's window is opened.

`clearSysOverride(appId)` — removes the entry from `KEY_SYS_OVERRIDES`.

### 17.6 `restorePublished()`

Called by `kos-init.js` during boot. Reads `'kos-studio-apps'`, for each published app:
- Adds the app to `AppManifest` if not already there
- Creates its window DOM
- Registers it with WM

This ensures custom apps survive page reload.

---

## 18. apps/task-mgr.js — Task Manager

Registered as `window.KOSApps.taskmanager`.

### 18.1 Simulated Performance Data

Two lookup tables providing simulated memory (MB) and CPU (%) values per app:
```js
const APP_MEMORY = { browser: 135, music: 48, video: 72, ... };
const APP_CPU    = { browser: 3.2, music: 1.1, video: 4.5, ... };
```

Apps not in the table get random filler values.

### 18.2 Polling

`_tmInterval` — 4-second `setInterval` handle calling `refreshTM()`.

`stopTMPolling()` — clears interval; called before starting a new one to prevent double-intervals.

Element refs cached after `body.innerHTML` is set: `_tmMemUsed`, `_tmMemSub`, `_tmMemBar`, `_tmHeapUsed`, `_tmHeapSub`, `_tmHeapBar`, `_tmList`.

### 18.3 Memory Panel

`updateTMMemory()` — reads `performance.memory` (Chrome-only API):
- `usedJSHeapSize` → "Memory Used"
- `totalJSHeapSize` → "JS Heap allocated"
- `jsHeapSizeLimit` → denominator for percentage
- Updates bar fill widths and text directly on cached elements (no `getElementById` per tick)

### 18.4 Process List

`buildTMProcessList()` — gets all open apps from `WM.registry`. For each open app:
1. Looks up memory and CPU from lookup tables (with jitter)
2. Gets `AppManifest` entry for icon and name

**Performance optimization:** Uses in-place DOM patching — finds existing `.tm-row[data-app-id]` and updates its text nodes instead of rebuilding the whole list. Only adds/removes rows for apps that have opened or closed. Uses `DocumentFragment` for new rows.

The force-quit button for each row calls `WM.close(appId)`.

KOSBus listeners are debounced via `requestAnimationFrame` to prevent rapid open/close events flooding the list rebuild.

---

## 19. apps/calculator.js — Calculator

Registered as `window.KOSApps.calculator` and as global `const Calc`.

### 19.1 `Calc` Object (Logic)

```js
const Calc = {
  display:  '0',
  operator: null,  // current pending operator (+, -, ×, ÷)
  operand:  null,  // left-hand operand stored on operator press
  fresh:    true,  // if true, next digit starts a fresh number
  _histOp:  null,  // operator to highlight in the UI
};
```

`Calc.press(key)` — the single input handler for all button clicks:
- `'AC'` → reset all state
- `'+/-'` → negate `display`
- `'%'` → divide `display` by 100, set `fresh = true`
- `'+', '-', '×', '÷'` → if operator pending and not fresh, compute first; save `operand`, set `operator`, set `fresh = true`
- `'='` → compute if `operator` set, clear operator, set `fresh = true`
- `'.'` → if fresh, set `display = '0.'`; if not, append `.` if not already present
- digit → if fresh, replace `display`; if not, append (capped at 10 significant chars)

`_update()` — adjusts font size based on digit count (3rem → 2rem → 1.6rem), updates `#calc-display` text, highlights active operator button.

`_compute()` — performs the arithmetic using `operand` and `display`, formats result via `_fmt()`.

`_fmt(n)` — uses `toPrecision(10)` to eliminate floating-point noise, falls back to `toExponential(4)` if result exceeds 12 characters.

### 19.2 Layout

`LAYOUT` is a hardcoded 5-row array of button specs `{ k: key, c: css-class }`. Rendered as a flat grid using CSS grid. The zero button (`'0'`) has class `calc-zero` for double-width.

---

## 20. apps/about.js — About KOS

Registered as `window.KOSApps.about`.

### 20.1 `ABOUT_INFO` Config Block

```js
const ABOUT_INFO = {
  osName:     'KOS Ultimate',
  edition:    '2026 Edition',
  version:    'Alpha 6',          // Note: shows Alpha 6 even in Alpha 8 build
  build:      'Build 6.0 (Unstable)',
  launchDate: 'April 3, 2026',
  developer:  'Kalapurackal Studios',
  devHandle:  '@kalapurackalstudios',
  website:    'na',
  copyright:  '© 2021 – 2026 Kalapurackal Studios. All rights reserved.',
  license:    'Personal Use License',
  tagline:    'Crafted with care. Built for flow.',
};
```

This is the only block that needs editing when version info changes.

### 20.2 `init()`

Reads live system data from browser APIs:
- `navigator.userAgent`, `navigator.platform`, `navigator.language`
- `navigator.hardwareConcurrency` — CPU core count
- `navigator.deviceMemory` — RAM estimate in GB
- `window.screen.width/height`, `window.devicePixelRatio`
- Browser engine sniffed from UA string: Blink/Chrome, Gecko/Firefox, or WebKit/Safari

Renders four sections: Hero block, Version Info, System Info, Developer Info. All sourced from `ABOUT_INFO` + live data.

`_abRow(label, value)` — helper that returns an `<div class="ab-info-row">` HTML string.

---

## 21. apps/release-notes.js — Release Notes

Registered as `window.KOSApps.releasenotes`.

### 21.1 `RELEASES` Array

Data-driven changelog. Each entry:
```js
{
  version:  string,
  date:     string,
  tag:      string,      // e.g. 'Performance Update', 'Alpha Release'
  tagColor: string,      // 'green', 'orange', etc.
  sections: [
    { title: string, items: string[] }
  ]
}
```

The **first** entry in `RELEASES` is always rendered as "Latest".

Adding a new version = prepend a new object to the array. Nothing else changes.

### 21.2 Rendering

`init()` — renders:
- Latest version header with large version number, date, and colored tag pill
- Expandable/collapsible version cards for all previous releases
- Each section with an emoji title and a bulleted list of items

---

## 22. terminal.js — Root System Terminal

An IIFE registering `appId = 'terminal'` with `WM.setOnOpen`. The `RootTerminal` object is module-local.

### 22.1 State

```js
const RootTerminal = {
  history:      [],     // command history array
  historyIndex: -1,     // cursor into history for up/down navigation
  commands:     { ... } // command registry
};
```

### 22.2 Command Registry

All commands are objects with `description` (shown in `help`) and `execute(args, outputEl)` function.

| Command | Description |
|---|---|
| `help` | Lists all commands with descriptions |
| `clear` | Clears the output element's innerHTML, returns null |
| `sysinfo` | Reads zoom, theme, glass state from localStorage/classList |
| `tree` | Async — queries KOSFS.list('', {}) and renders a directory-style tree of all files |
| `theme` | Sets light or dark theme via `toggleTheme()` |
| `glass` | Enables/disables glass via `toggleGlass()` |

### 22.3 `tree` Command Detail

1. Checks `window.KOSFS.list` is available — returns error if not.
2. Calls `window.KOSFS.list('', {})` — Note: empty string appId may cause a permission error in production KOSFS; this is a potential bug.
3. Categorizes files by `KOSFS.TYPES.*` into buckets: images, videos, audio, documents, applications, unknown.
4. Renders as a `root/` tree with Unicode box-drawing characters (`├──`, `└──`, `│`).
5. Each file entry shows name, MIME type suffix, and human-readable size via `KOSFS.formatSize()`.

### 22.4 Input Handling

`enter` key → parses input into command + args (split on spaces), looks up in `commands`, calls `execute(args, outputEl)`. Handles both sync return values and Promises (async commands). Adds to history.

`ArrowUp`/`ArrowDown` → navigates `history[]` array.

Output is appended to the scrollable output div as `<div class="terminal-line ...">` elements.

---

## 23. KOSBus — Global Event Bus Reference

Complete reference of all KOSBus events in the Alpha 8 + Alpha 9 codebase:

### Window Manager Events (dispatched by WM)

| Event | Payload | Listeners |
|---|---|---|
| `kos:app-opened` | `{ appId }` | kos-init (dock), task-mgr |
| `kos:app-closed` | `{ appId }` | kos-init (dock), task-mgr |
| `kos:app-minimized` | `{ appId }` | kos-init (dock) |
| `kos:app-restored` | `{ appId }` | kos-init (dock) |
| `kos:app-focused` | `{ appId }` | *(available for apps to use)* |
| `kos:registry-changed` | `{}` | kos-init (rebuilds dock + spotlight) |
| `kos:windows-visible-changed` | `{ hasVisible: boolean }` | kos-init (dock auto-hide) |
| `kos:request-spotlight-close` | `{}` | kos-init (closes spotlight) |

### Kernel Events

| Event | Payload | Dispatched by | Listeners |
|---|---|---|---|
| `kos:theme-changed` | `{ theme }` | `applyTheme()` | *(apps can react)* |
| `kos:glass-changed` | `{ enabled }` | `applyGlass()` | *(apps can react)* |
| `kos:desktop-new-folder` | `{}` | context menu | *(not yet implemented)* |

### KOSFS Events (Alpha 9)

| Event | Payload | Dispatched by | Listeners |
|---|---|---|---|
| `kos:fs-ready` | `{}` | `KOSFS.init()` | *(apps can await KOSFS.ready instead)* |
| `kos:fs-write` | `{ id, type, name, size, writtenBy }` | `KOSFS.write()` | notes.js (refresh list if not self-written) |
| `kos:fs-delete` | `{ id, type, name, deletedBy }` | `KOSFS.delete()` | notes.js (refresh list) |
| `kos:fs-update` | `{ id, type, patch, updatedBy }` | `KOSFS.updateMeta()` | notes.js (refresh list) |

---

## 24. IndexedDB Storage Contracts (Alpha 8)

### `kos-photos` (v2) — object store: `'uploads'`

| Field | Type | Notes |
|---|---|---|
| `id` | auto-number | keyPath |
| `buf` | ArrayBuffer | Raw image data (v2). v1 used `src: base64 string`. |
| `name` | string | Filename |
| `mime` | string | MIME type |
| `size` | number | Bytes |
| `width` | number | Pixels |
| `height` | number | Pixels |
| `date` | string/number | Upload date |
| `itype` | string | Image sub-type hint |

### `kos-videos` (v1) — object store: `'uploads'`

| Field | Type |
|---|---|
| `id` | auto-number |
| `buf` | ArrayBuffer |
| `name` | string |
| `mime` | string |
| `size` | number |
| `date` | string/number |

### `kos-audios` (v1) — object store: `'uploads'`

Same schema as `kos-videos`.

### `kos-documents` (v1) — object store: `'uploads'`

| Field | Type | Notes |
|---|---|---|
| `id` | auto-number | |
| `text` | string | Text content (not ArrayBuffer) |
| `name` | string | |
| `size` | number | |
| `date` | string/number | |

**Note:** The `kos-documents` store uses `text: string` instead of `buf: ArrayBuffer`. The KOSFS migration handles this by checking `r.data instanceof ArrayBuffer` — documents using the old `text` field will be skipped in migration unless the migration code is updated to handle them.

### `kos-filesystem` (v1) — Unified store (Alpha 9)

| Field | Type | Notes |
|---|---|---|
| `id` | auto-number | keyPath, autoIncrement |
| `name` | string | Indexed (`by_name`) |
| `type` | string | `KOSFS.TYPES.*`. Indexed (`by_type`) |
| `mimeType` | string | |
| `size` | number | Bytes |
| `data` | ArrayBuffer | Binary content |
| `createdAt` | number | `Date.now()`. Indexed (`by_createdAt`) |
| `modifiedAt` | number | `Date.now()` |
| `tags` | string[] | Multi-entry indexed (`by_tag`) |
| `albumIds` | string[] | Multi-entry indexed (`by_albumId`) |
| `writtenBy` | string | appId of writer, or `'migration'` |
| `_legacyId` | any | Original ID from legacy DB (migration only) |
| `_legacyDB` | string | Source DB name (migration only) |

### localStorage Keys (non-IDB persistence)

| Key | Used by | Value |
|---|---|---|
| `kos-theme` | kernel | `'light'` or `'dark'` |
| `kos-wallpaper` | kernel | wallpaper value string |
| `kos-avatar` | kernel | avatar data URL |
| `kos-custom-avatars` | kernel | JSON array |
| `kos-custom-wallpapers` | kernel | JSON array |
| `kos-session` | WM | JSON window state map |
| `kos-icon-palette` | kernel | palette ID |
| `kos-sys-overrides` | kernel/studio | JSON `{ appId: { css, js } }` |
| `kos-glass` | kernel | `'on'` or `'off'` |
| `kos-studio-apps` | studio | JSON custom app array |
| `kos-login-password` | kernel/settings | custom password string |
| `kos_photo_favs` | photos | JSON array of favourite IDs |
| `kos-fs-v1-migrated` | kos-fs | timestamp string (migration flag) |
| `kos_first_boot_complete` | kos-init | `'true'` |

---

## 25. CSS Architecture Overview

### Load Strategy

Core CSS is linked statically in `<head>`. App CSS is injected dynamically by `WM._injectAssets()` on first app launch. Both Google Fonts and FontAwesome are loaded non-render-blocking using the `media="print"` + `onload="this.media='all'"` trick.

### Core Files

| File | Responsibility |
|---|---|
| `css/core-vars.css` | CSS custom properties, resets, `.app-icon` gradient declarations, all `@keyframe` animations |
| `css/shell.css` | Boot/sleep/restart/shutdown screens, login card, desktop layout, topbar, spotlight overlay |
| `css/wm.css` | Window `.window` base, `.win-titlebar`, control buttons, resize handles, minimize/maximize/snap animations |
| `css/kos-contextmenu.css` | `#kos-ctx-menu` styles, menu items, separators, submenus, danger variant |

### CSS Variable Conventions

All theme-aware colors are defined as CSS custom properties on `:root` in `core-vars.css`. The `dark` class on `<body>` overrides these for dark mode. Glass effects use `backdrop-filter: blur(...)` and are disabled by the `no-glass` class on `<body>`.

`--icon-filter` is set by `applyIconPalette()` and applied to all `.app-icon` elements.

`--spotlight-dock-clearance` controls the vertical offset of the Spotlight panel to avoid overlapping a visible dock.

---

## 26. Alpha 9 Upgrade: KOSFS Integration Summary

The `KOSFS_INTEGRATION_GUIDE.md` documents all changes required to upgrade from Alpha 8 to Alpha 9. Here is a consolidated summary:

### New Files Added

| File | Role |
|---|---|
| `kos-fs.js` | KOSFS kernel module — `window.KOSFS` |
| `kos-fs-picker.js` | Shared file picker — `KOSFS.Picker` |

### index.html Changes

Add two script tags after `kos-kernel.js` and before `kos-wm.js`:
```html
<script defer src="kos-fs.js"></script>
<script defer src="kos-fs-picker.js"></script>
```

### kos-init.js Changes

Add `await KOSFS.init()` inside the async boot IIFE, after `KOSDisplay.apply()`:
```js
KOSDisplay.apply();
await KOSFS.init();
```

### sw.js Changes

Add to `ASSETS` array:
```js
'kos-fs.js',
'kos-fs-picker.js',
```

### kos-manifest.js Changes

Add `permissions` field to every app entry (already done in the Alpha 8 manifest in this codebase — the file is already Alpha 9-ready).

### Per-App Changes

Each app's `init()` must be updated to call `KOSFS.registerApp()` and `await KOSFS.ready` before any file operations:

```js
const manifest = AppManifest.find(a => a.id === 'YOUR_APP_ID');
KOSFS.registerApp('YOUR_APP_ID', manifest.permissions);
await KOSFS.ready;
```

**Notes app** — already fully migrated to KOSFS in Alpha 8.

**Photos app** — replace direct `kos-photos` IDB code with `KOSFS.list/write/readObjectURL/delete/updateMeta`.

**Files app** — replace four separate IDB calls with single `KOSFS.list/write/readBlob/delete` calls.

**Settings (ui-manager.js)** — add Storage section calling `KOSFS._systemStats()`.

### KOSBus API Note

`kos-fs.js` calls `KOSBus.emit(...)`. The Alpha 8 `kos-kernel.js` defines `KOSBus.dispatch(...)` not `.emit(...)`. The integration requires either:
- Renaming `dispatch` to `emit` in `kos-kernel.js` (breaking change), or
- Adding `emit: KOSBus.dispatch.bind(KOSBus)` alias to the `KOSBus` object, or
- Updating `kos-fs.js` to call `KOSBus.dispatch(...)` instead

---

*End of KOS Ultimate 2026 Alpha 8 Full Codebase Documentation.*
