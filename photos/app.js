(function () {
  const plateA = document.getElementById('plateA');
  const plateB = document.getElementById('plateB');
  const stripA = document.getElementById('stripA');
  const stripB = document.getElementById('stripB');
  const shuffle = document.getElementById('shuffle');
  const readout = document.getElementById('readout');
  const pairbox = document.getElementById('pairbox');
  const views = document.getElementById('views');
  const filters = document.getElementById('filters');
  const sheet = document.getElementById('sheet');
  const viewer = document.getElementById('viewer');
  const viewerImg = document.getElementById('viewerImg');
  const viewerLabel = document.getElementById('viewerLabel');

  let everything = [];   // the whole collection
  let pool = [];         // whatever the current filter allows
  let openAt = -1;

  const rolls = {
    a: { strip: stripA, plate: plateA, items: [], chosen: null, imgs: [], slot: 0, gen: 0,
         enter: 'translateX(-4%)', rest: 'translateX(0)' },
    b: { strip: stripB, plate: plateB, items: [], chosen: null, imgs: [], slot: 0, gen: 0,
         // the second never lands quite square on the first
         enter: 'translateX(4%) scale(1.05)', rest: 'translateX(0.9%) translateY(-0.7%) scale(1.05)' },
  };

  fetch('manifest.json')
    .then((r) => r.json())
    .then(build)
    .catch((err) => {
      document.body.insertAdjacentHTML(
        'beforeend',
        '<p style="position:fixed;top:30px;left:30px;color:#aaa;font-family:monospace">Could not load manifest.json — ' + err + '</p>'
      );
    });

  function build(manifest) {
    everything = manifest;
    pool = manifest.slice();
    Object.keys(rolls).forEach((key) => {
      const roll = rolls[key];
      roll.imgs = [document.createElement('img'), document.createElement('img')];
      roll.imgs.forEach((im) => { im.alt = ''; roll.plate.appendChild(im); });
    });
    loadRolls();
  }

  // Split whatever is in the pool between the two rolls, so a pairing is always two
  // different photographs. With only one frame to hand, both rolls hold it.
  function loadRolls() {
    const half = Math.ceil(pool.length / 2);
    rolls.a.items = pool.length > 1 ? pool.slice(0, half) : pool.slice();
    rolls.b.items = pool.length > 1 ? pool.slice(half) : pool.slice();

    Object.keys(rolls).forEach((key) => {
      const roll = rolls[key];
      roll.strip.innerHTML = '';
      roll.items.forEach((item, i) => {
        const frame = document.createElement('div');
        frame.className = 'fframe';
        const img = document.createElement('img');
        img.src = 'img-grid/' + item.file;
        img.loading = 'lazy';
        img.alt = '';
        frame.appendChild(img);
        const num = document.createElement('div');
        num.className = 'fnum';
        num.textContent = item.id;
        frame.appendChild(num);
        frame.addEventListener('click', () => expose(key, i));
        roll.strip.appendChild(frame);
      });
      roll.strip.scrollLeft = 0;
    });

    expose('a', 0);
    expose('b', 0);
  }

  // Put a frame from one roll into its half of the exposure. Each plate owns exactly
  // two image elements and alternates between them, so the crossfade never leaves a
  // stray behind however fast the selection changes. A generation token means a slow
  // load that has already been superseded is simply dropped.
  function expose(key, i) {
    const roll = rolls[key];
    const item = roll.items[i];
    if (!item) return;

    roll.chosen = i;
    [...roll.strip.children].forEach((f, n) => f.classList.toggle('chosen', n === i));

    const gen = ++roll.gen;
    const incoming = roll.imgs[roll.slot ^ 1];
    const outgoing = roll.imgs[roll.slot];

    const done = () => {
      if (gen !== roll.gen) return;        // a later choice already won
      roll.slot ^= 1;
      // start it off to its own side, then let it travel in to meet the other
      incoming.style.transform = roll.enter;
      void incoming.offsetWidth;           // commit that position before animating
      incoming.classList.add('showing');
      incoming.style.transform = roll.rest;
      outgoing.classList.remove('showing');
      say();
    };

    incoming.onload = done;
    incoming.src = 'img/' + item.file;
    if (incoming.complete) done();          // already cached
  }

  function say() {
    const a = rolls.a.items[rolls.a.chosen];
    const b = rolls.b.items[rolls.b.chosen];
    if (!a || !b) return;
    readout.textContent = a.id + '  +  ' + b.id;
    // a brief lift on the border as the pair meets
    pairbox.classList.remove('fresh');
    void pairbox.offsetWidth;
    pairbox.classList.add('fresh');
    clearTimeout(say._t);
    say._t = setTimeout(() => pairbox.classList.remove('fresh'), 620);
  }

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
      label.textContent = item.id;
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
      item.id + '  ·  ' + String(openAt + 1).padStart(3, '0') + ' / ' + String(n).padStart(3, '0');
    viewer.classList.add('on');
  }
  function closeViewer() { openAt = -1; viewer.classList.remove('on'); }
  viewer.addEventListener('click', closeViewer);

  window.addEventListener('keydown', (e) => {
    if (openAt < 0) return;
    if (e.key === 'Escape') { e.preventDefault(); closeViewer(); }
    else if (e.key === 'ArrowRight' || e.key === 'ArrowDown' || e.key === ' ') { e.preventDefault(); openViewer(openAt + 1); }
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') { e.preventDefault(); openViewer(openAt - 1); }
  });

  views.addEventListener('click', (e) => {
    const btn = e.target.closest('.vbtn');
    if (!btn) return;
    [...views.children].forEach((b) => b.classList.toggle('active', b === btn));
    const grid = btn.dataset.view === 'grid';
    closeViewer();
    sheet.classList.toggle('on', grid);
    document.querySelector('.canvas').style.display = grid ? 'none' : '';
    document.querySelector('.rolls').style.display = grid ? 'none' : '';
    if (grid) buildSheet();
  });

  filters.addEventListener('click', (e) => {
    const btn = e.target.closest('.vbtn');
    if (!btn) return;
    [...filters.children].forEach((b) => b.classList.toggle('active', b === btn));
    const cat = btn.dataset.cat;
    pool = cat === 'all' ? everything.slice()
                         : everything.filter((p) => (p.categories || []).includes(cat));
    if (!pool.length) pool = everything.slice();
    closeViewer();
    loadRolls();
    if (sheet.classList.contains('on')) buildSheet();
  });

  shuffle.addEventListener('click', () => {
    expose('a', Math.floor(Math.random() * rolls.a.items.length));
    expose('b', Math.floor(Math.random() * rolls.b.items.length));
  });
})();
