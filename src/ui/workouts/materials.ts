// Equipment materials (R5 T3): powder-coated steel, chrome (plain and knurled), zinc, rubber, stitched upholstery,
// wood, plastic, rope, cable. Detail maps are generated on a canvas (no image files): leather grain + stitched seam
// normal maps per cushion size, a knurl normal map, birch grain. Metals take the scene's environment map when
// setEnv is called (the viewer only exposes its scene through the overlay's parent).
import * as THREE from 'three';

export interface Mats {
  powder(hex: string): THREE.Material;
  chrome: THREE.MeshStandardMaterial;
  /** knurled chrome: the geometry's uv must be in knurl pitches (see KNURL_PITCH) */
  knurl: THREE.MeshStandardMaterial;
  zinc: THREE.MeshStandardMaterial;
  rubber: THREE.MeshStandardMaterial;
  grip: THREE.MeshStandardMaterial;
  plastic: THREE.MeshStandardMaterial;
  iron: THREE.MeshStandardMaterial;
  nylon: THREE.MeshStandardMaterial;
  cable: THREE.MeshStandardMaterial;
  rope: THREE.MeshStandardMaterial;
  hole: THREE.MeshBasicMaterial;
  shadow: THREE.MeshBasicMaterial;
  wood(hex: string): THREE.Material;
  /** non-slip rubber with a fine diamond tread: uv in metres */
  tread: THREE.MeshStandardMaterial;
  /** closed-cell foam with a grit top: uv in metres */
  foam(hex: string): THREE.Material;
  /** woven canvas, both sides drawn: uv in metres */
  fabric(hex: string): THREE.Material;
  tinted(hex: string, roughness: number): THREE.Material;
  /** stitched vinyl for a cushion whose top is w × d metres (uv 0..1 across the top) */
  upholstery(w: number, d: number, hex?: string): THREE.Material;
  /** plain vinyl (rollers) */
  vinyl: THREE.MeshPhysicalMaterial;
  setEnv(env: THREE.Texture | null): void;
  dispose(): void;
}

export const KNURL_PITCH = 0.0025; // metres between knurl diamonds

const canvas = (w: number, h: number) => {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return [c, c.getContext('2d', { willReadFrequently: true })!] as const;
};

/** normal map from a height canvas (red channel, 0..255) by central differences */
function toNormal(src: HTMLCanvasElement, strength: number, wrap: boolean): THREE.CanvasTexture {
  const w = src.width, h = src.height;
  const hd = src.getContext('2d')!.getImageData(0, 0, w, h).data;
  const [c, x] = canvas(w, h);
  const out = x.createImageData(w, h);
  const at = (i: number, j: number) => {
    if (wrap) { i = (i + w) % w; j = (j + h) % h; } else { i = Math.min(w - 1, Math.max(0, i)); j = Math.min(h - 1, Math.max(0, j)); }
    return hd[(j * w + i) * 4] / 255;
  };
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
    const dx = (at(i + 1, j) - at(i - 1, j)) * strength, dy = (at(i, j + 1) - at(i, j - 1)) * strength;
    const l = Math.hypot(dx, dy, 1), o = (j * w + i) * 4;
    out.data[o] = (-dx / l * 0.5 + 0.5) * 255;
    out.data[o + 1] = (dy / l * 0.5 + 0.5) * 255; // canvas y runs down, uv v runs up
    out.data[o + 2] = (1 / l * 0.5 + 0.5) * 255;
    out.data[o + 3] = 255;
  }
  x.putImageData(out, 0, 0);
  const t = new THREE.CanvasTexture(c);
  if (wrap) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

// ponytail: Math.random grain, so two runs differ by a few pixels; seed it if contact sheets must be byte-identical
function grain(x: CanvasRenderingContext2D, w: number, h: number, n: number, r: number) {
  for (let k = 0; k < n; k++) {
    x.fillStyle = `rgba(${Math.random() < 0.5 ? '0,0,0' : '255,255,255'},${0.05 + Math.random() * 0.08})`;
    x.beginPath();
    x.arc(Math.random() * w, Math.random() * h, r * (0.5 + Math.random()), 0, Math.PI * 2);
    x.fill();
  }
}

/** leather grain over the whole top, a seam groove and stitches inset from the edge; flat outside (the sides).
 *  seams false: grain only, tiling (rollers) */
