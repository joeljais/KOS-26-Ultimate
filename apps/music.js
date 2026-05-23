/* ═══════════════════════════════════════════════════════════
   KOS ULTIMATE 2026 — apps/music.js
   Music Engine — Spotify Premium Liquid Glass Remastered

   Storage Context: Same unified IDB storage via KOSFS kernel
   Integration Hooks: Inter-app pipeline routing binding
   ═══════════════════════════════════════════════════════════ */

'use strict';
window.KOSApps = window.KOSApps || {};

const MUSIC_APP_ID = 'files'; // Direct targeted pipeline to same IDB context
const AUDIO_TYPE_MATCH = 'audio';

const MU = {
  _tracks       : [],
  _activeIdx    : -1,
  _audio        : new Audio(),
  _isPlaying    : false,
  _isShuffle    : false,
  _isLoop       : false,
  _searchQuery  : '',
  _modalResolve : null,
  _currentBlobUrl: null
};

window.KOSApps.music = {
  async init() {
    const body = document.getElementById('music-body');
    if (!body) return;

    await KOSFS.ready;
    _renderPlayerShell(body);
    _bindAudioListeners();
    await _loadAudioLibrary();

    // Broadcast triggers for immediate reactive changes via KOSBus architecture
    KOSBus.on('kos:fs-write',  () => _silentReload());
    KOSBus.on('kos:fs-delete', () => _silentReload());
  },

  /**
   * INTER-APP INTERACTION INTERFACE HOOK
   * Allows external triggers (like double-clicking a file in the Files app)
   * to automatically play the track inside this instance.
   */
  async playTrackDirectly(fileId) {
    await KOSFS.ready;
    // Force immediate sync update check against filesystem architecture
    await _loadAudioLibrary();
    
    const targetIndex = MU._tracks.findIndex(t => String(t.id) === String(fileId));
    if (targetIndex !== -1) {
      _selectTrackByIndex(targetIndex);
    } else {
      _showMusicToast("Track object could not be mapped inside playback list.");
    }
  }
};

/* ═══════════════════════════════════════════════════════════
   UI MAIN COMPONENT LAYOUT SHELL
═══════════════════════════════════════════════════════════ */
function _renderPlayerShell(body) {
  body.innerHTML = `
    <div class="mu-app">
      <input type="file" id="mu-native-uploader" accept="audio/*" multiple style="display:none">

      <!-- LEFT SIDEBAR CONTROL PANEL -->
      <aside class="mu-sidebar">
        <div class="mu-logo">
          <i class="fa-brands fa-spotify"></i>
          <span>KOS Studio</span>
        </div>
        <nav class="mu-nav-group">
          <div class="mu-nav-item active"><i class="fa-solid fa-house"></i> <span>Home</span></div>
          <div class="mu-nav-item"><i class="fa-solid fa-magnifying-glass"></i> <span>Search Library</span></div>
          <div class="mu-nav-item"><i class="fa-solid fa-lines-leaning"></i> <span>Your Playlists</span></div>
        </nav>
      </aside>

      <!-- DYNAMIC CONTENT VIEW -->
      <main class="mu-main-view">
        <header class="mu-top-bar">
          <div class="mu-search-wrapper">
            <i class="fa-solid fa-magnifying-glass mu-search-icon"></i>
            <input type="text" id="mu-search-bar" placeholder="What do you want to listen to?" oninput="window._muFilterTracks(this.value)">
          </div>
          <button class="mu-btn-import" onclick="document.getElementById('mu-native-uploader').click()"><i class="fa-solid fa-arrow-up-from-bracket"></i> Import Track</button>
        </header>

        <div class="mu-content-scroll">
          <h2 class="mu-view-header">Tracks Vault</h2>
          <div id="mu-dynamic-tracks-view"></div>
        </div>
      </main>

      <!-- BOTTOM PERSISTENT MEDIA CONTROL STREAM PLAYER DECK -->
      <footer class="mu-player-deck">
        <div class="mu-deck-now-playing">
          <div class="mu-deck-thumb" id="mu-deck-cover"><i class="fa-solid fa-music"></i></div>
          <div class="mu-deck-info">
            <div class="mu-deck-track-name" id="mu-deck-track-title">No track selected</div>
            <div class="mu-deck-artist" id="mu-deck-track-artist">Local Storage System Element</div>
          </div>
        </div>

        <div class="mu-deck-controls">
          <div class="mu-control-buttons">
            <button class="mu-btn-flat" id="mu-btn-shuffle" onclick="window._muToggleShuffle()" title="Shuffle Mode"><i class="fa-solid fa-shuffle"></i></button>
            <button class="mu-btn-flat" onclick="window._muStepBack()" title="Previous Track"><i class="fa-solid fa-backward-step"></i></button>
            <button class="mu-btn-circ" id="mu-btn-play-pause" onclick="window._muTogglePlayback()" title="Play / Pause"><i class="fa-solid fa-play"></i></button>
            <button class="mu-btn-flat" onclick="window._muStepForward()" title="Next Track"><i class="fa-solid fa-forward-step"></i></button>
            <button class="mu-btn-flat" id="mu-btn-loop" onclick="window._muToggleLoop()" title="Loop Track"><i class="fa-solid fa-repeat"></i></button>
          </div>
          <div class="mu-timeline-container">
            <span id="mu-time-current">0:00</span>
            <div class="mu-progress-bar" id="mu-progress-track" onclick="window._muSeekAudio(event)">
              <div class="mu-progress-fill" id="mu-progress-fill"></div>
            </div>
            <span id="mu-time-duration">0:00</span>
          </div>
        </div>

        <div class="mu-deck-right-utilities">
          <i class="fa-solid fa-volume-high" style="font-size: 13px;"></i>
          <div class="mu-volume-slider" id="mu-volume-rail" onclick="window._muAdjustVolume(event)">
            <div class="mu-progress-fill" id="mu-volume-fill" style="width: 80%;"></div>
          </div>
        </div>
      </footer>

      <!-- INTERNALLY BOUND APP DIALOG COMPONENT WINDOW -->
      <div class="mu-modal-overlay" id="mu-modal-overlay">
        <div class="mu-dialog-box">
          <h3 style="margin: 0 0 12px 0; font-size:16px;">Purge Track Vector Confirmation</h3>
          <p id="mu-dialog-text" style="margin:0; font-size:13px; color:#b3b3b3; line-height:1.5;"></p>
          <div class="mu-dialog-buttons">
            <button class="mu-dialog-btn mu-btn-cancel" onclick="window._muCloseModal(false)">Cancel</button>
            <button class="mu-dialog-btn mu-btn-confirm" onclick="window._muCloseModal(true)">Delete Track</button>
          </div>
        </div>
      </div>

      <!-- APP BOUND SYSTEM TOAST NOTIFICATION WINDOW -->
      <div class="mu-toast" id="mu-toast"></div>
    </div>
  `;

  document.getElementById('mu-native-uploader').addEventListener('change', e => {
    _handleAudioUpload(Array.from(e.currentTarget.files || []));
    e.currentTarget.value = '';
  });
}

