/* ══════════════════════════════════════════════════════════════
   KOS ULTIMATE 2026 — kos-manifest.js
   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   THE ONLY FILE YOU EDIT TO ADD A NEW APP.

   HOW TO ADD A NEW APP:
   1. Add an entry to AppManifest below.
   2. Create  apps/<your-id>.js   with a KOSApps['<id>'] object.
   3. Create  css/apps/<your-id>.css  with your app styles.
   4. Add an icon gradient  .icon-<your-id>  in css/core-vars.css.
   That's it — Dock, Spotlight, and Task Manager update automatically.

   FIELD REFERENCE:
   id          — unique camelCase key, also used for DOM ids
   name        — human-readable display name
   iconClass   — CSS class for the icon gradient  (css/core-vars.css)
   faIcon      — FontAwesome class, e.g. 'fa-globe'
   jsPath      — path to the app module  (loaded once on first launch)
   cssPath     — path to the app stylesheet (injected once on first launch)
   metadata:
     showInDock  — whether the icon appears in the Dock
     searchable  — whether it appears in Spotlight
     isSystemApp — protected from deletion by KOS Studio
   initData:
     w, h        — computed automatically via winSize() — do not set manually
     ratio       — aspect ratio as [w, h] e.g. [16,9] or [4,3] or [1,1]
     size        — how much of the viewport width the window occupies (0–100)
     offset      — stagger from centre (helps avoid window stacking)
     title       — override titlebar text (defaults to name)
     special     — 'browser' | 'gallery'  triggers special DOM layouts
     bodyId      — id for the scrollable .win-body  (default: <id>-body)
     bodyClass   — extra CSS class on the body div

   ══════════════════════════════════════════════════════════════
   RESPONSIVE SIZING — winSize(size, ratio)
   ─────────────────────────────────────────────────────────────
   One universal helper handles every app:

     winSize(size, [rw, rh])

     size      — how wide the window is as a % of viewport width
     [rw, rh]  — aspect ratio as a two-element array

   Algorithm:
     1. w  = size% of viewport width
     2. h  = w * (rh / rw)          ← derived from the ratio
     3. If h would overflow the viewport, scale both axes down
        so the window fits snugly inside the screen height instead.

   Each app declares its own  ratio  and  size  in initData.
   winSize() is called once at manifest load time.

   Common ratios for reference:
     [16,  9]  — widescreen / most monitors
     [ 4,  3]  — classic square-ish
     [ 3,  5]  — tall portrait  (good for calculators, panels)
     [ 4,  5]  — tall document  (good for readers, release notes)
     [ 1,  1]  — perfect square
     [21,  9]  — ultrawide cinematic
   ══════════════════════════════════════════════════════════════ */

/* ── Viewport helpers ── */
const _vw = () => window.innerWidth  || screen.width;
const _vh = () => window.innerHeight || screen.height;

/**
 * winSize(size, [rw, rh])
 *
 * @param {number}   size   — window width as % of viewport width (e.g. 60)
 * @param {number[]} ratio  — aspect ratio array [width, height]  (e.g. [16, 9])
 * @returns {{ w: number, h: number }}
 *
 * Examples:
 *   winSize(60, [16, 9])  →  60% vw wide, 16:9 tall
 *   winSize(30, [ 4, 3])  →  30% vw wide,  4:3 tall
 *   winSize(40, [ 1, 1])  →  40% vw wide, square
 *   winSize(20, [ 3, 5])  →  20% vw wide, tall portrait
 *   winSize(50, [21, 9])  →  50% vw wide, ultrawide cinematic
 */
function winSize(size, [rw, rh]) {
  const vw = _vw();
  const vh = _vh();

  let w = Math.round(vw * (size / 100));
  let h = Math.round(w  * (rh / rw));

  // If the derived height overflows the viewport, scale both
  // dimensions down so the window fits inside screen height.
  if (h > vh) {
    h = vh;
    w = Math.round(h * (rw / rh));
  }

  return { w: Math.min(w, vw), h: Math.min(h, vh) };
}