function stitchMap(w: number, d: number, seams = true): THREE.CanvasTexture {
  const ppm = Math.min(700, 1024 / Math.max(w, d));
  const W = Math.max(32, Math.round(w * ppm)), H = Math.max(32, Math.round(d * ppm));
  const [c, x] = canvas(W, H);
  x.fillStyle = 'rgb(128,128,128)';
  x.fillRect(0, 0, W, H);
  if (!seams) {
    grain(x, W, H, Math.round(W * H / 18), Math.max(1, ppm * 0.0012));
    return toNormal(c, 3, true);
  }
  const edge = 0.02 * ppm; // outside this the cushion rounds over: no detail
  x.save();
  x.beginPath();
  x.rect(edge, edge, W - 2 * edge, H - 2 * edge);
  x.clip();
  grain(x, W, H, Math.round(W * H / 18), Math.max(1, ppm * 0.0012));
  x.restore();
  const seam = 0.032 * ppm, st = 0.009 * ppm;
  x.strokeStyle = 'rgb(70,70,70)'; // the seam: a groove where the top panel meets the welt
  x.lineWidth = Math.max(1.5, ppm * 0.002);
  x.strokeRect(seam, seam, W - 2 * seam, H - 2 * seam);
  x.strokeStyle = 'rgb(190,190,190)'; // the thread: raised dashes just inside the seam
  x.lineWidth = Math.max(1, ppm * 0.0012);
  x.setLineDash([ppm * 0.006, ppm * 0.004]);
  x.strokeRect(seam + st, seam + st, W - 2 * (seam + st), H - 2 * (seam + st));
  const t = toNormal(c, 3, false);
  t.anisotropy = 4;
  return t;
}

function knurlMap(): THREE.CanvasTexture {
  const N = 64, [c, x] = canvas(N, N), img = x.createImageData(N, N);
  const tri = (u: number) => 1 - 2 * Math.abs(u - Math.floor(u) - 0.5); // 0 at the grooves, 1 at the peaks
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const v = Math.min(tri((i + j) / N * 2), tri((i - j) / N * 2)) * 255, o = (j * N + i) * 4;
    img.data[o] = img.data[o + 1] = img.data[o + 2] = v;
    img.data[o + 3] = 255;
  }
  x.putImageData(img, 0, 0);
  return toNormal(c, 2.5, true);
}

function woodMap(hex: string): THREE.CanvasTexture {
  const [c, x] = canvas(512, 512);
  x.fillStyle = hex;
  x.fillRect(0, 0, 512, 512);
  for (let k = 0; k < 90; k++) { // birch: faint wavy late-wood lines
    const y0 = Math.random() * 512, a = 2 + Math.random() * 6, f = 0.004 + Math.random() * 0.01;
    x.strokeStyle = `rgba(120,80,40,${0.04 + Math.random() * 0.08})`;
    x.lineWidth = 0.5 + Math.random() * 1.5;
    x.beginPath();
    for (let i = 0; i <= 512; i += 8) x.lineTo(i, y0 + Math.sin(i * f + k) * a);
    x.stroke();
  }
  grain(x, 512, 512, 3000, 1);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

/** plain weave: threads over and under, 8 per tile */
function weaveMap(): THREE.CanvasTexture {
  const N = 64, C = 8, [c, x] = canvas(N, N), img = x.createImageData(N, N);
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const u = (i % C) / C, v = (j % C) / C, over = (Math.floor(i / C) + Math.floor(j / C)) % 2;
    const h = over ? Math.sin(Math.PI * v) * (0.6 + 0.4 * Math.sin(Math.PI * u)) : Math.sin(Math.PI * u) * (0.6 + 0.4 * Math.sin(Math.PI * v));
    const o = (j * N + i) * 4;
    img.data[o] = img.data[o + 1] = img.data[o + 2] = h * 255;
    img.data[o + 3] = 255;
  }
  x.putImageData(img, 0, 0);
  return toNormal(c, 1.5, true);
}

function shadowMap(): THREE.CanvasTexture {
  const [c, x] = canvas(128, 128);
  const g = x.createRadialGradient(64, 64, 8, 64, 64, 64);
  g.addColorStop(0, 'rgba(0,0,0,.5)');
  g.addColorStop(1, 'rgba(0,0,0,0)');
  x.fillStyle = g;
  x.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(c);
}

