// Gym equipment built in code (R5 T3, plan 2b.3): every item is drawn from public/data/equipment.json. The colliders
// are drawn as they are (look: steel, chrome, cushion, roller, stack…), so what you see is what the form checks test;
// each item's recipe adds the detail (rack holes, J-cups, plates, pulleys, cables, wheels) from parts.dims. Fixed items
// sit at their prototype-coordinate place × the body scale s (as props.ts); hand-held items follow the posed hands;
// cable attachments, lat bar, leg-press sled and leg-extension/curl levers follow the body too and have no collider;
// with no body (f(null), the contact sheet) they sit in their rest place: attachment clipped under the pulley, lat bar
// hanging on its cable, sled on its stops, levers in the start position.
// Static parts are merged per material (one draw per material per item).
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { BodyViewer } from '../../body/scene';
import { findItem, itemPose, rotX, type Collider, type EquipmentJson, type Item, type Placement } from '../../library/equipment';
import type { Vec3 } from '../../rig/ik';
import { PROTO_ROOT_Y } from '../../rig/pose';
import { mv, type M3, type Posed, type Skeleton } from '../../rig/skeleton';
import { createMats, KNURL_PITCH, type Mats } from './materials';

const D = Math.PI / 180;
const UP = new THREE.Vector3(0, 1, 0);
const X = new THREE.Vector3(1, 0, 0);
type V = THREE.Vector3;
const v3 = (a: readonly number[]) => new THREE.Vector3(a[0], a[1], a[2]);

export interface Equipment {
  /** move the following parts to posed f (fk with ground, as the viewer draws) */
  update(f: Posed): void;
  dispose(): void;
}

/** world points the moving parts follow */
interface Body { handL: V; handR: V; qL: THREE.Quaternion; qR: THREE.Quaternion; shinL: V; shinR: V; ballL: V; ballR: V }
type Follow = (b: Body | null) => void;

// ---- geometry helpers ----
type Kit = { add(g: THREE.BufferGeometry, m: THREE.Material, at?: THREE.Matrix4): void; into(o: THREE.Object3D): void };
function kit(geos: THREE.BufferGeometry[]): Kit {
  const by = new Map<THREE.Material, THREE.BufferGeometry[]>();
  return {
    add(g, m, at) {
      if (at) g.applyMatrix4(at);
      const n = g.index ? g.toNonIndexed() : g;
      if (n !== g) g.dispose();
      for (const k of Object.keys(n.attributes)) if (k !== 'position' && k !== 'normal' && k !== 'uv') n.deleteAttribute(k);
      if (!by.has(m)) by.set(m, []);
      by.get(m)!.push(n);
    },
    into(o) {
      for (const [m, list] of by) {
        const g = mergeGeometries(list);
        if (!g) throw new Error('equipment: geometries do not merge');
        for (const x of list) x.dispose();
        geos.push(g);
        o.add(new THREE.Mesh(g, m));
      }
      by.clear();
    },
  };
}
const M = (p: readonly number[] = [0, 0, 0], rx = 0, ry = 0, rz = 0) => new THREE.Matrix4().compose(v3(p),
  new THREE.Quaternion().setFromEuler(new THREE.Euler(rx * D, ry * D, rz * D)), new THREE.Vector3(1, 1, 1));
/** matrix putting a y-axis geometry from a to b */
const span = (a: V, b: V) => {
  const d = b.clone().sub(a), len = d.length();
  return { len, m: new THREE.Matrix4().compose(a.clone().add(b).multiplyScalar(0.5),
    new THREE.Quaternion().setFromUnitVectors(UP, len > 1e-9 ? d.divideScalar(len) : UP), new THREE.Vector3(1, 1, 1)) };
};
const rbox = (s: readonly number[], r = 0.008) => new RoundedBoxGeometry(s[0], s[1], s[2], 2, Math.max(0.0005, Math.min(r, Math.min(...s) / 2 - 0.0005)));
const rod = (k: Kit, a: V, b: V, r: number, m: THREE.Material, seg = 16) => {
  const { len, m: at } = span(a, b);
  k.add(new THREE.CylinderGeometry(r, r, len, seg), m, at);
};
const knurlRod = (k: Kit, a: V, b: V, r: number, mats: Mats) => {
  const { len, m: at } = span(a, b);
  const g = new THREE.CylinderGeometry(r, r, len, 24, 1, true), uv = g.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 2 * Math.PI * r / KNURL_PITCH, uv.getY(i) * len / KNURL_PITCH);
  k.add(g, mats.knurl, at);
};
/** one material group of a non-indexed geometry (ExtrudeGeometry: 0 = faces, 1 = side walls) as its own geometry */
const groupPart = (g: THREE.BufferGeometry, i: number) => {
  const { start, count } = g.groups[i], o = new THREE.BufferGeometry();
  for (const n of ['position', 'normal', 'uv']) {
    const a = g.getAttribute(n) as THREE.BufferAttribute;
    o.setAttribute(n, new THREE.BufferAttribute(a.array.slice(start * a.itemSize, (start + count) * a.itemSize), a.itemSize));
  }
  return o;
};
const lathe = (pts: [number, number][], seg = 40) => new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(r, y)), seg);
const tube = (pts: number[][], r: number, seg = 48, radial = 12) =>
  new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts.map(v3), false, 'centripetal'), seg, r, radial);
/** basis matrix: x along a hand line, y toward a point (cable), at origin o */
const basis = (o: V, x: V, toward: V) => {
  const xx = x.lengthSq() > 1e-8 ? x.clone().normalize() : X.clone();
  const y = toward.clone().sub(o);
  y.addScaledVector(xx, -y.dot(xx));
  if (y.lengthSq() < 1e-8) y.copy(UP);
  y.normalize();
  return new THREE.Matrix4().makeBasis(xx, y, xx.clone().cross(y)).setPosition(o);
};
/** a unit cylinder along y, stretched each frame from a to b */
function line(group: THREE.Object3D, r: number, m: THREE.Material, geos: THREE.BufferGeometry[]) {
  const g = new THREE.CylinderGeometry(r, r, 1, 8, 1, true);
  geos.push(g);
  const mesh = new THREE.Mesh(g, m);
  group.add(mesh);
  return (a: V, b: V) => {
    const d = b.clone().sub(a), len = Math.max(1e-6, d.length());
    mesh.position.copy(a).add(b).multiplyScalar(0.5);
    mesh.quaternion.setFromUnitVectors(UP, d.divideScalar(len));
    mesh.scale.set(1, len, 1);
  };
}

