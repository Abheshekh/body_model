// R4 GPU id pass (posed by the same GPU skinning as the materials, R5), as the sample's renderIds/idAt: every pickable pack mesh (layer PICK_LAYER) is drawn
// at half the canvas size with a flat id colour (id + 1 in R + G·256; 0 = background) and read back.
import * as THREE from 'three';
import { SKIN_GLSL } from '../rig/skin';

export const PICK_LAYER = 1;
export const SCALE = 2; // id buffer is 1/SCALE of the canvas in each direction

export interface IdPass {
  readonly w: number;
  readonly h: number;
  render(): void;
  /** part id at id-buffer pixel (x, y), top-left origin; -1 for background */
  at(x: number, y: number): number;
  /** fresh id pass, then the part id under client point (x, y), or null */
  pick(x: number, y: number): number | null;
}

type Uniforms = Record<string, THREE.IUniform>; // needs uState, uLo, uSize, uBones, uSkin (the materials' shared uniforms)

export function createIdPass(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.Camera, uniforms: Uniforms): IdPass {
  const canvas = renderer.domElement;
  const mat = new THREE.ShaderMaterial({
    uniforms: { uState: uniforms.uState, uLo: uniforms.uLo, uSize: uniforms.uSize, uBones: uniforms.uBones, uSkin: uniforms.uSkin },
    vertexShader: /* glsl */`
attribute float mid; uniform sampler2D uState; uniform vec3 uLo; uniform vec3 uSize; varying float vMid;
${SKIN_GLSL}
void main() {
  vMid = mid; int i = int(mid + 0.5);
  int vis = int(texelFetch(uState, ivec2(i % 64, i / 64), 0).r * 255.0 + 0.5);
  gl_Position = vis == 1 ? projectionMatrix * modelViewMatrix * (bodySkin(mid) * vec4(uLo + position * uSize, 1.)) : vec4(2., 2., 2., 1.);
}`,
    fragmentShader: /* glsl */`
varying float vMid;
void main() { float id = floor(vMid + 0.5) + 1.; gl_FragColor = vec4(mod(id, 256.) / 255., floor(id / 256.) / 255., 0., 1.); }`,
  });
  mat.toneMapped = false;
  const rt = new THREE.WebGLRenderTarget(1, 1);
  const clear = new THREE.Color();
  let w = 1, h = 1, buf = new Uint8Array(4);

  const render = () => {
    w = Math.max(1, Math.floor(canvas.clientWidth / SCALE));
    h = Math.max(1, Math.floor(canvas.clientHeight / SCALE));
    if (rt.width !== w || rt.height !== h) rt.setSize(w, h);
    if (buf.length !== w * h * 4) buf = new Uint8Array(w * h * 4);
    const bg = scene.background, alpha = renderer.getClearAlpha(), mask = camera.layers.mask;
    renderer.getClearColor(clear);
    scene.background = null;
    scene.overrideMaterial = mat;
    camera.layers.set(PICK_LAYER);
    renderer.setRenderTarget(rt);
    renderer.setClearColor(0, 1);
    renderer.clear();
    renderer.render(scene, camera);
    renderer.setRenderTarget(null);
    renderer.setClearColor(clear, alpha);
    camera.layers.mask = mask;
    scene.overrideMaterial = null;
    scene.background = bg;
    renderer.readRenderTargetPixels(rt, 0, 0, w, h, buf);
  };
  const at = (x: number, y: number) => {
    const o = ((h - 1 - y) * w + x) * 4;
    return buf[o] + buf[o + 1] * 256 - 1;
  };

  return {
    get w() { return w; },
    get h() { return h; },
    render,
    at,
    pick(x, y) {
      const r = canvas.getBoundingClientRect();
      render();
      const px = Math.floor((x - r.left) / SCALE), py = Math.floor((y - r.top) / SCALE);
      if (px < 0 || py < 0 || px >= w || py >= h) return null;
      const id = at(px, py);
      return id >= 0 ? id : null;
    },
  };
}
