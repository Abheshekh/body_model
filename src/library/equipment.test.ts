import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { placeEquipment, type EquipmentJson, type Item, type Vec3 } from './equipment';

const read = (f: string) => JSON.parse(readFileSync(`public/data/${f}`, 'utf8'));
const eq: EquipmentJson = read('equipment.json');
const close = (a: number[], b: number[]) => a.forEach((x, i) => expect(x).toBeCloseTo(b[i], 6));

// inline fixture: one fixed item with a hinged pad, a capsule and a grip
const item: Item = {
  id: 'thing', name: 'Thing', kind: 'fixed',
  parts: { model: 'x', dims: {}, source: 'test' },
  at: [1, 0, 0], yaw: 0,
  adjust: { angle: { min: -15, max: 90, default: 0, pivot: [0, 0.44, 0] } },
  surfaces: [
    { name: 'seat', points: ['pelvis'], plane: { point: [0, 0.44, 0.2], normal: [0, 1, 0] }, u: [0, 0, 1], extent: [0.1, 0.15] },
    { name: 'back', points: ['thoraxBack'], plane: { point: [0, 0.44, -1], normal: [0, 1, 0] }, u: [0, 0, 1], extent: [0.4, 0.15], hinge: true },
  ],
  colliders: [
    { name: 'pad', box: { center: [0, 0.4, -1], size: [0.3, 0.08, 0.8] }, hinge: true },
    { name: 'tilted', box: { center: [0, 1, 0], size: [1, 2, 3], rx: 90 } },
    { name: 'bar', capsule: { a: [-1, 2, 0], b: [1, 2, 0], r: 0.02 } },
  ],
  grip: [{ name: 'hand', point: [0, 1, 0] }],
  source: 'test', licence: 'test',
};
const fx: EquipmentJson = { sources: [], items: [item], objects: [], equipmentProps: {} };

describe('placeEquipment', () => {
  it('moves by at and scales by s', () => {
    const p = placeEquipment(['thing'], {}, 2, fx);
    close(p.surfaces[0].point, [2, 0.88, 0.4]); // 2 × ([0, .44, .2] + [1, 0, 0])
    close(p.surfaces[0].extent, [0.2, 0.3]);
    const bar = p.colliders[2] as Extract<typeof p.colliders[number], { capsule: unknown }>;
    close(bar.capsule.a, [0, 4, 0]);
    expect(bar.capsule.r).toBeCloseTo(0.04);
    close(p.grips[0].point, [2, 2, 0]);
  });
  it('turns by yaw (as three.js rotation.y: +x goes to -z at 90)', () => {
    const p = placeEquipment(['thing'], { thing: { at: [0, 0, 0], yaw: 90 } }, 1, fx);
    const bar = p.colliders[2] as Extract<typeof p.colliders[number], { capsule: unknown }>;
    close(bar.capsule.a, [0, 2, 1]);
    close(bar.capsule.b, [0, 2, -1]);
    close(p.surfaces[0].u, [1, 0, 0]); // u = +z turned to +x
    close(p.surfaces[0].normal, [0, 1, 0]);
  });
  it('angle turns only the hinged parts about the pivot', () => {
    const p = placeEquipment(['thing'], { thing: { at: [0, 0, 0], angle: 90 } }, 1, fx);
    close(p.surfaces[0].point, [0, 0.44, 0.2]); // seat stays
    close(p.surfaces[1].point, [0, 1.44, 0]); // the back pad's far end goes straight up
    close(p.surfaces[1].normal, [0, 0, 1]); // and faces forward
    const pad = p.colliders[0] as Extract<typeof p.colliders[number], { box: unknown }>;
    close(pad.box.center, [0, 1.44, -0.04]); // the pad body sits behind its face
    close(pad.box.axes[1], [0, 0, 1]);
  });
  it('clamps angle to the adjust range', () => {
    close(placeEquipment(['thing'], { thing: { angle: 120 } }, 1, fx).surfaces[1].normal, [0, 0, 1]); // 90
    const a = -15 * Math.PI / 180;
    close(placeEquipment(['thing'], { thing: { angle: -40 } }, 1, fx).surfaces[1].normal, [0, Math.cos(a), Math.sin(a)]);
  });
  it('box rx turns the box axes; half sizes scale', () => {
    const p = placeEquipment(['thing'], {}, 2, fx);
    const t = p.colliders[1] as Extract<typeof p.colliders[number], { box: unknown }>;
    close(t.box.axes[2], [0, -1, 0]);
    close(t.box.half, [1, 2, 3]);
  });
  it('skips bodyweight, throws on an unknown id', () => {
    expect(placeEquipment(['bodyweight'], {}, 1, fx).colliders).toHaveLength(0);
    expect(() => placeEquipment(['nope'], {}, 1, fx)).toThrow(/unknown equipment/);
  });
});