/** upholstered pad filling box size (thin axis = y or z; the face is the + side), board underneath */
function cushion(k: Kit, size: readonly number[], mats: Mats, at: THREE.Matrix4, hex?: string) {
  const thinZ = size[2] < size[1];
  const w = size[0], t = thinZ ? size[2] : size[1], d = thinZ ? size[1] : size[2];
  const pre = thinZ ? M([0, 0, 0], 90) : new THREE.Matrix4(); // build with the face up, then stand it up
  const board = 0.014, ct = t - board;
  const g = new RoundedBoxGeometry(w, ct, d, 5, Math.min(0.028, ct / 2 - 0.001));
  const p = g.attributes.position, uv = g.attributes.uv;
  for (let i = 0; i < p.count; i++) uv.setXY(i, (p.getX(i) + w / 2) / w, 1 - (p.getZ(i) + d / 2) / d);
  k.add(g, mats.upholstery(w, d, hex), at.clone().multiply(pre).multiply(M([0, board / 2, 0])));
  k.add(rbox([w - 0.02, board, d - 0.02], 0.004), mats.plastic, at.clone().multiply(pre).multiply(M([0, -t / 2 + board / 2, 0])));
}
function roller(k: Kit, a: V, b: V, r: number, mats: Mats) {
  const { len, m } = span(a, b), h = len / 2;
  k.add(lathe([[0, -h], [r * 0.82, -h], [r * 0.97, -h + r * 0.12], [r, -h + r * 0.4], [r, h - r * 0.4], [r * 0.97, h - r * 0.12], [r * 0.82, h], [0, h]], 32), mats.vinyl, m);
  for (const y of [-h, h]) k.add(new THREE.CylinderGeometry(r * 0.32, r * 0.32, 0.006, 20), mats.chrome, m.clone().multiply(M([0, y, 0])));
}
/** selectorised weight stack: plates, head plate, guide rods to rodTop (item y), selector pin, lift rod */
function stack(k: Kit, c: Collider, mats: Mats, rodTop: number) {
  const { center, size } = c.box!, [w, h, d] = size, y0 = center[1] - h / 2;
  const at = (x: number, y: number, z: number) => M([center[0] + x, y, center[2] + z]);
  const n = Math.floor((h - 0.06) / 0.026);
  for (const x of [-w / 2 + 0.05, w / 2 - 0.05]) k.add(new THREE.CylinderGeometry(0.02, 0.022, 0.03, 16), mats.rubber, at(x, y0 + 0.015, 0));
  for (let i = 0; i < n; i++) k.add(rbox([w, 0.022, d], 0.004), mats.iron, at(0, y0 + 0.03 + 0.011 + i * 0.026, 0));
  const top = y0 + 0.03 + n * 0.026;
  k.add(rbox([w - 0.02, 0.03, d - 0.01], 0.006), mats.zinc, at(0, top + 0.015, 0));
  for (const x of [-w / 2 + 0.035, w / 2 - 0.035]) rod(k, v3([center[0] + x, y0, center[2]]), v3([center[0] + x, rodTop, center[2]]), 0.0125, mats.chrome);
  rod(k, v3([center[0], top + 0.03, center[2]]), v3([center[0], top + 0.15, center[2]]), 0.011, mats.chrome);
  const pinY = top - 0.026 * 5;
  rod(k, v3([center[0], pinY, center[2] + d / 2]), v3([center[0], pinY, center[2] + d / 2 + 0.05]), 0.005, mats.chrome);
  k.add(new THREE.SphereGeometry(0.014, 16, 12), mats.tinted('#b3261e', 0.4), at(0, pinY, d / 2 + 0.06));
}
/** plastic end caps on the ends of a box tube along its long horizontal axis */
function caps(k: Kit, c: Collider, mats: Mats) {
  const { center, size } = c.box!, along = size[0] > size[2] ? 0 : 2, o = [...center];
  for (const s of [-1, 1]) {
    o[along] = center[along] + s * (size[along] / 2 + 0.003);
    k.add(rbox(along === 0 ? [0.008, size[1] + 0.004, size[2] + 0.004] : [size[0] + 0.004, size[1] + 0.004, 0.008], 0.003), mats.plastic, M(o));
  }
}
function pulley(k: Kit, mats: Mats, paint: THREE.Material, c: V, r: number) {
  k.add(new THREE.CylinderGeometry(r, r, 0.024, 32), mats.nylon, M([c.x, c.y, c.z], 0, 0, 90));
  k.add(new THREE.TorusGeometry(r * 0.78, 0.004, 8, 32), mats.zinc, M([c.x, c.y, c.z], 0, 90));
  for (const s of [-1, 1]) k.add(rbox([0.006, r * 2.4, r * 2.4], 0.004), paint, M([c.x + s * 0.02, c.y, c.z]));
  rod(k, v3([c.x - 0.03, c.y, c.z]), v3([c.x + 0.03, c.y, c.z]), 0.006, mats.chrome);
}

/** draw a collider by its look; hinge = the adjust-angle turn for hinged parts */
function drawCollider(k: Kit, c: Collider, mats: Mats, paint: THREE.Material, hinge: THREE.Matrix4, rodTop: number) {
  const look = c.look ?? 'steel';
  if (look === 'none') return;
  const h = c.hinge ? hinge : new THREE.Matrix4();
  if (c.box) {
    const at = h.clone().multiply(M(c.box.center, c.box.rx ?? 0));
    if (look === 'cushion') cushion(k, c.box.size, mats, at);
    else if (look === 'stack') stack(k, c, mats, rodTop);
    else k.add(rbox(c.box.size), look === 'chrome' ? mats.chrome : look === 'zinc' ? mats.zinc : paint, at);
  } else if (c.capsule) {
    const a = v3(c.capsule.a).applyMatrix4(h), b = v3(c.capsule.b).applyMatrix4(h), r = c.capsule.r;
    if (look === 'roller') roller(k, a, b, r, mats);
    else if (look === 'knurl') knurlRod(k, a, b, r, mats);
    else rod(k, a, b, r, look === 'grip' ? mats.grip : look === 'chrome' ? mats.chrome : look === 'zinc' ? mats.zinc : paint, 24);
  }
}

// ---- recipes: detail beyond the colliders, and the parts that follow the body ----
interface Ctx {
  it: Item; k: Kit; mats: Mats; paint: THREE.Material; dims: Record<string, number>;
  angle: number; height: number; hinge: THREE.Matrix4;
  col(name: string): Collider;
  /** a moving sub-group of the item with its own merged kit */
  part(): { g: THREE.Group; k: Kit };
  /** world → item coordinates */
  local(w: V): V;
  geos: THREE.BufferGeometry[];
}
type Recipe = (c: Ctx) => Follow | void;