/* ═══════════════════════════════════════════════════════════
   DATA MANAGEMENT MODULE ENGINE
═══════════════════════════════════════════════════════════ */
async function _loadAudioLibrary() {
  const container = document.getElementById('mu-dynamic-tracks-view');
  if (!container) return;

  try {
    MU._tracks = await KOSFS.list(MUSIC_APP_ID, { type: AUDIO_TYPE_MATCH });
    _renderTracksList();
  } catch (err) {
    container.innerHTML = `<div class="mu-empty-state"><span>Error loading sound database pipeline vectors.</span></div>`;
  }
}

async function _silentReload() {
  const activeTrackId = MU._activeIdx !== -1 ? MU._tracks[MU._activeIdx]?.id : null;
  MU._tracks = await KOSFS.list(MUSIC_APP_ID, { type: AUDIO_TYPE_MATCH });
  
  if (activeTrackId) {
    MU._activeIdx = MU._tracks.findIndex(t => t.id === activeTrackId);
  }
  _renderTracksList();
}

function _renderTracksList() {
  const container = document.getElementById('mu-dynamic-tracks-view');
  if (!container) return;

  let filtered = MU._tracks;
  if (MU._searchQuery) {
    filtered = filtered.filter(t => (t.name || '').toLowerCase().includes(MU._searchQuery));
  }

  if (filtered.length === 0) {
    container.innerHTML = `
      <div class="mu-empty-state">
        <i class="fa-solid fa-music" style="font-size: 40px; margin-bottom:12px; opacity:0.3;"></i>
        <span>No music payloads discovered inside this partition map index.</span>
      </div>`;
    return;
  }

  container.innerHTML = `
    <table class="mu-track-table">
      <thead>
        <tr class="mu-th-row">
          <th style="width: 40px; text-align: center;">#</th>
          <th>Title</th>
          <th>Storage File Dimension Metric</th>
          <th style="width: 60px; text-align: center;"><i class="fa-regular fa-trash-can"></i></th>
        </tr>
      </thead>
      <tbody>
        ${filtered.map((track, i) => {
          const globalIdx = MU._tracks.findIndex(t => t.id === track.id);
          const isCurrent = globalIdx === MU._activeIdx;
          return `
            <tr class="mu-track-row${isCurrent ? ' playing' : ''}" onclick="window._muSelectTrackByIndex(${globalIdx})">
              <td style="text-align: center; color: #b3b3b3;">
                ${isCurrent && MU._isPlaying ? '<i class="fa-solid fa-bars-staggered" style="color:#1ed760"></i>' : i + 1}
              </td>
              <td>
                <div class="mu-track-meta-col">
                  <div class="mu-track-icon-box"><i class="fa-solid fa-music"></i></div>
                  <div class="mu-track-title" title="${_escapeMarkup(track.name)}">${_escapeMarkup(track.name)}</div>
                </div>
              </td>
              <td style="color: #b3b3b3;">${KOSFS.formatSize(track.size || 0)}</td>
              <td style="text-align: center;">
                <button class="mu-track-action-btn" onclick="window._muTriggerTrackPurge('${track.id}', event)">
                  <i class="fa-regular fa-trash-can"></i>
                </button>
              </td>
            </tr>
          `;
        }).join('')}
      </tbody>
    </table>
  `;
}

