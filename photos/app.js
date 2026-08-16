(function () {
  const stage = document.getElementById('stage');
  const exposuresEl = document.getElementById('exposures');
  const nav = document.getElementById('nav');
  const views = document.getElementById('views');
  const counter = document.getElementById('counter');
  const sheet = document.getElementById('sheet');
  const pair = document.getElementById('pair');
  const pairA = document.getElementById('pgridA');
  const pairB = document.getElementById('pgridB');
  const viewer = document.getElementById('viewer');
  const viewerImg = document.getElementById('viewerImg');
  const viewerImgB = document.getElementById('viewerImgB');
  const viewerLabel = document.getElementById('viewerLabel');
  const hint = document.getElementById('hint');

  const LAYERS = 2;          // two photographs share the frame at a time

  // Every layer is additive over black, the way stacked exposures build up on one
  // frame of film: highlights accumulate, shadows let whatever is beneath show through.
  const ROLES = [
    { opacity: 0.90, blend: 'screen' },
    { opacity: 0.66, blend: 'screen' },
  ];
  const HOVER_LIFT = 0.16;   // how much pointing at a layer brings it up

  let all = [];
  let pool = [];
  let layers = [];           // in stacking order, 0 = dominant
  let hovered = -1;
  let idx = 0;               // index in the pool of the dominant exposure
  let view = 'exposure';     // 'exposure' or 'sheet'
  let openAt = -1;           // index open in the full-viewport viewer, -1 if closed
  let picked = [];           // frames chosen in the grid to expose over one another

  fetch('manifest.json')
    .then((r) => r.json())
    .then((manifest) => {
      all = manifest;
      pool = manifest.slice();
      for (let i = 0; i < LAYERS; i++) layers.push(makeLayer());
      idx = LAYERS - 1;
      render();
    })
    .catch((err) => {
      exposuresEl.insertAdjacentHTML(
        'beforeend',
        '<p style="padding:40px;color:#aaa;font-family:monospace">Could not load manifest.json — ' + err + '</p>'
      );
    });

  function makeLayer() {
    const el = document.createElement('div');
    el.className = 'exposure';
    const img = document.createElement('img');
    img.alt = '';
    el.appendChild(img);
    exposuresEl.appendChild(el);
    return { el, img, file: null };
  }

  // deterministic stream of numbers from any string
  function seeded(key) {
    let h = 2166136261;
    for (let i = 0; i < key.length; i++) { h ^= key.charCodeAt(i); h = Math.imul(h, 16777619); }
    return () => { h ^= h << 13; h |= 0; h ^= h >>> 17; h ^= h << 5; h |= 0; return ((h >>> 0) % 10000) / 10000; };
  }

  // Framing is derived from the file name, so a photograph is always cropped and
  // placed the same way. Without this, stepping back would re-frame what you just saw.
  function framing(file) {
    const r = seeded(file);
    return {
      ox: 30 + r() * 40,
      oy: 30 + r() * 40,
      scale: 1.04 + r() * 0.14,
      dx: (r() - 0.5) * 5,
      dy: (r() - 0.5) * 5,
    };
  }

  // Draw the pair from the current position. Everything is addressed by index, so
  // the sequence reads in both directions.
  function render() {
    const n = pool.length;
    layers.forEach((layer, i) => {
      const item = pool[((idx - i) % n + n) % n];
      if (layer.file !== item.file) {
        layer.file = item.file;
        layer.img.src = 'img/' + item.file;
        const f = framing(item.file);
        layer.img.style.objectPosition = f.ox.toFixed(0) + '% ' + f.oy.toFixed(0) + '%';
        layer.el.style.transform =
          'translate(' + f.dx.toFixed(1) + '%, ' + f.dy.toFixed(1) + '%) scale(' + f.scale.toFixed(3) + ')';
      }
      const role = ROLES[Math.min(i, ROLES.length - 1)];
      const lift = i === hovered ? HOVER_LIFT : 0;
      layer.el.style.zIndex = String(LAYERS - i);
      layer.el.style.mixBlendMode = role.blend;
      layer.el.style.opacity = Math.min(1, role.opacity + lift).toFixed(3);
      layer.el.classList.toggle('dominant', i === 0);
    });
    const back = ((idx - LAYERS + 1) % n + n) % n;
    counter.textContent =
      String(back + 1).padStart(3, '0') + '\u2013' + String(idx + 1).padStart(3, '0') +
      ' / ' + String(pool.length).padStart(3, '0');
  }

  function step(d) {
    const n = pool.length;
    idx = ((idx + d) % n + n) % n;
    render();
  }

  // ---------- getting through the collection ----------
  // A click moves the whole pair on, so both photographs change together and the
  // next click brings an entirely new exposure rather than half of the last one.
  stage.addEventListener('click', () => step(LAYERS));

  window.addEventListener('keydown', (e) => {
    // with a photograph open, the arrows walk the collection inside the viewer
    if (openAt >= 0) {
      if (e.key === 'Escape') { e.preventDefault(); closeViewer(true); return; }
      // a pair is a composition, not a position in the sequence: leave it be
      if (viewer.classList.contains('paired')) return;
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown' || e.key === ' ') { e.preventDefault(); picked = []; openViewer(openAt + 1); }
      else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') { e.preventDefault(); picked = []; openViewer(openAt - 1); }
      return;
    }
    if (view !== 'exposure') return;
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown' || e.key === ' ' || e.key === 'Enter') {
      e.preventDefault(); step(LAYERS);
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
      e.preventDefault(); step(-LAYERS);
    } else if (e.key === 'Home') {
      e.preventDefault(); idx = LAYERS - 1; render();
    }
  });

  let wheelAcc = 0, wheelLock = false;
  window.addEventListener('wheel', (e) => {
    if (view !== 'exposure' || openAt >= 0) return;   // the grid scrolls normally
    wheelAcc += e.deltaY || e.deltaX;
    if (wheelLock || Math.abs(wheelAcc) < 40) return;
    step(wheelAcc > 0 ? LAYERS : -LAYERS);
    wheelAcc = 0;
    wheelLock = true;
    setTimeout(() => { wheelLock = false; }, 90);
  }, { passive: true });

  // dragging across the frame scrubs through, for covering ground quickly
  let scrub = null;
  stage.addEventListener('mousedown', (e) => { scrub = { x: e.clientX, moved: false }; });
  window.addEventListener('mousemove', (e) => {
    if (!scrub) return;
    const dx = e.clientX - scrub.x;
    if (Math.abs(dx) >= 46) {
      step(dx > 0 ? LAYERS : -LAYERS);
      scrub.x = e.clientX;
      scrub.moved = true;
    }
  });
  window.addEventListener('mouseup', () => { scrub = null; });

  // ---------- two contact sheets, one over the other ----------
  const PAIR_COLS = 4, PAIR_ROWS = 3;
  const PAIR_CELLS = PAIR_COLS * PAIR_ROWS;
  let shift = { x: 0, y: 0 };     // how far sheet B sits off sheet A
  let liftedCell = null;

  function buildPair() {
    const n = pool.length;
    [pairA, pairB].forEach((grid, g) => {
      grid.innerHTML = '';
      for (let i = 0; i < PAIR_CELLS; i++) {
        // the two sheets draw from opposite halves, so they are different collections
        const at = (g === 0 ? i : i + Math.floor(n / 2)) % n;
        const item = pool[at];
        const cell = document.createElement('div');
        cell.className = 'pcell';
        const img = document.createElement('img');
        // a cell is a quarter of the viewport wide; the full scans would put a
        // quarter-gigabyte of decoded bitmap under a full-screen blend
        img.src = 'img-grid/' + item.file;
        img.alt = '';
        cell.appendChild(img);
        const label = document.createElement('div');
        label.className = 'pcell-label';
        label.textContent = 'fig.' + item.id;
        cell.appendChild(label);
        cell.addEventListener('click', (e) => {
          e.stopPropagation();
          if (pairDrag && pairDrag.moved) return;
          liftCell(cell, grid);
        });
        grid.appendChild(cell);
      }
    });
    // start half a cell out of true, so the overlap is legible from the first moment
    const r = pair.getBoundingClientRect();
    shift = { x: (r.width / PAIR_COLS) * 0.5, y: (r.height / PAIR_ROWS) * 0.32 };
    applyShift();
  }

  function applyShift() {
    pairB.style.transform = 'translate(' + shift.x.toFixed(1) + 'px, ' + shift.y.toFixed(1) + 'px)';
  }

  function liftCell(cell, grid) {
    if (liftedCell) liftedCell.classList.remove('lifted');
    liftedCell = cell === liftedCell ? null : cell;
    if (liftedCell) liftedCell.classList.add('lifted');
    // the other sheet steps back so the chosen frame carries
    pairA.classList.toggle('recessed', !!liftedCell && grid !== pairA);
    pairB.classList.toggle('recessed', !!liftedCell && grid !== pairB);
  }

  // Sheet B can be slid over sheet A, but only within a cell either way: the point is
  // to see new pairings line up, not to scatter the photographs.
  let pairDrag = null;
  pair.addEventListener('mousedown', (e) => {
    pairDrag = { x: e.clientX, y: e.clientY, from: { ...shift }, moved: false };
    pair.classList.add('shifting');
  });
  window.addEventListener('mousemove', (e) => {
    if (!pairDrag) return;
    const dx = e.clientX - pairDrag.x;
    const dy = e.clientY - pairDrag.y;
    if (!pairDrag.moved && Math.hypot(dx, dy) > 3) pairDrag.moved = true;
    if (!pairDrag.moved) return;
    const r = pair.getBoundingClientRect();
    const capX = r.width / PAIR_COLS;
    const capY = r.height / PAIR_ROWS;
    shift.x = Math.max(-capX, Math.min(pairDrag.from.x + dx, capX));
    shift.y = Math.max(-capY, Math.min(pairDrag.from.y + dy, capY));
    applyShift();
  });
  window.addEventListener('mouseup', () => {
    if (!pairDrag) return;
    pair.classList.remove('shifting');
    setTimeout(() => { pairDrag = null; }, 0);
  });

  // ---------- the grid, and one photograph filling the viewport ----------
  function buildSheet() {
    sheet.innerHTML = '';
    pool.forEach((item, i) => {
      const cell = document.createElement('div');
      cell.className = 'cell';
      const img = document.createElement('img');
      img.src = 'img-grid/' + item.file;
      img.loading = 'lazy';
      img.alt = '';
      cell.appendChild(img);
      const label = document.createElement('div');
      label.className = 'cell-label';
      label.textContent = 'fig.' + item.id;
      cell.appendChild(label);
      const mark = document.createElement('div');
      mark.className = 'pick-mark';
      cell.appendChild(mark);
      cell.addEventListener('click', () => choose(i));
      sheet.appendChild(cell);
    });
    picked = [];
    paintPicks();
  }

  // Two frames chosen in the grid are exposed over one another, the same way the
  // layers combine in the other view. Choosing one on its own just shows it.
  function choose(i) {
    const at = picked.indexOf(i);
    if (at >= 0) {                      // clicking a chosen frame lets it go
      picked.splice(at, 1);
      paintPicks();
      return;
    }
    picked.push(i);
    if (picked.length === 1) {
      paintPicks();
      openViewer(picked[0]);            // seen on its own until a second is chosen
      return;
    }
    picked = picked.slice(-2);
    paintPicks();
    openViewer(picked[0], picked[1]);
  }

  function paintPicks() {
    [...sheet.children].forEach((cell, i) => {
      const at = picked.indexOf(i);
      cell.classList.toggle('picked', at >= 0);
      const mark = cell.querySelector('.pick-mark');
      if (mark) mark.textContent = at >= 0 ? String(at + 1) : '';
    });
    updateHint();
  }

  function updateHint() {
    if (view === 'pair') { hint.textContent = 'drag to slide one sheet over the other'; return; }
    if (view !== 'sheet') { hint.textContent = ''; return; }
    hint.textContent = picked.length === 1
      ? 'pick a second to expose over it'
      : 'pick two to combine';
  }

  function openViewer(i, j) {
    const n = pool.length;
    openAt = ((i % n) + n) % n;
    const item = pool[openAt];
    viewerImg.src = 'img/' + item.file;

    const paired = j != null;
    viewer.classList.toggle('paired', paired);
    if (paired) {
      const other = pool[((j % n) + n) % n];
      viewerImgB.src = 'img/' + other.file;
      viewerLabel.textContent = 'fig.' + item.id + '  ×  fig.' + other.id;
    } else {
      viewerImgB.removeAttribute('src');
      viewerLabel.textContent =
        'fig.' + item.id + '  ·  ' + String(openAt + 1).padStart(3, '0') + ' / ' + String(n).padStart(3, '0');
    }
    viewer.classList.add('on');
  }

  function closeViewer(clearPicks) {
    openAt = -1;
    viewer.classList.remove('on', 'paired');
    if (clearPicks !== false) { picked = []; if (view === 'sheet') paintPicks(); }
  }
  viewer.addEventListener('click', () => closeViewer(true));

  function setView(next) {
    view = next;
    closeViewer(true);
    sheet.classList.toggle('on', view === 'sheet');
    pair.classList.toggle('on', view === 'pair');
    stage.style.display = view === 'exposure' ? '' : 'none';
    counter.style.visibility = view === 'exposure' ? '' : 'hidden';
    if (view === 'sheet') buildSheet();
    else if (view === 'pair') buildPair();
    else render();
    updateHint();
  }

  views.addEventListener('click', (e) => {
    const btn = e.target.closest('.nav-btn');
    if (!btn) return;
    [...views.querySelectorAll('.nav-btn')].forEach((b) => b.classList.toggle('active', b === btn));
    setView(btn.dataset.view);
  });

  // ---------- side navigation ----------
  nav.addEventListener('click', (e) => {
    const btn = e.target.closest('.nav-btn');
    if (!btn || !btn.dataset.cat) return;
    [...nav.querySelectorAll('.nav-btn[data-cat]')].forEach((b) => b.classList.toggle('active', b === btn));

    const cat = btn.dataset.cat;
    pool = cat === 'all' ? all.slice() : all.filter((p) => (p.categories || []).includes(cat));
    if (!pool.length) pool = all.slice();

    layers.forEach((l) => { l.file = null; });
    idx = Math.min(LAYERS - 1, pool.length - 1);
    hovered = -1;
    closeViewer(true);
    if (view === 'sheet') buildSheet();
    else if (view === 'pair') buildPair();
    else render();
    updateHint();
  });
})();