const hexHead = (flats: number, len: number, bevel = 0.005) => {
  const R = flats / Math.sqrt(3) - bevel, s = new THREE.Shape();
  for (let i = 0; i <= 6; i++) s[i ? 'lineTo' : 'moveTo'](R * Math.cos(i * 60 * D), R * Math.sin(i * 60 * D));
  return new THREE.ExtrudeGeometry(s, { depth: len - 2 * bevel, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 3 });
};
function plate(k: Kit, mats: Mats, x0: number, t: number, R: number, rubber: boolean, base = new THREE.Matrix4()) {
  // rubber bumper: raised rim lip, recessed face; iron: thinner rim, recessed centre. Built along +y, turned to +x.
  const turn = base.clone().multiply(M([0, 0, 0], 0, 0, -90)), h = t / 2, y = x0 + h;
  const prof: [number, number][] = rubber
    ? [[0.0655, y - h + 0.002], [R - 0.035, y - h + 0.002], [R - 0.02, y - h], [R - 0.003, y - h], [R, y - h + 0.003], [R, y + h - 0.003], [R - 0.003, y + h], [R - 0.02, y + h], [R - 0.035, y + h - 0.002], [0.0655, y + h - 0.002], [0.0655, y - h + 0.002]]
    : [[0.0655, y - h], [0.09, y - h], [0.1, y - h + 0.008], [R - 0.03, y - h + 0.008], [R - 0.02, y - h], [R, y - h + 0.003], [R, y + h - 0.003], [R - 0.02, y + h], [R - 0.03, y + h - 0.008], [0.1, y + h - 0.008], [0.09, y + h], [0.0655, y + h], [0.0655, y - h]];
  k.add(lathe(prof, 64), rubber ? mats.rubber : mats.iron, turn);
  k.add(lathe([[0.0253, y - h - 0.001], [0.068, y - h - 0.001], [0.068, y + h + 0.001], [0.0253, y + h + 0.001], [0.0253, y - h - 0.001]], 48), mats.zinc, turn);
}

/** attachments hang from their origin (the cable end) with the grip along x below it */
function attachment(kind: string, k: Kit, mats: Mats, dims: Record<string, number>) {
  if (kind === 'bar') {
    knurlRod(k, v3([-dims.barLen / 2, -0.07, 0]), v3([dims.barLen / 2, -0.07, 0]), 0.014, mats);
    for (const s of [-1, 1]) k.add(new THREE.CylinderGeometry(0.016, 0.016, 0.01, 20), mats.chrome, M([s * (dims.barLen / 2 + 0.005), -0.07, 0], 0, 0, 90));
    rod(k, v3([0, -0.07, 0]), v3([0, -0.012, 0]), 0.008, mats.chrome);
  } else if (kind === 'rope') {
    for (const s of [-1, 1]) {
      const end = v3([s * 0.05, -0.03 - dims.ropeLen, 0]);
      rod(k, v3([0, -0.04, 0]), end, 0.014, mats.rope, 12);
      k.add(new THREE.CylinderGeometry(0.022, 0.024, 0.045, 20), mats.rubber, M([end.x, end.y - 0.02, end.z]));
    }
    k.add(new THREE.CylinderGeometry(0.018, 0.018, 0.05, 20), mats.chrome, M([0, -0.035, 0]));
  } else { // D-handle
    const w = dims.handleW;
    rod(k, v3([-w / 2, -0.11, 0]), v3([w / 2, -0.11, 0]), 0.017, mats.grip, 20);
    for (const s of [-1, 1]) rod(k, v3([s * (w / 2 + 0.006), -0.11, 0]), v3([0, -0.014, 0]), 0.006, mats.chrome);
  }
  k.add(new THREE.TorusGeometry(0.012, 0.0035, 8, 20), mats.chrome, M([0, 0, 0]));
}
const DROP: Record<string, number> = { bar: 0.07, rope: 0.12, handle: 0.11 };

/** cable from a pulley to an attachment that follows the hands (cable column, lat machine). With no hands the
 *  attachment hangs straight down with its cable end at restO (just under the pulley: clipped on the carriage) */
function cableFollow(c: Ctx, g: THREE.Group, pulleyC: V, r: number, drop: number, ring: number, restO: V, rope: boolean): Follow {
  const cab = line(c.part().g, c.dims.cableD / 2, c.mats.cable, c.geos);
  const live = c.part().g; // the rope drawn live: strands from the swivel to each hand, stoppers past the hands
  const strands = rope ? [0, 1].map(() => line(live, 0.014, c.mats.rope, c.geos)) : [];
  const stoppers = rope ? [0, 1].map(() => {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.024, 0.045, 20), c.mats.rubber);
    c.geos.push(m.geometry);
    live.add(m);
    return m;
  }) : [];
  const restMid = restO.clone().add(new THREE.Vector3(0, -(drop + ring), 0));
  return (b) => {
    const hl = b ? c.local(b.handL) : restMid.clone().add(new THREE.Vector3(0.1, 0, 0));
    const hr = b ? c.local(b.handR) : restMid.clone().add(new THREE.Vector3(-0.1, 0, 0));
    const mid = hl.clone().add(hr).multiplyScalar(0.5);
    const bm = basis(mid, hl.clone().sub(hr), pulleyC);
    const o = new THREE.Vector3(0, drop + ring, 0).applyMatrix4(bm); // the cable end
    const drawn = rope && !!b;
    g.visible = !drawn;
    live.visible = drawn;
    if (drawn) {
      strands[0](o, hl);
      strands[1](o, hr);
      for (const [m, hnd] of [[stoppers[0], hl], [stoppers[1], hr]] as const) {
        const d = hnd.clone().sub(o).normalize();
        m.position.copy(hnd).addScaledVector(d, 0.05);
        m.quaternion.setFromUnitVectors(UP, d);
      }
    } else {
      g.matrixAutoUpdate = false;
      g.matrix.copy(bm.multiply(M([0, drop, 0])));
    }
    cab(pulleyC.clone().addScaledVector(o.clone().sub(pulleyC).normalize(), r), o);
  };
}

/** a lever turning about x through (pivotY, pivotZ) so its pad meets the lower shins (leg extension, leg curl) */
function leverFollow(c: Ctx): Follow {
  const { pivotY, pivotZ, leverX, leverLen: L, padR, padHalf, padSide } = c.dims;
  const { g, k } = c.part();
  g.position.set(0, pivotY, pivotZ);
  k.add(rbox([0.03, L + 0.05, 0.05], 0.006), c.paint, M([leverX + 0.02, -L / 2, 0]));
  rod(k, v3([leverX + 0.02, -L, 0]), v3([-padHalf, -L, 0]), 0.018, c.paint);
  roller(k, v3([-padHalf, -L, 0]), v3([padHalf, -L, 0]), padR, c.mats);
  k.into(g);
  const delta = Math.atan2(padR + 0.05, L);
  return (b) => {
    let phi = padSide > 0 ? 0 : Math.PI / 2;
    if (b) {
      const s = c.local(b.shinL).add(c.local(b.shinR)).multiplyScalar(0.5);
      phi = Math.atan2(-(s.z - pivotZ), -(s.y - pivotY));
    }
    g.rotation.x = phi - padSide * delta;
  };
}

