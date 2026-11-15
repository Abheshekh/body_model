import { highlightPlan, type Inset } from '../body/model';
import type { BodyViewer } from '../body/scene';
import type { Depth } from '../body/state';
import { confirmAdult, isAdultConfirmed, type Profile } from '../me/profile';
import { canOpen, visiblePrograms, type Claim, type Item, type Program, type ProgramsFile } from '../programs/programs';

const LABEL: Record<Claim['strength'], string> = { strong: 'Strong', moderate: 'Moderate', weak: 'Weak', convention: 'Convention' };

const h = (tag: string, cls = '', text = ''): HTMLElement => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text) e.textContent = text;
  return e;
};
const back = () => {
  const a = h('a', 'back', '← Programs') as HTMLAnchorElement;
  a.href = '#workouts/programs';
  return a;
};

const FEMALE_NOTE = 'Female anatomy here is adapted from the male model; pelvic organs are simplified.';

export function mountPrograms(root: HTMLElement, viewer: BodyViewer | null, profile: Profile, programId?: string): () => void {
  let disposed = false;
  let pelvic = false;
  // Programs restore the Body page state on dispose and show the profile's sex while mounted (§2b.16)
  const snapshot = viewer?.state;
  if (viewer && viewer.state.sex !== profile.sex) viewer.setState({ sex: profile.sex });
  const sheet = h('section', 'sheet programs');
  sheet.setAttribute('aria-label', 'Programs');
  const banner = h('div', 'banner sheet-banner', FEMALE_NOTE);
  banner.hidden = true;
  const body = h('div', '', 'Loading…');
  const handle = h('button', 'sheet-handle') as HTMLButtonElement;
  handle.type = 'button';
  sheet.append(handle, banner, body);
  root.replaceChildren(sheet);

  // the viewer centres the body in the canvas area not under any displayed fixed bar (top nav on wide,
  // bottom tab bar on phone) or the sheet; insets are measured against the canvas
  const applyInset = () => {
    const canvas = document.querySelector('.body-stage canvas');
    if (!viewer || !canvas) return;
    const c = canvas.getBoundingClientRect();
    const inset: Inset = { top: 0, right: 0, bottom: 0, left: 0 };
    for (const el of [...document.querySelectorAll<HTMLElement>('.nav'), sheet]) {
      if (getComputedStyle(el).display === 'none' || el.closest('[hidden]')) continue;
      const r = el.getBoundingClientRect();
      if (r.bottom <= c.top || r.top >= c.bottom || r.right <= c.left || r.left >= c.right) continue;
      if (r.left > c.left + 1) inset.right = Math.max(inset.right, c.right - r.left); // side panel
      else if (r.top <= c.top) inset.top = Math.max(inset.top, r.bottom - c.top);
      else inset.bottom = Math.max(inset.bottom, c.bottom - r.top);
    }
    viewer.setViewInset(inset);
  };
  const setPeek = (on: boolean) => {
    sheet.classList.toggle('peek', on);
    handle.setAttribute('aria-label', on ? 'Expand list' : 'Collapse list');
  };
  setPeek(false);
  handle.addEventListener('click', () => {
    setPeek(!sheet.classList.contains('peek'));
    applyInset();
  });
  const observer = new ResizeObserver(applyInset);
  observer.observe(sheet);
  addEventListener('resize', applyInset);
  applyInset();

  const centreZ = (id: number) => {
    const b = viewer?.bounds(id);
    return b ? (b.min.z + b.max.z) / 2 : null;
  };

  const select = (prog: Program, item: Item, row: HTMLElement) => {
    for (const r of body.querySelectorAll('.item.active')) r.classList.remove('active');
    row.classList.add('active');
    const female = profile.sex === 'female';
    banner.hidden = !female || prog.audience !== 'female';
    if (!viewer) return;
    const plan = highlightPlan(viewer.parts, item.targets.parts, centreZ);
    for (const n of plan.missing) console.warn(`Programs: unknown target "${n}" in ${prog.id}/${item.id}`);
    const s = viewer.state;
    const systems = new Set(s.systems).add('skeleton');
    if (plan.pelvic) {
      // pelvic floor from below: bones with the pelvic-floor muscles isolated (§2b.3), as R0
      viewer.setState({ depth: 'bones', isolate: new Set(plan.ids), systems });
      viewer.setView('below');
      pelvic = true;
      banner.hidden = !female;
    } else {
      // peel to the min layer of the targets instead of R0's see-through; keep a depth that already shows them
      const shows = typeof s.depth === 'number' && plan.depth !== null && s.depth <= plan.depth;
      viewer.setState({ isolate: null, systems, ...(plan.depth !== null && !shows ? { depth: plan.depth as Depth } : {}) });
      if (pelvic) viewer.setView('front');
      pelvic = false;
    }
    viewer.setHighlight(plan.ids, '#ffd400');
    if (matchMedia('(max-width: 899px)').matches) setPeek(true);
    applyInset(); // synchronous: measures the sheet right after the peek toggle
    if (!plan.pelvic && plan.ids.length) viewer.frameIds(plan.ids, plan.facing);
    row.scrollIntoView({ block: 'nearest' });
  };

  const itemEl = (prog: Program, item: Item) => {
    const li = h('li', 'item');
    li.dataset.item = item.id;
    const head = h('button', 'item-head') as HTMLButtonElement;
    head.type = 'button';
    const text = h('span', 'item-title');
    text.append(h('span', 'item-name', item.name));
    if (item.component) text.append(h('span', 'muted', item.component));
    head.append(text);
    if (viewer) head.append(h('span', 'item-show', 'Show'));
    head.addEventListener('click', () => select(prog, item, li));
    li.append(head);

    const cues = h('ul', 'cues');
    for (const c of item.cues) cues.append(h('li', '', c));
    li.append(cues);

    const dose = h('p', 'dose');
    if (item.dose) {
      const d = item.dose;
      const bits = [d.sets && `${d.sets} sets`, d.reps && `${d.reps} reps`, d.holdSeconds && `hold ${d.holdSeconds} s`, d.frequency];
      dose.append(h('strong', '', 'Dose: '), bits.filter(Boolean).join(' · ') + '. ');
      const a = h('a', '', d.source.title) as HTMLAnchorElement;
      a.href = d.source.url;
      a.target = '_blank';
      a.rel = 'noopener';
      dose.append(a);
    } else dose.textContent = 'Dose not yet confirmed against a clinical guideline';
    li.append(dose);

    const targets = h('div', 'targets');
    if (item.targets.parts.length === 0) targets.append(h('p', 'muted', 'No single target muscle for this activity.'));
    else {
      targets.append(h('h3', '', item.targets.provisional ? 'Main muscles (provisional)' : 'Main muscles'));
      targets.append(h('p', 'muted', item.targets.parts.join(', ')));
    }
    li.append(targets);

    const claims = h('ul', 'claims');
    for (const id of item.evidence) {
      const c = prog.evidence.find((x) => x.id === id);
      if (!c) continue;
      const cl = h('li');
      cl.append(h('span', `chip ${c.strength}`, LABEL[c.strength]), ' ', c.claim, ' ');
      if (c.source.url) {
        const a = h('a', '', c.source.title) as HTMLAnchorElement;
        a.href = c.source.url;
        a.target = '_blank';
        a.rel = 'noopener';
        cl.append(a);
      } else cl.append(h('span', 'muted', c.source.title));
      claims.append(cl);
    }
    li.append(claims, h('p', 'muted', 'Animation arrives with the exercise library.'));
    return li;
  };

  const showDetail = (prog: Program) => {
    const out: HTMLElement[] = [back(), h('h1', '', prog.title), h('p', 'muted', 'Education, not treatment. Pain, numbness or a lasting problem: see a clinician.')];
    if (!viewer) out.push(h('p', 'notice', 'The body could not be loaded, so highlights are off.'));
    // the sticky banner is the single place the female-anatomy note shows
    for (const n of prog.notes) if (n !== banner.textContent) out.push(h('p', 'notice', n));
    if (prog.cautions.length) {
      out.push(h('h2', '', 'Cautions'));
      const ul = h('ul', 'cautions');
      for (const c of prog.cautions) ul.append(h('li', '', c));
      out.push(ul);
    }
    out.push(h('h2', '', viewer ? 'Exercises: tap one to show it on the body' : 'Exercises'));
    const ol = h('ol', 'items');
    for (const it of prog.items) ol.append(itemEl(prog, it));
    out.push(ol);
    body.replaceChildren(...out);
    sheet.scrollTop = 0;
    // DEV-only deep link for headless screenshots (?item=<itemId>), stripped from production builds
    if (import.meta.env.DEV) {
      const id = new URLSearchParams(location.search).get('item');
      const li = id ? ol.querySelector<HTMLElement>(`li[data-item="${CSS.escape(id)}"]`) : null;
      const it = prog.items.find((x) => x.id === id);
      if (li && it) select(prog, it, li);
    }
  };

  const showGate = (prog: Program) => {
    const yes = h('button', 'primary', 'I am 18 or over') as HTMLButtonElement;
    const no = h('button', '', 'Back') as HTMLButtonElement;
    yes.addEventListener('click', () => { confirmAdult(); showDetail(prog); });
    no.addEventListener('click', () => { location.hash = '#workouts/programs'; });
    const row = h('div', 'actions');
    row.append(yes, no);
    body.replaceChildren(back(), h('h1', '', prog.title), h('p', '', 'This program covers sexual health. Confirm you are 18 or over.'), row);
  };

  const render = (programs: Program[]) => {
    if (programId === undefined) {
      const ul = h('ul', 'program-list');
      for (const p of visiblePrograms(programs, profile)) {
        const a = h('a', 'program-row') as HTMLAnchorElement;
        a.href = `#workouts/programs/${p.id}`;
        a.append(h('span', 'item-name', p.title), h('span', 'muted', `${p.items.length} exercises`));
        const li = h('li');
        li.append(a);
        ul.append(li);
      }
      body.replaceChildren(h('h1', '', 'Programs'), h('p', 'muted', 'Education, not treatment. Pick a program to see its exercises.'), ul);
      return;
    }
    // ponytail: an unknown id gets the same message as a hidden one
    const prog = programs.find((p) => p.id === programId);
    if (!prog || !canOpen(prog, profile)) {
      body.replaceChildren(back(), h('p', 'notice', 'This program is not available for your profile.'));
      return;
    }
    if (prog.adultOnly && !isAdultConfirmed()) showGate(prog);
    else showDetail(prog);
  };

  (async () => {
    try {
      const res = await fetch(`${import.meta.env.BASE_URL}data/programs.json`);
      if (!res.ok) throw new Error(String(res.status));
      const file: ProgramsFile = await res.json();
      if (!disposed) render(file.programs);
    } catch (e) {
      if (!disposed) body.textContent = `Could not load programs: ${e instanceof Error ? e.message : String(e)}`;
    }
  })();

  return () => {
    disposed = true;
    observer.disconnect();
    removeEventListener('resize', applyInset);
    if (viewer && snapshot) {
      viewer.clearHighlight();
      viewer.setState(snapshot);
      if (pelvic) viewer.setView('front');
      pelvic = false;
      viewer.setViewInset({ top: 0, right: 0, bottom: 0, left: 0 });
    }
    root.replaceChildren();
  };
}
