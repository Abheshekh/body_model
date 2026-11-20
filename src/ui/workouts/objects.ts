// Task objects built in code (R5 T4, plan 2b.3): the chair and steps, and the things the task builder lifts, carries and
// pushes (box, bucket, bag, child, suitcase, gas cylinder, chest of drawers, mop, broom). Every object is drawn from
// the `objects` section of public/data/equipment.json (same numbers as the colliders and surfaces the form checks read).
// Hand-held objects follow the posed hands as in equipment.ts. The child is a stylised figure, labelled "simplified".
// buildProps draws a mixed list: gym items through buildEquipment, task objects here.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import type { BodyViewer } from '../../body/scene';
import { findItem, itemPose, type EquipmentJson, type Item, type Placement } from '../../library/equipment';
import type { Vec3 } from '../../rig/ik';
import { PROTO_ROOT_Y } from '../../rig/pose';
import { mv, type Posed, type Skeleton } from '../../rig/skeleton';
import { buildEquipment, type Equipment } from './equipment';
import { createMats, type Mats } from './materials';

const D = Math.PI / 180;
const UP = new THREE.Vector3(0, 1, 0);
const X = new THREE.Vector3(1, 0, 0);
type V = THREE.Vector3;
const v3 = (a: readonly number[]) => new THREE.Vector3(a[0], a[1], a[2]);

interface Ctx { it: Item; g: THREE.Group; mats: Mats; dims: Record<string, number>; geos: THREE.BufferGeometry[]; own: THREE.Material[] }
type Follow = (hands: { l: V; r: V } | null) => void;
type Recipe = (c: Ctx) => void;

const at = (p: readonly number[] = [0, 0, 0], rx = 0, ry = 0, rz = 0) =>
  new THREE.Matrix4().compose(v3(p), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx * D, ry * D, rz * D)), new THREE.Vector3(1, 1, 1));
/** planar uv in metres on the dominant face axis, so wood grain keeps its scale on every part */
function metric(g: THREE.BufferGeometry) {
  const p = g.attributes.position, n = g.attributes.normal, uv = g.attributes.uv;
  for (let i = 0; i < p.count; i++) {
    const ax = Math.abs(n.getX(i)), ay = Math.abs(n.getY(i)), az = Math.abs(n.getZ(i));
    if (ax >= ay && ax >= az) uv.setXY(i, p.getZ(i), p.getY(i));
    else if (ay >= az) uv.setXY(i, p.getX(i), p.getZ(i));
    else uv.setXY(i, p.getX(i), p.getY(i));
  }
}
function put(c: Ctx, geo: THREE.BufferGeometry, m: THREE.Material, pos?: readonly number[], rx = 0, ry = 0, rz = 0) {
  if (pos) geo.applyMatrix4(at(pos, rx, ry, rz));
  c.geos.push(geo);
  const mesh = new THREE.Mesh(geo, m);
  c.g.add(mesh);
  return mesh;
}
/** bevelled box of size s centred at pos */
const bevel = (c: Ctx, s: readonly number[], m: THREE.Material, pos: readonly number[], r = 0.005, rx = 0, ry = 0, rz = 0) => {
  const g = new RoundedBoxGeometry(s[0], s[1], s[2], 3, Math.max(0.0005, Math.min(r, Math.min(...s) / 2 - 0.0003)));
  metric(g);
  return put(c, g, m, pos, rx, ry, rz);
};
const between = (c: Ctx, a: readonly number[], b: readonly number[], r: number, m: THREE.Material, seg = 16) => {
  const A = v3(a), B = v3(b), d = B.clone().sub(A), len = d.length();
  const g = new THREE.CylinderGeometry(r, r, len, seg);
  g.applyMatrix4(new THREE.Matrix4().compose(A.clone().add(B).multiplyScalar(0.5), new THREE.Quaternion().setFromUnitVectors(UP, d.divideScalar(len)), new THREE.Vector3(1, 1, 1)));
  c.geos.push(g);
  c.g.add(new THREE.Mesh(g, m));
};
const lathe = (c: Ctx, pts: [number, number][], m: THREE.Material, seg = 48) => put(c, new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(r, y)), seg), m);
const tube = (c: Ctx, pts: number[][], r: number, m: THREE.Material, radial = 10) =>
  put(c, new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts.map(v3), false, 'centripetal'), 48, r, radial), m);