/** cam housing on the lever axis, cable from the side stack to the cam, and the lever that follows the shins */
function camLever(c: Ctx): Follow {
  const { k, mats, paint, dims } = c;
  const cam = c.col('cam').capsule!;
  rod(k, v3(cam.a), v3(cam.b), cam.r, paint, 40);
  rod(k, v3(cam.a).add(new THREE.Vector3(-0.002, 0, 0)), v3(cam.a).add(new THREE.Vector3(0.004, 0, 0)), 0.03, mats.chrome, 24);
  const stk = c.col('stack').box!, sx = stk.center[0], sz = stk.center[2], top = dims.rodTop - 0.05;
  rod(k, v3([sx, stk.center[1] + stk.size[1] / 2 + 0.15, sz]), v3([sx, top - 0.045, sz]), 0.0025, mats.cable, 8);
  pulley(k, mats, paint, v3([sx, top, sz]), 0.045);
  rod(k, v3([sx, top + 0.045, sz]), v3([cam.a[0] + 0.03, cam.a[1] + 0.07, cam.a[2]]), 0.0025, mats.cable, 8);
  return leverFollow(c);
}

const RECIPES: Record<string, Recipe> = {
  flatBench: ({ k, mats, col }) => { for (const n of ['footFront', 'footRear']) caps(k, col(n), mats); },

  adjustableBench: ({ k, mats, paint, dims, angle, hinge, col }) => {
    caps(k, col('footRear'), mats);
    for (const s of [-1, 1]) { // front wheels
      const p = [s * 0.285, dims.wheelR + 0.004, 0.38];
      k.add(new THREE.CylinderGeometry(dims.wheelR, dims.wheelR, 0.03, 28), mats.rubber, M(p, 0, 0, 90));
      k.add(new THREE.CylinderGeometry(dims.wheelR * 0.45, dims.wheelR * 0.45, 0.032, 20), mats.zinc, M(p, 0, 0, 90));
    }
    k.add(tube([[-0.16, 0.05, -0.6], [-0.16, 0.11, -0.67], [-0.09, 0.13, -0.71], [0.09, 0.13, -0.71], [0.16, 0.11, -0.67], [0.16, 0.05, -0.6]], 0.013), paint);
    rod(k, v3([-0.08, 0.13, -0.71]), v3([0.08, 0.13, -0.71]), 0.017, mats.grip);
    // hinge plates and pin, and the back-pad strut from its ladder notch to the pad
    for (const s of [-1, 1]) k.add(rbox([0.008, 0.09, 0.09], 0.003), paint, M([s * 0.036, 0.37, -0.01]));
    rod(k, v3([-0.05, 0.37, -0.01]), v3([0.05, 0.37, -0.01]), 0.009, mats.chrome);
    const a = 0.44 - 0.07, top = v3([0, a, dims.strutAt]).applyMatrix4(hinge);
    const t = (angle + 15) / 100, foot = v3([0, 0.22, dims.ladderFrom + (dims.ladderTo - dims.ladderFrom) * t]);
    for (const s of [-1, 1]) {
      const { len, m } = span(foot.clone().setX(s * 0.035), top.clone().setX(s * 0.035));
      k.add(rbox([0.012, len, 0.035], 0.003), paint, m);
    }
    rod(k, foot.clone().setX(-0.05), foot.clone().setX(0.05), 0.008, mats.chrome);
  },

  squatRack: ({ k, mats, paint, dims, it, col }) => {
    for (const c of it.colliders.filter((x) => x.name.startsWith('upright_'))) {
      const [x, , z] = c.box!.center;
      for (const s of [-1, 1]) for (let y = dims.holeFrom; y <= dims.holeTo; y += dims.holeStep)
        k.add(new THREE.CircleGeometry(dims.holeD / 2, 12), mats.hole, M([x, y, z + s * (c.box!.size[2] / 2 + 0.0006)], 0, s > 0 ? 0 : 180));
    }
    for (const n of ['baseLeft', 'baseRight']) caps(k, col(n), mats);
    // J-cups on the inside of the front uprights: mounting plate, cup, front lip; plastic liner in the cup
    const j = new THREE.Shape([[0, -0.07], [0.105, -0.07], [0.105, 0.04], [0.09, 0.04], [0.09, 0], [0.02, 0], [0.02, 0.07], [0, 0.07]].map(([a, b]) => new THREE.Vector2(a, b)));
    for (const n of ['jHookLeft', 'jHookRight']) {
      const { center, size } = col(n).box!, face = center[2] + size[2] / 2;
      const g = new THREE.ExtrudeGeometry(j, { depth: size[0] - 0.006, bevelEnabled: true, bevelThickness: 0.003, bevelSize: 0.003, bevelSegments: 2 });
      k.add(g, paint, M([center[0] - size[0] / 2 + 0.003, center[1], face], 0, 90));
      k.add(rbox([size[0] + 0.002, 0.006, 0.07], 0.002), mats.plastic, M([center[0], center[1] + 0.003, face - 0.055]));
      k.add(rbox([size[0] + 0.002, 0.04, 0.006], 0.002), mats.plastic, M([center[0], center[1] + 0.02, face - 0.087]));
    }
    for (const n of ['safetyLeft', 'safetyRight']) { // pin knobs at the front
      const c = col(n).capsule!;
      k.add(new THREE.SphereGeometry(0.026, 20, 14), mats.plastic, M([c.b[0], c.b[1], c.b[2] + 0.02]));
    }
  },

  barbell: ({ k, mats, dims }) => {
    const turn = (x0: number, x1: number, r: number, knurled: boolean) => {
      for (const s of [-1, 1]) {
        const a = v3([s * x0, 0, 0]), b = v3([s * x1, 0, 0]);
        if (knurled) knurlRod(k, a, b, r, mats); else rod(k, a, b, r, mats.chrome, 24);
      }
    };
    const r = dims.shaftD / 2, R = dims.sleeveD / 2;
    turn(0, dims.knurlIn, r, false);
    turn(dims.knurlIn, dims.markX - 0.005, r, true);
    turn(dims.markX - 0.005, dims.markX + 0.005, r, false);
    turn(dims.markX + 0.005, dims.knurlOut, r, true);
    turn(dims.knurlOut, dims.collarX, r, false);
    const end = dims.length / 2, px = dims.sleeveX, pt = dims.plateT;
    for (const ry of [0, 180]) {
      const side = M([0, 0, 0], 0, ry), turnX = side.clone().multiply(M([0, 0, 0], 0, 0, -90));
      const add = (g: THREE.BufferGeometry, m: THREE.Material, at = turnX) => k.add(g, m, at);
      add(lathe([[r, dims.collarX], [R + 0.001, dims.collarX + 0.001], [R + 0.0075, dims.collarX + 0.004], [R + 0.0075, px - 0.004], [R + 0.001, px], [R, px]], 40), mats.chrome);
      add(lathe([[R, px], [R, end - 0.006], [R - 0.002, end], [0.012, end], [0.012, end - 0.002], [0, end - 0.002]], 40), mats.chrome);
      plate(k, mats, px, pt, dims.plateD / 2, true, side);
      // lever collar after the plate
      const c0 = px + pt + 0.001, c1 = c0 + dims.clampW;
      add(lathe([[R + 0.001, c0], [dims.clampD / 2 - 0.001, c0], [dims.clampD / 2, c0 + 0.004], [dims.clampD / 2, c1 - 0.004], [dims.clampD / 2 - 0.001, c1], [R + 0.001, c1], [R + 0.001, c0]], 40), mats.tinted('#a51d1d', 0.45));
      k.add(rbox([0.03, 0.012, 0.06], 0.004), mats.plastic, side.clone().multiply(M([(c0 + c1) / 2, dims.clampD / 2 + 0.004, 0.012])));
    }
  },

  dumbbell: ({ k, mats, dims, paint }) => {
    const hl = dims.handleLen / 2;
    knurlRod(k, v3([0, 0, -hl + dims.ringT]), v3([0, 0, hl - dims.ringT]), dims.handleD / 2, mats);
    for (const ry of [0, 180]) {
      const side = M([0, 0, 0], 0, ry);
      k.add(lathe([[dims.handleD / 2, hl - dims.ringT], [dims.ringD / 2, hl - dims.ringT + 0.002], [dims.ringD / 2, hl]], 32), mats.chrome, side.clone().multiply(M([0, 0, 0], 90)));
      k.add(hexHead(dims.headFlats, dims.headLen), paint, side.clone().multiply(M([0, 0, hl + 0.005])));
      k.add(new THREE.CylinderGeometry(0.028, 0.028, 0.004, 32), mats.chrome, side.clone().multiply(M([0, 0, hl + dims.headLen + 0.001], 90)));
    }
  },

  kettlebell: ({ k, paint, dims }) => {
    const c = 0.0825, R = dims.bodyD / 2, pts: [number, number][] = [[0, 0], [dims.baseD / 2, 0]];
    for (let a = Math.asin(-c / R); a <= 60 * D + 1e-9; a += (60 * D - Math.asin(-c / R)) / 18) pts.push([R * Math.cos(a), c + R * Math.sin(a)]);
    pts.push([0.035, 0.186], [0, 0.188]);
    k.add(lathe(pts, 48), paint);
    const hx = dims.hornX, gy = dims.gripY;
    k.add(tube([[hx - 0.005, 0.15, 0], [hx + 0.004, 0.2, 0], [hx - 0.008, 0.24, 0], [0.04, gy, 0], [0, gy + 0.001, 0], [-0.04, gy, 0], [-hx + 0.008, 0.24, 0], [-hx - 0.004, 0.2, 0], [-hx + 0.005, 0.15, 0]], dims.handleD / 2, 64, 14), paint);
  },

  cableColumn: (c) => {
    const { k, mats, paint, dims, height: h, it } = c;
    const rail = c.col('rail').box!, rz = rail.center[2] + rail.size[2] / 2;
    for (let y = 0.3; y <= 2.0; y += 0.05) k.add(new THREE.CircleGeometry(0.006, 10), mats.hole, M([0, y, rz + 0.0006]));
    k.add(rbox([0.11, 0.16, 0.11], 0.01), paint, M([0, h, dims.railZ]));
    rod(k, v3([0.055, h + 0.04, dims.railZ]), v3([0.09, h + 0.04, dims.railZ]), 0.005, mats.chrome);
    k.add(new THREE.SphereGeometry(0.014, 16, 12), mats.tinted('#b3261e', 0.4), M([0.095, h + 0.04, dims.railZ]));
    const P = v3([0, h - 0.03, dims.railZ + 0.12]);
    k.add(rbox([0.05, 0.04, 0.07], 0.006), paint, M([0, h - 0.03, dims.railZ + 0.07]));
    pulley(k, mats, paint, P, dims.pulleyR);
    // the cable inside: stack lift rod up to the top pulleys
    const stk = c.col('stack').box!, lift = stk.center[1] - stk.size[1] / 2 + 0.03 + Math.floor((stk.size[1] - 0.06) / 0.026) * 0.026 + 0.18;
    const topY = dims.rodTop - 0.05;
    rod(k, v3([0, lift, stk.center[2]]), v3([0, topY - dims.pulleyR, stk.center[2]]), dims.cableD / 2, mats.cable, 8);
    pulley(k, mats, paint, v3([0, topY, stk.center[2]]), dims.pulleyR);
    pulley(k, mats, paint, v3([0, topY, dims.railZ]), dims.pulleyR);
    rod(k, v3([0, topY + dims.pulleyR, stk.center[2]]), v3([0, topY + dims.pulleyR, dims.railZ]), dims.cableD / 2, mats.cable, 8);
    // spare attachments on hooks on the left upright
    const up = c.col('uprightLeft').box!, hx = up.center[0] + up.size[0] / 2;
    const active = it.parts.attachment ?? 'handle';
    let y = 1.62;
    for (const kind of ['handle', 'rope', 'bar'].filter((x) => x !== active)) {
      k.add(tube([[hx, y, up.center[2]], [hx + 0.05, y, up.center[2]], [hx + 0.065, y + 0.03, up.center[2]]], 0.006, 12, 8), mats.chrome);
      const sk = kit(c.geos);
      attachment(kind, sk, mats, dims);
      const { g } = c.part();
      g.position.set(hx + 0.055, y - 0.012, up.center[2]);
      g.rotation.y = 90 * D;
      sk.into(g);
      y -= kind === 'rope' ? 0.5 : 0.25;
    }
    const { g, k: ak } = c.part();
    attachment(active, ak, mats, dims);
    ak.into(g);
    return cableFollow(c, g, P, dims.pulleyR, DROP[active], 0, P.clone().add(new THREE.Vector3(0, -dims.pulleyR - 0.035, 0)), active === 'rope');
  },

  latMachine: (c) => {
    const { k, mats, paint, dims } = c;
    const P = v3([0, dims.pulleyY, dims.pulleyZ]), Q = v3([0, dims.pulleyY, 0.8]);
    pulley(k, mats, paint, P, dims.pulleyR);
    pulley(k, mats, paint, Q, dims.pulleyR);
    k.add(rbox([0.05, 0.05, 0.06], 0.006), paint, M([0, dims.pulleyY + 0.06, dims.pulleyZ]));
    const stk = c.col('stack').box!;
    rod(k, v3([0, stk.center[1] + stk.size[1] / 2 + 0.15, 0.8]), v3([0, dims.pulleyY - dims.pulleyR, 0.8]), dims.cableD / 2, mats.cable, 8);
    rod(k, v3([0, dims.pulleyY + dims.pulleyR, dims.pulleyZ]), v3([0, dims.pulleyY + dims.pulleyR, 0.8]), dims.cableD / 2, mats.cable, 8); // over the top beam
    // lat bar: straight middle, ends bent down bendDeg, rubber grips on the bends, ring on top
    const { g, k: bk } = c.part();
    const half = dims.barLen / 2, bl = dims.bendLen, st = half - bl * Math.cos(dims.bendDeg * D) - 0.01, dy = bl * Math.sin(dims.bendDeg * D);
    const pts = [[-half, -dy, 0], [-st - 0.03, -0.004, 0], [-st, 0, 0], [0, 0, 0], [st, 0, 0], [st + 0.03, -0.004, 0], [half, -dy, 0]];
    bk.add(tube(pts, dims.barD / 2, 96, 14), mats.chrome);
    for (const s of [-1, 1]) {
      const a = v3([s * (st + 0.06), -dy * 0.3, 0]), b = v3([s * (half - 0.01), -dy + 0.002, 0]);
      rod(bk, a, b, dims.barD / 2 + 0.004, mats.grip, 20);
    }
    rod(bk, v3([0, 0, 0]), v3([0, 0.035, 0]), 0.007, mats.chrome);
    bk.add(new THREE.TorusGeometry(0.012, 0.0035, 8, 20), mats.chrome, M([0, 0.047, 0]));
    bk.into(g);
    // the hands hold the bent grips, about 6 cm below the bar's straight middle; at rest the bar hangs at hangY
    return cableFollow(c, g, P, dims.pulleyR, 0.06, 0.047, v3([0, dims.hangY + 0.06 + 0.047, dims.pulleyZ]), false);
  },

  legPress: (c) => {
    const { k, mats, paint, dims } = c;
    for (const s of [-1, 1]) { // seat handles
      rod(k, v3([s * 0.30, 0.08, 0.05]), v3([s * 0.30, 0.40, 0.05]), 0.02, paint);
      rod(k, v3([s * 0.30, 0.40, -0.06]), v3([s * 0.30, 0.40, 0.20]), 0.016, mats.grip, 20);
    }
    for (const n of ['baseLeft', 'baseRight']) caps(k, c.col(n), mats);
    const rl = c.col('railLeft').box!, rx = rl.rx ?? 0;
    const dir = v3(rotX([0, 0, 1], rx)), up = v3(rotX([0, 1, 0], rx));
    const S0 = v3([0, rl.center[1], rl.center[2]]).addScaledVector(dir, -rl.size[2] / 2).addScaledVector(up, rl.size[1] / 2);
    // the sled in its own frame: z' along the rails, y' off them; footplate at the top end facing the user
    const { g, k: sk } = c.part();
    g.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(X, up, dir));
    const cl = dims.carriageLen, pf = dims.plateFrom, pt2 = dims.plateTo;
    sk.add(rbox([0.62, 0.06, cl], 0.01), paint, M([0, 0.03, cl / 2]));
    for (const s of [-1, 1]) for (const z of [0.07, cl - 0.07]) sk.add(rbox([0.1, 0.05, 0.12], 0.008), mats.plastic, M([s * 0.22, 0.015, z]));
    sk.add(rbox([dims.plateW, pt2 - pf, 0.025], 0.006), paint, M([0, (pf + pt2) / 2, cl - 0.0125]));
    sk.add(rbox([dims.plateW - 0.05, pt2 - pf - 0.05, 0.006], 0.003), mats.rubber, M([0, (pf + pt2) / 2, cl - 0.028]));
    for (const s of [-1, 1]) {
      rod(sk, v3([s * 0.25, 0.06, 0.06]), v3([s * 0.25, pt2 - 0.06, cl]), 0.018, paint);
      const hy = 0.12, hz = cl / 2;
      rod(sk, v3([s * 0.31, hy, hz]), v3([s * (dims.hornX + dims.hornLen), hy, hz]), 0.025, mats.chrome, 24);
      plate(sk, mats, dims.hornX, dims.plateT, dims.plateD / 2, false, M([0, hy, hz], 0, s > 0 ? 0 : 180));
    }
    sk.into(g);
    return (b) => {
      let t = dims.restT; // no feet: the sled sits on its stops in the start position
      if (b) {
        const f = c.local(b.ballL).add(c.local(b.ballR)).multiplyScalar(0.5);
        t = Math.min(dims.travel, Math.max(0, f.sub(S0).dot(dir) - (cl - 0.028)));
      }
      g.position.copy(S0).addScaledVector(dir, t);
    };
  },

  legExtension: (c) => {
    for (const s of [-1, 1]) { // seat handles
      rod(c.k, v3([s * 0.25, 0.5, -0.14]), v3([s * 0.25, 0.5, 0.06]), 0.016, c.mats.grip, 20);
      rod(c.k, v3([s * 0.25, 0.5, -0.04]), v3([s * 0.17, 0.44, -0.04]), 0.014, c.paint);
    }
    return camLever(c);
  },

  legCurl: (c) => camLever(c),

  pullUpRig: ({ k, mats, it }) => {
    for (const c of it.colliders) {
      if (c.name.startsWith('upright')) { const { center, size } = c.box!; k.add(rbox([size[0] + 0.004, 0.008, size[2] + 0.004], 0.003), mats.plastic, M([center[0], center[1] + size[1] / 2 + 0.004, center[2]])); }
      if (c.name.startsWith('foot')) caps(k, c, mats);
      if (c.name === 'bar') for (const p of [c.capsule!.a, c.capsule!.b]) k.add(new THREE.CylinderGeometry(0.018, 0.018, 0.006, 20), mats.chrome, M([p[0] + Math.sign(p[0]) * 0.003, p[1], p[2]], 0, 0, 90));
    }
  },

  plyoBox: ({ k, mats, dims, it, col }) => {
    // plywood panels painted in a dark rubberised finish; the routed ply edges (and hand-hold walls) show the birch
    const { center, size } = col('box').box!, [w, h, d] = size, t = dims.ply, b = 0.004;
    const finish = mats.tinted(it.parts.colour ?? '#33363b', 0.85), wood = mats.wood('#c9a477');
    const rect = (a: number, c: number) => new THREE.Shape([[-a / 2, -c / 2], [a / 2, -c / 2], [a / 2, c / 2], [-a / 2, c / 2]].map(([x, y]) => new THREE.Vector2(x, y)));
    const panel = (s: THREE.Shape, at: THREE.Matrix4) => {
      const g = new THREE.ExtrudeGeometry(s, { depth: t - 2 * b, bevelEnabled: true, bevelThickness: b, bevelSize: b, bevelSegments: 2 });
      k.add(groupPart(g, 0), finish, at); // faces
      k.add(groupPart(g, 1), wood, at); // ply edges, bevels, hole walls
      g.dispose();
    };
    const y0 = center[1] - h / 2;
    for (const y of [y0 + b, y0 + h - t + b]) panel(rect(w, d), M([center[0], y, center[2]], -90));
    for (const s of [-1, 1]) panel(rect(w, h - 2 * t), M([center[0], center[1], center[2] + s * (d / 2 - t / 2) - (t - 2 * b) / 2]));
    for (const s of [-1, 1]) { // the sides carry the routed hand holds
      const sh = rect(d - 2 * t, h - 2 * t), hy = h / 2 - t - dims.slotFromTop, hw = dims.slotW / 2, hh = dims.slotH / 2;
      const hole = new THREE.Path();
      hole.absarc(-hw + hh, hy, hh, Math.PI / 2, Math.PI * 1.5, false);
      hole.absarc(hw - hh, hy, hh, -Math.PI / 2, Math.PI / 2, false);
      sh.holes.push(hole);
      panel(sh, M([center[0] + s * (w / 2 - t / 2) - (t - 2 * b) / 2, center[1], center[2]], 0, 90));
    }
    // non-slip rubber tread on the top, inset from the ply edge (its face 0.5 mm proud of the top surface)
    const pad = rbox([w - 0.03, 0.003, d - 0.03], 0.0012), p = pad.attributes.position, uv = pad.attributes.uv;
    for (let i = 0; i < p.count; i++) uv.setXY(i, p.getX(i), p.getZ(i));
    k.add(pad, mats.tread, M([center[0], y0 + h - 0.001, center[2]]));
  },

  mat: ({ k, mats, dims, it, col }) => {
    // closed-cell foam: rounded rectangle, edges rounded over by bevel = half the thickness, grit top
    const { center, size } = col('mat').box!, [w, h, d] = size, r = dims.cornerR, s = new THREE.Shape(), b = h * 0.4;
    const x = w / 2 - b, y = d / 2 - b;
    s.moveTo(-x + r, -y);
    s.lineTo(x - r, -y); s.quadraticCurveTo(x, -y, x, -y + r);
    s.lineTo(x, y - r); s.quadraticCurveTo(x, y, x - r, y);
    s.lineTo(-x + r, y); s.quadraticCurveTo(-x, y, -x, y - r);
    s.lineTo(-x, -y + r); s.quadraticCurveTo(-x, -y, -x + r, -y);
    const g = new THREE.ExtrudeGeometry(s, { depth: h - 2 * b, bevelEnabled: true, bevelThickness: b, bevelSize: b, bevelSegments: 4, curveSegments: 8 });
    k.add(g, mats.foam(it.parts.colour ?? '#2f4656'), M([center[0], center[1] - h / 2 + b, center[2]], -90));
  },

  band: (c) => {
    // a closed latex loop: two strands from hand to hand (sagging when the hands are closer than restLen, narrowing
    // when stretched) joined round each fist by a half turn (the grip loops). A flat rectangular strap swept round it.
    const { dims, mats, it } = c, n = 40, e = 10, N = 2 * (n + e), R = dims.loopR;
    const g = new THREE.BufferGeometry(), pos = new Float32Array(N * 8 * 3), idx: number[] = [];
    for (let i = 0; i < N; i++) for (let f = 0; f < 4; f++) { // 4 faces, 2 own vertices each per sample (sharp edges)
      const a = i * 8 + 2 * f, b = ((i + 1) % N) * 8 + 2 * f;
      idx.push(a, b, a + 1, a + 1, b, b + 1);
    }
    g.setIndex(idx);
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    c.geos.push(g);
    c.part().g.add(new THREE.Mesh(g, mats.tinted(it.parts.colour ?? '#a82e27', 0.78)));
    const rest = dims.restLen, grip = it.grip!;
    return (b) => {
      // no hands: the band hangs slack between the grip points, a little closer than restLen
      const g0 = v3(grip[0].point), g1 = v3(grip[1].point), gm = g0.clone().add(g1).multiplyScalar(0.5);
      const hl = b ? c.local(b.handL) : gm.clone().lerp(g0, 0.88), hr = b ? c.local(b.handR) : gm.clone().lerp(g1, 0.88);
      const sp = hr.clone().sub(hl), len = Math.max(sp.length(), 1e-3), ax = sp.clone().divideScalar(len);
      const thin = len > rest ? Math.sqrt(rest / len) : 1; // stretched latex narrows
      const sag = len < rest ? Math.sqrt((3 * len * (rest - len)) / 8) : 0;
      const side = ax.clone().cross(UP); // the strap's width runs along the fists (the loop's turning axis)
      if (side.lengthSq() < 1e-8) side.set(0, 0, 1);
      side.normalize();
      const up = side.clone().cross(ax).normalize(); // the loop lies in the plane (ax, up)
      const pts: V[] = [];
      const strand = (s: number, k: number) => { // upper (s 1) or lower (s -1) strand, hl → hr (k 1) or back
        for (let i = 0; i < n; i++) {
          const u = k > 0 ? i / n : 1 - i / n;
          pts.push(hl.clone().addScaledVector(sp, u).addScaledVector(up, s * R - 4 * sag * u * (1 - u) * (s > 0 ? 1 : 1.15)));
        }
      };
      const wrap = (o: V, out: number, from: number) => { // half turn round a fist, outward from the other hand
        for (let i = 0; i < e; i++) {
          const a = from + (Math.PI * i) / e;
          pts.push(o.clone().addScaledVector(up, R * Math.cos(a)).addScaledVector(ax, out * R * Math.sin(a)));
        }
      };
      strand(1, 1); wrap(hr, 1, 0); strand(-1, -1); wrap(hl, -1, Math.PI);
      const W = (dims.width / 2) * thin, T = (dims.thick / 2) * thin;
      for (let i = 0; i < N; i++) {
        const tg = pts[(i + 1) % N].clone().sub(pts[(i + N - 1) % N]).normalize();
        const tw = 0.35 * Math.sin((2 * Math.PI * i) / N + 0.6); // a slight twist along the loop
        const wd = side.clone().addScaledVector(tg, -side.dot(tg)).normalize().applyAxisAngle(tg, tw), nm = tg.clone().cross(wd);
        const cs = [[W, T], [-W, T], [-W, -T], [W, -T]];
        for (let f = 0; f < 4; f++) for (const q of [f, (f + 1) % 4]) {
          const o = (i * 8 + 2 * f + (q === f ? 0 : 1)) * 3, v = pts[i].clone().addScaledVector(wd, cs[q][0]).addScaledVector(nm, cs[q][1]);
          pos[o] = v.x; pos[o + 1] = v.y; pos[o + 2] = v.z;
        }
      }
      g.attributes.position.needsUpdate = true;
      g.computeVertexNormals();
      g.computeBoundingSphere();
    };
  },
};

