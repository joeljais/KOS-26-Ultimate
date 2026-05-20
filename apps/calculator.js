/* ══════════════════════════════════════════════════════════════
   KOS ULTIMATE 2026 — apps/calculator.js
   Mac-style dark calculator.
   ══════════════════════════════════════════════════════════════ */

window.KOSApps = window.KOSApps || {};

/* Expose as global alias so inline onclick="Calc.press(...)" works */
const Calc = {
  display:  '0',
  operator: null,
  operand:  null,
  fresh:    true,
  _histOp:  null,

  _update() {
    const el = document.getElementById('calc-display');
    if (!el) return;
    const len = this.display.replace('-', '').length;
    el.style.fontSize = len > 9 ? '1.6rem' : len > 6 ? '2rem' : '3rem';
    el.textContent = this.display;
    document.querySelectorAll('.calc-btn.calc-op').forEach(btn => {
      btn.classList.toggle('calc-op-active', btn.textContent.trim() === this._histOp);
    });
  },

  press(key) {
    if (key === 'AC') {
      this.display = '0'; this.operator = null; this.operand = null;
      this.fresh = true; this._histOp = null;
    } else if (key === '+/-') {
      if (this.display !== '0') {
        this.display = this.display.startsWith('-') ? this.display.slice(1) : '-' + this.display;
      }
    } else if (key === '%') {
      const v = parseFloat(this.display);
      if (!isNaN(v)) this.display = this._fmt(v / 100);
      this.fresh = true;
    } else if (['+', '-', '×', '÷'].includes(key)) {
      if (this.operator && !this.fresh) this._compute();
      this.operand = parseFloat(this.display);
      this.operator = key; this._histOp = key; this.fresh = true;
    } else if (key === '=') {
      if (this.operator) { this._compute(); this.operator = null; this._histOp = null; this.fresh = true; }
    } else if (key === '.') {
      if (this.fresh) { this.display = '0.'; this.fresh = false; return this._update(); }
      if (!this.display.includes('.')) this.display += '.';
      return this._update();
    } else {
      if (this.fresh) { this.display = key; this.fresh = false; }
      else if (this.display.replace(/[-.]/, '').length < 10) this.display += key;
      this._histOp = null;
    }
    this._update();
  },

  _compute() {
    const a = this.operand, b = parseFloat(this.display);
    if (isNaN(a) || isNaN(b)) return;
    let r;
    switch (this.operator) {
      case '+': r = a + b; break;
      case '-': r = a - b; break;
      case '×': r = a * b; break;
      case '÷': r = b !== 0 ? a / b : 'Error'; break;
      default: return;
    }
    this.display = r === 'Error' ? 'Error' : this._fmt(r);
    this.operand = null;
  },

  _fmt(n) {
    if (!isFinite(n)) return 'Error';
    const s = parseFloat(n.toPrecision(10)).toString();
    return s.length > 12 ? n.toExponential(4) : s;
  },
};

window.KOSApps.calculator = {
  init() {
    const body = document.getElementById('calc-body');
    if (!body) return;
    const LAYOUT = [
      [{ k: 'AC', c: 'fn' }, { k: '+/-', c: 'fn' }, { k: '%', c: 'fn' },  { k: '÷', c: 'op' }],
      [{ k: '7',  c: 'num'}, { k: '8',   c: 'num'}, { k: '9',  c: 'num'}, { k: '×', c: 'op' }],
      [{ k: '4',  c: 'num'}, { k: '5',   c: 'num'}, { k: '6',  c: 'num'}, { k: '-', c: 'op' }],
      [{ k: '1',  c: 'num'}, { k: '2',   c: 'num'}, { k: '3',  c: 'num'}, { k: '+', c: 'op' }],
      [{ k: '0',  c: 'num zero'}, { k: '.', c: 'num'}, { k: '=', c: 'op eq' }],
    ];

    body.innerHTML = `
      <div class="calc-wrap">
        <div class="calc-history" id="calc-history"></div>
        <div class="calc-display" id="calc-display">0</div>
        <div class="calc-grid">
          ${LAYOUT.map(row => row.map(b => {
            const safe = b.k.replace(/'/g, "\\'");
            return `<button class="calc-btn calc-${b.c.split(' ').join(' calc-')}" onclick="Calc.press('${safe}')">${b.k}</button>`;
          }).join('')).join('')}
        </div>
      </div>`;

    /* Reset state on every open */
    Calc.display = '0'; Calc.operator = null; Calc.operand = null;
    Calc.fresh = true; Calc._histOp = null;
    Calc._update();
  },
};

/* Register init hook with WM */
WM.setOnOpen('calculator', () => window.KOSApps.calculator.init());