/** flat strap (webbing) w wide, t thick along a curve in about the x-y plane: the width stays in that plane */
function strap(c: Ctx, pts: V[], w: number, t: number, m: THREE.Material) {
  const curve = new THREE.CatmullRomCurve3(pts, false, 'centripetal'), n = 64, L = curve.getLength(), pos: number[] = [], uv: number[] = [], idx: number[] = [];
  const cs = [[w, t], [-w, t], [-w, -t], [w, -t]], Z = new THREE.Vector3(0, 0, 1);
  for (let i = 0; i <= n; i++) {
    const p = curve.getPointAt(i / n), tg = curve.getTangentAt(i / n), wd = tg.clone().cross(Z).normalize(), nm = tg.clone().cross(wd);
    for (let f = 0; f < 4; f++) for (const q of [f, (f + 1) % 4]) {
      const v = p.clone().addScaledVector(wd, cs[q][0] / 2).addScaledVector(nm, cs[q][1] / 2);
      pos.push(v.x, v.y, v.z);
      uv.push((L * i) / n, cs[q][0] / 2);
    }
    if (i < n) for (let f = 0; f < 4; f++) { const a = i * 8 + 2 * f, b = a + 8; idx.push(a, a + 1, b, a + 1, b + 1, b); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  put(c, g, m);
}
/** a material the object owns (disposed with it); double sided for open lathes */
const solid = (c: Ctx, hex: string, rough: number, o: THREE.MeshStandardMaterialParameters = {}) => {
  const m = new THREE.MeshStandardMaterial({ color: hex, roughness: rough, side: THREE.DoubleSide, ...o });
  c.own.push(m);
  return m;
};

// ---- recipes ----
const RECIPES: Record<string, Recipe> = {
  chair: (c) => {
    const wood = c.mats.wood(c.it.parts.colour ?? '#c29a66'), { mats } = c;
    const find = (n: string) => c.it.colliders.find((x) => x.name === n)!.box!;
    const seat = find('seat'), back = find('back');
    bevel(c, seat.size, wood, seat.center, 0.012);
    for (const n of ['legFrontLeft', 'legFrontRight', 'legBackLeft', 'legBackRight']) { const b = find(n); bevel(c, b.size, wood, b.center, 0.006); }
    const ay = c.dims.apronY, rail = c.dims.rail, [w, , d] = seat.size;
    bevel(c, [w - 0.075, rail, 0.016], wood, [0, ay, 0.18], 0.004);
    bevel(c, [w - 0.075, rail, 0.016], wood, [0, ay, -0.18], 0.004);
    for (const s of [-1, 1]) bevel(c, [0.016, rail, d - 0.075], wood, [s * 0.19, ay, 0], 0.004);
    for (const s of [-1, 1]) bevel(c, [0.014, 0.014, d - 0.075], wood, [s * 0.19, 0.16, 0], 0.003); // side stretchers
    bevel(c, [w - 0.075, 0.014, 0.014], wood, [0, 0.16, 0.18], 0.003);
    // back: the panel from the collider, a top rail, and a lower slat between the rear legs
    bevel(c, back.size, wood, back.center, 0.006);
    bevel(c, [back.size[0] + 0.035, 0.05, 0.026], wood, [0, 0.826, back.center[2]], 0.01);
    bevel(c, [w - 0.075, 0.05, 0.016], wood, [0, 0.55, back.center[2]], 0.004);
    for (const [x, z] of [[0.19, 0.18], [-0.19, 0.18], [0.19, -0.18], [-0.19, -0.18]]) // rubber glides
      put(c, new THREE.CylinderGeometry(0.0155, 0.0175, 0.008, 16), mats.rubber, [x, 0.004, z]);
  },

  step: (c) => {
    const { center, size } = c.it.colliders[0].box!, [w, h, d] = size, t = c.dims.tread, n = c.dims.nosing;
    const wood = c.mats.wood(c.it.parts.colour ?? '#c9a26b'), paint = c.mats.tinted('#e8e5dd', 0.55), trim = c.mats.tinted('#d4d0c6', 0.6);
    const y0 = center[1] - h / 2;
    bevel(c, [w, t, d + n], wood, [center[0], y0 + h - t / 2, center[2] - n / 2], 0.012); // tread with the nosing toward the user (-z)
    bevel(c, [w - 0.03, h - t, d - 0.012], paint, [center[0], y0 + (h - t) / 2, center[2] + 0.002], 0.003); // closed riser block
    for (const s of [-1, 1]) bevel(c, [0.014, h - t, d], trim, [center[0] + s * (w / 2 - 0.007), y0 + (h - t) / 2, center[2]], 0.003); // stringers
    bevel(c, [w, 0.07, 0.012], trim, [center[0], y0 + 0.035, center[2] - d / 2 + 0.004], 0.003); // skirting
    bevel(c, [w - 0.03, 0.006, 0.006], c.mats.tinted('#4a4a4a', 0.8), [center[0], y0 + h - t - 0.003, center[2] - d / 2 - 0.002], 0.002); // shadow gap under the nosing
  },

  box: (c) => {
    const { w, h, d, slotW, slotH, tapeW } = c.dims, kraft = c.mats.tinted(c.it.parts.colour ?? '#b78a55', 0.88);
    const tape = c.mats.tinted('#c9a46f', 0.32), dark = c.mats.tinted('#3a2a1a', 1), seam = c.mats.tinted('#9a7345', 0.9);
    bevel(c, [w, h, d], kraft, [0, h / 2, 0], 0.005);
    bevel(c, [w + 0.002, 0.0012, tapeW], tape, [0, h + 0.0004, 0], 0.0005); // tape along the lid seam
    bevel(c, [w + 0.002, 0.0008, 0.002], seam, [0, h + 0.0014, 0], 0.0003);
    for (const s of [-1, 1]) {
      bevel(c, [0.0012, 0.0012, d + 0.002], tape, [s * (w / 2 + 0.0004), h, 0], 0.0005);
      bevel(c, [0.004, slotH, slotW], dark, [s * (w / 2 - 0.0005), h * 0.72, 0], slotH / 2 - 0.0005); // hand slot
      bevel(c, [0.002, 0.004, slotW + 0.012], seam, [s * (w / 2 + 0.0004), h * 0.72 - slotH / 2 - 0.003, 0], 0.001); // lip under the slot
    }
    for (const s of [-1, 1]) bevel(c, [w - 0.01, 0.002, 0.0015], seam, [0, h * 0.5, s * (d / 2 + 0.0002)], 0.0005); // flap fold line
  },

  bucket: (c) => {
    const { topD, baseD, h, fillY, bail } = c.dims, rt = topD / 2, rb = baseD / 2, wall = c.dims.wall;
    const m = solid(c, c.it.parts.colour ?? '#c7392f', 0.42);
    lathe(c, [[rb - 0.012, 0], [rb, 0.006], [rb + 0.002, 0.02], [rt - 0.004, h - 0.012], [rt + 0.004, h - 0.01], [rt + 0.008, h - 0.004], [rt + 0.004, h + 0.002], [rt - wall, h - 0.004],
      [rt - wall - 0.002, h - 0.02], [rb - wall, 0.02], [rb - wall - 0.004, 0.008], [0, 0.008]], m);
    put(c, new THREE.CylinderGeometry(rt - wall - 0.013, rt - wall - 0.0132 - 0.0095, 0.003, 40), solid(c, '#3d86b8', 0.08, { transparent: true, opacity: 0.85 }), [0, fillY, 0]);
    for (const s of [-1, 1]) bevel(c, [0.014, 0.03, 0.03], m, [s * (rt + 0.002), h - 0.03, 0], 0.005); // ears
    for (const y of [0.09, 0.16]) lathe(c, [[rb + (rt - rb) * (y / h) + 0.001, y], [rb + (rt - rb) * (y / h) + 0.004, y + 0.003], [rb + (rt - rb) * (y / h) + 0.001, y + 0.006]], m); // ribs
    tube(c, [[-rt - 0.004, h - 0.03, 0], [-rt - 0.001, h + 0.07, 0], [-0.09, bail - 0.015, 0], [0, bail, 0], [0.09, bail - 0.015, 0], [rt + 0.001, h + 0.07, 0], [rt + 0.004, h - 0.03, 0]], 0.0035, c.mats.zinc);
    between(c, [-0.055, bail - 0.002, 0], [0.055, bail - 0.002, 0], 0.012, c.mats.grip);
  },

  bag: (c) => {
    // cotton canvas tote: an open-topped box with a gusset, bulged by its contents, creased, the top pulled in by the
    // handles; two flat webbing straps up to the hand; a loaf and a bottle neck show above the rim
    const { w, h, d, grip } = c.dims, dd = d * 0.88, canvasM = c.mats.fabric(c.it.parts.colour ?? '#b9ad92'), webbing = c.mats.fabric('#8c7f66');
    const deform = (X: number, Y: number, Z: number, nx = 0, nz = 0): V => {
      const u = Y / h, ex = (2 * X) / w, ez = (2 * Z) / dd, wave = Math.sin(Math.PI * u) * 0.006;
      let x = X, y = Y, z = Z;
      if (nz) z += nz * wave * (1 - ex * ex) * (Math.sin(22 * X + 17 * Y) + 0.5 * Math.sin(41 * Y - 31 * X)); // creases
      if (nx) x += nx * wave * (1 - ez * ez) * Math.sin(29 * Z + 23 * Y);
      z *= 1 + 0.14 * Math.sin(Math.PI * Math.min(1, u * 1.1)) * (1 - 0.7 * ex * ex) - 0.25 * u ** 4;
      x *= 1 - 0.03 * Math.sin(Math.PI * u);
      if (Math.abs(ex) > 0.999) x -= Math.sign(X) * 0.035 * u ** 3 * (1 - ez * ez); // the gusset folds in at the top
      y -= 0.018 * u ** 6 * (1 - ex * ex); // the rim slumps between the strap seams
      return new THREE.Vector3(x, y, z);
    };
    const body = new THREE.BoxGeometry(w, h, dd, 14, 14, 8), keep: number[] = [];
    for (const gr of body.groups) if (gr.materialIndex !== 2) for (let i = gr.start; i < gr.start + gr.count; i++) keep.push(body.index!.getX(i)); // open top
    body.setIndex(keep);
    body.clearGroups();
    const p = body.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const X = p.getX(i), Y = p.getY(i) + h / 2, Z = p.getZ(i);
      const nx = Math.abs(X) > w / 2 - 1e-6 && Y > 1e-6 ? Math.sign(X) : 0, nz = !nx && Math.abs(Z) > dd / 2 - 1e-6 && Y > 1e-6 ? Math.sign(Z) : 0;
      p.setXYZ(i, ...deform(X, Y, Z, nx, nz).toArray());
    }
    body.computeVertexNormals();
    metric(body);
    put(c, body, canvasM);
    const rim: V[] = [];
    for (let i = 0; i < 40; i++) { // the hemmed top edge
      const a = (i / 40) * Math.PI * 2, cx = Math.cos(a), cz = Math.sin(a), k = 1 / Math.max(Math.abs(cx), Math.abs(cz));
      rim.push(deform((w / 2) * cx * k, h, (dd / 2) * cz * k));
    }
    put(c, new THREE.TubeGeometry(new THREE.CatmullRomCurve3(rim, true), 80, 0.004, 8, true), canvasM);
    for (const s of [-1, 1]) {
      const at = (x: number, y: number) => deform(x, y, (s * dd) / 2).addScaledVector(new THREE.Vector3(0, 0, s), 0.002);
      strap(c, [at(-0.09, h - 0.09), at(-0.09, h - 0.01), v3([-0.08, h + 0.06, s * 0.04]), v3([-0.04, grip - 0.025, s * 0.012]), v3([0, grip, s * 0.005]),
        v3([0.04, grip - 0.025, s * 0.012]), v3([0.08, h + 0.06, s * 0.04]), at(0.09, h - 0.01), at(0.09, h - 0.09)], 0.025, 0.0025, webbing);
    }
    // contents: a crusty loaf leaning out at the back, a green glass bottle neck at the front
    const loaf = new THREE.CapsuleGeometry(0.045, 0.17, 8, 18).scale(1, 1, 0.85);
    put(c, loaf, c.mats.tinted('#9c6a3a', 0.85), [0.05, h - 0.03, -0.025], -12, 0, -38);
    const glass = solid(c, '#2f4a37', 0.12, { metalness: 0 });
    lathe(c, [[0, h - 0.2], [0.035, h - 0.2], [0.035, h - 0.06], [0.03, h - 0.03], [0.015, h], [0.0135, h + 0.07], [0.015, h + 0.072], [0, h + 0.072]], glass, 28).position.set(-0.08, 0, 0.035);
    lathe(c, [[0, h + 0.068], [0.0155, h + 0.068], [0.0155, h + 0.09], [0.013, h + 0.092], [0, h + 0.092]], c.mats.tinted('#c7c0b0', 0.45), 24).position.set(-0.08, 0, 0.035);
  },

  child: (c) => {
    const skin = c.mats.tinted('#e3b690', 0.7), cloth = c.mats.tinted(c.it.parts.colour ?? '#d0572f', 0.85), pants = c.mats.tinted('#3a5a8c', 0.85), hair = c.mats.tinted('#4a3022', 0.9), shoe = c.mats.tinted('#f2f2ee', 0.6);
    const torso = new THREE.CapsuleGeometry(0.09, 0.2, 8, 20);
    torso.scale(1, 1, 0.78);
    put(c, torso, cloth, [0, 0.555, 0]);
    put(c, new THREE.CapsuleGeometry(0.1, 0.06, 8, 20).scale(1, 1, 0.8), pants, [0, 0.41, 0]);
    for (const s of [-1, 1]) {
      put(c, new THREE.CapsuleGeometry(0.036, 0.29, 6, 14), pants, [s * 0.047, 0.2, 0]);
      bevel(c, [0.07, 0.04, 0.13], shoe, [s * 0.047, 0.02, 0.025], 0.016);
      put(c, new THREE.CapsuleGeometry(0.028, 0.18, 6, 12), cloth, [s * 0.148, 0.6, 0.0], 0, 0, s * -12); // arm
      put(c, new THREE.SphereGeometry(0.03, 14, 10), skin, [s * 0.165, 0.475, 0.0]); // hand
    }
    between(c, [0, 0.7, 0], [0, 0.77, 0], 0.03, skin);
    put(c, new THREE.SphereGeometry(c.dims.head, 28, 20), skin, [0, 0.855, 0]);
    put(c, new THREE.SphereGeometry(c.dims.head + 0.004, 28, 14, 0, Math.PI * 2, 0, Math.PI * 0.55), hair, [0, 0.858, -0.004]);
  },

  suitcase: (c) => {
    const { t, h, w, wheel } = c.dims, shell = c.mats.powder(c.it.parts.colour ?? '#33485e'), y = wheel + h / 2, top = wheel + h;
    bevel(c, [t, h, w], shell, [0, y, 0], 0.035);
    bevel(c, [0.004, h + 0.002, w + 0.002], c.mats.plastic, [0, y, 0], 0.0015); // zip seam, round the case
    for (const s of [-1, 1]) for (let i = -3; i <= 3; i++) bevel(c, [0.006, h - 0.08, 0.014], shell, [s * (t / 2 + 0.0005), y, i * 0.052], 0.003); // ribs
    for (const [sx, sz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
      bevel(c, [0.045, 0.03, 0.045], c.mats.plastic, [sx * 0.07, wheel + 0.005, sz * 0.16], 0.01);
      put(c, new THREE.CylinderGeometry(0.02, 0.02, 0.016, 20), c.mats.rubber, [sx * 0.07, 0.02, sz * 0.16], 0, 0, 90);
      put(c, new THREE.CylinderGeometry(0.009, 0.009, 0.018, 12), c.mats.zinc, [sx * 0.07, 0.02, sz * 0.16], 0, 0, 90);
    }
    bevel(c, [0.06, 0.014, 0.13], c.mats.plastic, [0, top + 0.004, 0], 0.005);
    tube(c, [[0, top + 0.004, -0.06], [0, top + 0.035, -0.055], [0, top + 0.05, 0], [0, top + 0.035, 0.055], [0, top + 0.004, 0.06]], 0.0085, c.mats.plastic);
    between(c, [0, top + 0.0495, -0.055], [0, top + 0.0495, 0.055], 0.0145, c.mats.grip);
    for (const s of [-1, 1]) bevel(c, [0.2, 0.08, 0.006], c.mats.plastic, [0, wheel + 0.08, s * (w / 2 + 0.0)], 0.006); // corner guards, low edge
  },

  gasCylinder: (c) => {
    const r = c.dims.d / 2, cy = c.dims.collarY, brass = c.mats.tinted('#b08d3c', 0.32), shell = solid(c, c.it.parts.colour ?? '#2d6fa8', 0.4, { metalness: 0.2 });
    lathe(c, [[0, 0.056], [0.11, 0.046], [0.147, 0.075], [r, 0.13], [r, 0.34], [0.146, 0.405], [0.115, 0.445], [0.07, 0.468], [0.045, 0.478], [0.045, 0.486]], shell);
    lathe(c, [[0.115, 0.0], [0.122, 0.002], [0.122, 0.052], [0.112, 0.056], [0.11, 0.05], [0.115, 0.0]], c.mats.iron, 32); // foot ring
    for (const y of [0.455, cy]) put(c, new THREE.TorusGeometry(0.1, 0.0085, 10, 40), c.mats.zinc, [0, y, 0], 90); // collar rings
    for (let i = 0; i < 4; i++) { const a = (i * Math.PI) / 2 + Math.PI / 4; between(c, [Math.cos(a) * 0.1, 0.455, Math.sin(a) * 0.1], [Math.cos(a) * 0.1, cy, Math.sin(a) * 0.1], 0.0085, c.mats.zinc, 10); }
    lathe(c, [[0, 0.47], [0.02, 0.47], [0.022, 0.5], [0.03, 0.51], [0.03, 0.545], [0.018, 0.552], [0, 0.552]], brass, 24); // valve
    put(c, new THREE.CylinderGeometry(0.0055, 0.0055, 0.07, 10), brass, [0.03, 0.525, 0], 0, 0, 90); // outlet
    put(c, new THREE.CylinderGeometry(0.03, 0.03, 0.01, 6), c.mats.plastic, [0, 0.56, 0]);
  },

  drawers: (c) => {
    const { w, h, d, drawers } = c.dims, carcass = c.mats.wood('#7b5a3a'), front = c.mats.wood(c.it.parts.colour ?? '#9b7650'), top = c.mats.wood('#6c4d30');
    const plinth = 0.07, slab = 0.03, gap = 0.004, ph = (h - slab - plinth) / drawers;
    bevel(c, [w + 0.02, slab, d + 0.02], top, [0, h - slab / 2, 0.0], 0.008);
    bevel(c, [w - 0.02, h - slab - plinth, d - 0.02], carcass, [0, plinth + (h - slab - plinth) / 2, 0.0], 0.004);
    bevel(c, [w - 0.06, plinth, d - 0.06], c.mats.tinted('#33261a', 0.7), [0, plinth / 2, 0], 0.004);
    for (const s of [-1, 1]) for (const z of [-1, 1]) bevel(c, [0.04, 0.012, 0.04], c.mats.rubber, [s * (w / 2 - 0.05), 0.006, z * (d / 2 - 0.05)], 0.004);
    for (let i = 0; i < drawers; i++) {
      const y = plinth + ph * i + ph / 2;
      bevel(c, [w - 0.05, ph - gap, 0.02], front, [0, y, -d / 2 + 0.002], 0.004);
      for (const s of [-1, 1]) {
        between(c, [s * 0.06 + 0.0, y, -d / 2 - 0.02], [s * 0.06 + 0.0, y, -d / 2 - 0.002], 0.004, c.mats.chrome, 10);
      }
      between(c, [-0.06, y, -d / 2 - 0.02], [0.06, y, -d / 2 - 0.02], 0.0065, c.mats.chrome, 16); // bar pull
    }
  },

  mop: (c) => {
    const { stick, stickD, padW, padD, gripLo, gripHi } = c.dims, micro = solid(c, c.it.parts.colour ?? '#6aa0d0', 1);
    bevel(c, [padW, 0.022, padD], micro, [0, 0.011, 0], 0.009);
    bevel(c, [padW - 0.02, 0.008, padD - 0.016], c.mats.zinc, [0, 0.026, 0], 0.003);
    put(c, new THREE.SphereGeometry(0.018, 18, 12), c.mats.plastic, [0, 0.05, 0]);
    for (const s of [-1, 1]) between(c, [s * 0.025, 0.03, 0], [0, 0.058, 0], 0.005, c.mats.zinc, 10);
    between(c, [0, 0.055, 0], [0, stick, 0], stickD / 2, c.mats.zinc, 20);
    between(c, [0, gripHi - 0.08, 0], [0, gripHi + 0.08, 0], stickD / 2 + 0.004, solid(c, '#2a2a2c', 0.9), 20);
    between(c, [0, gripLo - 0.07, 0], [0, gripLo + 0.07, 0], stickD / 2 + 0.003, solid(c, '#2a2a2c', 0.9), 20);
    put(c, new THREE.CylinderGeometry(0.014, 0.014, 0.01, 16), c.mats.plastic, [0, stick + 0.002, 0]);
  },

  broom: (c) => {
    const { stick, stickD, headW, bristle } = c.dims, wood = c.mats.wood('#c19a6b'), hair = solid(c, c.it.parts.colour ?? '#d8c36a', 0.95);
    bevel(c, [headW, 0.04, 0.06], wood, [0, bristle + 0.02, 0], 0.008);
    const n = 15;
    for (let i = 0; i < n; i++) {
      const u = i / (n - 1) - 0.5, hh = bristle * (0.96 + 0.04 * Math.cos(i * 2.1));
      put(c, new THREE.CylinderGeometry(0.0125, 0.0105, hh, 8), hair, [u * (headW - 0.02), hh / 2, 0], 0, 0, -u * 14);
      put(c, new THREE.CylinderGeometry(0.0125, 0.0105, hh * 0.98, 8), hair, [u * (headW - 0.02) * 0.98, hh / 2, 0.015], 0, 0, -u * 14);
      put(c, new THREE.CylinderGeometry(0.0125, 0.0105, hh * 0.98, 8), hair, [u * (headW - 0.02) * 0.98, hh / 2, -0.015], 0, 0, -u * 14);
    }
    put(c, new THREE.CylinderGeometry(stickD / 2 + 0.002, 0.02, 0.1, 18), c.mats.zinc, [0, bristle + 0.09, 0]);
    between(c, [0, bristle + 0.1, 0], [0, stick, 0], stickD / 2, wood, 20);
    put(c, new THREE.TorusGeometry(0.009, 0.0025, 8, 16), c.mats.rope, [0, stick - 0.03, 0], 90); // hanging cord
  },
};

/** which hand-held model follows how: hanging by one grip (right hand), between both hands, or a stick leaning to the floor */
const SINGLE = new Set(['bucket', 'bag', 'suitcase', 'gasCylinder']);
const STICK = new Set(['mop', 'broom']);

function follower(it: Item, group: THREE.Group, s: number, pose: { at: Vec3 }): Follow {
  const model = it.parts.model, grips = it.grip!.map((g) => v3(g.point));
  const rest = v3(pose.at).multiplyScalar(s);
  if (SINGLE.has(model)) return (h) => {
    group.position.copy(h ? h.r.clone().sub(grips[0].clone().multiplyScalar(s)) : rest);
  };
  if (STICK.has(model)) {
    const gm = grips.reduce((a, b) => a.add(b), new THREE.Vector3()).multiplyScalar(1 / grips.length).y * s;
    return (h) => {
      if (!h) { group.position.copy(rest); return; }
      const mid = h.l.clone().add(h.r).multiplyScalar(0.5);
      const foot = new THREE.Vector3(mid.x, 0, mid.z + Math.sqrt(Math.max(gm * gm - mid.y * mid.y, 0.0025)));
      group.position.copy(foot);
      group.quaternion.setFromUnitVectors(UP, mid.clone().sub(foot).normalize());
    };
  }
  const g0 = grips[0], g1 = grips[grips.length - 1], gm = g0.clone().add(g1).multiplyScalar(0.5);
  return (h) => {
    if (!h) { group.position.copy(rest); return; }
    let dir = h.l.clone().sub(h.r);
    dir.y = 0; // held level, turned with the hand line
    if (dir.lengthSq() < 1e-8) dir = X.clone();
    group.quaternion.setFromUnitVectors(X, dir.normalize());
    group.position.copy(h.l.clone().add(h.r).multiplyScalar(0.5)).sub(gm.clone().multiplyScalar(s).applyQuaternion(group.quaternion));
  };
}

/** draw the task objects (equipment.json `objects` ids) for the body of skel; unknown ids are skipped with a warning */
export function buildObjects(viewer: BodyViewer, ids: string[], placement: Placement, skel: Skeleton, eq: EquipmentJson): Equipment {
  const s = skel.H[skel.names.indexOf('pelvis')][1] / PROTO_ROOT_Y;
  const mats = createMats(), geos: THREE.BufferGeometry[] = [], own: THREE.Material[] = [];
  const root = new THREE.Group(), follows: Follow[] = [];
  for (const id of ids) {
    const it = eq.objects.find((o) => o.id === id), recipe = it && RECIPES[it.parts.model];
    if (!it || !recipe) { console.warn(`Objects: nothing to draw for "${id}"`); continue; }
    const pose = itemPose(it, placement), group = new THREE.Group();
    group.position.copy(v3(pose.at).multiplyScalar(s));
    group.scale.setScalar(s);
    group.rotation.y = pose.yaw * D;
    root.add(group);
    recipe({ it, g: group, mats, dims: it.parts.dims, geos, own });
    if (it.kind === 'fixed') {
      let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
      for (const c of it.colliders) if (c.box) { x0 = Math.min(x0, c.box.center[0] - c.box.size[0] / 2); x1 = Math.max(x1, c.box.center[0] + c.box.size[0] / 2); z0 = Math.min(z0, c.box.center[2] - c.box.size[2] / 2); z1 = Math.max(z1, c.box.center[2] + c.box.size[2] / 2); }
      const sh = new THREE.Mesh(new THREE.PlaneGeometry(x1 - x0 + 0.3, z1 - z0 + 0.3), mats.shadow);
      sh.rotation.x = -Math.PI / 2;
      sh.position.set((x0 + x1) / 2, 0.0015, (z0 + z1) / 2);
      geos.push(sh.geometry);
      group.add(sh);
    } else follows.push(follower(it, group, s, pose));
  }
  viewer.addOverlay(root);
  mats.setEnv((root.parent as THREE.Scene | null)?.environment ?? null);
  root.updateMatrixWorld(true);
  for (const f of follows) f(null);

  const iL = skel.names.indexOf('hand_l'), iR = skel.names.indexOf('hand_r');
  const grip = (f: Posed, i: number) => { // the prototype's wrist + 6 cm down the hand (as equipment.ts)
    const head = v3(mv(f.Rs[i], skel.H[i] as Vec3)).add(v3(f.ts[i])), tail = v3(mv(f.Rs[i], skel.T[i] as Vec3)).add(v3(f.ts[i]));
    return head.add(tail.sub(head).normalize().multiplyScalar(0.06 * s));
  };
  return {
    update(f) {
      root.updateMatrixWorld(true);
      const h = { l: grip(f, iL), r: grip(f, iR) };
      for (const fn of follows) fn(h);
      viewer.addOverlay(root); // redraw
    },
    dispose() {
      viewer.removeOverlay(root);
      for (const g of geos) g.dispose();
      for (const m of own) m.dispose();
      mats.dispose();
    },
  };
}

/** a mixed list: gym items through buildEquipment, task objects through buildObjects */
export function buildProps(viewer: BodyViewer, ids: string[], placement: Placement, skel: Skeleton, eq: EquipmentJson): Equipment {
  const isObj = (id: string) => eq.objects.some((o) => o.id === id);
  const parts = [buildEquipment(viewer, ids.filter((i) => !isObj(i) && findItem(eq, i)), placement, skel, eq), buildObjects(viewer, ids.filter(isObj), placement, skel, eq)];
  return { update: (f) => parts.forEach((p) => p.update(f)), dispose: () => parts.forEach((p) => p.dispose()) };
}