/** draw the items (equipment.json ids; 'bodyweight' and unknown ids skipped) for the body of skel */
export function buildEquipment(viewer: BodyViewer, items: string[], placement: Placement, skel: Skeleton, eq: EquipmentJson): Equipment {
  const s = skel.H[skel.names.indexOf('pelvis')][1] / PROTO_ROOT_Y;
  const mats = createMats(), geos: THREE.BufferGeometry[] = [];
  const root = new THREE.Group();
  const follows: Follow[] = [];

  for (const id of items) {
    if (id === 'bodyweight') continue;
    const it = findItem(eq, id), recipe = it && RECIPES[it.parts.model];
    if (!it || !recipe) { console.warn(`Equipment: nothing to draw for "${id}"`); continue; }
    const pose = itemPose(it, placement);
    const pivot = v3(it.adjust?.angle?.pivot ?? [0, 0, 0]);
    const hinge = new THREE.Matrix4().makeTranslation(pivot).multiply(new THREE.Matrix4().makeRotationX(pose.angle * D)).multiply(new THREE.Matrix4().makeTranslation(pivot.clone().negate()));
    const paint = createPaint(mats, it);
    const group = new THREE.Group(), k = kit(geos), parts: { g: THREE.Group; k: Kit }[] = [];
    group.position.copy(v3(pose.at).multiplyScalar(s));
    group.rotation.y = pose.yaw * D;
    group.scale.setScalar(s);
    root.add(group);
    const col = (name: string) => {
      const c = it.colliders.find((x) => x.name === name);
      if (!c) throw new Error(`equipment ${it.id}: no collider "${name}"`);
      return c;
    };
    for (const c of it.colliders) drawCollider(k, c, mats, paint, hinge, it.parts.dims.rodTop ?? 0);
    if (it.kind === 'fixed') shadow(k, it, mats);
    const ctx: Ctx = {
      it, k, mats, paint, dims: it.parts.dims, angle: pose.angle, height: pose.height, hinge, col, geos,
      part() { const p = { g: new THREE.Group(), k: kit(geos) }; group.add(p.g); parts.push(p); return p; },
      local: (w) => group.worldToLocal(w.clone()),
    };
    const follow = recipe(ctx);
    k.into(group);
    for (const p of parts) p.k.into(p.g);
    if (it.kind === 'handheld') follows.push(handheld(it, group, s, pose.at));
    if (follow) follows.push(follow);
  }
  viewer.addOverlay(root);
  mats.setEnv((root.parent as THREE.Scene | null)?.environment ?? null);
  root.updateMatrixWorld(true);
  for (const f of follows) f(null);

  const idx = (n: string) => skel.names.indexOf(n);
  const iL = idx('hand_l'), iR = idx('hand_r'), cL = idx('calf_l'), cR = idx('calf_r'), bL = idx('ball_l'), bR = idx('ball_r');
  const pt = (f: Posed, i: number, P: readonly Vec3[]) => v3(mv(f.Rs[i], P[i] as Vec3)).add(v3(f.ts[i]));
  const grip = (f: Posed, i: number) => { // the prototype's wrist + 6 cm down the hand (props.ts)
    const head = pt(f, i, skel.H), tail = pt(f, i, skel.T);
    return head.add(tail.sub(head).normalize().multiplyScalar(0.06 * s));
  };
  const rot = (R: M3) => new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().set(R[0], R[1], R[2], 0, R[3], R[4], R[5], 0, R[6], R[7], R[8], 0, 0, 0, 0, 1));
  const shin = (f: Posed, i: number) => pt(f, i, skel.H).lerp(pt(f, i, skel.T), 0.85);

  return {
    update(f) {
      const b: Body = { handL: grip(f, iL), handR: grip(f, iR), qL: rot(f.Rs[iL]), qR: rot(f.Rs[iR]), shinL: shin(f, cL), shinR: shin(f, cR), ballL: pt(f, bL, skel.H), ballR: pt(f, bR, skel.H) };
      root.updateMatrixWorld(true);
      for (const fn of follows) fn(b);
      viewer.addOverlay(root); // redraw
    },
    dispose() {
      viewer.removeOverlay(root);
      for (const g of geos) g.dispose();
      mats.dispose();
    },
  };
}