window._muFilterTracks = function(query) {
  MU._searchQuery = query.trim().toLowerCase();
  _renderTracksList();
};

/* ═══════════════════════════════════════════════════════════
   AUDIO ENGINE PLAYBACK LOGIC CONTROLLERS
═══════════════════════════════════════════════════════════ */
function _bindAudioListeners() {
  MU._audio.addEventListener('timeupdate', () => {
    const current = MU._audio.currentTime || 0;
    const duration = MU._audio.duration || 0;
    
    const fill = document.getElementById('mu-progress-fill');
    if (fill && duration > 0) fill.style.width = `${(current / duration) * 100}%`;

    const txtCurrent = document.getElementById('mu-time-current');
    if (txtCurrent) txtCurrent.textContent = _formatAudioDuration(current);
  });

  MU._audio.addEventListener('loadedmetadata', () => {
    const txtDuration = document.getElementById('mu-time-duration');
    if (txtDuration) txtDuration.textContent = _formatAudioDuration(MU._audio.duration || 0);
  });

  MU._audio.addEventListener('ended', () => {
    if (MU._isLoop) {
      MU._audio.currentTime = 0;
      MU._audio.play().catch(() => {});
    } else {
      window._muStepForward();
    }
  });
}

window._muSelectTrackByIndex = async function(index) {
  if (index < 0 || index >= MU._tracks.length) return;
  
  // Revoke the old object URL if changing tracks to optimize memory leaks
  if (MU._currentBlobUrl) {
    URL.revokeObjectURL(MU._currentBlobUrl);
    MU._currentBlobUrl = null;
  }

  MU._activeIdx = index;
  const track = MU._tracks[index];

  const titleEl = document.getElementById('mu-deck-track-title');
  const coverEl = document.getElementById('mu-deck-cover');
  if (titleEl) titleEl.textContent = track.name;
  if (coverEl) coverEl.innerHTML = `<i class="fa-solid fa-compact-disc fa-spin" style="color:#1ed760"></i>`;

  try {
    MU._currentBlobUrl = await KOSFS.readObjectURL(MUSIC_APP_ID, track.id);
    MU._audio.src = MU._currentBlobUrl;
    
    MU._isPlaying = true;
    _syncPlayPauseButtonState();
    _renderTracksList(); // Trigger visual re-index render sequence update

    MU._audio.play().catch(() => {
      _showMusicToast("Audio playback stream initialization suspended by client framework.");
      MU._isPlaying = false;
      _syncPlayPauseButtonState();
    });
  } catch (err) {
    _showMusicToast("Failed resolving filesystem stream descriptors mapping data vectors.");
  }
};

window._muTogglePlayback = function() {
  if (MU._activeIdx === -1 && MU._tracks.length > 0) {
    window._muSelectTrackByIndex(0);
    return;
  }
  if (MU._activeIdx === -1) return;

  if (MU._isPlaying) {
    MU._audio.pause();
    MU._isPlaying = false;
    const coverEl = document.getElementById('mu-deck-cover');
    if (coverEl) coverEl.innerHTML = `<i class="fa-solid fa-music"></i>`;
  } else {
    MU._audio.play().catch(() => {});
    MU._isPlaying = true;
    const coverEl = document.getElementById('mu-deck-cover');
    if (coverEl) coverEl.innerHTML = `<i class="fa-solid fa-compact-disc fa-spin" style="color:#1ed760"></i>`;
  }
  _syncPlayPauseButtonState();
  _renderTracksList();
};

window._muStepForward = function() {
  if (MU._tracks.length === 0) return;
  if (MU._isShuffle) {
    const rand = Math.floor(Math.random() * MU._tracks.length);
    window._muSelectTrackByIndex(rand);
  } else {
    let next = MU._activeIdx + 1;
    if (next >= MU._tracks.length) next = 0;
    window._muSelectTrackByIndex(next);
  }
};

