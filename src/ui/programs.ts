import { highlightPlan, type Inset } from '../body/model';
import { clearHighlights, setPartColor, type Viewer } from '../body/viewer';
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
  a.href = '#programs';
  return a;
};

export function mountPrograms(root: HTMLElement, viewer: Viewer | null, profile: Profile, programId?: string): () => void {
  let disposed = false;
  let pelvic = false;
  const sheet = h('section', 'sheet programs');
  sheet.setAttribute('aria-label', 'Programs');
  const banner = h('div', 'banner sheet-banner', 'The body shown is male anatomy.');
  banner.hidden = true;
  const body = h('div', '', 'Loading…');
  const handle = h('button', 'sheet-handle') as HTMLButtonElement;
  handle.type = 'button';
  sheet.append(handle, banner, body);
  root.replaceChildren(sheet);

  // the viewer centres the body in the canvas area not under the nav, the Explore toolbar or the sheet
  const applyInset = () => {
    if (!viewer) return;
    let top = 0;
    for (const el of document.querySelectorAll<HTMLElement>('.nav, .explore .toolbar')) {
      if (getComputedStyle(el).display !== 'none' && !el.closest('[hidden]')) top = Math.max(top, el.getBoundingClientRect().bottom);
    }
    const r = sheet.getBoundingClientRect();
    const inset: Inset = innerWidth < 900
      ? { top, right: 0, bottom: innerHeight - r.top, left: 0 }
      : { top, right: innerWidth - r.left, bottom: 0, left: 0 };
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

  const leavePelvic = () => {
    if (!viewer || !pelvic) return;
    viewer.setPelvicView(false);
    viewer.setView('front');
    pelvic = false;
  };

  const select = (prog: Program, item: Item, row: HTMLElement) => {
    for (const r of body.querySelectorAll('.item.active')) r.classList.remove('active');
    row.classList.add('active');
    banner.hidden = prog.audience !== 'female';
    if (!viewer) return;
    const plan = highlightPlan(viewer.parts, item.targets.parts);
    for (const n of plan.missing) console.warn(`Programs: unknown target "${n}" in ${prog.id}/${item.id}`);
    clearHighlights();
    if (plan.pelvic) {
      // full opacity first: setPelvicView snapshots the state it restores later
      viewer.setLayerOpacity('superficialMuscles', 1);
      viewer.setPelvicView(true, plan.ids);
      pelvic = true;
      banner.hidden = false;
    } else {
      leavePelvic();
      for (const k of plan.layers) if (!viewer.isLayerVisible(k)) viewer.setLayerVisible(k, true);
      viewer.setLayerOpacity('superficialMuscles', plan.seeThroughSuperficial ? 0.35 : 1);
    }
    for (const id of plan.ids) setPartColor(id, '#ffd400', 1);
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
    // the sticky banner is the single place the male-anatomy note shows
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
    no.addEventListener('click', () => { location.hash = '#programs'; });
    const row = h('div', 'actions');
    row.append(yes, no);
    body.replaceChildren(back(), h('h1', '', prog.title), h('p', '', 'This program covers sexual health. Confirm you are 18 or over.'), row);
  };

  const render = (programs: Program[]) => {
    if (programId === undefined) {
      const ul = h('ul', 'program-list');
      for (const p of visiblePrograms(programs, profile)) {
        const a = h('a', 'program-row') as HTMLAnchorElement;
        a.href = `#programs/${p.id}`;
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
    if (viewer) {
      clearHighlights();
      const wasPelvic = pelvic;
      viewer.setPelvicView(false);
      if (wasPelvic) viewer.setView('front');
      pelvic = false;
      viewer.setLayerOpacity('superficialMuscles', 1);
      viewer.setViewInset({ top: 0, right: 0, bottom: 0, left: 0 });
    }
    root.replaceChildren();
  };
}
