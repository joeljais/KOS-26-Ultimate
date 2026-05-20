/* ══════════════════════════════════════════════════════════════
   KOS ULTIMATE 2026 — apps/ui-manager.js
   UI Manager — wallpaper, avatar, theme, icon palette.
   ══════════════════════════════════════════════════════════════ */

window.KOSApps = window.KOSApps || {};

window.KOSApps.uimanager = {
  init() {
    const body = document.getElementById('uim-body');
    if (!body) return;
    const isDark    = document.body.classList.contains('dark');
    const isGlass   = !document.body.classList.contains('no-glass');
    body.innerHTML = `
      <div class="uim-section">
        <h3>Appearance</h3>
        <div class="setting-row">
          <span>Dark Mode</span>
          <div class="toggle-switch ${isDark ? 'on' : ''}" id="darkToggle" onclick="toggleTheme()">
            <div class="toggle-knob"></div>
          </div>
        </div>
        <div class="setting-row" style="margin-top:8px;">
          <div>
            <span>Glass UI</span>
            <div style="font-size:0.75rem;color:#aaa;margin-top:2px;">Frosted blur on windows, dock &amp; panels</div>
          </div>
          <div class="toggle-switch ${isGlass ? 'on' : ''}" id="glassToggle" onclick="toggleGlass()">
            <div class="toggle-knob"></div>
          </div>
        </div>
      </div>
      <div class="uim-section">
        <h3>Icon Style</h3>
        <p style="font-size:0.78rem;color:#888;margin-bottom:12px;">iOS 18-style icon tinting — all app icons adapt to your colour palette.</p>
        <div class="ip-grid" id="ip-grid"></div>
      </div>
      <div class="uim-section" id="uim-avatar-section"></div>
      <div class="uim-section">
        <h3>Wallpaper</h3>
        <div class="wallpaper-grid" id="wallpaperGrid"></div>
      </div>`;

    buildIconPaletteGrid();
    buildAvatarSection();
    buildWallpaperGrid();
  },
};

/* Register init hook with WM */
WM.setOnOpen('uimanager', () => window.KOSApps.uimanager.init());
