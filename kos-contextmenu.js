/* ══════════════════════════════════════════════════════════════
   KOS ULTIMATE 2026 — kos-contextmenu.js
   Right-click context menu system.

   ┌─ ARCHITECTURE ────────────────────────────────────────────┐
   │  KOSContextMenu (public API)                               │
   │    .register(appId, menuDef)  ← apps extend their menus   │
   │    .registerZone(selector, menuDef) ← custom HTML zones   │
   │    .open(x, y, menuDef)       ← programmatic open         │
   │    .close()                                                │
   │                                                            │
   │  Zone resolution order (first match wins):                 │
   │    1. Blocked zones → swallow, no menu                     │
   │    2. App-registered menu    (data-app-id on .window)      │
   │    3. Custom zone registry   (registerZone)                │
   │    4. Built-in zones:                                      │
   │         .topbar            → TOPBAR_MENU                   │
   │         .desktop / body    → DESKTOP_MENU                  │
   └────────────────────────────────────────────────────────────┘

   UPGRADE PATH — adding a menu to an app:
   ─────────────────────────────────────────────────────────────
     // In your app's JS (after KOSContextMenu is loaded):
     KOSContextMenu.register('myAppId', [
       { label: 'New File',     icon: 'fa-file-plus',   action: () => myApp.newFile() },
       { label: 'Save',         icon: 'fa-floppy-disk', shortcut: '⌘S', action: () => myApp.save() },
       { type: 'sep' },
       { label: 'Preferences',  icon: 'fa-sliders',     action: () => myApp.prefs() },
       { type: 'sep' },
       { label: 'Close Window', icon: 'fa-xmark',       variant: 'danger',
         action: () => WM.close(myApp.id) },
     ]);

   MENU ITEM SHAPE:
   ─────────────────────────────────────────────────────────────
     { type: 'sep' }                        ← horizontal rule
     { type: 'label', label: 'Section' }    ← non-interactive heading
     {
       label    : 'Item text',              // required
       icon     : 'fa-icon-name',           // optional Font Awesome icon
       shortcut : '⌘K',                    // optional keyboard hint (display only)
       variant  : 'danger',                 // optional: 'danger'
       disabled : false,                    // optional
       checked  : false,                    // optional checkmark left of icon
       action   : () => {},                 // called on click
       sub      : [ ...items ],             // optional sub-menu
     }

   ══════════════════════════════════════════════════════════════ */