const AppManifest = [

  /* ── Browser ─────────────────────── 16:9 @ 60% ── */
  {
    id: 'browser',
    name: 'Kalapurackal',
    iconClass: 'icon-browser',
    faIcon: 'fa-globe',
    jsPath: 'apps/browser.js',
    cssPath: 'css/apps/browser.css',
    metadata: { showInDock: true, searchable: true, isSystemApp: true },
    initData: {
      ...winSize(60, [16, 9]),
      ratio: [16, 9], size: 60,
      offset: 0, title: 'Kalapurackal Smooth', special: 'browser'
    }
  },

  /* ── UI Manager ───────────────────── 4:3 @ 45% ── */
  {
    id: 'uimanager',
    name: 'UI Manager',
    iconClass: 'icon-uimanager',
    faIcon: 'fa-sliders',
    jsPath: 'apps/ui-manager.js',
    cssPath: 'css/apps/ui-manager.css',
    metadata: { showInDock: true, searchable: true, isSystemApp: true },
     initData: {
      ...winSize(32, [3, 5]),
      ratio: [3, 5], size: 32,
      offset: 0, bodyId: 'uim-body'
    }
  },

  /* ── Task Manager ─────────────────── 16:9 @ 50% ── */
  {
    id: 'taskmanager',
    name: 'Task Manager',
    iconClass: 'icon-taskmanager',
    faIcon: 'fa-list-check',
    jsPath: 'apps/task-mgr.js',
    cssPath: 'css/apps/task-mgr.css',
    metadata: { showInDock: true, searchable: true, isSystemApp: true },
    initData: {
      ...winSize(50, [16, 9]),
      ratio: [16, 9], size: 50,
      offset: 30, bodyId: 'tm-body', bodyClass: 'tm-body'
    }
  },

  /* ── Photos ───────────────────────── 16:9 @ 65% ── */
  {
    id: 'gallery',
    name: 'Photos',
    iconClass: 'icon-gallery',
    faIcon: 'fa-images',
    jsPath: 'apps/photos.js',
    cssPath: 'css/apps/photos.css',
    metadata: { showInDock: true, searchable: true, isSystemApp: true },
   initData: {
      ...winSize(60, [16, 9]),
      ratio: [16, 9], size: 60,
      offset: 60, special: 'gallery'
    }
  },

  /* ── Calculator ───────────────────── 3:5 @ 20% ── */
  {
    id: 'calculator',
    name: 'Calculator',
    iconClass: 'icon-calculator',
    faIcon: 'fa-calculator',
    jsPath: 'apps/calculator.js',
    cssPath: 'css/apps/calculator.css',
    metadata: { showInDock: true, searchable: true, isSystemApp: true },
    initData: {
      ...winSize(32, [3, 5]),
      ratio: [3, 5], size: 32,
      offset: 90, bodyId: 'calc-body', bodyClass: 'calc-body-wrap'
    }
  },

  /* ── KOS Studio ───────────────────── 16:9 @ 75% ── */
  {
    id: 'studio',
    name: 'KOS Studio',
    iconClass: 'icon-studio',
    faIcon: 'fa-code',
    jsPath: 'apps/studio.js',
    cssPath: 'css/apps/studio.css',
    metadata: { showInDock: true, searchable: true, isSystemApp: true },
    initData: {
      ...winSize(60, [16, 9]),
      ratio: [16, 9], size: 60,
      offset: 0, title: 'KOS Studio', bodyId: 'studio-body', bodyClass: 'studio-body-wrap'
    }
  },

  /* ── About ────────────────────────── 4:5 @ 28% ── */
  {
    id: 'about',
    name: 'About KOS',
    iconClass: 'icon-about',
    faIcon: 'fa-circle-info',
    jsPath: 'apps/about.js',
    cssPath: 'css/apps/about.css',
    metadata: { showInDock: false, searchable: true, isSystemApp: true },
      initData: {
      ...winSize(32, [3, 5]),
      ratio: [3, 5], size: 32,
      offset: 0, bodyId: 'about-body'
    }
  },

  /* ── Release Notes ────────────────── 4:5 @ 32% ── */
  {
    id: 'releasenotes',
    name: 'Release Notes',
    iconClass: 'icon-releasenotes',
    faIcon: 'fa-newspaper',
    jsPath: 'apps/release-notes.js',
    cssPath: 'css/apps/release-notes.css',
    metadata: { showInDock: false, searchable: true, isSystemApp: true },
    initData: {
      ...winSize(32, [3, 5]),
      ratio: [3, 5], size: 32,
      offset: 20, bodyId: 'rn-body'
    }
  },

  /* ── Placeholder / coming-soon apps ── */
  {
    id: 'music',
    name: 'Music',
    iconClass: 'icon-music',
    faIcon: 'fa-music',
    jsPath: null,
    cssPath: null,
    metadata: { showInDock: true, searchable: true, isSystemApp: true },
    initData: null
  },

  /* ── Notes ────────────────────────── 16:9 @ 60% ── */
  {
    id: 'notes',
    name: 'Notes',
    iconClass: 'icon-notes',
    faIcon: 'fa-pen-to-square',
    jsPath: 'apps/notes.js',
    cssPath: 'css/apps/notes.css',
    metadata: { showInDock: true, searchable: true, isSystemApp: true },
    initData: {
      ...winSize(60, [16, 9]),
      ratio: [16, 9], size: 60,
      offset: 40, title: 'Liquid Notes', bodyId: 'notes-body'
    }
  },

  {
    id: 'messages',
    name: 'Messages',
    iconClass: 'icon-messages',
    faIcon: 'fa-message',
    jsPath: null,
    cssPath: null,
    metadata: { showInDock: false, searchable: true, isSystemApp: true },
    initData: null
  },
  {
    id: 'store',
    name: 'App Store',
    iconClass: 'icon-store',
    faIcon: 'fa-bag-shopping',
    jsPath: null,
    cssPath: null,
    metadata: { showInDock: false, searchable: true, isSystemApp: true },
    initData: null
  },

  /* ── Files ────────────────────────── 16:9 @ 70% ── */
  {
    id: 'files',
    name: 'Files',
    iconClass: 'icon-files',
    faIcon: 'fa-folder',
    jsPath: 'apps/files.js',
    cssPath: 'css/apps/files.css',
    metadata: { showInDock: true, searchable: true, isSystemApp: true },
   initData: {
      ...winSize(60, [16, 9]),
      ratio: [16, 9], size: 60,
      offset: 0, title: 'Files', bodyId: 'files-body', bodyClass: 'fi-app-wrap'
    }
  },

];