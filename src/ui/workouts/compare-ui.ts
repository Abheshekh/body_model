// Compare (R5 R6, plan 2b.7, 2b.8): pin the current version (exercise or task) as A, change to B; an A/B switch flips
// which one the body plays, the other is drawn as a faint ghost at the same phase; the muscle columns A and B (side by
// side ≥ 900 px, stacked below) and the differences in words (compareWords). The pin lives in module memory, so it
// survives the remount when a Variation or preset changes, and is dropped when the route leaves its screen.
import type { BodyViewer } from '../../body/scene';
import { effort, type EngineData } from '../../engine/effort';
import type { EffortResult, Load, Sex, Support } from '../../engine/types';
import { compareWords, type PartNames } from '../../library/compare';
import { lerpPose, type Pose } from '../../rig/pose';
import { panelRows } from './effort-panel';
import { ROLE_COL } from './library';
import './taskbuilder.css'; // the compare styles

/** one playable version: keyframes with the supports of each keyframe and the resolved loads */
export interface Version {
  kind: 'exercises' | 'tasks';
  label: string;
  keyframes: Pose[];
  loads: Load[];
  supports: Support[][];
}

let pin: Version | null = null;
// ponytail: "the route changes" = the hash leaves the pinned screen (#workouts/<kind>[/…]); a Variation or preset
// change stays on it, which is the change Compare is for
globalThis.addEventListener?.('hashchange', () => { if (pin && !location.hash.startsWith(`#workouts/${pin.kind}`)) pin = null; });

const IN_BETWEEN = [0.25, 0.5, 0.75];
const ROLE_KEY = { work: 'prime', help: 'syn', hold: 'stab' } as const;
const smooth = (u: number) => u * u * (3 - 2 * u);

/** where u (0..1 over the whole sequence) falls: keyframe i, fraction f towards i + 1 */
const seg = (n: number, u: number): [number, number] => {
  if (n < 2) return [0, 0];
  const p = Math.min(1, Math.max(0, u)) * (n - 1), i = Math.min(n - 2, Math.floor(p));
  return [i, p - i];
};

/** the pose at phase u (0..1) over the keyframes, smoothstep inside each segment */
export function poseAt(keys: Pose[], u: number): Pose {
  const [i, f] = seg(keys.length, u);
  return keys.length < 2 ? keys[0] : lerpPose(keys[i], keys[i + 1], smooth(f));
}

/** effort input at phase u: the pose, the motion direction (roles), the supports (in-betweens take the next keyframe's) */
export function inputAt(v: Version, u: number): { pose: Pose; poseB?: Pose; supports: Support[] } {
  const keys = v.keyframes, [i, f] = seg(keys.length, u);
  if (keys.length < 2) return { pose: keys[0], supports: v.supports[0] };
  const e = smooth(f);
  return { pose: lerpPose(keys[i], keys[i + 1], e), poseB: lerpPose(keys[i], keys[i + 1], e + 1), supports: v.supports[f > 0 ? i + 1 : i] };
}

/**
 * Effort over the whole version: every keyframe (its own supports) and 3 in-betweens per segment (the next keyframe's
 * supports, as editChecks). Peak level per muscle, peak lower-back moment, worst balance, all warnings (as effortOverMove).
 */
export function versionEffort(v: Version, sex: Sex, data: EngineData): EffortResult {
  const keys = v.keyframes;
  let out: EffortResult | undefined;
  const take = (pose: Pose, sup: Support[], poseB?: Pose) => {
    const r = effort({ pose, poseB, sex, loads: v.loads, supports: sup }, data);
    if (!out) { out = r; return; }
    for (const [id, m] of Object.entries(r.muscle)) if (m.level > (out.muscle[+id]?.level ?? -1)) out.muscle[+id] = m;
    if (r.lowerBack.momentNm > out.lowerBack.momentNm) out.lowerBack = r.lowerBack;
    if (r.balance.margin < out.balance.margin) out.balance = r.balance;
    out.warnings = [...new Set([...out.warnings, ...r.warnings])];
  };
  keys.forEach((k, i) => {
    const next = keys[i + 1];
    take(k, v.supports[i], next ?? (i ? lerpPose(keys[i - 1], k, 2) : undefined));
    if (next) for (const t of IN_BETWEEN) take(lerpPose(k, next, t), v.supports[i + 1], lerpPose(k, next, t + 1));
  });
  if (!out) throw new Error('versionEffort: no keyframes');
  return out;
}