const KOSContextMenu = (() => {

  /* ── Internal state ──────────────────────────────────────── */
  let _menuEl   = null;          // the single #kos-ctx-menu DOM node
  let _appMenus = {};            // appId → menuDef[]
  let _zoneRegs = [];            // [{ selector, menuDef }] custom zone registrations

  /* ── Blocked ancestor selectors ─────────────────────────── */
  /*
     If the right-click target is inside ANY of these selectors,
     the native context menu is suppressed but KOS shows nothing.
  */
  const BLOCKED = [
    '#screen-boot',
    '#screen-login',
    '#screen-shutdown',
    '#screen-restart',
    '#screen-sleep',
    '#dock',
    '#dock-trigger-zone',
    '#spotlight-overlay',
  ];

  /* ── Zone selectors → menu builder fn ───────────────────── */
  const BUILT_IN_ZONES = [
    { selector: '.topbar',  build: _buildTopbarMenu  },
    { selector: '.desktop', build: _buildDesktopMenu },
  ];

  /* ══════════════════════════════════════════════════════════
     MENU DEFINITIONS  (built-in zones)
     ═════════════════════════════════════════════════════════ */

  /* ── Desktop / Homescreen ─────────────────────────────────
     Right-clicking on the wallpaper / desktop icon grid.
  ─────────────────────────────────────────────────────────── */
  function _buildDesktopMenu() {
    return [
      { type: 'label', label: 'Desktop' },
      {
        label  : 'Change Wallpaper',
        icon   : 'fa-image',
        action : () => WM.launch('settings'),   // adjust to your settings app id
      },
      {
        label  : 'New Folder',
        icon   : 'fa-folder-plus',
        action : () => KOSBus.emit('kos:desktop-new-folder', {}),
      },
      {
        label  : 'Sort Icons',
        icon   : 'fa-arrow-up-a-z',
        sub    : [
          { label: 'By Name',      icon: 'fa-font',           action: () => KOSBus.emit('kos:sort-icons', { by: 'name' }) },
          { label: 'By Date',      icon: 'fa-calendar',        action: () => KOSBus.emit('kos:sort-icons', { by: 'date' }) },
          { label: 'By Kind',      icon: 'fa-layer-group',     action: () => KOSBus.emit('kos:sort-icons', { by: 'kind' }) },
        ],
      },
      {
        label  : 'Refresh',
        icon   : 'fa-rotate-right',
        shortcut: 'F5',
        action : () => KOSBus.emit('kos:desktop-refresh', {}),
      },
      { type: 'sep' },
      {
        label  : 'Display Settings',
        icon   : 'fa-display',
        action : () => WM.launch('display-settings'),
      },
      {
        label  : 'Appearance',
        icon   : 'fa-palette',
        action : () => WM.launch('appearance'),
      },
      { type: 'sep' },
      {
        label  : 'About KOS',
        icon   : 'fa-circle-info',
        action : () => WM.launch('about'),
      },
    ];
  }

  /* ── Top Navigation Bar ───────────────────────────────────
     Right-clicking the pill-shaped topbar.
  ─────────────────────────────────────────────────────────── */
  function _buildTopbarMenu() {
    return [
      { type: 'label', label: 'System' },
      {
        label  : 'Open Spotlight',
        icon   : 'fa-magnifying-glass',
        shortcut: '⌘Space',
        action : () => {
          if (typeof openSpotlight === 'function') openSpotlight();
          else KOSBus.emit('kos:request-spotlight-open', {});
        },
      },
      { type: 'sep' },
      {
        label  : 'System Preferences',
        icon   : 'fa-sliders',
        action : () => WM.launch('settings'),
      },
      {
        label  : 'About This System',
        icon   : 'fa-circle-info',
        action : () => WM.launch('about'),
      },
      { type: 'sep' },
      {
        label  : 'Lock Screen',
        icon   : 'fa-lock',
        shortcut: '⌘L',
        action : () => KOSBus.emit('kos:lock', {}),
      },
      { type: 'sep' },
      {
        label  : 'Restart',
        icon   : 'fa-rotate-right',
        action : () => KOSBus.emit('kos:restart', {}),
      },
      {
        label  : 'Shut Down…',
        icon   : 'fa-power-off',
        variant: 'danger',
        action : () => KOSBus.emit('kos:shutdown', {}),
      },
    ];
  }

  /* ── Default app window menu (fallback when no app registers one) */
  function _buildDefaultAppMenu(appId, winEl) {
    const reg = window.WM?.registry?.[appId] ?? {};
    return [
      { type: 'label', label: reg.title ?? appId },
      {
        label  : 'Minimize',
        icon   : 'fa-minus',
        disabled: reg.minimized,
        action : () => WM.minimize(appId),
      },
      {
        label  : reg.maximized ? 'Restore' : 'Maximize',
        icon   : reg.maximized ? 'fa-compress' : 'fa-expand',
        action : () => reg.maximized ? WM.restore(appId) : WM.maximize(appId),
      },
      {
        label  : 'Move to Center',
        icon   : 'fa-crosshairs',
        action : () => WM.center(appId),
      },
      { type: 'sep' },
      {
        label  : 'Close',
        icon   : 'fa-xmark',
        variant: 'danger',
        shortcut: '⌘W',
        action : () => WM.close(appId),
      },
    ];
  }

  /* ══════════════════════════════════════════════════════════
     DOM BUILDER
     ═════════════════════════════════════════════════════════ */

  /** Ensure the persistent menu element exists in the DOM. */
  function _ensureEl() {
    if (_menuEl) return;
    _menuEl = document.createElement('div');
    _menuEl.id = 'kos-ctx-menu';
    _menuEl.setAttribute('role', 'menu');
    document.body.appendChild(_menuEl);
  }

  /** Render a menuDef array into a parent element (root menu or sub-menu). */
  function _renderItems(items, parent) {
    parent.innerHTML = '';

    items.forEach(item => {
      /* ── Section label ─ */
      if (item.type === 'label') {
        const el = document.createElement('div');
        el.className   = 'ctx-section-label';
        el.textContent = item.label;
        parent.appendChild(el);
        return;
      }

      /* ── Separator ─ */
      if (item.type === 'sep') {
        const el = document.createElement('div');
        el.className = 'ctx-sep';
        parent.appendChild(el);
        return;
      }

      /* ── Action item ─ */
      const el = document.createElement('div');
      el.className   = 'ctx-item';
      el.setAttribute('role', 'menuitem');
      if (item.variant === 'danger') el.classList.add('ctx-danger');
      if (item.disabled)             el.classList.add('ctx-disabled');

      /* Check mark */
      const check = document.createElement('span');
      check.className = 'ctx-check';
      check.innerHTML = item.checked ? '<i class="fa-solid fa-check"></i>' : '';
      el.appendChild(check);

      /* Icon */
      if (item.icon) {
        const ico = document.createElement('i');
        ico.className = `fa-solid ${item.icon} ctx-icon`;
        el.appendChild(ico);
      } else {
        /* Empty spacer so labels align when some items have icons */
        const spc = document.createElement('span');
        spc.className = 'ctx-icon';
        el.appendChild(spc);
      }

      /* Label */
      const lbl = document.createElement('span');
      lbl.className   = 'ctx-label';
      lbl.textContent = item.label;
      el.appendChild(lbl);

      /* Keyboard hint */
      if (item.shortcut) {
        const sh = document.createElement('span');
        sh.className   = 'ctx-shortcut';
        sh.textContent = item.shortcut;
        el.appendChild(sh);
      }

      /* Sub-menu arrow + panel */
      if (item.sub?.length) {
        const arrow = document.createElement('span');
        arrow.className = 'ctx-arrow';
        arrow.innerHTML = '<i class="fa-solid fa-chevron-right"></i>';
        el.appendChild(arrow);

        const subEl = document.createElement('div');
        subEl.className = 'ctx-submenu';
        _renderItems(item.sub, subEl);
        el.appendChild(subEl);

        /* Flip sub-menu if it would overflow right edge */
        el.addEventListener('mouseenter', () => {
          const rect = subEl.getBoundingClientRect();
          subEl.classList.toggle('ctx-flip-x', rect.right > window.innerWidth - 12);
        });
      }

      /* Click handler */
      if (!item.disabled && !item.sub?.length && typeof item.action === 'function') {
        el.addEventListener('click', e => {
          e.stopPropagation();
          close();
          item.action();
        });
      }

      parent.appendChild(el);
    });
  }

  /* ══════════════════════════════════════════════════════════
     POSITIONING
     ═════════════════════════════════════════════════════════ */

  function _position(x, y) {
    /* Temporarily make visible (but transparent) to measure */
    _menuEl.style.visibility = 'hidden';
    _menuEl.style.display    = 'block';

    const mw = _menuEl.offsetWidth;
    const mh = _menuEl.offsetHeight;
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    /* Clamp so menu never clips screen edges */
    const left = Math.min(x, vw - mw - 8);
    const top  = Math.min(y, vh - mh - 8);

    /* Tell CSS where transform-origin should be for the spring */
    _menuEl.style.setProperty('--ctx-origin-x', x > vw / 2 ? 'right'  : 'left');
    _menuEl.style.setProperty('--ctx-origin-y', y > vh / 2 ? 'bottom' : 'top');

    _menuEl.style.left       = `${Math.max(8, left)}px`;
    _menuEl.style.top        = `${Math.max(8, top)}px`;
    _menuEl.style.visibility = '';
    _menuEl.style.display    = '';
  }

  /* ══════════════════════════════════════════════════════════
     ZONE RESOLUTION
     Returns a menuDef array (or null → show nothing).
     ═════════════════════════════════════════════════════════ */

  function _resolveMenu(target) {
    /* 1. Blocked zones → no menu */
    for (const sel of BLOCKED) {
      if (target.closest(sel)) return null;
    }

    /* 2. Only show menus when the desktop screen is active */
    const desktop = document.getElementById('screen-desktop');
    if (!desktop?.classList.contains('active')) return null;

    /* 3. App window → registered menu or default window menu */
    const winEl = target.closest('.window[data-app-id]');
    if (winEl) {
      const appId = winEl.dataset.appId;
      if (_appMenus[appId]) {
        /* App provided its own menu; prepend a title label */
        const reg = window.WM?.registry?.[appId] ?? {};
        return [
          { type: 'label', label: reg.title ?? appId },
          ..._appMenus[appId],
        ];
      }
      return _buildDefaultAppMenu(appId, winEl);
    }

    /* 4. Custom zone registrations (user-registered via registerZone) */
    for (const { selector, menuDef } of _zoneRegs) {
      if (target.closest(selector)) {
        return typeof menuDef === 'function' ? menuDef(target) : menuDef;
      }
    }

    /* 5. Built-in zones */
    for (const { selector, build } of BUILT_IN_ZONES) {
      if (target.closest(selector)) return build(target);
    }

    /* 6. Bare desktop / wallpaper fallback */
    if (
      target.closest('.desktop') ||
      target.closest('#screen-desktop') ||
      target === document.body
    ) {
      return _buildDesktopMenu();
    }

    /* Nothing matched → suppress native menu but show nothing */
    return null;
  }

  /* ══════════════════════════════════════════════════════════
     OPEN / CLOSE
     ═════════════════════════════════════════════════════════ */

  function open(x, y, menuDef) {
    _ensureEl();
    _renderItems(menuDef, _menuEl);
    _position(x, y);

    /* Tick ensures the initial transform is painted before transition fires */
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        _menuEl.classList.add('ctx-visible');
      });
    });
  }

  function close() {
    if (!_menuEl) return;
    _menuEl.classList.remove('ctx-visible');
  }

  /* ══════════════════════════════════════════════════════════
     GLOBAL EVENT WIRING
     ═════════════════════════════════════════════════════════ */

  /* contextmenu → decide + show */
  document.addEventListener('contextmenu', e => {
    const menuDef = _resolveMenu(e.target);

    /* Always prevent the browser's native context menu on the desktop screen */
    const desktop = document.getElementById('screen-desktop');
    if (desktop?.classList.contains('active')) {
      e.preventDefault();
    }

    if (!menuDef) { close(); return; }

    e.preventDefault();
    close();                          /* dismiss any previously open menu */
    open(e.clientX, e.clientY, menuDef);
  });

  /* Dismiss on outside click */
  document.addEventListener('pointerdown', e => {
    if (_menuEl && !_menuEl.contains(e.target)) close();
  });

  /* Dismiss on Escape */
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') close();
  });

  /* Dismiss on scroll */
  document.addEventListener('scroll', close, { passive: true, capture: true });

  /* Re-close spotlight shouldn't fight the menu */
  if (typeof KOSBus !== 'undefined') {
    KOSBus.on('kos:request-spotlight-open', () => close());
  }

  /* ══════════════════════════════════════════════════════════
     PUBLIC API
     ═════════════════════════════════════════════════════════ */

  /**
   * Register a context menu for a specific app.
   * The menu replaces the default window actions menu.
   *
   * @param {string}   appId    - matches data-app-id on the .window element
   * @param {Array}    menuDef  - array of menu item objects (see shape above)
   *
   * @example
   *   KOSContextMenu.register('my-notes', [
   *     { label: 'New Note', icon: 'fa-plus',    action: () => notes.new() },
   *     { type: 'sep' },
   *     { label: 'Close',    icon: 'fa-xmark',   variant: 'danger',
   *       action: () => WM.close('my-notes') },
   *   ]);
   */
  function register(appId, menuDef) {
    _appMenus[appId] = menuDef;
  }

  /**
   * Register a context menu for any custom HTML zone via CSS selector.
   * Runs BEFORE built-in zones so you can override desktop/topbar.
   *
   * @param {string}          selector  - CSS selector (uses .closest())
   * @param {Array|Function}  menuDef   - item array OR fn(target) → array
   *
   * @example
   *   KOSContextMenu.registerZone('#my-canvas', [
   *     { label: 'Clear Canvas', icon: 'fa-eraser', action: () => canvas.clear() },
   *   ]);
   */
  function registerZone(selector, menuDef) {
    _zoneRegs.unshift({ selector, menuDef });   /* prepend: later calls win */
  }

  /**
   * Unregister an app's context menu (e.g. on app uninstall).
   * @param {string} appId
   */
  function unregister(appId) {
    delete _appMenus[appId];
  }

  /**
   * Programmatically open a menu at a given coordinate.
   * Useful for long-press simulation on touch devices.
   *
   * @param {number} x
   * @param {number} y
   * @param {Array}  menuDef
   */
  function openAt(x, y, menuDef) {
    _ensureEl();
    open(x, y, menuDef);
  }

  /* Listen to the KOSBus registry-changed so we rebuild app menu
     registrations (not needed for the menu itself, but useful for
     Studio-published apps that call register() in their own script). */
  if (typeof KOSBus !== 'undefined') {
    KOSBus.on('kos:registry-changed', () => { /* no-op; apps re-register themselves */ });
  }

  return { register, unregister, registerZone, open: openAt, close };

})();
