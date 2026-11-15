// R4 labels, as the sample's queueLabels/drawLabels: from the id pass, each visible part (grouped by plain
// name) gets its pixel area and a nearest-own-pixel anchor; the biggest 14 (≥ 760 px) or 6 (< 760 px) go
// into left/right columns with leader lines. A label is never wider than the gap between the canvas edge
// and the body silhouette on its rows, so labels never cover the body (phone included).
import { LAYER_COL } from './materials';
import { SCALE, type IdPass } from './pick';
import type { Part } from './load';
import type { BodyState } from './state';

export interface Labels {
  /** redraw 140 ms from now */
  queue(): void;
  /** camera moved: clear now, redraw 140 ms after it stops */
  moved(): void;
  set(on: boolean): void;
}

const LINE = '#EDE6DA'; // label look: `.body-label` in style.css

export function createLabels(host: HTMLElement, canvas: HTMLCanvasElement, ids: IdPass, parts: Part[],
  state: () => BodyState, select: (id: number) => void): Labels {
  const byId: Part[] = [];
  for (const p of parts) byId[p.id] = p;
  const layer = document.createElement('div');
  layer.className = 'body-labels';
  layer.style.cssText = 'position:absolute;pointer-events:none;overflow:hidden';
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.style.cssText = 'position:absolute;inset:0;width:100%;height:100%';
  layer.append(svg);
  host.append(layer);
  let on = true, timer = 0;

  const clear = () => {
    svg.replaceChildren();
    layer.querySelectorAll('button').forEach((e) => e.remove());
  };

  const draw = () => {
    clear();
    const s = state(), W = canvas.clientWidth, H = canvas.clientHeight;
    if (!on || s.depth === 'skin' || !W || !H) return;
    Object.assign(layer.style, { left: `${canvas.offsetLeft}px`, top: `${canvas.offsetTop}px`, width: `${W}px`, height: `${H}px` });
    ids.render();
    const { w, h } = ids;
    // per part: [pixels, Σx, Σy]; per row: the body silhouette's left and right edge
    const stats = new Map<number, [number, number, number]>();
    const rowL = new Int32Array(h).fill(w), rowR = new Int32Array(h).fill(-1);
    for (let y = 0; y < h; y += 2) for (let x = 0; x < w; x += 2) {
      const id = ids.at(x, y);
      if (id < 0) continue;
      if (x < rowL[y]) rowL[y] = x;
      if (x > rowR[y]) rowR[y] = x;
      let st = stats.get(id);
      if (!st) stats.set(id, (st = [0, 0, 0]));
      st[0]++; st[1] += x; st[2] += y;
    }
    const best = new Map<string, [number, [number, number, number]]>();
    for (const [id, st] of stats) {
      const p = byId[id];
      if (!p || p.kind === 'skin') continue;
      const b = best.get(p.plain);
      if (!b || b[1][0] < st[0]) best.set(p.plain, [id, st]);
    }
    const phone = innerWidth < 760, maxN = phone ? 6 : 14, minPx = ((w * h) / 4) * (phone ? 0.004 : 0.0008);
    const top = [...best.values()].filter(([, st]) => st[0] > minPx).sort((a, b) => b[1][0] - a[1][0]).slice(0, maxN);
    const chosen = top.map(([id, st]) => {
      const cx = st[1] / st[0], cy = st[2] / st[0];
      let bx = cx, by = cy, bd = Infinity;
      if (ids.at(Math.round(cx), Math.round(cy)) !== id) {
        for (let y = 0; y < h; y += 2) for (let x = 0; x < w; x += 2) {
          if (ids.at(x, y) !== id) continue;
          const d = (x - cx) ** 2 + (y - cy) ** 2;
          if (d < bd) { bd = d; bx = x; by = y; }
        }
      }
      return { id, x: bx * SCALE, y: by * SCALE, ly: 0 };
    });

    const yTop = phone ? 52 : 64, yBottom = H - 24, gap = phone ? 30 : 24, maxW = phone ? 120 : 190;
    for (const left of [true, false]) {
      const list = chosen.filter((c) => (c.x < W / 2) === left).sort((a, b) => a.y - b.y);
      let y = yTop;
      for (const c of list) { c.ly = Math.max(c.y, y); y = c.ly + gap; }
      let over = (list.at(-1)?.ly ?? 0) - yBottom;
      for (let i = list.length - 1; i >= 0 && over > 0; i--) {
        list[i].ly -= over;
        if (i > 0) over = list[i - 1].ly - (list[i].ly - gap);
      }
      const lx = left ? 8 : W - 8;
      for (const c of list) {
        // room between the canvas edge and the silhouette on the label's rows (+ 14 px for the leader stub)
        let edge = left ? W : 0;
        const r0 = Math.max(0, Math.floor((c.ly - gap / 2) / SCALE)), r1 = Math.min(h - 1, Math.ceil((c.ly + gap / 2) / SCALE));
        for (let r = r0; r <= r1; r++) {
          if (rowR[r] < 0) continue;
          edge = left ? Math.min(edge, rowL[r] * SCALE) : Math.max(edge, (rowR[r] + 1) * SCALE);
        }
        const room = Math.min(maxW, left ? edge - lx - 14 : lx - edge - 14);
        if (room < 40) continue; // ponytail: no room beside the body here; the label is dropped, not squeezed
        const p = byId[c.id], el = document.createElement('button');
        el.type = 'button';
        el.className = 'body-label';
        if (phone) {
          const t = document.createElement('span');
          t.textContent = p.plain;
          el.append(t);
        } else el.textContent = p.plain;
        el.style.cssText = `max-width:${room}px;left:${lx}px;top:${c.ly}px;transform:translate(${left ? '0' : '-100%'},-50%)`;
        el.onclick = () => select(c.id);
        layer.append(el);
        // a label cut to fewer than 8 visible characters ('Ext…') says nothing: drop it
        const t = (el.firstElementChild as HTMLElement | null) ?? el, n = p.plain.length;
        const cs = getComputedStyle(el), pad = t === el ? 2 * parseFloat(cs.paddingLeft) : 0;
        // truncated: text share of the visible box, less the ellipsis (about one em wide)
        const shown = t.scrollHeight > t.clientHeight + 1 ? (n * t.clientHeight) / t.scrollHeight - 1
          : t.scrollWidth > t.clientWidth + 1 ? (n * (t.clientWidth - pad - parseFloat(cs.fontSize))) / (t.scrollWidth - pad) : n;
        if (shown < 8) { el.remove(); continue; } // ponytail: proportional estimate, not per-glyph measuring
        const ex = left ? lx + el.offsetWidth : lx - el.offsetWidth, stub = ex + (left ? 12 : -12);
        const col = s.colour === 'layer' && (p.kind === 'muscle' || p.kind === 'tendon') ? LAYER_COL[Math.min(p.layer ?? 1, 6)] : LINE;
        svg.insertAdjacentHTML('beforeend', `<polyline points="${ex},${c.ly} ${stub},${c.ly} ${c.x},${c.y}" fill="none" stroke="${col}" stroke-opacity=".75" stroke-width="1"/><circle cx="${c.x}" cy="${c.y}" r="2.5" fill="${col}"/>`);
      }
    }
  };

  const queue = () => {
    clearTimeout(timer);
    timer = window.setTimeout(draw, 140);
  };
  return {
    queue,
    moved() { clear(); queue(); },
    set(v) { on = v; clear(); queue(); },
  };
}
