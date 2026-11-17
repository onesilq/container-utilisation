/*!
 * FCL unit: "FCL [container] 49%", the button in the shipment's Overview header.
 * From the Silq Container Utilisation prototype (v88, 16 Nov 2026). No libraries.
 *
 * One button: the shipment's mode, a 26 x 14 container glyph, and the percentage used:
 * the higher of space and weight used, which the fill follows too. Plain at rest, a
 * grey shape on hover, a white one while open. Hover or focus shows a one-line tooltip, "49% of space used".
 * Clicking opens the utilisation popover, which is yours to wire up.
 *
 *   <script src="fcl-unit.js"></script>
 *   el.innerHTML = FclUnit.button({ mode: 'FCL', type: '40HQ', cbm: 37, kg: 1000 });
 *
 * Works as a plain <script> (window.FclUnit) or a CommonJS / bundler import.
 */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.FclUnit = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  /* Capacity of one container: nominal internal volume (CBM) and max payload (kg).
     Add your other types here, keyed the way your data names them. */
  var CAPACITY = {
    '20GP': { cbm: 33, kg: 28200 },
    '40GP': { cbm: 67, kg: 26700 },
    '40HQ': { cbm: 76, kg: 26500 }
  };

  /* The percentage and the fill's length follow the higher of space and weight
     used, since a container is full when either runs out. The fill is always
     the volume colour, the same as the Analytics page; it doesn't change with
     how full the container is. */
  /* At or above 90% of max payload, a "Weight-limited" chip follows the button. */
  var HEAVY = 90;

  var COLORS = {
    fill: '#7681FC',     // the fill, at any %: Analytics' volume colour (Interface/Marine/500)
    weight: '#F9B474',   // Analytics' weight colour (Interface/Orange/300), for a weight bar beside it
    outline: '#1E1E1E',  // body outline, door line, rod; ridges at 18%
    body: '#FFFFFF',     // inside of the container
    text: '#111111',     // "FCL" and the percentage
    none: '#8A8A8A',     // the dash when space used isn't known
    tip: '#1E1E1E',      // tooltip
    open: '#FFFFFF',     // the shape while the popover is open (Figma: State=Active)
    header: '#EBEDFF',   // the Overview header the button sits on; not set by this file
    chip: '#E9ECFB',     // "Weight-limited" chip
    chipText: '#2E3AA3'
  };

  /* The glyph's inside starts at x 2.3 and is at most 17.2 wide: a full
     container fills up to the door line. */
  var GLYPH = { width: 26, height: 14, fillX: 2.3, fillMax: 17.2 };

  var CSS = [
    /* FCL, the glyph and the percentage: one button */
    '.fcl-u{position:relative;display:inline-flex;align-items:center;gap:6px;height:26px;padding:0 6px;border:0;border-radius:6px;background:none;font-family:inherit;font-size:14px;font-weight:600;line-height:16px;letter-spacing:-.042px;color:#111111;font-variant-numeric:tabular-nums;cursor:pointer;transition:background .12s}',
    '.fcl-u:hover,.fcl-u:focus-visible{background:rgba(10,11,18,.06)}',
    '.fcl-u:focus-visible{outline:2px solid #384A66;outline-offset:2px}',
    '.fcl-u .fcl-none{font-weight:400;color:#8A8A8A}',
    '.fcl-glyph{display:block;flex:none}',
    /* Tooltip: under the button, right edges lined up */
    '.fcl-tip{position:absolute;top:calc(100% + 8px);right:0;z-index:20;display:none;background:#1E1E1E;color:#FFFFFF;border-radius:8px;padding:8px 10px;font-size:12.5px;font-weight:400;line-height:1.5;letter-spacing:0;text-align:left;white-space:nowrap;box-shadow:0 12px 32px rgba(0,0,0,.14),0 2px 6px rgba(0,0,0,.06)}',
    '.fcl-u:hover .fcl-tip,.fcl-u:focus-visible .fcl-tip{display:block}',
    /* Open (pressed): a white shape, made for the #EBEDFF Overview header, and no tooltip over the popover */
    '.fcl-u[aria-expanded="true"]{background:#FFFFFF}',
    '.fcl-u[aria-expanded="true"] .fcl-tip{display:none}',
    '.fcl-chip{display:inline-flex;align-items:center;height:21px;padding:0 6px;border-radius:4px;background:#E9ECFB;color:#2E3AA3;font-size:12.5px;font-weight:600;white-space:nowrap}'
  ].join('\n');

  function injectCss() {
    if (typeof document === 'undefined' || document.getElementById('fcl-css')) return;
    var st = document.createElement('style');
    st.id = 'fcl-css';
    st.textContent = CSS;
    (document.head || document.documentElement).appendChild(st);
  }

  /* "<1" for anything above 0 and under 1%, otherwise rounded. Not capped, so an overfilled container reads e.g. "104". */
  function pctText(x) { return x > 0 && x < 1 ? '<1' : String(Math.round(x)); }

  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  /* Space and weight used for a shipment.
     o: { type: '40HQ', containers: 1, cbm: 37 | null, kg: 1000 | null }
     space = cargo CBM / (containers x capacity CBM); weight = cargo kg / (containers x max payload). */
  function measure(o) {
    var cap = CAPACITY[o.type];
    if (!cap) throw new Error('FclUnit: no capacity for container type "' + o.type + '". Add it to FclUnit.capacity.');
    var n = o.containers || 1, capCbm = cap.cbm * n, capKg = cap.kg * n;
    var has = o.cbm != null, hasKg = o.kg != null;
    var space = has ? o.cbm / capCbm * 100 : null;
    var weight = hasKg ? o.kg / capKg * 100 : null;
    /* Weight decides only when it's strictly higher; both are capped at 100 for the comparison. */
    var byWeight = has && hasKg && Math.min(100, weight) > Math.min(100, space);
    var spaceText = has ? pctText(space) : null, weightText = hasKg ? pctText(weight) : null;
    return {
      has: has,                                   // false until the cargo volume is known
      capCbm: capCbm, capKg: capKg,
      space: space, weight: weight,               // 0-100+, or null
      spaceText: spaceText,                       // "49", "<1"
      weightText: weightText,
      byWeight: byWeight,                         // true when weight used is the higher
      used: has ? (byWeight ? weight : space) : null,              // the figure shown
      usedText: has ? (byWeight ? weightText : spaceText) : null,  // its text: "60"
      heavy: hasKg && weight >= HEAVY
    };
  }

  /* The 26 x 14 glyph as an SVG string. space and weight are 0-100 (or null when not known).
     The fill's length follows the higher of the two; it's always the volume colour. Empty when space isn't known. */
  function glyph(space, weight) {
    injectCss();
    var has = space != null;
    var s = has ? Math.min(100, space) : 0;
    var wt = weight != null ? Math.min(100, weight) : 0;
    var w = has ? (GLYPH.fillMax * Math.max(s, wt) / 100).toFixed(2) : 0;
    return '<svg class="fcl-glyph" viewBox="0 0 26 14" width="26" height="14" aria-hidden="true">' +
      '<rect x=".75" y=".75" width="24.5" height="12.5" rx="1.4" fill="#FFFFFF" stroke="#1E1E1E" stroke-width="1.3"/>' +
      '<rect x="2.3" y="2.3" width="' + w + '" height="9.4" rx=".6" fill="' + COLORS.fill + '"/>' +
      '<path d="M6.3 2.6v8.8M10.3 2.6v8.8M14.3 2.6v8.8" stroke="#1E1E1E" stroke-opacity=".18" stroke-width="1"/>' +
      '<path d="M20.3 1.4v11.2" stroke="#1E1E1E" stroke-width="1.1"/>' +
      '<path d="M22.4 3.4v7.2" stroke="#1E1E1E" stroke-width="1.1" stroke-linecap="round"/>' +
      '</svg>';
  }

  /* The whole button, with its tooltip, and the "Weight-limited" chip after it when the cargo is heavy.
     o: { mode: 'FCL', type: '40HQ', containers: 1, cbm: 37 | null, kg: 1000 | null }
     The button has data-fcl, aria-haspopup="dialog" and aria-expanded="false": set aria-expanded
     to "true" while your popover is open. */
  function button(o) {
    var u = measure(o), mode = esc(o.mode || 'FCL');
    var label = mode + ', ' + (!u.has ? 'space used not known yet'
      : u.usedText + (u.byWeight ? '% of weight limit used' : '% of container space used'));
    /* The tooltip is one line: the figure shown and what it is. */
    var tip = !u.has ? 'Space used not known yet'
      : u.byWeight ? u.weightText + '% of weight limit used'
      : u.spaceText + '% of space used';
    return '<button type="button" class="fcl-u" data-fcl aria-haspopup="dialog" aria-expanded="false" aria-label="' + label + '">' +
      mode + glyph(u.space, u.weight) +
      (u.has ? '<span class="fcl-pct">' + u.usedText + '%</span>' : '<span class="fcl-none">—</span>') +
      '<span class="fcl-tip" role="tooltip">' + tip + '</span></button>' +
      (u.heavy ? '<span class="fcl-chip">Weight-limited</span>' : '');
  }

  return {
    button: button,
    glyph: glyph,
    measure: measure,
    css: CSS,
    capacity: CAPACITY,
    colors: COLORS,
    thresholds: { heavy: HEAVY },
    shape: GLYPH
  };
});
