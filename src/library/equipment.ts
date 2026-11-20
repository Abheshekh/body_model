// Equipment data (public/data/equipment.json, plan 2b.3): pure reader. placeEquipment turns an item's surfaces,
// colliders and grips from item coordinates into world coordinates (at, yaw, adjust angle, body scale s), so the form
// checks and the renderer (src/ui/workouts/equipment.ts) read the same numbers. No three.js, no DOM.

export type Vec3 = [number, number, number];
export interface Surface { name: string; points: string[]; plane: { point: Vec3; normal: Vec3 }; u: Vec3; extent: [number, number]; hinge?: boolean }
export interface Collider {
  name: string;
  box?: { center: Vec3; size: Vec3; rx?: number };
  capsule?: { a: Vec3; b: Vec3; r: number };
  look?: string;
  hinge?: boolean;
}
export interface Item {
  id: string;
  name: string;
  kind: 'fixed' | 'handheld';
  parts: { model: string; colour?: string; attachment?: string; dims: Record<string, number>; source: string };
  at: Vec3;
  yaw: number;
  adjust?: { angle?: { min: number; max: number; default: number; pivot: Vec3 }; height?: { min: number; max: number; default: number } };
  surfaces: Surface[];
  colliders: Collider[];
  grip?: { name: string; point: Vec3 }[];
  note?: string;
  source: string;
  licence: string;
}
export interface EquipmentJson { sources: string[]; note?: string; items: Item[]; objects: Item[]; equipmentProps: Record<string, string[]> }
/** a record's per-item override (plan 2b.3); angle and height only apply where the item's adjust lists them */
export type Placement = Record<string, { at?: Vec3; yaw?: number; angle?: number; height?: number }>;

export interface PlacedSurface { item: string; name: string; points: string[]; point: Vec3; normal: Vec3; u: Vec3; v: Vec3; extent: [number, number] }
export type PlacedCollider =
  | { item: string; name: string; box: { center: Vec3; half: Vec3; axes: [Vec3, Vec3, Vec3] } }
  | { item: string; name: string; capsule: { a: Vec3; b: Vec3; r: number } };
export interface Placed { surfaces: PlacedSurface[]; colliders: PlacedCollider[]; grips: { item: string; name: string; point: Vec3 }[] }

const D = Math.PI / 180;
const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));
const add = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const scale = (a: Vec3, k: number): Vec3 => [a[0] * k, a[1] * k, a[2] * k];
const cross = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
/** rotation about +x (as three.js rotation.x) */
export const rotX = (v: Vec3, deg: number): Vec3 => {
  const c = Math.cos(deg * D), s = Math.sin(deg * D);
  return [v[0], v[1] * c - v[2] * s, v[1] * s + v[2] * c];
};
/** rotation about +y (as three.js rotation.y) */
export const rotY = (v: Vec3, deg: number): Vec3 => {
  const c = Math.cos(deg * D), s = Math.sin(deg * D);
  return [v[0] * c + v[2] * s, v[1], -v[0] * s + v[2] * c];
};

export const findItem = (eq: EquipmentJson, id: string): Item | undefined => eq.items.find((i) => i.id === id) ?? eq.objects.find((i) => i.id === id);

/** where an item stands and its adjust values after the record's override (angle and height clamped to their range) */
export function itemPose(it: Item, placement: Placement = {}): { at: Vec3; yaw: number; angle: number; height: number } {
  const p = placement[it.id] ?? {}, a = it.adjust?.angle, h = it.adjust?.height;
  return {
    at: p.at ?? it.at,
    yaw: p.yaw ?? it.yaw,
    angle: a ? clamp(p.angle ?? a.default, a.min, a.max) : 0,
    height: h ? clamp(p.height ?? h.default, h.min, h.max) : 0,
  };
}

/** surfaces, colliders and grips of the items in world coordinates; 'bodyweight' is skipped, an unknown id throws */
export function placeEquipment(items: string[], placement: Placement, s: number, eq: EquipmentJson): Placed {
  const out: Placed = { surfaces: [], colliders: [], grips: [] };
  for (const id of items) {
    if (id === 'bodyweight') continue;
    const it = findItem(eq, id);
    if (!it) throw new Error(`unknown equipment "${id}"`);
    const { at, yaw, angle } = itemPose(it, placement);
    const pivot = it.adjust?.angle?.pivot ?? [0, 0, 0];
    const dir = (v: Vec3, hinge?: boolean): Vec3 => rotY(hinge ? rotX(v, angle) : v, yaw);
    const pt = (p: Vec3, hinge?: boolean): Vec3 => scale(add(rotY(hinge ? add(rotX(sub(p, pivot), angle), pivot) : p, yaw), at), s);
    for (const f of it.surfaces) {
      const normal = dir(f.plane.normal, f.hinge), u = dir(f.u, f.hinge);
      out.surfaces.push({ item: id, name: f.name, points: f.points, point: pt(f.plane.point, f.hinge), normal, u, v: cross(normal, u), extent: [f.extent[0] * s, f.extent[1] * s] });
    }
    for (const c of it.colliders) {
      if (c.box) {
        const rx = c.box.rx ?? 0;
        const axes = ([[1, 0, 0], [0, 1, 0], [0, 0, 1]] as Vec3[]).map((e) => dir(rotX(e, rx), c.hinge)) as [Vec3, Vec3, Vec3];
        out.colliders.push({ item: id, name: c.name, box: { center: pt(c.box.center, c.hinge), half: scale(c.box.size, s / 2), axes } });
      } else if (c.capsule) {
        out.colliders.push({ item: id, name: c.name, capsule: { a: pt(c.capsule.a, c.hinge), b: pt(c.capsule.b, c.hinge), r: c.capsule.r * s } });
      }
    }
    for (const g of it.grip ?? []) out.grips.push({ item: id, name: g.name, point: pt(g.point) });
  }
  return out;
}
