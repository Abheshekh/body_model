// R3 renderer: one mesh per pack, quantised attributes decoded on the GPU, per-part state texture.
// Render on demand (only when something changed), as the M1 viewer.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { loadManifest, loadPack, loadRig, loadWeights, type Manifest, type PackData, type PackInfo, type Part, type Weights } from './load';
import { defaultState, idsOfPlain, packsNeeded, visibility, type BodyState, type Depth } from './state';
import { LAYER_COL, SKIN_TONES, SYS_COL, VIS, createMaterials, type Materials, type SkinTone } from './materials';
import { createIdPass, PICK_LAYER } from './pick';
import { createLabels } from './labels';
import { fitDistance, viewOffset, visibleFraction, type Inset } from './model';
import { loadProfile } from '../me/profile';
import { createSkeleton, type Posed, type Skeleton } from '../rig/skeleton';
import { accumulateWeights, createBoneTexture, skinBox, writeBones } from '../rig/skin';
import type { Pose } from '../rig/pose';

type Sex = BodyState['sex'];
const FOV = 30;
const W = 64; // state texture 64×128 (§2b.8)
const NB = 22; // rig.json driven bones (FORMAT.md)
const AZIMUTH = { front: 0, side: -90, back: 180 };
export type View = keyof typeof AZIMUTH | 'below';

export interface BodyViewer {
  manifest: Manifest;
  parts: Part[];
  readonly state: BodyState;
  setState(patch: Partial<BodyState>): void;
  setSkinTone(tone: SkinTone): void;
  bounds(id: number): THREE.Box3 | null;
  select(id: number | null): void;
  frameIds(ids: number[], facing?: 'front' | 'back'): void;
  setViewInset(inset: Inset): void;
  setHighlight(ids: number[], colour: string): void;
  clearHighlight(): void;
  setView(v: View): void;
  /** part id under client point (x, y), or null */
  pick(x: number, y: number): number | null;
  setLabels(on: boolean): void;
  onChange(cb: () => void): void;
  /** R5: pose the body; null = rest (the bind mesh, unchanged). The first non-null pose loads rig.json and the weights. */
  setPose(pose: Pose | null): Promise<void>;
  /** posed world position of a joint (rig.json joint key), or null before the rig has loaded */
  jointPosition(key: string): THREE.Vector3 | null;
  // §2b.15 overlays (Move handles, props): drawn in the main pass only, so they never block part picking
  readonly camera: THREE.PerspectiveCamera;
  /** add obj to the scene and redraw; call again after changing obj to redraw */
  addOverlay(obj: THREE.Object3D): void;
  removeOverlay(obj: THREE.Object3D): void;
  /** intersections of objects under client point (x, y), nearest first */
  raycast(x: number, y: number, objects: THREE.Object3D[]): THREE.Intersection[];
  /** a canvas pointerdown orbits/pans only when fn(e) is true; null = always */
  setOrbitGate(fn: ((e: PointerEvent) => boolean) | null): void;
}

export async function createBodyViewer(canvas: HTMLCanvasElement, opts: { fps: boolean }): Promise<BodyViewer> {
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

function backdrop(): THREE.Texture {
  const c = document.createElement('canvas');
  c.width = c.height = 512;
  const x = c.getContext('2d')!;
  const g = x.createRadialGradient(256, 210, 20, 256, 256, 380);
  g.addColorStop(0, '#16555d');
  g.addColorStop(1, '#06282c');
  x.fillStyle = g;
  x.fillRect(0, 0, 512, 512);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function contactShadow(): THREE.Mesh {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const x = c.getContext('2d')!;
  const g = x.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, 'rgba(0,0,0,.55)');
  g.addColorStop(1, 'rgba(0,0,0,0)');
  x.fillStyle = g;
  x.fillRect(0, 0, 128, 128);
  const m = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.6), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(c), transparent: true, depthWrite: false }));
  m.rotation.x = -Math.PI / 2;
  m.position.y = 0.002;
  return m;
}