export interface CompareCtx {
  data: EngineData;
  sex: Sex;
  parts: PartNames;
  /** the A/B switch flipped (or the pin was cleared): play `shown()` on the body */
  onFlip(): void;
}
export interface Compare {
  /** the host's current version (B) changed; null = none (a disabled combination) */
  set(b: Version | null): void;
  /** what the body plays: A when the switch is on A, else the current version */
  shown(): Version | null;
  /** draw the other version as the ghost at phase u (0..1); no ghost unless comparing */
  frame(u: number): void;
  dispose(): void;
}

const h = (tag: string, cls = '', text = ''): HTMLElement => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text) e.textContent = text;
  return e;
};
const btn = (text: string, on: () => void, cls = ''): HTMLButtonElement => {
  const b = h('button', cls, text) as HTMLButtonElement;
  b.type = 'button';
  b.addEventListener('click', on);
  return b;
};

export function mountCompare(root: HTMLElement, viewer: BodyViewer | null, ctx: CompareCtx): Compare {
  const box = h('section', 'compare');
  box.setAttribute('aria-label', 'Compare');
  root.append(box);
  let cur: Version | null = null, onA = false;
  const memo = new WeakMap<Version, EffortResult>();
  const eff = (v: Version) => {
    let r = memo.get(v);
    if (!r) memo.set(v, (r = versionEffort(v, ctx.sex, ctx.data)));
    return r;
  };
  const comparing = () => !!pin && !!cur && pin !== cur;
  const other = () => (comparing() ? (onA ? cur : pin) : null);

  const column = (tag: string, v: Version) => {
    const r = eff(v), col = h('div', 'cmp-col'), ul = h('ul', 'cmp-rows');
    col.append(h('h3', '', `${tag}: ${v.label}`));
    for (const row of panelRows(r, { parts: ctx.parts, sources: [] })) {
      const li = h('li'), bar = h('span', 'effort-bar'), fill = h('i');
      const pct = Math.round(row.level * 100);
      bar.setAttribute('role', 'meter');
      bar.setAttribute('aria-valuemin', '0');
      bar.setAttribute('aria-valuemax', '100');
      bar.setAttribute('aria-valuenow', String(pct));
      fill.style.width = pct + '%';
      fill.style.background = ROLE_COL[ROLE_KEY[row.role]];
      bar.append(fill);
      li.append(h('span', 'cmp-name', row.name), bar, h('span', 'cmp-pct', `${pct}%`));
      ul.append(li);
    }
    col.append(ul, h('p', 'muted', `Lower back: ${Math.round(r.lowerBack.momentNm)} Nm`));
    return col;
  };

  const render = () => {
    const pinB = btn(pin ? 'Pin this as A again' : 'Compare: pin this as A', () => {
      if (!cur) return;
      [pin, onA] = [cur, false];
      render();
    });
    pinB.disabled = !cur;
    const acts = h('div', 'move-acts');
    acts.append(pinB);
    if (pin) acts.append(btn('Clear', () => { const was = onA; [pin, onA] = [null, false]; void viewer?.setGhost(null); render(); if (was) ctx.onFlip(); }));
    const out: HTMLElement[] = [h('h2', '', 'Compare'), acts];
    if (!pin) out.push(h('p', 'muted', 'Pin this version as A, then change the settings to compare it with B.'));
    else if (!comparing()) out.push(h('p', 'muted', `A: ${pin.label}. Change the settings to make B.`));
    else {
      const sw = h('div', 'seg cmp-switch');
      sw.setAttribute('role', 'group');
      sw.setAttribute('aria-label', 'Version on the body');
      for (const [a, t] of [[true, 'A'], [false, 'B']] as const) {
        const b = btn(`Show ${t}`, () => { if (onA === a) return; onA = a; render(); ctx.onFlip(); });
        b.setAttribute('aria-pressed', String(onA === a));
        sw.append(b);
      }
      const words = h('ul', 'cmp-words');
      for (const w of compareWords(eff(pin), eff(cur!), ctx.parts)) words.append(h('li', '', w));
      const cols = h('div', 'cmp-cols');
      cols.append(column('A', pin), column('B', cur!));
      out.push(sw, h('p', 'muted', `The body shows ${onA ? 'A' : 'B'}; the faint ghost is ${onA ? 'B' : 'A'}.`),
        h('h3', '', 'What changes from A to B'), words, cols,
        h('p', 'muted', 'Peak levels over the whole movement. Estimates from a static model; education only, not medical advice.'));
    }
    box.replaceChildren(...out);
  };
  render();

  return {
    set(b) {
      cur = b;
      if (!comparing()) { onA = false; void viewer?.setGhost(null); }
      render();
    },
    shown: () => (comparing() && onA ? pin : cur),
    frame(u) {
      const o = other();
      if (o && viewer) void viewer.setGhost(poseAt(o.keyframes, u));
    },
    dispose() {
      void viewer?.setGhost(null);
      box.remove();
    },
  };
}