export function createMats(): Mats {
  const all: THREE.Material[] = [], tex: THREE.Texture[] = [];
  const keep = <M extends THREE.Material>(m: M): M => { all.push(m); return m; };
  const cache = new Map<string, THREE.Material>();
  const once = (key: string, make: () => THREE.Material) => cache.get(key) ?? (cache.set(key, keep(make())), cache.get(key)!);
  const metals: THREE.MeshStandardMaterial[] = [];
  const metal = (o: THREE.MeshStandardMaterialParameters) => { const m = keep(new THREE.MeshStandardMaterial({ metalness: 1, ...o })); metals.push(m); return m; };

  const knurlTex = knurlMap();
  const shadowTex = shadowMap();
  tex.push(knurlTex, shadowTex);
  const grainTex = stitchMap(0.2, 0.2, false);
  grainTex.repeat.set(2, 2);
  tex.push(grainTex);
  const treadTex = knurlTex.clone();
  treadTex.repeat.set(1 / 0.006, 1 / 0.006); // 6 mm diamonds on metric uv
  const weaveTex = weaveMap();
  weaveTex.repeat.set(1 / 0.02, 1 / 0.02); // 2.5 mm threads
  tex.push(treadTex, weaveTex);

  return {
    powder: (hex) => once(`p${hex}`, () => new THREE.MeshPhysicalMaterial({
      color: hex, roughness: 0.48, metalness: 0.25, clearcoat: 0.35, clearcoatRoughness: 0.45 })),
    chrome: metal({ color: 0xe9ecef, roughness: 0.08 }),
    knurl: metal({ color: 0xd8dbde, roughness: 0.28, normalMap: knurlTex, normalScale: new THREE.Vector2(1.2, 1.2) }),
    zinc: metal({ color: 0xc2c7cc, roughness: 0.32 }),
    rubber: keep(new THREE.MeshStandardMaterial({ color: 0x161719, roughness: 0.88 })),
    grip: keep(new THREE.MeshStandardMaterial({ color: 0x101112, roughness: 0.95 })),
    plastic: keep(new THREE.MeshStandardMaterial({ color: 0x0d0d0f, roughness: 0.42 })),
    iron: metal({ color: 0x3d4044, roughness: 0.6, metalness: 0.7 }),
    nylon: keep(new THREE.MeshStandardMaterial({ color: 0x1a1a1c, roughness: 0.55 })),
    cable: keep(new THREE.MeshStandardMaterial({ color: 0x08080a, roughness: 0.35 })),
    rope: keep(new THREE.MeshStandardMaterial({ color: 0x1c1d20, roughness: 0.85 })),
    hole: keep(new THREE.MeshBasicMaterial({ color: 0x030303 })),
    shadow: keep(new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, depthWrite: false })),
    wood: (hex) => once(`w${hex}`, () => {
      const t = woodMap(hex);
      tex.push(t);
      t.repeat.set(1.6, 1.6); // ~0.6 m per tile on metric uv
      return new THREE.MeshStandardMaterial({ map: t, roughness: 0.62 });
    }),
    tread: keep(new THREE.MeshStandardMaterial({ color: 0x1b1c1e, roughness: 0.9, normalMap: treadTex, normalScale: new THREE.Vector2(0.7, 0.7) })),
    foam: (hex) => once(`f${hex}`, () => {
      const t = stitchMap(0.2, 0.2, false);
      t.repeat.set(5, 5); // 0.2 m per tile on metric uv
      tex.push(t);
      return new THREE.MeshStandardMaterial({ color: hex, roughness: 0.92, normalMap: t, normalScale: new THREE.Vector2(0.6, 0.6) });
    }),
    fabric: (hex) => once(`c${hex}`, () => new THREE.MeshStandardMaterial({ color: hex, roughness: 0.95, normalMap: weaveTex, normalScale: new THREE.Vector2(0.6, 0.6), side: THREE.DoubleSide })),
    tinted: (hex, roughness) => once(`t${hex}${roughness}`, () => new THREE.MeshStandardMaterial({ color: hex, roughness })),
    upholstery: (w, d, hex = '#141518') => once(`u${w.toFixed(3)}x${d.toFixed(3)}${hex}`, () => {
      const t = stitchMap(w, d);
      tex.push(t);
      return new THREE.MeshPhysicalMaterial({ color: hex, roughness: 0.52, normalMap: t, normalScale: new THREE.Vector2(0.8, 0.8),
        clearcoat: 0.15, clearcoatRoughness: 0.5, sheen: 0.25, sheenColor: 0x444444 });
    }),
    vinyl: keep(new THREE.MeshPhysicalMaterial({ color: 0x141518, roughness: 0.52, normalMap: grainTex, clearcoat: 0.15, clearcoatRoughness: 0.5 })),
    setEnv(env) {
      for (const m of metals) { m.envMap = env; m.envMapIntensity = 1.1; m.needsUpdate = true; }
    },
    dispose() {
      for (const m of all) m.dispose();
      for (const t of tex) t.dispose();
    },
  };
}
