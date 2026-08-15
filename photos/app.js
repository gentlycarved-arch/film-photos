(function () {
  const stage = document.getElementById('stage');
  const nav = document.getElementById('nav');

  const COLS = 16;
  const ROWS = 9;
  const ENLARGE_TO = 0.58;   // a hovered photograph fills this much of the table
  const DRAG_SLOP = 4;       // px of movement before it counts as a drag, not a click

  function seededRandom(seed) {
    let h = 2166136261;
    for (let i = 0; i < seed.length; i++) {
      h ^= seed.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return function () {
      h ^= h << 13; h |= 0;
      h ^= h >>> 17;
      h ^= h << 5; h |= 0;
      return ((h >>> 0) % 100000) / 100000;
    };
  }

  let plates = [];
  let topZ = 0;
  let front = null;
  let dragging = null;

  fetch('manifest.json')
    .then((r) => r.json())
    .then(build)
    .catch((err) => {
      stage.insertAdjacentHTML(
        'beforeend',
        '<p style="padding:40px;font-family:monospace">Could not load manifest.json — ' + err + '</p>'
      );
    });

  function build(manifest) {
    const cells = [];
    for (let i = 0; i < COLS * ROWS; i++) cells.push(i);
    const sh = seededRandom('table-v1');
    for (let i = cells.length - 1; i > 0; i--) {
      const j = Math.floor(sh() * (i + 1));
      [cells[i], cells[j]] = [cells[j], cells[i]];
    }

    const cellW = 100 / COLS;
    const cellH = 100 / ROWS;

    manifest.forEach((item, i) => {
      const r = seededRandom('plate' + item.id + i);

      const w = 17 + r() * 17;
      const h = w * (item.height / item.width) * (16 / 9);

      const cell = cells[i % cells.length];
      const cx = (cell % COLS) * cellW;
      const cy = Math.floor(cell / COLS) * cellH;
      const left = cx - w / 2 + (r() - 0.5) * cellW * 2;
      const top = cy - h / 2 + (r() - 0.5) * cellH * 2;

      const el = document.createElement('div');
      el.className = 'plate';
      el.style.left = left.toFixed(2) + '%';
      el.style.top = top.toFixed(2) + '%';
      el.style.width = w.toFixed(2) + '%';
      el.style.height = h.toFixed(2) + '%';
      el.style.zIndex = String(i + 1);
      el.dataset.file = item.file;
      el.dataset.categories = (item.categories || []).join(',');

      const img = document.createElement('img');
      img.src = 'img-grid/' + item.file;
      img.loading = 'lazy';
      img.alt = '';
      el.appendChild(img);

      el.addEventListener('mousedown', (e) => startDrag(e, el));
      el.addEventListener('mouseenter', () => enlarge(el));
      el.addEventListener('mouseleave', () => shrink(el));

      stage.appendChild(el);
      plates.push(el);
      topZ = i + 1;
    });
  }

  function fullSize(el) {
    const img = el.querySelector('img');
    if (img && img.src.indexOf('img-grid/') !== -1) {
      const full = 'img/' + el.dataset.file;
      const pre = new Image();
      pre.onload = () => { img.src = full; };
      pre.src = full;
    }
  }

  // hover → grows to full size, kept inside the table so it never runs off an edge
  function enlarge(el) {
    if (dragging) return;
    fullSize(el);

    const s = stage.getBoundingClientRect();
    const r = el.getBoundingClientRect();
    const k = Math.min(
      (s.width * ENLARGE_TO) / r.width,
      (s.height * 0.86) / r.height
    );
    if (k <= 1) { el.classList.add('enlarged'); return; }

    // where the centre would land once scaled, nudged back inside the table
    const cx = r.left + r.width / 2 - s.left;
    const cy = r.top + r.height / 2 - s.top;
    const halfW = (r.width * k) / 2;
    const halfH = (r.height * k) / 2;
    const wantX = Math.min(Math.max(cx, halfW + 8), s.width - halfW - 8);
    const wantY = Math.min(Math.max(cy, halfH + 8), s.height - halfH - 8);

    el.classList.add('enlarged');
    el.style.transform =
      'translate(' + (wantX - cx).toFixed(1) + 'px, ' + (wantY - cy).toFixed(1) + 'px) scale(' + k.toFixed(3) + ')';
  }

  function shrink(el) {
    el.classList.remove('enlarged');
    el.style.transform = '';
  }

  // press and move → the photograph comes with the cursor
  function startDrag(e, el) {
    e.preventDefault();
    shrink(el);

    const s = stage.getBoundingClientRect();
    const r = el.getBoundingClientRect();

    dragging = {
      el,
      moved: false,
      startX: e.clientX,
      startY: e.clientY,
      // work in px from here on; the layout started in %
      originX: r.left - s.left,
      originY: r.top - s.top,
    };

    el.style.width = r.width + 'px';
    el.style.height = r.height + 'px';
    el.style.left = dragging.originX + 'px';
    el.style.top = dragging.originY + 'px';
  }

  window.addEventListener('mousemove', (e) => {
    if (!dragging) return;
    const dx = e.clientX - dragging.startX;
    const dy = e.clientY - dragging.startY;

    if (!dragging.moved && Math.hypot(dx, dy) > DRAG_SLOP) {
      dragging.moved = true;
      dragging.el.classList.add('dragging');
      bringForward(dragging.el);
    }
    if (!dragging.moved) return;

    dragging.el.style.left = (dragging.originX + dx) + 'px';
    dragging.el.style.top = (dragging.originY + dy) + 'px';
  });

  window.addEventListener('mouseup', () => {
    if (!dragging) return;
    const { el, moved } = dragging;
    el.classList.remove('dragging');
    dragging = null;
    // a press that never moved is a click: bring it to the front
    if (!moved) bringForward(el);
    // the cursor is still over it, so let it grow again
    if (el.matches(':hover')) enlarge(el);
  });

  function bringForward(el) {
    if (front && front !== el) front.classList.remove('front');
    el.classList.add('front');
    front = el;
    el.style.zIndex = String(++topZ);
    fullSize(el);
  }

  // ---------- side navigation ----------
  nav.addEventListener('click', (e) => {
    const btn = e.target.closest('.nav-btn');
    if (!btn) return;
    [...nav.children].forEach((b) => b.classList.toggle('active', b === btn));
    const cat = btn.dataset.cat;
    plates.forEach((el) => {
      const match = cat === 'all' || el.dataset.categories.split(',').includes(cat);
      el.classList.toggle('hidden', !match);
      if (!match) shrink(el);
    });
  });
})();