describe('equipment.json', () => {
  const all = [...eq.items, ...eq.objects];
  const unit = (v: Vec3) => Math.hypot(...v);
  it('has the R2 gym items and the chair and steps', () => {
    expect(eq.items.map((i) => i.id).sort()).toEqual(['adjustable-bench', 'band', 'barbell', 'cable-column', 'dumbbell', 'flat-bench', 'kettlebell',
      'lat-machine', 'leg-curl', 'leg-extension', 'leg-press', 'mat', 'plyo-box', 'pull-up-rig', 'squat-rack']);
    for (const id of ['chair', 'step1', 'step2']) expect(eq.objects.map((i) => i.id)).toContain(id);
  });
  it('ids unique; every item sourced, licensed, with dimensions and their source', () => {
    expect(new Set(all.map((i) => i.id)).size).toBe(all.length);
    for (const i of all) {
      expect(i.source && i.licence && i.parts.source, i.id).toBeTruthy();
      expect(['fixed', 'handheld'], i.id).toContain(i.kind);
      expect(i.colliders.length, i.id).toBeGreaterThan(0);
    }
  });
  it('surfaces: unit normal, u in the plane, body points listed; hinge only with an adjust angle', () => {
    for (const i of all) {
      for (const f of i.surfaces) {
        expect(unit(f.plane.normal), `${i.id}.${f.name}`).toBeCloseTo(1, 3);
        expect(unit(f.u), `${i.id}.${f.name}`).toBeCloseTo(1, 3);
        expect(f.plane.normal.reduce((d, x, k) => d + x * f.u[k], 0), `${i.id}.${f.name}`).toBeCloseTo(0, 3);
        expect(f.points.length, `${i.id}.${f.name}`).toBeGreaterThan(0);
      }
      for (const x of [...i.surfaces, ...i.colliders]) if (x.hinge) expect(i.adjust?.angle, `${i.id}.${x.name}`).toBeDefined();
    }
  });
  it('colliders are a box or a capsule; nothing below the floor at the default place', () => {
    for (const i of all) {
      for (const c of i.colliders) expect(!!c.box !== !!c.capsule, `${i.id}.${c.name}`).toBe(true);
      const p = placeEquipment([i.id], {}, 1, eq);
      for (const c of p.colliders) {
        const low = 'box' in c ? c.box.center[1] - c.box.axes.reduce((m, a, k) => m + Math.abs(a[1]) * c.box.half[k], 0)
          : Math.min(c.capsule.a[1], c.capsule.b[1]) - c.capsule.r;
        expect(low, `${i.id}.${c.name}`).toBeGreaterThan(-0.001);
      }
    }
  });
  it('fixed items stand on the floor; handhelds have grips', () => {
    for (const i of all) {
      if (i.kind === 'handheld') { expect(i.grip?.length, i.id).toBeGreaterThan(0); continue; }
      const p = placeEquipment([i.id], {}, 1, eq);
      const low = Math.min(...p.colliders.map((c) => ('box' in c ? c.box.center[1] - c.box.axes.reduce((m, a, k) => m + Math.abs(a[1]) * c.box.half[k], 0)
        : Math.min(c.capsule.a[1], c.capsule.b[1]) - c.capsule.r)));
      expect(low, i.id).toBeCloseTo(0, 3);
    }
  });
  it('flat bench pad top at 0.45 m (IPF 0.42-0.45), pull-up bar at the prototype 2.15 m', () => {
    const b = placeEquipment(['flat-bench'], {}, 1, eq).surfaces.find((f) => f.name === 'pad')!;
    expect(b.point[1]).toBeCloseTo(0.45, 3);
    const bar = placeEquipment(['pull-up-rig'], {}, 1, eq).colliders.find((c) => c.name === 'bar')!;
    expect('capsule' in bar && bar.capsule.a[1]).toBeCloseTo(2.15, 3);
  });
  it('equipmentProps name engine props that loads.json or supports.json know', () => {
    const loads = read('loads.json'), sup = read('supports.json');
    const known = new Set([...Object.keys(loads.props), ...loads.none, ...Object.keys(sup.props), ...sup.none]);
    for (const [id, props] of Object.entries(eq.equipmentProps)) {
      expect(all.map((i) => i.id), id).toContain(id);
      for (const p of props) expect(known.has(p), `${id} → ${p}`).toBe(true);
    }
  });
  it('mat is 15 mm foam, plyo box top and mat top sit on their colliders', () => {
    for (const id of ['mat', 'plyo-box']) {
      const it = all.find((x) => x.id === id)!, box = it.colliders[0].box!;
      expect(it.surfaces[0].plane.point[1], id).toBeCloseTo(box.center[1] + box.size[1] / 2, 6);
    }
    expect(all.find((x) => x.id === 'mat')!.colliders[0].box!.size[1]).toBeCloseTo(0.015, 6);
  });
  it('band is a flat strap (about 4 cm by 1 mm); rest places lie in range', () => {
    const d = (id: string) => all.find((x) => x.id === id)!.parts.dims;
    expect(d('band').width).toBeGreaterThanOrEqual(0.035);
    expect(d('band').width).toBeLessThanOrEqual(0.045);
    expect(d('band').thick).toBeLessThanOrEqual(0.0015);
    expect(d('band').loopR).toBeGreaterThan(0);
    expect(d('leg-press').restT).toBeGreaterThanOrEqual(0);
    expect(d('leg-press').restT).toBeLessThanOrEqual(d('leg-press').travel);
    expect(d('lat-machine').hangY).toBeLessThan(d('lat-machine').pulleyY - d('lat-machine').pulleyR - 0.107); // the bar hangs below the pulley
  });
});
