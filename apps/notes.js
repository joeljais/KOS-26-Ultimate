'use strict';
window.KOSApps = window.KOSApps || {};

const NotesApp = {
  currentId: null,
  dbName: 'kos-documents',
  version: 1,

  async init() {
    const body = document.getElementById('notes-body');
    if (!body) return;

    body.innerHTML = `
      <div class="notes-container">
        <aside class="notes-sidebar">
          <div class="notes-sidebar-header">
            <div class="notes-search-wrapper">
               <input type="text" id="new-note-name" placeholder="New note name...">
               <button id="create-note-btn"><i class="fa-solid fa-plus"></i></button>
            </div>
          </div>
          <div id="notes-list" class="notes-list"></div>
        </aside>
        <main class="notes-editor">
          <div class="editor-toolbar">
            <span id="active-note-title">Documents</span>
            <button id="save-note-btn" class="liquid-btn" style="display:none;">Save Note</button>
          </div>
          <textarea id="note-textarea" placeholder="Start writing..."></textarea>
        </main>
        <div id="notes-toast" class="nt-toast">Saved to Documents</div>
      </div>
    `;

    this.bindEvents();
    await this.refreshNotesList();
  },

  /* ─────────────────── Database Handlers (Synced with files.js) ─────────────────── */
  async _getDB() {
    return new Promise((res, rej) => {
      const req = indexedDB.open(this.dbName, this.version);
      req.onsuccess = e => res(e.target.result);
      req.onerror = e => rej(e.target.error);
    });
  },

  async refreshNotesList() {
    const listEl = document.getElementById('notes-list');
    const db = await this._getDB();
    
    return new Promise((res) => {
      const transaction = db.transaction('uploads', 'readonly');
      const store = transaction.objectStore('uploads');
      const req = store.getAll();

      req.onsuccess = () => {
        const files = req.result || [];
        if (files.length === 0) {
          listEl.innerHTML = '<div class="nt-empty">No notes in Documents</div>';
          return res();
        }

        listEl.innerHTML = files.map(file => `
          <div class="note-item ${this.currentId === file.id ? 'active' : ''}" data-id="${file.id}">
            <i class="fa-solid fa-file-lines"></i>
            <div class="note-item-info">
              <div class="note-item-title">${file.name}</div>
              <div class="note-item-date">${new Date(file.date).toLocaleDateString()}</div>
            </div>
          </div>
        `).join('');

        listEl.querySelectorAll('.note-item').forEach(el => {
          el.onclick = () => this.loadNote(parseInt(el.dataset.id));
        });
        res();
      };
    });
  },

  async loadNote(id) {
    const db = await this._getDB();
    const transaction = db.transaction('uploads', 'readonly');
    const store = transaction.objectStore('uploads');
    const req = store.get(id);

    req.onsuccess = () => {
      const file = req.result;
      if (!file) return;
      this.currentId = id;
      document.getElementById('note-textarea').value = file.text || "";
      document.getElementById('active-note-title').innerText = file.name;
      document.getElementById('save-note-btn').style.display = 'block';
      this.refreshNotesList(); 
    };
  },

  bindEvents() {
    const createBtn = document.getElementById('create-note-btn');
    const nameInput = document.getElementById('new-note-name');

    createBtn.onclick = async () => {
      let name = nameInput.value.trim();
      if (!name) return;
      if (!name.endsWith('.txt')) name += '.txt';
      
      const db = await this._getDB();
      const transaction = db.transaction('uploads', 'readwrite');
      const store = transaction.objectStore('uploads');
      
      const newNote = {
        name: name,
        text: "",
        size: 0,
        date: new Date().toISOString()
      };

      const req = store.add(newNote);
      req.onsuccess = (e) => {
        nameInput.value = "";
        this.currentId = e.target.result;
        this.refreshNotesList();
        this.loadNote(this.currentId);
        // Refresh Files app if it's open
        window.KOSApps.files?.refresh?.();
      };
    };

    document.getElementById('save-note-btn').onclick = async () => {
      if (!this.currentId) return;
      const content = document.getElementById('note-textarea').value;
      
      const db = await this._getDB();
      const transaction = db.transaction('uploads', 'readwrite');
      const store = transaction.objectStore('uploads');
      
      // Get existing metadata first
      const getReq = store.get(this.currentId);
      getReq.onsuccess = () => {
        const data = getReq.result;
        data.text = content;
        data.size = new Blob([content]).size;
        data.date = new Date().toISOString();
        
        const putReq = store.put(data);
        putReq.onsuccess = () => {
          const toast = document.getElementById('notes-toast');
          toast.classList.add('show');
          setTimeout(() => toast.classList.remove('show'), 2000);
          window.KOSApps.files?.refresh?.();
        };
      };
    };
  }
};

window.KOSApps.notes = NotesApp;