// R5 GPU skinning: skin matrices in a float DataTexture (one mat4 per bone, 4 texels per row, column-major), the GLSL
// the materials and the id pass share, and CPU skinning of part boxes for framing.
import * as THREE from 'three';
import type { Posed } from './skeleton';

// Needs uState (the per-part state texture) declared first. Rigid parts store bone index + 1 in the state texture's
// alpha (rig.json partBone); other parts blend bi/bw (weights pack). uSkin 0 = rest: the bind mesh, unchanged.
export const SKIN_GLSL = /* glsl */`
attribute vec4 bi; attribute vec4 bw;
uniform sampler2D uBones; uniform float uSkin;
mat4 boneMat(float b) { int i = int(b + 0.5);
  return mat4(texelFetch(uBones, ivec2(0, i), 0), texelFetch(uBones, ivec2(1, i), 0), texelFetch(uBones, ivec2(2, i), 0), texelFetch(uBones, ivec2(3, i), 0)); }
mat4 bodySkin(float m) {
  if (uSkin < 0.5) return mat4(1.);
  int id = int(m + 0.5);
  int rb = int(texelFetch(uState, ivec2(id % 64, id / 64), 0).a * 255. + 0.5);
  if (rb > 0) return boneMat(float(rb - 1));
  return bw.x * boneMat(bi.x) + bw.y * boneMat(bi.y) + bw.z * boneMat(bi.z) + bw.w * boneMat(bi.w);
}
`;

export function createBoneTexture(bones: number): THREE.DataTexture {
  const t = new THREE.DataTexture(new Float32Array(bones * 16), 4, bones, THREE.RGBAFormat, THREE.FloatType);
  t.magFilter = t.minFilter = THREE.NearestFilter;
  return t;
}

/** Writes v' = Rs · v + ts per bone into the texture as column-major mat4s. */
export function writeBones(tex: THREE.DataTexture, f: Posed): void {
  const d = tex.image.data as Float32Array;
  f.Rs.forEach((R, i) => {
    const o = i * 16, t = f.ts[i];
    for (let c = 0; c < 3; c++) d.set([R[c], R[3 + c], R[6 + c], 0], o + c * 4);
    d.set([t[0], t[1], t[2], 1], o + 12);
  });
  tex.needsUpdate = true;
}

/** Adds each vertex's bone weights to its part's row of w (parts × bones): part-averaged weights for framing. */
export function accumulateWeights(w: Float32Array, bones: number, mid: Uint16Array, bi: Uint8Array, bw: Uint8Array): void {
  for (let v = 0; v < mid.length; v++) for (let k = 0; k < 4; k++) w[mid[v] * bones + bi[v * 4 + k]] += bw[v * 4 + k];
}

/** CPU skinning of a part's rest box with its part-averaged weights (row `id` of w): the box of the 8 moved corners. */
export function skinBox(box: THREE.Box3, w: Float32Array, bones: number, id: number, f: Posed): THREE.Box3 {
  const R = new Array<number>(9).fill(0), t = [0, 0, 0];
  let sum = 0;
  for (let b = 0; b < bones; b++) {
    const x = w[id * bones + b];
    if (!x) continue;
    sum += x;
    for (let k = 0; k < 9; k++) R[k] += x * f.Rs[b][k];
    for (let k = 0; k < 3; k++) t[k] += x * f.ts[b][k];
  }
  if (!sum) return box;
  const m = new THREE.Matrix4().set(R[0], R[1], R[2], t[0], R[3], R[4], R[5], t[1], R[6], R[7], R[8], t[2], 0, 0, 0, sum)
    .multiplyScalar(1 / sum);
  return box.clone().applyMatrix4(m);
}