window._muStepBack = function() {
  if (MU._tracks.length === 0) return;
  let prev = MU._activeIdx - 1;
  if (prev < 0) prev = MU._tracks.length - 1;
  window._muSelectTrackByIndex(prev);
};

window._muToggleShuffle = function() {
  MU._isShuffle = !MU._isShuffle;
  document.getElementById('mu-btn-shuffle')?.classList.toggle('active', MU._isShuffle);
};

window._muToggleLoop = function() {
  MU._isLoop = !MU._isLoop;
  document.getElementById('mu-btn-loop')?.classList.toggle('active', MU._isLoop);
};

window._muSeekAudio = function(e) {
  const bar = document.getElementById('mu-progress-track');
  if (!bar || !MU._audio.duration) return;
  const pct = e.offsetX / bar.clientWidth;
  MU._audio.currentTime = pct * MU._audio.duration;
};

window._muAdjustVolume = function(e) {
  const rail = document.getElementById('mu-volume-rail');
  if (!rail) return;
  const pct = Math.max(0, Math.min(1, e.offsetX / rail.clientWidth));
  MU._audio.volume = pct;
  document.getElementById('mu-volume-fill').style.width = `${pct * 100}%`;
};

function _syncPlayPauseButtonState() {
  const btn = document.getElementById('mu-btn-play-pause');
  if (btn) btn.innerHTML = MU._isPlaying ? `<i class="fa-solid fa-pause"></i>` : `<i class="fa-solid fa-play"></i>`;
}

/* ═══════════════════════════════════════════════════════════
   FILESYSTEM ATTACHED WRITE & DELETE DRIVERS
═══════════════════════════════════════════════════════════ */
async function _handleAudioUpload(files) {
  if (!files.length) return;
  _showMusicToast(`Uploading ${files.length} audio objects...`);

  let loaded = 0;
  for (const f of files) {
    try {
      await KOSFS.write(MUSIC_APP_ID, f);
      loaded++;
    } catch (err) { console.error(err); }
  }

  if (loaded > 0) {
    _showMusicToast(`Successfully imported ${loaded} items.`);
    await _loadAudioLibrary();
  } else {
    _showMusicToast("Files engine rejected volume writing pipeline.");
  }
}

window._muTriggerTrackPurge = function(fileId, event) {
  event.stopPropagation(); // Shield the play row interaction event rule tree
  const match = MU._tracks.find(t => String(t.id) === String(fileId));
  if (!match) return;

  _showConfirmModal(`Are you sure you want to permanently delete "${match.name}"?`).then(async (approved) => {
    if (!approved) return;

    try {
      // If deleting the actively playing track, tear down audio channels
      if (MU._activeIdx !== -1 && MU._tracks[MU._activeIdx]?.id === fileId) {
        MU._audio.pause();
        MU._audio.src = '';
        MU._isPlaying = false;
        MU._activeIdx = -1;
        _syncPlayPauseButtonState();
        document.getElementById('mu-deck-track-title').textContent = "No track selected";
        document.getElementById('mu-deck-cover').innerHTML = `<i class="fa-solid fa-music"></i>`;
        
        if (MU._currentBlobUrl) {
          URL.revokeObjectURL(MU._currentBlobUrl);
          MU._currentBlobUrl = null;
        }
      }

      await KOSFS.delete(MUSIC_APP_ID, fileId);
      _showMusicToast("Object purged successfully from filesystem block mapping arrays.");
      await _loadAudioLibrary();
    } catch {
      _showMusicToast("Access violation exception during deletion tracking routing sequence.");
    }
  });
};

/* ═══════════════════════════════════════════════════════════
   APP MODAL AND COMPONENT ENGINE DIALOG INTERFACES
═══════════════════════════════════════════════════════════ */
function _showConfirmModal(text) {
  return new Promise(resolve => {
    const el = document.getElementById('mu-modal-overlay');
    const txt = document.getElementById('mu-dialog-text');
    if (!el || !txt) return resolve(false);

    txt.textContent = text;
    el.classList.add('active');
    MU._modalResolve = resolve;
  });
}

window._muCloseModal = function(decision) {
  document.getElementById('mu-modal-overlay')?.classList.remove('active');
  if (MU._modalResolve) {
    MU._modalResolve(decision);
    MU._modalResolve = null;
  }
};

function _showMusicToast(msg) {
  const el = document.getElementById('mu-toast');
  if (!el) return;
  el.textContent = msg;
  el.classList.add('visible');
  clearTimeout(MU._toastTimer);
  MU._toastTimer = setTimeout(() => el.classList.remove('visible'), 2500);
}

function _formatAudioDuration(s) {
  if (isNaN(s)) return "0:00";
  const mins = Math.floor(s / 60);
  const secs = Math.floor(s % 60);
  return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
}

function _escapeMarkup(str) {
  return (str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}