function createPaint(mats: Mats, it: Item): THREE.Material {
  return it.parts.model === 'dumbbell' ? mats.rubber : it.parts.model === 'kettlebell' ? mats.tinted(it.parts.colour ?? '#17181a', 0.62) : mats.powder(it.parts.colour ?? '#1b1c1f');
}

/** a soft dark patch under a fixed item (the viewer has no shadow maps) */
function shadow(k: Kit, it: Item, mats: Mats) {
  let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
  for (const c of it.colliders) {
    const pts = c.box ? [[c.box.center[0] - c.box.size[0] / 2, c.box.center[2] - c.box.size[2] / 2], [c.box.center[0] + c.box.size[0] / 2, c.box.center[2] + c.box.size[2] / 2]]
      : [[c.capsule!.a[0], c.capsule!.a[2]], [c.capsule!.b[0], c.capsule!.b[2]]];
    for (const [x, z] of pts) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z); }
  }
  k.add(new THREE.PlaneGeometry(x1 - x0 + 0.3, z1 - z0 + 0.3), mats.shadow, M([(x0 + x1) / 2, 0.0015, (z0 + z1) / 2], -90));
}

/** hand-held items: barbell, kettlebell and band between the hands; one dumbbell in each hand */
function handheld(it: Item, group: THREE.Group, s: number, at: Vec3): Follow {
  const model = it.parts.model;
  if (model === 'dumbbell') {
    const twin = group.clone(); // shares geometry and materials
    group.parent!.add(twin);
    return (b) => {
      if (!b) {
        group.position.copy(v3(at).add(new THREE.Vector3(0.14, 0, 0)).multiplyScalar(s));
        twin.position.copy(v3(at).add(new THREE.Vector3(-0.14, 0, 0)).multiplyScalar(s));
        return;
      }
      group.position.copy(b.handL);
      group.quaternion.copy(b.qL);
      twin.position.copy(b.handR);
      twin.quaternion.copy(b.qR);
    };
  }
  if (model === 'band') return () => {}; // the band writes its strands in its own (placed) frame
  const g0 = v3(it.grip![0].point), g1 = v3(it.grip![it.grip!.length - 1].point), gm = g0.clone().add(g1).multiplyScalar(0.5);
  return (b) => {
    if (!b) return;
    const mid = b.handL.clone().add(b.handR).multiplyScalar(0.5);
    let dir = b.handL.clone().sub(b.handR);
    if (model === 'kettlebell') dir.y = 0; // the bell hangs straight down
    if (dir.lengthSq() < 1e-8) dir = X.clone();
    group.quaternion.setFromUnitVectors(X, dir.normalize());
    group.position.copy(mid).sub(gm.clone().multiplyScalar(s).applyQuaternion(group.quaternion));
  };
}
