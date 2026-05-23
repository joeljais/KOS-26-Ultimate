/* ═══════════════════════════════════════════════════════════
   KOS ULTIMATE 2026 — apps/videos.js
   Videos App — KOSFS Edition

   Bugs fixed from previous build:
   1. WM.setOnOpen callback received no `win` arg — now uses
      document.getElementById('videos-body') like every other app
   2. KOSFS.registerApp() was never called — added at init
   3. KOSFS.write/readObjectURL used 'files' as appId — fixed to APP_ID
   4. window._showToast doesn't exist — fixed to showToast()
   5. Inner div duplicated id="videos-body" — removed the wrapper,
      CSS classes applied directly to the WM-built body element
   ═══════════════════════════════════════════════════════════ */

'use strict';

(function () {
  const APP_ID = 'videos';

  /* Module-level refs — set once in init, reused by event handlers
     and the inter-app deep-link entry point. */
  let videoEl        = null;
  let currentVideoId = null;
  let _objectURLs    = [];   // track URLs created so we can revoke on close

  /* ═══════════════════════════════════════════════════════════
     §1  WM REGISTRATION
     WM calls onOpen() with ZERO arguments — do NOT expect a
     parameter here. Get the body by ID the same way every
     other app does.
  ═══════════════════════════════════════════════════════════ */
  WM.setOnOpen(APP_ID, async function () {

    /* ── Find the WM-built body div (id set from manifest bodyId) ── */
    const body = document.getElementById('videos-body');
    if (!body) return;

    /* ── Register KOSFS permissions from the manifest ── */
    const manifest = (typeof AppManifest !== 'undefined')
      ? AppManifest.find(a => a.id === APP_ID)
      : null;
    KOSFS.registerApp(APP_ID, manifest?.permissions ?? ['videos', 'audios']);
    await KOSFS.ready;

    /* ── Build the UI directly inside the WM body div ──
       Do NOT add another wrapper div with id="videos-body" —
       the WM already set that id on this element. */
    body.innerHTML = `
      <div class="vid-container">

        <!-- Player canvas -->
        <div class="vid-player-canvas">
          <video id="vid-main-element" src="" aria-label="KOS Video Player"></video>

          <!-- No-video placeholder (hidden once a video loads) -->
          <div class="vid-empty-state" id="vid-empty-state">
            <i class="fa-solid fa-film"></i>
            <p>No video loaded</p>
            <span>Click the upload button to import a video file</span>
          </div>

          <!-- Glass controls overlay -->
          <div class="vid-glass-controls" id="vid-glass-controls">

            <!-- Progress / seek row -->
            <div class="vid-timeline-container">
              <span class="vid-time-display" id="vid-time-current">00:00</span>
              <input type="range" class="vid-progress-slider" id="vid-seek-bar"
                     min="0" max="100" value="0">
              <span class="vid-time-display" id="vid-time-total">00:00</span>
            </div>

            <!-- Button row -->
            <div class="vid-button-row">
              <button class="vid-ctrl-btn" id="vid-btn-upload" title="Import video file">
                <i class="fa-solid fa-cloud-arrow-up"></i>
              </button>

              <div class="vid-center-group">
                <button class="vid-ctrl-btn vid-btn-secondary" id="vid-btn-rw" title="Rewind 10 s">
                  <i class="fa-solid fa-backward"></i>
                </button>
                <button class="vid-ctrl-btn vid-btn-main" id="vid-btn-play" title="Play / Pause">
                  <i class="fa-solid fa-play"></i>
                </button>
                <button class="vid-ctrl-btn vid-btn-secondary" id="vid-btn-ff" title="Forward 10 s">
                  <i class="fa-solid fa-forward"></i>
                </button>
              </div>

              <div class="vid-volume-group">
                <button class="vid-ctrl-btn" id="vid-btn-mute" title="Mute / Unmute">
                  <i class="fa-solid fa-volume-high"></i>
                </button>
                <input type="range" class="vid-volume-slider" id="vid-volume-bar"
                       min="0" max="1" step="0.05" value="1">
              </div>
            </div>

          </div><!-- /.vid-glass-controls -->
        </div><!-- /.vid-player-canvas -->
      </div><!-- /.vid-container -->

      <!-- Hidden file input — triggered by the upload button -->
      <input type="file" id="vid-hidden-uploader" accept="video/*" style="display:none">
    `;

    /* Cache the <video> element reference */
    videoEl = body.querySelector('#vid-main-element');

    _wireEvents(body);
  });

  /* ═══════════════════════════════════════════════════════════
     §2  EVENT WIRING
  ═══════════════════════════════════════════════════════════ */

  function _wireEvents(body) {
    const btnPlay  = body.querySelector('#vid-btn-play');
    const btnMute  = body.querySelector('#vid-btn-mute');
    const btnRw    = body.querySelector('#vid-btn-rw');
    const btnFf    = body.querySelector('#vid-btn-ff');
    const seekBar  = body.querySelector('#vid-seek-bar');
    const volBar   = body.querySelector('#vid-volume-bar');
    const timeCur  = body.querySelector('#vid-time-current');
    const timeTot  = body.querySelector('#vid-time-total');
    const uploader = body.querySelector('#vid-hidden-uploader');
    const btnUpload = body.querySelector('#vid-btn-upload');
    const emptyState = body.querySelector('#vid-empty-state');
    const controls = body.querySelector('#vid-glass-controls');

    /* ── Play / Pause ── */
    btnPlay.addEventListener('click', () => {
      if (!videoEl.src || videoEl.src === window.location.href) return;
      if (videoEl.paused) {
        videoEl.play();
        btnPlay.innerHTML = `<i class="fa-solid fa-pause"></i>`;
      } else {
        videoEl.pause();
        btnPlay.innerHTML = `<i class="fa-solid fa-play"></i>`;
      }
    });

    /* ── Seek bar live update ── */
    videoEl.addEventListener('timeupdate', () => {
      if (!videoEl.duration) return;
      seekBar.value = (videoEl.currentTime / videoEl.duration) * 100;
      timeCur.textContent = _fmt(videoEl.currentTime);
    });

    /* ── Duration ready ── */
    videoEl.addEventListener('loadedmetadata', () => {
      timeTot.textContent = _fmt(videoEl.duration);
    });

    /* ── Video loaded — hide empty state ── */
    videoEl.addEventListener('loadeddata', () => {
      if (emptyState) emptyState.style.display = 'none';
    });

    /* ── Playback ended — reset play button ── */
    videoEl.addEventListener('ended', () => {
      btnPlay.innerHTML = `<i class="fa-solid fa-play"></i>`;
    });

    /* ── Scrub ── */
    seekBar.addEventListener('input', () => {
      if (!videoEl.duration) return;
      videoEl.currentTime = (seekBar.value / 100) * videoEl.duration;
    });

    /* ── Skip back / forward ── */
    btnRw.addEventListener('click', () => { videoEl.currentTime = Math.max(0, videoEl.currentTime - 10); });
    btnFf.addEventListener('click', () => { videoEl.currentTime = Math.min(videoEl.duration || 0, videoEl.currentTime + 10); });

    /* ── Volume slider ── */
    volBar.addEventListener('input', () => {
      videoEl.volume = parseFloat(volBar.value);
      videoEl.muted  = (volBar.value == 0);
      btnMute.innerHTML = videoEl.muted
        ? `<i class="fa-solid fa-volume-xmark"></i>`
        : `<i class="fa-solid fa-volume-high"></i>`;
    });

    /* ── Mute toggle ── */
    btnMute.addEventListener('click', () => {
      videoEl.muted = !videoEl.muted;
      btnMute.innerHTML = videoEl.muted
        ? `<i class="fa-solid fa-volume-xmark"></i>`
        : `<i class="fa-solid fa-volume-high"></i>`;
    });

    /* ── Upload button → file input ── */
    btnUpload.addEventListener('click', () => uploader.click());

    /* ── File selected from disk ── */
    uploader.addEventListener('change', async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      e.target.value = '';

      showToast('Importing video…');   // ← correct global from kos-kernel.js (was window._showToast)

      try {
        /* Write to KOSFS using THIS app's registered id, not 'files' */
        const fileId = await KOSFS.write(APP_ID, file);   // ← was KOSFS.write('files', file)
        showToast('Video saved to library.');

        /* Load it straight into the player */
        await _loadVideo(fileId);

      } catch (err) {
        console.error('[Videos] upload error:', err);
        showToast('Upload failed: ' + err.message);
      }
    });

    /* ── Auto-hide controls when mouse leaves player ── */
    const canvas = body.querySelector('.vid-player-canvas');
    let _hideTimer;
    canvas?.addEventListener('mousemove', () => {
      if (controls) controls.style.opacity = '1';
      clearTimeout(_hideTimer);
      _hideTimer = setTimeout(() => {
        if (videoEl && !videoEl.paused && controls) controls.style.opacity = '0';
      }, 2800);
    });
    canvas?.addEventListener('mouseleave', () => {
      clearTimeout(_hideTimer);
      if (videoEl && !videoEl.paused && controls) controls.style.opacity = '0';
    });

    /* ── Click on video to play/pause ── */
    videoEl.addEventListener('click', () => btnPlay.click());
  }

  /* ═══════════════════════════════════════════════════════════
     §3  INTERNAL VIDEO LOADER
  ═══════════════════════════════════════════════════════════ */

  async function _loadVideo(fileId) {
    if (!videoEl) return;
    try {
      /* Revoke any previously created object URL to avoid memory leaks */
      if (currentVideoId && currentVideoId !== fileId) {
        const old = _objectURLs.pop();
        if (old) URL.revokeObjectURL(old);
      }

      currentVideoId = fileId;

      /* Read from KOSFS using THIS app's id */
      const url = await KOSFS.readObjectURL(APP_ID, fileId);  // ← was KOSFS.readObjectURL('files', fileId)
      _objectURLs.push(url);

      videoEl.src = url;
      videoEl.load();

      const btnPlay = document.getElementById('vid-btn-play');
      videoEl.play().then(() => {
        if (btnPlay) btnPlay.innerHTML = `<i class="fa-solid fa-pause"></i>`;
      }).catch(() => {});

    } catch (err) {
      console.error('[Videos] load error:', err);
      showToast('Could not load video.');
    }
  }

  /* ═══════════════════════════════════════════════════════════
     §4  TIME FORMATTER
  ═══════════════════════════════════════════════════════════ */

  function _fmt(seconds) {
    if (!seconds || isNaN(seconds)) return '00:00';
    const m = Math.floor(seconds / 60).toString().padStart(2, '0');
    const s = Math.floor(seconds % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  }

  /* ═══════════════════════════════════════════════════════════
     §5  INTER-APP DEEP LINK
     Other apps (e.g. Files) can call this to play a specific
     KOSFS video without the user having to re-upload it.

     Usage:
       window.KOSApps.videos.playVideoDirectly(fileId);
  ═══════════════════════════════════════════════════════════ */

  window.KOSApps        = window.KOSApps || {};
  window.KOSApps.videos = {
    playVideoDirectly: async function (fileId) {
      /* If the Videos window isn't open yet, open it first */
      if (!videoEl) {
        WM.launch(APP_ID);
        /* Wait for the init to complete (videoEl gets set in WM.setOnOpen) */
        await new Promise(resolve => {
          const check = setInterval(() => {
            if (videoEl) { clearInterval(check); resolve(); }
          }, 80);
          setTimeout(() => { clearInterval(check); resolve(); }, 3000);
        });
      }
      await _loadVideo(fileId);
    }
  };

  /* ═══════════════════════════════════════════════════════════
     §6  CLEANUP  (called by WM on window close)
  ═══════════════════════════════════════════════════════════ */

  WM.setOnClose?.(APP_ID, function () {
    /* Revoke all Object URLs to free memory */
    _objectURLs.forEach(u => URL.revokeObjectURL(u));
    _objectURLs    = [];
    videoEl        = null;
    currentVideoId = null;
  });

})();
