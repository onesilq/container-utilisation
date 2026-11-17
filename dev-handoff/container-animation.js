/* Container loading animation
   From the Silq Container Utilisation prototype (v82, 16 Nov 2026): the 3D container in the utilisation popover and the Overview note.
   It draws one shipping container as SVG, filled to any level, and plays the loading animation: the cartons slide in, then the doors swing shut.
   No dependencies. Load it with a <script> tag (it adds window.ContainerAnimation), or require/import it with a bundler (module.exports).

     const c = ContainerAnimation.draw(0.22, { width: 288 });   // fill from 0 to 1
     el.innerHTML = c.svg;
     ContainerAnimation.play(el);                               // plays once; call it again to replay

   draw(fill, { width, height }) returns { svg, width, height, cartons, timing }.
     width   the drawing's width in px (default 360). The popover uses 288, the Overview note 132. height (optional) caps the height.
     cartons how many of the 60 carton spaces are filled: fill × 60, rounded.
     timing  when each part plays, in ms after play(): fade, cartons and doors as [start, end], and stagger (ms between cartons).
   play(el) plays it on the SVG inside el (or on the SVG itself). It returns false and does nothing when the person has asked
   for reduced motion or the tab is hidden, so they see the finished picture.

   Without play(), the SVG is the finished picture: cartons in place, doors shut. The Overview note shows it like that, at width 132.
   The SVG is aria-hidden. Put the % used and the container type in text beside it, as the prototype does.
   Every container type uses this one shape (a 40' HQ's proportions). Show the type, e.g. "20' GP", in text under it.
*/
(function (root) {
  'use strict';

  // Inside of a 40' HQ in metres, and the carton grid: 10 along, 2 across, 3 high = 60 spaces.
  const BOX = { L: 12.03, W: 2.35, H: 2.69, nx: 10, ny: 2, nz: 3 };

  // The view: turned 25° and tilted 24°.
  const VT = 25 * Math.PI / 180, VP = 24 * Math.PI / 180;
  const cT = Math.cos(VT), sT = Math.sin(VT), cP = Math.cos(VP), sP = Math.sin(VP);

  const COLORS = {
    frame: '#FFFFFF', wall: '#FFFFFF', end: '#FAFAFB', floor: '#F3F4F6', ridge: '#D3D5DB',
    leaf: '#FFFFFF', leafIn: '#F7F7F9', edge: '#2A2D35', bar: '#2A2D35', shadow: '#202020',
    glass: '#F6F9FF', glassEdge: 'rgba(42,45,53,.55)', glassRidge: 'rgba(42,45,53,.13)',
    // three carton tones, each [top, long side, end]
    box: [['#E4C595', '#CFA266', '#B98A4F'], ['#E8CB9D', '#D4A86D', '#BE9056'], ['#DFBE8C', '#C99B5E', '#B28349']]
  };

  // Timing in ms. The CSS below is built from these too.
  const T = {
    fade: 250,            // the container fades in
    cartonStart: 250,     // the first carton starts
    carton: 420,          // each carton's slide
    maxStagger: 55,       // at most this long between cartons...
    cartonsWithin: 1000,  // ...and all of them start within about a second, however full
    minWait: 900,         // the doors wait at least this long (in the popover, the 0.9 s meter bars finish first)
    doorsDelay: 100,      // then this much more after the cartons
    doors: 700,           // the doors' swing
    doorAngle: 105,       // degrees open at the start
    doorSteps: 24         // steps in the swing
  };
  const EASE_CARTON = 'cubic-bezier(.2,.75,.25,1)';

  const CSS =
    '.ctr-svg{display:block;max-width:100%;height:auto}' +
    `.ctr-svg.ctr-play{animation:ctr-fade ${T.fade}ms ease-out both}` +
    `.ctr-play .ctr-box{animation:ctr-in ${T.carton}ms ${EASE_CARTON} calc(var(--i) * var(--s) + ${T.cartonStart}ms) both}` +
    '@keyframes ctr-fade{from{opacity:0}}' +
    '@keyframes ctr-in{from{transform:translate(var(--dx),var(--dy));opacity:0}35%{opacity:1}}';

  function injectCSS() {
    if (typeof document === 'undefined' || document.getElementById('ctr-css')) return;
    const s = document.createElement('style');
    s.id = 'ctr-css';
    s.textContent = CSS;
    document.head.appendChild(s);
  }

  let uid = 0;

  function draw(fill, opts) {
    opts = opts || {};
    const f = Math.max(0, Math.min(1, Number(fill) || 0));
    const id = uid++, C = COLORS, { L, W, H, nx, ny, nz } = BOX, t = .14;
    const prims = [];
    const P = (x, y, z) => [x * cT + y * sT, x * sT * sP - y * cT * sP - z * cP];
    const poly = (pts, a, g) => (g || prims).push({ t: 'p', pts, a });
    const fY = (y, x0, x1, z0, z1) => [[x0, y, z0], [x1, y, z0], [x1, y, z1], [x0, y, z1]];
    const fX = (x, y0, y1, z0, z1) => [[x, y0, z0], [x, y1, z0], [x, y1, z1], [x, y0, z1]];
    const fZ = (z, x0, x1, y0, y1) => [[x0, y0, z], [x1, y0, z], [x1, y1, z], [x0, y1, z]];
    const box = (x0, x1, y0, y1, z0, z1, c, g, a) => {
      a = a || {};
      poly(fX(x1, y0, y1, z0, z1), Object.assign({ fill: c[2] }, a), g);
      poly(fY(y0, x0, x1, z0, z1), Object.assign({ fill: c[1] }, a), g);
      poly(fZ(z1, x0, x1, y0, y1), Object.assign({ fill: c[0] }, a), g);
    };
    const fr = [C.frame, C.frame, C.frame], ed = { stroke: C.edge, 'stroke-width': 1, 'stroke-linejoin': 'round' };
    const n = Math.round(f * nx * ny * nz);

    // soft shadow under the container
    poly([[-.4, -.9, -t], [L + 2.2, -.9, -t], [L + 2.2, W + .9, -t], [-.4, W + .9, -t]], { fill: C.shadow, opacity: .07, filter: `url(#ctr-s${id})` });

    // door leaves, drawn at every step from open (105°) to shut so play() can swing them; the resting picture is shut
    const lw = (W + 2 * t) / 2, open = T.doorAngle * Math.PI / 180, zb = -t + .05, zt = H + t - .05, NF = T.doorSteps;
    const leaf = (hy, dir, a) => {
      const ex = Math.sin(a) * lw, ey = dir * Math.cos(a) * lw;
      return {
        poly: [[L + t, hy, zb], [L + t + ex, hy + ey, zb], [L + t + ex, hy + ey, zt], [L + t, hy, zt]],
        bars: [.3, .7].map(r => [[L + t + ex * r, hy + ey * r, zb + .25], [L + t + ex * r, hy + ey * r, zt - .25]])
      };
    };
    const swing = (hy, dir) => Array.from({ length: NF + 1 }, (_, s) => leaf(hy, dir, open * (1 - s / NF)));
    const farF = swing(W + t, -1), nearF = swing(-t, 1);
    // far leaf while swung past 90°: behind everything (its front copy takes over nearer to shut)
    prims.push({ t: 'd', frames: farF, side: 'back', a: Object.assign({ fill: C.leafIn }, ed) });

    // inside: far wall with ridges, end wall, floor
    poly(fY(W, 0, L, 0, H), Object.assign({ fill: C.wall }, ed));
    for (let x = .4; x < L - .3; x += .6) prims.push({ t: 'l', pts: [[x, W, .12], [x, W, H - .1]], a: { stroke: C.ridge, 'stroke-width': 1 } });
    poly(fX(0, 0, W, 0, H), Object.assign({ fill: C.end }, ed));
    poly(fZ(0, 0, L, 0, W), Object.assign({ fill: C.floor }, ed));

    // far frame: corner posts, top rail, end header
    box(-t, 0, W, W + t, -t, H + t, fr, null, ed); box(L, L + t, W, W + t, -t, H + t, fr, null, ed);
    box(-t, L + t, W, W + t, H, H + t, fr, null, ed); box(-t, 0, 0, W, H, H + t, fr, null, ed);

    // cargo: loaded from the end wall toward the doors, a slice at a time; in each slice bottom to top, back row first.
    // j is a carton's place in that order (its animation delay); the list is then sorted back to front for painting.
    const cx = L / nx, cy = W / ny, cz = H / nz, g = .045;
    const order = [];
    for (let i = 0; i < nx; i++) for (let zz = 0; zz < nz; zz++) for (let yy = ny - 1; yy >= 0; yy--) order.push([i, yy, zz]);
    const filled = order.slice(0, n).map((c, j) => ({ c, j }));
    filled.sort((a, b) => (b.c[1] - a.c[1]) || (a.c[0] - b.c[0]) || (a.c[2] - b.c[2]));
    filled.forEach(({ c: [i, yy, zz], j }) => {
      const x0 = i * cx + g, x1 = (i + 1) * cx - g, y0 = yy * cy + g, y1 = (yy + 1) * cy - g, z0 = zz * cz + g, z1 = (zz + 1) * cz - g;
      // it slides in from the door end: its distance to the doors (at most 3.2 m) plus 0.8 m, and drops 0.3 m into place
      const d = Math.min(L - x1, 3.2) + .8, gr = { t: 'g', j, d, kids: [] };
      box(x0, x1, y0, y1, z0, z1, C.box[(i * 7 + yy * 3 + zz) % 3], gr.kids);
      prims.push(gr);
    });

    // glass: the roof and near wall over the cargo, see-through so the cargo shows
    poly(fZ(H, 0, L, 0, W), { fill: `url(#ctr-r${id})`, stroke: C.glassEdge, 'stroke-width': .8 });
    poly(fY(0, 0, L, 0, H), { fill: `url(#ctr-w${id})`, stroke: C.glassEdge, 'stroke-width': .8 });
    for (let x = .55; x < L - .3; x += .6) prims.push({ t: 'l', pts: [[x, 0, .12], [x, 0, H - .1]], a: { stroke: C.glassRidge, 'stroke-width': 1 } });

    // near frame: bottom and top rails, corner post, door frame
    box(-t, L + t, -t, 0, -t, 0, fr, null, ed); box(-t, 0, -t, 0, -t, H + t, fr, null, ed);
    box(-t, L + t, -t, 0, H, H + t, fr, null, ed);
    box(L, L + t, -t, W + t, -t, 0, fr, null, ed); box(L, L + t, -t, W + t, H, H + t, fr, null, ed); box(L, L + t, -t, 0, -t, H + t, fr, null, ed);

    // far leaf nearer to shut, then the near leaf: both in front of the container, with their locking bars
    prims.push({ t: 'd', frames: farF, side: 'front', bars: true, a: Object.assign({ fill: C.leaf }, ed) });
    prims.push({ t: 'd', frames: nearF, bars: true, a: Object.assign({ fill: C.leaf }, ed) });

    // fit to the requested size
    let mnx = 1e9, mny = 1e9, mxx = -1e9, mxy = -1e9;
    const walk = list => list.forEach(p => {
      if (p.t === 'g') return walk(p.kids);
      (p.t === 'd' ? p.frames[0].poly : p.pts).forEach(q => { const [a, b] = P(...q); mnx = Math.min(mnx, a); mxx = Math.max(mxx, a); mny = Math.min(mny, b); mxy = Math.max(mxy, b); });
    });
    walk(prims);
    const pad = 6, w = opts.width || 360;
    const K = Math.min((w - 2 * pad) / (mxx - mnx), opts.height ? (opts.height - 2 * pad) / (mxy - mny) : 1e9);
    const h = Math.round((mxy - mny) * K + 2 * pad), W2 = Math.round((mxx - mnx) * K + 2 * pad);
    const X = q => { const [a, b] = P(...q); return ((a - mnx) * K + pad).toFixed(1) + ' ' + ((b - mny) * K + pad).toFixed(1); };
    const attrs = a => Object.keys(a).map(k => `${k}="${a[k]}"`).join(' ');

    // timing
    const stagger = Math.min(T.maxStagger, T.cartonsWithin / Math.max(1, n));
    const loaded = Math.round(T.cartonStart + n * stagger + T.carton);   // when the doors may start, before minWait and doorsDelay
    const doorsStart = Math.max(T.minWait, loaded) + T.doorsDelay;

    const out = list => list.map(p => {
      if (p.t === 'g') {
        const dx = (p.d * cT * K).toFixed(1), dy = (p.d * sT * sP * K - .3 * cP * K).toFixed(1);
        return `<g class="ctr-box" style="--i:${p.j};--dx:${dx}px;--dy:${dy}px" stroke="#FFFFFF" stroke-opacity=".5" stroke-width=".7" stroke-linejoin="round">${out(p.kids)}</g>`;
      }
      if (p.t === 'l') return `<path d="M${X(p.pts[0])}L${X(p.pts[1])}" fill="none" ${attrs(p.a)}/>`;
      if (p.t === 'd') {
        // a door leaf: drawn shut, with every step of the swing in data-fr
        const dp = s => 'M' + s.poly.map(X).join('L') + 'Z', bp = s => s.bars.map(b => `M${X(b[0])}L${X(b[1])}`).join(''), last = p.frames[p.frames.length - 1];
        const sd = p.side ? ` data-side="${p.side}" visibility="${p.side === 'back' ? 'hidden' : 'visible'}"` : '';
        return `<path d="${dp(last)}" data-fr="${p.frames.map(dp).join('|')}"${sd} ${attrs(p.a)}/>` +
          (p.bars ? `<path d="${bp(last)}" data-fr="${p.frames.map(bp).join('|')}"${sd} fill="none" stroke="${C.bar}" stroke-width="1.3" stroke-linecap="round"/>` : '');
      }
      return `<path d="M${p.pts.map(X).join('L')}Z" ${attrs(p.a)}/>`;
    }).join('');

    const gl = C.glass;
    const svg = `<svg class="ctr-svg" viewBox="0 0 ${W2} ${h}" width="${W2}" height="${h}" style="--s:${stagger.toFixed(1)}ms" data-doors="${doorsStart}" aria-hidden="true">` +
      `<defs><filter id="ctr-s${id}" x="-20%" y="-60%" width="140%" height="220%"><feGaussianBlur stdDeviation="${(K * .35).toFixed(1)}"/></filter>` +
      `<linearGradient id="ctr-w${id}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${gl}" stop-opacity=".42"/><stop offset=".55" stop-color="${gl}" stop-opacity=".16"/><stop offset="1" stop-color="${gl}" stop-opacity=".07"/></linearGradient>` +
      `<linearGradient id="ctr-r${id}" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="${gl}" stop-opacity=".36"/><stop offset="1" stop-color="${gl}" stop-opacity=".12"/></linearGradient></defs>` +
      `${out(prims)}</svg>`;

    injectCSS();
    return {
      svg, width: W2, height: h, cartons: n,
      timing: {
        fade: [0, T.fade],
        cartons: n ? [T.cartonStart, Math.round(T.cartonStart + (n - 1) * stagger + T.carton)] : null,
        stagger: Math.round(stagger * 10) / 10,
        doors: [doorsStart, doorsStart + T.doors]
      }
    };
  }

  function play(el) {
    const svg = el && (el.classList && el.classList.contains('ctr-svg') ? el : el.querySelector && el.querySelector('svg.ctr-svg'));
    if (!svg || document.hidden || (root.matchMedia && root.matchMedia('(prefers-reduced-motion: reduce)').matches)) return false;
    injectCSS();

    // the fade and the cartons are CSS animations: restart them
    svg.classList.remove('ctr-play');
    svg.getBoundingClientRect();
    svg.classList.add('ctr-play');

    // the doors: open while the cargo goes in, then swing shut. The far leaf's back copy shows while it's past 90°, its front copy after.
    const doors = Array.from(svg.querySelectorAll('[data-fr]'));
    if (!doors.length) return true;
    const frames = doors.map(d => d.getAttribute('data-fr').split('|')), N = frames[0].length - 1, tok = svg._ctrTok = {};
    const set = s => doors.forEach((d, i) => {
      d.setAttribute('d', frames[i][s]);
      const side = d.getAttribute('data-side');
      if (side) d.setAttribute('visibility', (side === 'back') === (T.doorAngle * (1 - s / N) >= 90) ? 'visible' : 'hidden');
    });
    set(0);
    const t0 = performance.now() + Number(svg.getAttribute('data-doors'));
    const tick = now => {
      if (svg._ctrTok !== tok || !svg.isConnected) return;
      const x = Math.max(0, Math.min(1, (now - t0) / T.doors)), e = x < .5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2;   // ease-in-out
      set(Math.round(e * N));
      if (x < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
    // make sure they end shut even if frames were skipped
    setTimeout(() => { if (svg._ctrTok === tok) set(N); }, Number(svg.getAttribute('data-doors')) + T.doors + 300);
    return true;
  }

  const api = { draw, play, css: CSS, shape: BOX, colors: COLORS, timing: T };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.ContainerAnimation = api;
})(typeof self !== 'undefined' ? self : this);
