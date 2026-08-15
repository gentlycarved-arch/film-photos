(function () {
  const exposuresEl = document.getElementById('exposures');
  const zonesEl = document.getElementById('zones');
  const nav = document.getElementById('nav');

  const LAYERS = 4;          // photographs sharing the frame at any moment

  // How each layer sits once the stack is ordered. Index 0 is the dominant exposure.
  // Blend modes alternate so light and dark areas of different frames eat into
  // one another rather than simply stacking.
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
  let layers = [];           // { el, img, item } in stacking order, 0 = dominant
  let hovered = -1;
  let cursor = 0;            // how far through the collection the clicks have got

  fetch('manifest.json')
    .then((r) => r.json())
    .then((manifest) => {
      all = manifest;
      pool = manifest.slice();
      buildZones();
      // open on the first frames of the collection, in order, the newest on top
      for (let i = 0; i < LAYERS; i++) layers.unshift(makeLayer(pool[i % pool.length]));
      cursor = LAYERS;
      restack();
    })
    .catch((err) => {
      exposuresEl.insertAdjacentHTML(
        'beforeend',
        '<p style="padding:40px;color:#aaa;font-family:monospace">Could not load manifest.json — ' + err + '</p>'
      );
    });

  function makeLayer(item) {
    const el = document.createElement('div');
    el.className = 'exposure';

    const img = document.createElement('img');
    img.alt = '';
    el.appendChild(img);
    exposuresEl.appendChild(el);

    const layer = { el, img, item: null };
    setPhoto(layer, item);
    return layer;
  }

  // Each frame is cropped and framed a little differently, so the layers never
  // line up squarely on top of one another.
  function setPhoto(layer, item) {
    if (!item) return;
    layer.item = item;
    layer.img.src = 'img/' + item.file;
    const ox = 30 + Math.random() * 40;
    const oy = 30 + Math.random() * 40;
    layer.img.style.objectPosition = ox.toFixed(0) + '% ' + oy.toFixed(0) + '%';
    const scale = 1.04 + Math.random() * 0.14;
    const dx = (Math.random() - 0.5) * 5;
    const dy = (Math.random() - 0.5) * 5;
    layer.el.style.transform =
      'translate(' + dx.toFixed(1) + '%, ' + dy.toFixed(1) + '%) scale(' + scale.toFixed(3) + ')';
  }

  // Apply the roles down the stack. This is the only thing click and hover change.
  function restack() {
    layers.forEach((layer, i) => {
      const role = ROLES[Math.min(i, ROLES.length - 1)];
      const lift = i === hovered ? HOVER_LIFT : 0;
      layer.el.style.zIndex = String(LAYERS - i);
      layer.el.style.mixBlendMode = role.blend;
      layer.el.style.opacity = Math.min(1, role.opacity + lift).toFixed(3);
      // the dominant exposure is printed down less, so it reads clearly
      // while the ones beneath stay as underlying exposures
      layer.el.classList.toggle('dominant', i === 0);
    });
  }

  // One invisible region per layer. Pointing at a region speaks to its layer.
  function buildZones() {
    const cols = LAYERS <= 2 ? LAYERS : 2;
    const rows = Math.ceil(LAYERS / cols);
    zonesEl.style.gridTemplateColumns = 'repeat(' + cols + ', 1fr)';
    zonesEl.style.gridTemplateRows = 'repeat(' + rows + ', 1fr)';

    for (let i = 0; i < LAYERS; i++) {
      const z = document.createElement('div');
      z.className = 'zone';
      z.addEventListener('mouseenter', () => { hovered = i; restack(); });
      z.addEventListener('mouseleave', () => { if (hovered === i) { hovered = -1; restack(); } });
      z.addEventListener('click', advance);
      zonesEl.appendChild(z);
    }
  }

  // Click advances the collection by one. The next photograph in order becomes the
  // dominant exposure, everything already in the frame steps back a rank, and the
  // faintest one drops out — so the stack reads as a sequence being worked through.
  function advance() {
    const next = pool[cursor % pool.length];
    cursor++;
    const recycled = layers.pop();     // the faintest exposure makes way
    setPhoto(recycled, next);
    layers.unshift(recycled);
    hovered = 0;
    restack();
  }

  // ---------- side navigation ----------
  nav.addEventListener('click', (e) => {
    const btn = e.target.closest('.nav-btn');
    if (!btn) return;
    [...nav.children].forEach((b) => b.classList.toggle('active', b === btn));

    const cat = btn.dataset.cat;
    pool = cat === 'all' ? all.slice() : all.filter((p) => (p.categories || []).includes(cat));
    if (!pool.length) pool = all.slice();

    // restart the sequence at the top of whatever was selected
    layers.forEach((l, i) => setPhoto(l, pool[(LAYERS - 1 - i) % pool.length]));
    cursor = LAYERS;
    hovered = -1;
    restack();
  });
})();
