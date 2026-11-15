import { LAYER_KEYS, layerOf, parseLayersParam, searchParts, type LayerKey, type Part } from '../body/model';
import { clearHighlights, createViewer, setPartColor, type Viewer } from '../body/viewer';

const LABELS: Record<LayerKey, string> = {
  skin: 'Skin',
  superficialMuscles: 'Superficial muscles',
  deepMuscles: 'Deep muscles',
  skeleton: 'Skeleton',
  organs: 'Organs',
};
const DEFAULT_ON: LayerKey[] = ['superficialMuscles', 'deepMuscles', 'skeleton'];

export function mountExplore(root: HTMLElement): Promise<Viewer> {
  const q = new URLSearchParams(location.search);
  root.innerHTML = `
    <canvas class="scene"></canvas>
    <div class="toolbar">
      <div class="views"></div>
      <div class="layers"></div>
      <div class="search">
        <input type="search" list="part-list" placeholder="Search a muscle or bone" autocomplete="off" />
        <datalist id="part-list"></datalist>
        <div class="no-match" hidden>No match</div>
      </div>
    </div>
    <div class="card" hidden>
      <button class="card-close" aria-label="Close">×</button>
      <div class="card-plain"></div>
      <div class="card-name"></div>
      <div class="card-meta"></div>
    </div>
    <footer class="credit">Anatomy: BodyParts3D © DBCLS, CC BY-SA 2.1 JP · <a href="#credits">Credits</a></footer>`;
  const $ = <T extends HTMLElement>(s: string) => root.querySelector(s) as T;
  const canvas = $<HTMLCanvasElement>('canvas');
  const card = $('.card');
  const input = $<HTMLInputElement>('.search input');
  const noMatch = $('.no-match');

  const showCard = (p: Part | null) => {
    card.hidden = !p;
    if (!p) return;
    $('.card-plain').textContent = p.plainName;
    $('.card-name').textContent = p.name;
    $('.card-meta').textContent = `${p.kind} · ${p.id}`;
  };
  $('.card-close').addEventListener('click', () => showCard(null));

  const ready = createViewer(canvas, { fps: q.get('fps') === '1' });
  ready.then((viewer) => {
    const initial = parseLayersParam(q.get('layers')) ?? new Set(DEFAULT_ON);
    const boxes = new Map<LayerKey, HTMLInputElement>();
    for (const k of LAYER_KEYS) {
      const label = document.createElement('label');
      const box = document.createElement('input');
      box.type = 'checkbox';
      box.checked = initial.has(k);
      box.addEventListener('change', () => viewer.setLayerVisible(k, box.checked));
      viewer.setLayerVisible(k, box.checked);
      label.append(box, ' ' + LABELS[k]);
      $('.layers').appendChild(label);
      boxes.set(k, box);
    }

    // checkboxes follow the viewer, including layer changes made by the pelvic view or by Programs
    viewer.onLayersChanged(() => { for (const [k, box] of boxes) box.checked = viewer.isLayerVisible(k); });

    for (const v of ['front', 'side', 'back'] as const) {
      const b = document.createElement('button');
      b.textContent = v[0].toUpperCase() + v.slice(1);
      b.addEventListener('click', () => {
        viewer.setPelvicView(false); // Programs may have left the pelvic view on
        viewer.setView(v);
      });
      $('.views').appendChild(b);
    }
    const view = q.get('view');
    viewer.setView(view === 'side' || view === 'back' ? view : 'front');

    // tap = pointer up within 6 px of pointer down
    let down: { x: number; y: number } | null = null;
    canvas.addEventListener('pointerdown', (e) => { down = { x: e.clientX, y: e.clientY }; });
    canvas.addEventListener('pointerup', (e) => {
      if (!down || Math.hypot(e.clientX - down.x, e.clientY - down.y) > 6) return;
      showCard(viewer.pick(e.clientX, e.clientY));
    });

    input.addEventListener('input', () => {
      noMatch.hidden = true;
      const list = $('#part-list');
      list.replaceChildren(...searchParts(viewer.parts, input.value).map((p) => {
        const o = document.createElement('option');
        o.value = p.name;
        o.label = p.plainName;
        return o;
      }));
    });
    const go = () => {
      const text = input.value.trim().toLowerCase();
      if (!text) return;
      const hit =
        viewer.parts.find((p) => p.kind !== 'skin' && (p.name === text || p.plainName.toLowerCase() === text)) ??
        searchParts(viewer.parts, text, 1)[0];
      noMatch.hidden = !!hit;
      if (!hit) return;
      const layer = layerOf(hit);
      boxes.get(layer)!.checked = true;
      viewer.setLayerVisible(layer, true);
      clearHighlights();
      setPartColor(hit.id, '#ffd400', 1);
      viewer.flyTo(hit.id);
      showCard(hit);
    };
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') go(); });
    input.addEventListener('change', go);

    (window as unknown as { bodyModel: unknown }).bodyModel = { viewer, setPartColor, clearHighlights };
  }).catch(() => { /* viewer already showed the load error */ });
  return ready;
}
