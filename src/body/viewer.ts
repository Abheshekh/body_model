import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { LAYER_KEYS, flyDistance, layerOf, mixColor, type LayerKey, type Part } from './model';

const t0 = performance.now();
const FOV = 30;
const TARGET = new THREE.Vector3(0, 0.85, 0);
const VIEWS = {
  front: new THREE.Vector3(0, 0.9, 4.3),
  side: new THREE.Vector3(4.3, 0.9, 0),
  back: new THREE.Vector3(0, 0.9, -4.3),
};
const KIND_COLOR = { bone: 0xe8dfc6, cartilage: 0xc9d2cf, tendon: 0xe4d9c8, skin: 0xd8a488, organ: 0xa0524d };
const DEFAULT_LAYERS: LayerKey[] = ['superficialMuscles', 'deepMuscles', 'skeleton'];

export interface Viewer {
  parts: Part[];
  setLayerVisible(key: LayerKey, on: boolean): void;
  setView(v: 'front' | 'side' | 'back'): void;
  pick(clientX: number, clientY: number): Part | null;
  flyTo(id: string): void;
}

interface Internal {
  meshes: Map<string, THREE.Mesh>;
  base: Map<string, number>;
  render(): void;
}
let current: Internal | null = null;

// colour hash from the anatomy spike: same muscle, both sides, same colour
function hash(s: string): number {
  let h = 7;
  for (const ch of s) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return (h % 1000) / 1000;
}

function baseColor(p: Part): number {
  if (p.kind !== 'muscle') return KIND_COLOR[p.kind];
  const h = hash(p.name.replace(/\b(left|right)\b/, ''));
  return new THREE.Color().setHSL(0.008 + h * 0.02, 0.58 + h * 0.12, 0.36 + h * 0.08, THREE.SRGBColorSpace).getHex();
}

const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

export async function createViewer(canvas: HTMLCanvasElement, opts: { fps: boolean }): Promise<Viewer> {
  const host = canvas.parentElement ?? document.body;
  try {
    return await build(canvas, opts, host);
  } catch (e) {
    const msg = document.createElement('div');
    msg.className = 'load-error';
    msg.textContent = `Could not load the body: ${e instanceof Error ? e.message : String(e)}`;
    host.appendChild(msg);
    throw e;
  }
}

