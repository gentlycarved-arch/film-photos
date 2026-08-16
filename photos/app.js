(function () {
  const stage = document.getElementById('stage');
  const exposuresEl = document.getElementById('exposures');
  const windowsEl = document.getElementById('windows');
  const nav = document.getElementById('nav');
  const views = document.getElementById('views');
  const counter = document.getElementById('counter');
  const sheet = document.getElementById('sheet');
  const viewer = document.getElementById('viewer');
  const viewerImg = document.getElementById('viewerImg');
  const viewerLabel = document.getElementById('viewerLabel');

  const LAYERS = 4;          // photographs sharing the frame at any moment
  const WINDOWS = 3;         // apertures onto what is coming next

  // Every layer is additive over black, the way stacked exposures build up on one
  // frame of film: highlights accumulate, shadows let whatever is beneath show through.
  const ROLES = [
    { opacity: 0.94, blend: 'screen' },
    { opacity: 0.46, blend: 'screen' },
    { opacity: 0.36, blend: 'screen' },
    { opacity: 0.28, blend: 'screen' },
  ];
  const HOVER_LIFT = 0.16;   // how much pointing at a layer brings it up

  let all = [];
  let pool = [];
  let layers = [];           // in stacking order, 0 = dominant
  let windows = [];
  let hovered = -1;
  let idx = 0;               // index in the pool of the dominant exposure
  let view = 'exposure';     // 'exposure' or 'sheet'
  let openAt = -1;           // index open in the full-viewport viewer, -1 if closed

  fetch('manifest.json')
    .then((r) => r.json())
    .then((manifest) => {
      all = manifest;
      pool = manifest.slice();
      for (let i = 0; i < LAYERS; i++) layers.push(makeLayer());
      buildWindows();
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

  // Draw the stack from the current position: the dominant exposure plus the three
  // frames behind it. Everything is addressed by index, so it reads in both directions.
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
    counter.textContent =
      String(idx + 1).padStart(3, '0') + ' / ' + String(pool.length).padStart(3, '0');
    placeWindows();
  }

  function step(d) {
    const n = pool.length;
    idx = ((idx + d) % n + n) % n;
    render();
  }

  // Apertures onto photographs further down the sequence. Each shows the part of a
  // frame that would fall in that spot were it full-bleed, so the window reads as a
  // hole cut in the composition rather than a thumbnail pasted on top.
  function buildWindows() {
    for (let i = 0; i < WINDOWS; i++) {
      const w = document.createElement('div');
      w.className = 'window';
      const img = document.createElement('img');
      img.alt = '';
      w.appendChild(img);
      const label = document.createElement('div');
      label.className = 'wlabel';
      w.appendChild(label);
      ['tl', 'tr', 'bl', 'br'].forEach((c) => {
        const t = document.createElement('span');
        t.className = 'wtick wt-' + c;
        w.appendChild(t);
      });
      w.addEventListener('click', (e) => {
        e.stopPropagation();
        if (w._target != null) { idx = w._target; render(); }
      });
      windowsEl.appendChild(w);
      windows.push({ el: w, img, label });
    }
    window.addEventListener('resize', placeWindows);
  }

  function placeWindows() {
    const s = stage.getBoundingClientRect();
    const n = pool.length;
    if (!n) return;

    windows.forEach((win, i) => {
      // positions shift as you move through, so the apertures never sit in a fixed grid
      const r = seeded('win' + i + '-' + idx);
      const w = s.width * (0.17 + r() * 0.10);
      const h = w * (0.62 + r() * 0.24);
      // spread across the width, each in its own horizontal band
      const bandTop = s.height * (0.08 + i * 0.29);
      const x = s.width * (0.05 + r() * 0.72);
      const y = bandTop + r() * s.height * 0.10;

      const left = Math.max(14, Math.min(x, s.width - w - 14));
      const top = Math.max(14, Math.min(y, s.height - h - 14));

      win.el.style.left = left + 'px';
      win.el.style.top = top + 'px';
      win.el.style.width = w + 'px';
      win.el.style.height = h + 'px';

      // the photograph is drawn at full-frame size and shifted, so the aperture
      // lands on whatever part of it happens to be there
      const target = ((idx + 1 + i) % n + n) % n;
      const item = pool[target];
      win.el._target = target;
      win.img.src = 'img/' + item.file;
      win.img.style.width = s.width + 'px';
      win.img.style.height = s.height + 'px';
      win.img.style.left = -left + 'px';
      win.img.style.top = -top + 'px';
      win.label.textContent = 'fig.' + item.id;
    });
  }

  // ---------- getting through the collection ----------
  // click anywhere for the next frame, and every ordinary way of moving through a
  // sequence works too, so 139 photographs don't take 139 deliberate clicks
  // clicking the field advances one frame; clicking an aperture jumps to that one
  stage.addEventListener('click', () => step(1));

  window.addEventListener('keydown', (e) => {
    // with a photograph open, the arrows walk the collection inside the viewer
    if (openAt >= 0) {
      if (e.key === 'Escape') { e.preventDefault(); closeViewer(); }
      else if (e.key === 'ArrowRight' || e.key === 'ArrowDown' || e.key === ' ') { e.preventDefault(); openViewer(openAt + 1); }
      else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') { e.preventDefault(); openViewer(openAt - 1); }
      return;
    }
    if (view !== 'exposure') return;
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown' || e.key === ' ' || e.key === 'Enter') {
      e.preventDefault(); step(1);
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
      e.preventDefault(); step(-1);
    } else if (e.key === 'Home') {
      e.preventDefault(); idx = LAYERS - 1; render();
    }
  });

  let wheelAcc = 0, wheelLock = false;
  window.addEventListener('wheel', (e) => {
    if (view !== 'exposure' || openAt >= 0) return;   // the grid scrolls normally
    wheelAcc += e.deltaY || e.deltaX;
    if (wheelLock || Math.abs(wheelAcc) < 40) return;
    step(wheelAcc > 0 ? 1 : -1);
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
      step(dx > 0 ? 1 : -1);
      scrub.x = e.clientX;
      scrub.moved = true;
    }
  });
  window.addEventListener('mouseup', () => { scrub = null; });

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
      cell.addEventListener('click', () => openViewer(i));
      sheet.appendChild(cell);
    });
  }

  function openViewer(i) {
    const n = pool.length;
    openAt = ((i % n) + n) % n;
    const item = pool[openAt];
    viewerImg.src = 'img/' + item.file;
    viewerLabel.textContent =
      'fig.' + item.id + '  ·  ' + String(openAt + 1).padStart(3, '0') + ' / ' + String(n).padStart(3, '0');
    viewer.classList.add('on');
  }
  function closeViewer() { openAt = -1; viewer.classList.remove('on'); }
  viewer.addEventListener('click', closeViewer);

  function setView(next) {
    view = next;
    closeViewer();
    const onSheet = view === 'sheet';
    sheet.classList.toggle('on', onSheet);
    stage.style.display = onSheet ? 'none' : '';
    counter.style.visibility = onSheet ? 'hidden' : '';
    if (onSheet) buildSheet();
    else render();
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
    closeViewer();
    if (view === 'sheet') buildSheet();
    else render();
  });
})();