function parseDepth(v: string | null): Depth | null {
  if (v === 'skin' || v === 'bones') return v;
  if (v === 'outer') return 1;
  const n = Number(v);
  return v && Number.isInteger(n) && n >= 1 && n <= 6 ? (n as Depth) : null;
}

const hex = (c: string) => parseInt(c.slice(1), 16);
const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

async function build(canvas: HTMLCanvasElement, opts: { fps: boolean }, host: HTMLElement): Promise<BodyViewer> {
  // load before creating the renderer, so a failed fetch leaves no WebGL context behind
  const m = await loadManifest();
  const first = m.packs.filter((p) => p.load === 'first');
  const data = await Promise.all(first.map((p) => loadPack(m, p.name)));

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.95;
  const scene = new THREE.Scene();
  scene.background = backdrop();
  scene.environment = new THREE.PMREMGenerator(renderer).fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = 0.35;
  const key = new THREE.DirectionalLight(0xfff1e0, 2.0);
  key.position.set(-1.5, 3, 2.5);
  const rim = new THREE.DirectionalLight(0xa8e6ff, 2.2);
  rim.position.set(1.8, 2.2, -2.5);
  const fill = new THREE.DirectionalLight(0xffffff, 0.55);
  fill.position.set(2, 0.5, 2);
  scene.add(key, rim, fill, new THREE.HemisphereLight(0x9fd6dd, 0x1a0a08, 0.4), contactShadow());
  const camera = new THREE.PerspectiveCamera(FOV, 1, 0.02, 30);
  const controls = new OrbitControls(camera, canvas);
  controls.enableDamping = true;
  controls.minDistance = 0.2;
  controls.maxDistance = 6;

  let state = defaultState(m, loadProfile()?.sex ?? 'male');
  const highlight = new Set<number>();
  const selected = new Set<number>(); // every id sharing the selected part's plain name (§2b.4)
  const sdata = new Uint8Array(W * W * 2 * 4);
  const tex = new THREE.DataTexture(sdata, W, W * 2, THREE.RGBAFormat);
  tex.magFilter = tex.minFilter = THREE.NearestFilter;
  const boneTex = createBoneTexture(NB);
  const mats: Materials = createMaterials(tex, m.box, boneTex);

  // per-part bounds per sex, decoded once on the CPU (§2b.9)
  const n = Math.max(...m.parts.map((p) => p.id)) + 1;
  const lo = { male: new Float32Array(n * 3).fill(Infinity), female: new Float32Array(n * 3).fill(Infinity) };
  const hi = { male: new Float32Array(n * 3).fill(-Infinity), female: new Float32Array(n * 3).fill(-Infinity) };
  const [b0, b1] = m.box;
  const accumulate = (sex: Sex, pos: Uint16Array, mid: Uint16Array) => {
    const l = lo[sex], h = hi[sex];
    for (let v = 0; v < mid.length; v++) {
      const o = mid[v] * 3;
      for (let k = 0; k < 3; k++) {
        const x = b0[k] + (pos[v * 3 + k] / 65535) * (b1[k] - b0[k]);
        if (x < l[o + k]) l[o + k] = x;
        if (x > h[o + k]) h[o + k] = x;
      }
    }
  };

  const bodySphere = new THREE.Box3(new THREE.Vector3().fromArray(b0), new THREE.Vector3().fromArray(b1)).getBoundingSphere(new THREE.Sphere());
  type PackMesh = { name: string; mid: Uint16Array; geo: THREE.BufferGeometry; pos: Record<Sex, THREE.BufferAttribute>; nrm: Record<Sex, THREE.BufferAttribute> };
  // R5 rig: loaded on the first non-null pose. partW = per-part bone weights (parts × NB) for posed bounds.
  let weights: Weights | null = null;
  let skel: Record<Sex, Skeleton> | null = null;
  let partW: Float32Array | null = null;
  let pose: Pose | null = null;
  let posed: Posed | null = null;
  const attachWeights = (p: PackMesh) => {
    const w = weights?.[p.name];
    if (!w || !partW) return;
    if (w.bi.length !== p.mid.length * 4) throw new Error(`weights for ${p.name}: ${w.bi.length / 4} vertices, pack has ${p.mid.length}`);
    p.geo.setAttribute('bi', new THREE.BufferAttribute(w.bi, 4));
    p.geo.setAttribute('bw', new THREE.BufferAttribute(w.bw, 4, true));
    accumulateWeights(partW, NB, p.mid, w.bi, w.bw);
  };
  const packs: PackMesh[] = [];
  const meshOf: Record<string, THREE.Mesh> = {};
  const loaded = new Set<string>();
  const addPack = (info: PackInfo, d: PackData) => {
    const kind = info.kinds[0];
    const soft = kind === 'muscle' || kind === 'tendon';
    const geo = new THREE.BufferGeometry();
    const pos = { male: new THREE.BufferAttribute(d.posM, 3, true), female: new THREE.BufferAttribute(d.posF, 3, true) };
    const nrm = { male: new THREE.BufferAttribute(d.nrmM, 3, true), female: new THREE.BufferAttribute(d.nrmF, 3, true) };
    geo.setAttribute('position', pos[state.sex]);
    geo.setAttribute('normal', nrm[state.sex]);
    const fib = new THREE.BufferAttribute(d.fib, 3, true);
    geo.setAttribute('fib', fib);
    if (soft) geo.setAttribute('tangent', fib); // anisotropy along fibres; w defaults to 1
    geo.setAttribute('acr', new THREE.BufferAttribute(d.acr, 1));
    geo.setAttribute('mid', new THREE.BufferAttribute(d.mid, 1));
    geo.setAttribute('ao', new THREE.BufferAttribute(d.ao, 1, true));
    geo.setIndex(new THREE.BufferAttribute(d.idx, 1));
    geo.boundingSphere = bodySphere; // only used to sort transparent meshes; positions are quantised
    const mesh = new THREE.Mesh(geo, kind === 'skin' ? mats.skin : (mats.tissue[kind] ?? mats.tissue.organ));
    mesh.frustumCulled = false;
    if (kind === 'skin') mesh.renderOrder = 3;
    mesh.layers.enable(PICK_LAYER); // ghosts and the contact shadow are not pickable
    meshOf[kind] = mesh;
    scene.add(mesh);
    if (soft) {
      const ghost = new THREE.Mesh(geo, mats.ghost);
      ghost.frustumCulled = false;
      ghost.renderOrder = 2;
      scene.add(ghost);
    }
    accumulate('male', d.posM, d.mid);
    accumulate('female', d.posF, d.mid);
    const pm = { name: info.name, mid: d.mid, geo, pos, nrm };
    attachWeights(pm);
    packs.push(pm);
    loaded.add(info.name);
  };
  first.forEach((p, i) => addPack(p, data[i]));

  const colourOf = (p: Part) => {
    if (state.colour === 'system') return SYS_COL[p.kind] ?? p.colour;
    if (state.colour === 'layer' && (p.kind === 'muscle' || p.kind === 'tendon')) return LAYER_COL[Math.min(p.layer ?? 1, 6)];
    return p.colour;
  };
  const writeState = () => {
    for (const p of m.parts) {
      const o = p.id * 4, c = (W * W + p.id) * 4, col = hex(colourOf(p));
      sdata[o] = VIS[visibility(p, state)];
      sdata[o + 1] = highlight.has(p.id) || selected.has(p.id) ? 255 : 0;
      sdata[o + 2] = state.isolate?.has(p.id) ? 255 : 0;
      sdata[c] = col >> 16;
      sdata[c + 1] = (col >> 8) & 255;
      sdata[c + 2] = col & 255;
    }
    tex.needsUpdate = true;
    mats.skin.opacity = state.seeThrough ? 0.3 : 1;
    mats.skin.depthWrite = !state.seeThrough;
    // isolate: bones stay as context at 25% (§2b.3)
    const bone = mats.tissue.bone, iso = state.isolate !== null;
    if (bone.transparent !== iso) {
      bone.transparent = iso;
      bone.opacity = iso ? 0.25 : 1;
      bone.depthWrite = !iso;
      bone.needsUpdate = true;
    }
    // see-through skin and 25% context bones do not block picking or labels
    if (state.seeThrough) meshOf.skin?.layers.disable(PICK_LAYER); else meshOf.skin?.layers.enable(PICK_LAYER);
    if (iso) meshOf.bone?.layers.disable(PICK_LAYER); else meshOf.bone?.layers.enable(PICK_LAYER);
  };

  // render on demand: the rAF loop only draws when something changed (or ?fps=1)
  let dirty = true;
  const request = () => { dirty = true; };
  const idPass = createIdPass(renderer, scene, camera, mats.ghost.uniforms);
  const labels = createLabels(host, canvas, idPass, m.parts, () => state, (id) => viewer.select(id));
  controls.addEventListener('change', () => { request(); labels.moved(); }); // also fires every tween frame
  const listeners: (() => void)[] = [];
  const changed = () => { request(); labels.queue(); for (const cb of listeners) cb(); };

  // projection offset: the body centres in the part of the canvas not under the nav or the sheet
  let inset: Inset = { top: 0, right: 0, bottom: 0, left: 0 };
  const size = () => ({ w: canvas.clientWidth || 1, h: canvas.clientHeight || 1 });
  const applyOffset = () => {
    const { w, h } = size();
    if (!inset.top && !inset.right && !inset.bottom && !inset.left) camera.clearViewOffset();
    else {
      const o = viewOffset({ w, h }, inset);
      camera.setViewOffset(w, h, o.x, o.y, w, h);
    }
  };
  const resize = () => {
    const { w, h } = size();
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    applyOffset();
    request();
    labels.queue();
  };
  new ResizeObserver(resize).observe(canvas);
  resize();

  let tween: { from: THREE.Vector3; to: THREE.Vector3; tFrom: THREE.Vector3; tTo: THREE.Vector3; start: number } | null = null;
  // views as the sample's setView; 'below' looks up at the pelvic floor (R0 pelvic view)
  const setView = (v: View) => {
    tween = null;
    const s = m.heights[state.sex] / m.heights.male;
    if (v === 'below') {
      camera.position.set(0, 0.4 * s, 0.25 * s);
      controls.target.set(0, 0.84 * s, -0.03 * s);
    } else {
      const a = THREE.MathUtils.degToRad(AZIMUTH[v]), y = 0.9 * s;
      const r = camera.aspect < 0.75 ? (4.6 / Math.max(camera.aspect, 0.45)) * 0.62 : 3.6;
      camera.position.set(Math.sin(a) * r, y + 0.15, Math.cos(a) * r);
      controls.target.set(0, y, 0);
    }
    controls.update();
    request();
  };

  // tween the camera onto the union box of ids (M1 frameIds)
  const frame = (ids: number[], facing?: 'front' | 'back') => {
    const box = new THREE.Box3();
    for (const id of ids) {
      const b = viewer.bounds(id);
      if (b) box.union(b);
    }
    if (box.isEmpty()) return;
    const sphere = box.getBoundingSphere(new THREE.Sphere());
    const dir = facing ? new THREE.Vector3(0, 0, facing === 'front' ? 1 : -1) : camera.position.clone().sub(controls.target);
    if (dir.lengthSq() < 1e-12) dir.set(0, 0, 1);
    dir.normalize();
    const dist = fitDistance(sphere.radius, FOV, visibleFraction(size(), inset));
    tween = { from: camera.position.clone(), to: sphere.center.clone().add(dir.multiplyScalar(dist)), tFrom: controls.target.clone(), tTo: sphere.center.clone(), start: performance.now() };
    request();
  };

  // demand packs: load what the state can show, once each (cached in load.ts)
  let loading: Promise<unknown> = Promise.resolve();
  const ensurePacks = () => {
    const want = packsNeeded(state, m).filter((n) => !loaded.has(n));
    if (!want.length) return;
    loading = Promise.all(want.map((name) => loadPack(m, name).then((d) => {
      if (loaded.has(name)) return;
      addPack(m.packs.find((p) => p.name === name)!, d);
      changed();
    }))).catch((e) => {
      const msg = document.createElement('div');
      msg.className = 'load-error';
      msg.textContent = `Could not load the body: ${e instanceof Error ? e.message : String(e)}`;
      host.appendChild(msg);
    });
  };

  const applyPose = () => {
    posed = pose && skel ? skel[state.sex].posed(pose) : null;
    if (posed) writeBones(boneTex, posed);
    mats.ghost.uniforms.uSkin.value = posed ? 1 : 0; // the same uniform object every material and the id pass share
    changed();
  };
  let rigLoad: Promise<void> | null = null;
  const ensureRig = () => rigLoad ??= (async () => {
    const [r, w] = await Promise.all([loadRig(m), loadWeights(m)]);
    if (r.bones.length !== NB) throw new Error(`rig.json has ${r.bones.length} bones, expected ${NB}`);
    partW = new Float32Array(n * NB);
    for (const [id, b] of Object.entries(r.partBone)) {
      sdata[Number(id) * 4 + 3] = b + 1; // rigid part: bone + 1 in the state alpha (SKIN_GLSL)
      partW[Number(id) * NB + b] = 1;
    }
    tex.needsUpdate = true;
    weights = w;
    for (const p of packs) attachWeights(p);
    skel = { male: createSkeleton(r, 'male'), female: createSkeleton(r, 'female') };
  })().catch((e) => {
    rigLoad = null; // allow retry
    const msg = document.createElement('div');
    msg.className = 'load-error';
    msg.textContent = `Could not load the body rig: ${e instanceof Error ? e.message : String(e)}`;
    host.appendChild(msg);
  });

  let overlay: HTMLElement | null = null;
  const stamps: number[] = [];
  if (opts.fps) {
    overlay = document.createElement('div');
    overlay.className = 'fps-overlay';
    host.appendChild(overlay);
  }
  let onFirst: (() => void) | null = null;
  const firstFrame = new Promise<void>((r) => { onFirst = r; });
  const loop = (now: number) => {
    requestAnimationFrame(loop);
    if (tween) {
      const t = Math.min(1, (now - tween.start) / 600), e = ease(t);
      camera.position.lerpVectors(tween.from, tween.to, e);
      controls.target.lerpVectors(tween.tFrom, tween.tTo, e);
      if (t >= 1) tween = null;
      dirty = true;
    }
    controls.update(); // damping; fires 'change' while the camera moves
    if (!dirty && !opts.fps) return;
    dirty = false;
    renderer.render(scene, camera);
    if (onFirst) {
      const ms = Math.round(performance.now());
      console.info(`Body load time: ${ms} ms`);
      if (overlay) overlay.dataset.load = `${ms} ms`;
      onFirst();
      onFirst = null;
    }
    if (overlay) {
      stamps.push(now);
      while (stamps.length && now - stamps[0] > 1000) stamps.shift();
      overlay.textContent = `${stamps.length} fps · load ${overlay.dataset.load ?? '?'}`;
    }
  };

  let gate: ((e: PointerEvent) => boolean) | null = null;
  // capture on the stage runs before OrbitControls' own canvas listener; the next pointerup re-enables (wheel zoom)
  host.addEventListener('pointerdown', (e) => { if (e.target === canvas) controls.enabled = !gate || gate(e); }, true);
  for (const t of ['pointerup', 'pointercancel']) addEventListener(t, () => { controls.enabled = true; });
  const ray = new THREE.Raycaster();

  const viewer: BodyViewer = {
    manifest: m,
    parts: m.parts,
    get state() { return state; },
    setState(patch) {
      const sex = state.sex;
      state = { ...state, ...patch };
      if (state.sex !== sex) {
        for (const p of packs) {
          p.geo.setAttribute('position', p.pos[state.sex]);
          p.geo.setAttribute('normal', p.nrm[state.sex]);
        }
        if (pose) applyPose(); // the other sex's skeleton
      }
      writeState();
      ensurePacks();
      changed();
    },
    setSkinTone(tone) {
      mats.skin.color.set(SKIN_TONES[tone]);
      request();
    },
    bounds(id) {
      const l = lo[state.sex], h = hi[state.sex], o = id * 3;
      if (!(l[o] <= h[o])) return null; // no vertices for this sex (or pack not loaded)
      const box = new THREE.Box3(new THREE.Vector3(l[o], l[o + 1], l[o + 2]), new THREE.Vector3(h[o], h[o + 1], h[o + 2]));
      return posed && partW ? skinBox(box, partW, NB, id, posed) : box;
    },
    select(id) {
      selected.clear();
      const p = id === null ? undefined : m.parts.find((x) => x.id === id);
      if (p) for (const i of idsOfPlain(m, p.plain)) selected.add(i);
      writeState();
      changed();
    },
    frameIds(ids, facing) {
      // a demand pack may still be loading (select from the list turns its system on first)
      void loading.then(() => frame(ids, facing));
    },
    setViewInset(next) {
      inset = { ...next };
      applyOffset();
      request();
    },
    setHighlight(ids, colour) {
      highlight.clear();
      for (const i of ids) highlight.add(i);
      mats.ghost.uniforms.uHighlight.value.set(colour); // the same uniform object every material shares
      writeState();
      changed();
    },
    clearHighlight() {
      highlight.clear();
      writeState();
      changed();
    },
    setView,
    pick: (x, y) => idPass.pick(x, y),
    setLabels: (on) => labels.set(on),
    onChange(cb) {
      listeners.push(cb);
    },
    async setPose(p) {
      pose = p;
      if (p && !skel) await ensureRig();
      if (pose === p) applyPose(); // a later call may have replaced p while the rig loaded
    },
    jointPosition(key) {
      if (!skel) return null;
      return new THREE.Vector3(...skel[state.sex].jointPosition(posed, key));
    },
    camera,
    addOverlay(obj) {
      scene.add(obj);
      request();
    },
    removeOverlay(obj) {
      scene.remove(obj);
      request();
    },
    raycast(x, y, objects) {
      const r = canvas.getBoundingClientRect();
      ray.setFromCamera(new THREE.Vector2(((x - r.left) / r.width) * 2 - 1, 1 - ((y - r.top) / r.height) * 2), camera);
      return ray.intersectObjects(objects, true);
    },
    setOrbitGate(fn) {
      gate = fn;
    },
  };

  writeState();
  if (import.meta.env.DEV) {
    (window as unknown as { bodyViewer: BodyViewer }).bodyViewer = viewer;
    const q = new URLSearchParams(location.search);
    const sex = q.get('sex'), depth = parseDepth(q.get('depth'));
    const patch: Partial<BodyState> = {};
    if (sex === 'male' || sex === 'female') patch.sex = sex;
    if (depth !== null) patch.depth = depth;
    viewer.setState(patch);
    const poseId = q.get('pose'); // acceptance pose id (public/data/poses_acceptance.json)
    if (poseId) {
      void fetch(`${import.meta.env.BASE_URL}data/poses_acceptance.json`).then((r) => r.json())
        .then((d: { poses: { id: string; pose: Pose }[] }) => {
          const e = d.poses.find((x) => x.id === poseId);
          if (e) return viewer.setPose(e.pose);
          console.warn(`no acceptance pose ${poseId}`);
        });
    }
  }
  setView('front');
  requestAnimationFrame(loop);
  await firstFrame;
  return viewer;
}