async function build(canvas: HTMLCanvasElement, opts: { fps: boolean }, host: HTMLElement): Promise<Viewer> {
  const base = import.meta.env.BASE_URL;
  const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
  const [partsRes, gltf] = await Promise.all([fetch(`${base}data/parts.json`), loader.loadAsync(`${base}data/body.glb`)]);
  if (!partsRes.ok) throw new Error(`parts.json ${partsRes.status}`);
  const parts: Part[] = (await partsRes.json()).parts;

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x2a323d);
  const camera = new THREE.PerspectiveCamera(FOV, 1, 0.05, 50);
  scene.add(new THREE.HemisphereLight(0xdfe8ff, 0x3a3030, 0.75));
  const key = new THREE.DirectionalLight(0xfff4e6, 1.15);
  key.position.set(1.5, 3.4, 4.8);
  const fill = new THREE.DirectionalLight(0xbfd4ff, 0.45);
  fill.position.set(-2, 1.5, -4.3);
  scene.add(key, fill);
  const floor = new THREE.Mesh(
    new THREE.CircleGeometry(1.6, 64),
    new THREE.MeshStandardMaterial({ color: 0x39424e, roughness: 1 }),
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -0.014;
  scene.add(floor);

  const byId = new Map(parts.map((p) => [p.id, p]));
  const meshes = new Map<string, THREE.Mesh>();
  const baseColors = new Map<string, number>();
  const layerMeshes = new Map<LayerKey, THREE.Mesh[]>(LAYER_KEYS.map((k) => [k, []]));
  scene.add(gltf.scene);
  gltf.scene.traverse((o) => {
    const p = byId.get(o.name);
    if (!p || !(o as THREE.Mesh).isMesh) return;
    const mesh = o as THREE.Mesh;
    const c = baseColor(p);
    mesh.material = new THREE.MeshStandardMaterial({ color: c, roughness: p.kind === 'skin' ? 0.7 : 0.55, metalness: 0 });
    meshes.set(p.id, mesh);
    baseColors.set(p.id, c);
    layerMeshes.get(layerOf(p))!.push(mesh);
  });
  for (const k of LAYER_KEYS) {
    const on = DEFAULT_LAYERS.includes(k);
    for (const m of layerMeshes.get(k)!) m.visible = on;
  }

  const controls = new OrbitControls(camera, canvas);
  controls.target.copy(TARGET);

  // render on demand: the rAF loop only draws when something changed (or ?fps=1)
  let dirty = true;
  let tween: { from: THREE.Vector3; to: THREE.Vector3; tFrom: THREE.Vector3; tTo: THREE.Vector3; start: number } | null = null;
  const request = () => { dirty = true; };
  controls.addEventListener('change', request);

  const resize = () => {
    const w = canvas.clientWidth || 1;
    const h = canvas.clientHeight || 1;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    request();
  };
  new ResizeObserver(resize).observe(canvas);

  let overlay: HTMLElement | null = null;
  const stamps: number[] = [];
  if (opts.fps) {
    overlay = document.createElement('div');
    overlay.className = 'fps-overlay';
    host.appendChild(overlay);
  }
  let firstFrame = true;

  const draw = () => {
    renderer.render(scene, camera);
    if (firstFrame) {
      firstFrame = false;
      const ms = Math.round(performance.now() - t0);
      console.info(`Body load time: ${ms} ms`);
      if (overlay) overlay.dataset.load = `${ms} ms`;
    }
  };

  const setCamera = (pos: THREE.Vector3, target: THREE.Vector3) => {
    tween = null;
    camera.position.copy(pos);
    controls.target.copy(target);
    controls.update();
    request();
  };

  const loop = (now: number) => {
    requestAnimationFrame(loop);
    if (tween) {
      const t = Math.min(1, (now - tween.start) / 600);
      const e = ease(t);
      camera.position.lerpVectors(tween.from, tween.to, e);
      controls.target.lerpVectors(tween.tFrom, tween.tTo, e);
      controls.update();
      if (t >= 1) tween = null;
      dirty = true;
    }
    if (!dirty && !opts.fps) return;
    dirty = false;
    draw();
    if (overlay) {
      stamps.push(now);
      while (stamps.length && now - stamps[0] > 1000) stamps.shift();
      overlay.textContent = `${stamps.length} fps · load ${overlay.dataset.load ?? '?'}`;
    }
  };
  setCamera(VIEWS.front, TARGET);
  resize();
  requestAnimationFrame(loop);

  const raycaster = new THREE.Raycaster();
  current = { meshes, base: baseColors, render: request };

  return {
    parts,
    setLayerVisible(k, on) {
      for (const m of layerMeshes.get(k)!) m.visible = on;
      request();
    },
    setView(v) {
      setCamera(VIEWS[v], TARGET);
    },
    pick(clientX, clientY) {
      const r = canvas.getBoundingClientRect();
      const ndc = new THREE.Vector2(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1);
      raycaster.setFromCamera(ndc, camera);
      const visible = [...meshes.values()].filter((m) => m.visible);
      const hit = raycaster.intersectObjects(visible, false)[0];
      return hit ? (byId.get(hit.object.name) ?? null) : null;
    },
    flyTo(id) {
      const mesh = meshes.get(id);
      if (!mesh) return;
      const sphere = new THREE.Box3().setFromObject(mesh).getBoundingSphere(new THREE.Sphere());
      const dir = camera.position.clone().sub(controls.target);
      if (dir.lengthSq() < 1e-12) dir.set(0, 0, 1);
      dir.normalize();
      const to = sphere.center.clone().add(dir.multiplyScalar(flyDistance(sphere.radius, FOV)));
      tween = { from: camera.position.clone(), to, tFrom: controls.target.clone(), tTo: sphere.center.clone(), start: performance.now() };
      request();
    },
  };
}

function colorNumber(c: string | number): number {
  return typeof c === 'number' ? c : new THREE.Color(c).getHex();
}

export function setPartColor(id: string, color: string | number, level: number): boolean {
  const mesh = current?.meshes.get(id);
  if (!current || !mesh) {
    console.warn(`setPartColor: unknown part id "${id}"`);
    return false;
  }
  (mesh.material as THREE.MeshStandardMaterial).color.setHex(mixColor(current.base.get(id)!, colorNumber(color), level));
  current.render();
  return true;
}

export function clearHighlights(): void {
  if (!current) return;
  for (const [id, mesh] of current.meshes) (mesh.material as THREE.MeshStandardMaterial).color.setHex(current.base.get(id)!);
  current.render();
}
