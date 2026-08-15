(function () {
  const stage = document.getElementById('stage');

  // the whole collection, laid over one another on the table
  const COLS = 16;
  const ROWS = 9;

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

  let topZ = 0;

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
    // spread the cells so the collection's order can't be read off the layout
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

      // large enough to overlap several neighbours in every direction
      const w = 17 + r() * 17;                   // % of the table
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

      const img = document.createElement('img');
      img.src = 'img-grid/' + item.file;
      img.loading = 'lazy';
      img.alt = '';
      el.appendChild(img);

      el.addEventListener('click', () => bringForward(el));
      stage.appendChild(el);
      topZ = i + 1;
    });
  }

  // click → it comes to the front and stays fully clear, even after the cursor
  // leaves. Only one layer is the front one, so the last click hands it over.
  let front = null;
  function bringForward(el) {
    if (front && front !== el) front.classList.remove('front');
    el.classList.add('front');
    front = el;

    el.style.zIndex = String(++topZ);
    // now that it is being looked at, swap in the full-size scan behind the scenes
    const img = el.querySelector('img');
    if (img && img.src.indexOf('img-grid/') !== -1) {
      const full = 'img/' + el.dataset.file;
      const pre = new Image();
      pre.onload = () => { img.src = full; };
      pre.src = full;
    }
  }
})();
