// Exercise and task props (R8/R9): simple shapes as the prototype's (prototype/index.html "props", updateProps).
// Not anatomy, so no "simplified" label. Fixed props sit in prototype coordinates scaled by the body (rest pelvis
// height / the prototype's 0.965); hand-held props follow the posed hands every frame.
import * as THREE from 'three';
import type { BodyViewer } from '../../body/scene';
import type { Vec3 } from '../../rig/ik';
import { mv, type M3, type Posed, type Skeleton } from '../../rig/skeleton';

const D = Math.PI / 180;
const UP = new THREE.Vector3(0, 1, 0);

export interface Props {
  /** place the hand-held props for posed f (fk with ground, as the viewer draws) */
  update(f: Posed): void;
  dispose(): void;
}

export function createProps(viewer: BodyViewer, names: string[], skel: Skeleton): Props {
  const s = skel.H[skel.names.indexOf('pelvis')][1] / 0.965;
  const propMat = new THREE.MeshStandardMaterial({ color: 0x8fa39c, roughness: 0.9 });
  const ironMat = new THREE.MeshStandardMaterial({ color: 0x3b4a46, roughness: 0.5, metalness: 0.4 });
  const geos: THREE.BufferGeometry[] = [];
  const mesh = (g: THREE.BufferGeometry, mat: THREE.Material) => { geos.push(g); return new THREE.Mesh(g, mat); };
  const box = (w: number, h: number, d: number, x = 0, y = 0, z = 0, rx = 0) => {
    const m = mesh(new THREE.BoxGeometry(w * s, h * s, d * s), propMat);
    m.position.set(x * s, y * s, z * s);
    m.rotation.x = rx * D;
    return m;
  };
  const cyl = (r: number, len: number, mat = ironMat) => mesh(new THREE.CylinderGeometry(r * s, r * s, len * s, 16), mat);
  const dumbbell = () => {
    const g = new THREE.Group(), bar = cyl(0.013, 0.16);
    bar.rotation.x = 90 * D;
    g.add(bar);
    for (const z of [-0.08, 0.08]) {
      const e = mesh(new THREE.SphereGeometry(0.04 * s, 14, 10), ironMat);
      e.position.z = z * s;
      g.add(e);
    }
    return g;
  };

  const make: Record<string, () => THREE.Object3D> = {
    seat: () => box(0.44, 0.42, 0.42, 0, 0.21, 0.1),
    back: () => box(0.4, 0.62, 0.05, 0, 0.74, -0.16),
    bench: () => box(0.32, 0.45, 1.25, 0, 0.225, -0.36),
    pad: () => box(0.5, 0.05, 0.36, 0, 0.75, 0.2, 40),
    reclineBack: () => box(0.42, 0.72, 0.06, 0, 0.68, -0.29, -35),
    reclineSeat: () => box(0.42, 0.06, 0.3, 0, 0.4, 0.05, -35),
    pullbar: () => { const m = cyl(0.016, 1.3); m.rotation.z = 90 * D; m.position.set(0, 2.15 * s, 0); return m; },
    shelf: () => box(0.8, 0.03, 0.3, 0, 1.98, 0.42),
    step1: () => box(0.7, 0.18, 0.28, 0, 0.09, 0.24),
    step2: () => box(0.7, 0.36, 0.28, 0, 0.18, 0.52),
    bar: () => {
      const g = new THREE.Group();
      g.add(cyl(0.014, 1.5));
      for (const y of [-0.62, 0.62]) {
        const p = mesh(new THREE.CylinderGeometry(0.11 * s, 0.11 * s, 0.035 * s, 24), ironMat);
        p.position.y = y * s;
        g.add(p);
      }
      return g;
    },
    handle: () => cyl(0.013, 0.62),
    mop: () => {
      const g = new THREE.Group(); // stick (child 0) and head (child 1) in world coordinates
      g.add(cyl(0.012, 1.35, propMat), box(0.3, 0.03, 0.1));
      return g;
    },
    bucket: () => mesh(new THREE.CylinderGeometry(0.13 * s, 0.105 * s, 0.24 * s, 20), propMat),
    bucketR: () => mesh(new THREE.CylinderGeometry(0.13 * s, 0.105 * s, 0.24 * s, 20), propMat),
    bagL: () => box(0.1, 0.28, 0.24),
    bagR: () => box(0.1, 0.28, 0.24),
    box: () => box(0.36, 0.22, 0.26),
    dbL: dumbbell,
    dbR: dumbbell,
  };
  const group = new THREE.Group();
  const objs: Record<string, THREE.Object3D> = {};
  for (const n of names) {
    if (!make[n]) { console.warn(`Props: unknown prop "${n}"`); continue; }
    group.add((objs[n] = make[n]()));
  }
  viewer.addOverlay(group);

  // a point down the posed hand (the prototype's wrist + 6 cm), and the hand's skin rotation
  const iL = skel.names.indexOf('hand_l'), iR = skel.names.indexOf('hand_r');
  const grip = (f: Posed, i: number): THREE.Vector3 => {
    const at = (X: readonly Vec3[]) => new THREE.Vector3(...mv(f.Rs[i], X[i] as Vec3)).add(new THREE.Vector3(...f.ts[i]));
    const head = at(skel.H), tail = at(skel.T);
    return head.add(tail.sub(head).normalize().multiplyScalar(0.06 * s));
  };
  const rot = (R: M3) => new THREE.Quaternion().setFromRotationMatrix(
    new THREE.Matrix4().set(R[0], R[1], R[2], 0, R[3], R[4], R[5], 0, R[6], R[7], R[8], 0, 0, 0, 0, 1));
  const between = (o: THREE.Object3D, a: THREE.Vector3, b: THREE.Vector3) => {
    o.position.copy(a).add(b).multiplyScalar(0.5);
    o.quaternion.setFromUnitVectors(UP, b.clone().sub(a).normalize());
  };

  return {
    update(f) {
      const a = grip(f, iL), b = grip(f, iR), mid = a.clone().add(b).multiplyScalar(0.5);
      const o = objs;
      if (o.bar) between(o.bar, b, a);
      if (o.handle) between(o.handle, b, a);
      if (o.bucket) o.bucket.position.set(mid.x, Math.max(0.12 * s, mid.y - 0.16 * s), mid.z);
      if (o.bucketR) o.bucketR.position.set(b.x, Math.max(0.12 * s, b.y - 0.17 * s), b.z);
      if (o.bagL) o.bagL.position.set(a.x, a.y - 0.17 * s, a.z);
      if (o.bagR) o.bagR.position.set(b.x, b.y - 0.17 * s, b.z);
      if (o.box) o.box.position.set(mid.x, mid.y, mid.z + 0.02 * s);
      if (o.mop) {
        const foot = new THREE.Vector3(mid.x * 0.3, 0.03 * s, mid.z + 0.72 * s);
        between(o.mop.children[0], foot, mid.clone().add(new THREE.Vector3(0, 0.12 * s, -0.1 * s)));
        o.mop.children[1].position.set(foot.x, 0.015 * s, foot.z);
      }
      for (const [n, p, i] of [['dbL', a, iL], ['dbR', b, iR]] as const) {
        if (!o[n]) continue;
        o[n].position.copy(p);
        o[n].quaternion.copy(rot(f.Rs[i]));
      }
      viewer.addOverlay(group); // redraw
    },
    dispose() {
      viewer.removeOverlay(group);
      for (const g of geos) g.dispose();
      propMat.dispose();
      ironMat.dispose();
    },
  };
}
