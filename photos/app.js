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
    { opacity: 0.78, blend: 'screen' },
    { opacity: 0.52, blend: 'screen' },
    { opacity: 0.42, blend: 'screen' },
    { opacity: 0.34, blend: 'screen' },
  ];
  const HOVER_LIFT = 0.16;   // how much pointing at a layer brings it up

  let all = [];
  let pool = [];
  let layers = [];           // { el, img, item } in stacking order, 0 = dominant
  let hovered = -1;

  fetch('manifest.json')
    .then((r) => r.json())
    .then((manifest) => {
      all = manifest;
      pool = manifest.slice();
      buildZones();
      for (let i = 0; i < LAYERS; i++) layers.push(makeLayer(draw()));
      restack();
    })
    .catch((err) => {
      exposuresEl.insertAdjacentHTML(
        'beforeend',
        '<p style="padding:40px;color:#aaa;font-family:monospace">Could not load manifest.json — ' + err + '</p>'
      );
    });

  // a photograph not already on screen, so the four are always different
  function draw() {
    const onScreen = new Set(layers.map((l) => l.item && l.item.file));
    const choices = pool.filter((p) => !onScreen.has(p.file));
    const from = choices.length ? choices : pool;
    return from[Math.floor(Math.random() * from.length)];
  }

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
      z.addEventListener('click', () => bringForward(i));
      zonesEl.appendChild(z);
    }
  }

  // Click makes that exposure dominant. The others stay in the frame, one step back.
  // The layer pushed off the bottom is replaced, so the composition keeps turning over.
  function bringForward(i) {
    if (i === 0) {
      // already dominant: retire the faintest layer for an unseen photograph
      setPhoto(layers[layers.length - 1], draw());
      restack();
      return;
    }
    const [picked] = layers.splice(i, 1);
    layers.unshift(picked);
    hovered = 0;
    setPhoto(layers[layers.length - 1], draw());
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

    layers.forEach((l) => { l.item = null; });
    layers.forEach((l) => setPhoto(l, draw()));
    hovered = -1;
    restack();
  });
})();
