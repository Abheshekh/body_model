// R1 loader: manifest + packs (FORMAT.md). No three.js.
export type Part = {
  id: number; name: string; plain: string; side: 'left' | 'right' | 'center'; kind: string;
  region: string; system: string; colour: string; layer: number | null;
  sex: 'both' | 'male' | 'female'; ext: boolean; simplified: boolean; defaultHidden: boolean; pack: string;
};
export type PackInfo = {
  name: string; kinds: string[]; load: 'first' | 'demand'; file: string;
  bytes: number; gzBytes: number; verts: number; tris: number;
  arrays: Record<string, [number, number]>;
};
export type Manifest = {
  version: number; box: [number[], number[]]; sexes: string[]; heights: Record<string, number>;
  packs: PackInfo[]; parts: Part[]; credits: string;
};
export type PackData = {
  idx: Uint32Array; posM: Uint16Array; posF: Uint16Array; nrmM: Int8Array; nrmF: Int8Array;
  fib: Int8Array; acr: Int16Array; mid: Uint16Array; ao: Uint8Array;
};

const base = () => `${import.meta.env?.BASE_URL ?? '/'}data/body/`;

async function get(file: string): Promise<Uint8Array> {
  const r = await fetch(base() + file);
  if (!r.ok) throw new Error(`${file}: HTTP ${r.status}`);
  return new Uint8Array(await r.arrayBuffer());
}

export async function loadManifest(): Promise<Manifest> {
  const m = JSON.parse(new TextDecoder().decode(await get('manifest.json'))) as Manifest;
  if (m.version !== 1) throw new Error(`manifest version ${m.version}, expected 1`);
  return m;
}

export const isGzip = (b: Uint8Array) => b.length > 1 && b[0] === 0x1f && b[1] === 0x8b;

async function gunzip(b: Uint8Array): Promise<Uint8Array> {
  const s = new Blob([b as BlobPart]).stream().pipeThrough(new DecompressionStream('gzip'));
  return new Uint8Array(await new Response(s).arrayBuffer());
}

// Slice a decompressed pack into typed arrays (copies, so views are aligned at offset 0).
export function slicePack(p: PackInfo, raw: Uint8Array): PackData {
  const a = (k: string): ArrayBuffer => {
    const [o, n] = p.arrays[k];
    return raw.slice(o, o + n).buffer as ArrayBuffer;
  };
  return {
    idx: new Uint32Array(a('idx')), posM: new Uint16Array(a('posM')), posF: new Uint16Array(a('posF')),
    nrmM: new Int8Array(a('nrmM')), nrmF: new Int8Array(a('nrmF')), fib: new Int8Array(a('fib')),
    acr: new Int16Array(a('acr')), mid: new Uint16Array(a('mid')), ao: new Uint8Array(a('ao')),
  };
}

const cache = new Map<string, Promise<PackData>>();

export function loadPack(m: Manifest, name: string): Promise<PackData> {
  let c = cache.get(name);
  if (!c) {
    const p = m.packs.find((x) => x.name === name);
    if (!p) return Promise.reject(new Error(`no pack ${name}`));
    c = get(p.file).then((b) => (isGzip(b) ? gunzip(b) : b)).then((raw) => slicePack(p, raw));
    c.catch(() => cache.delete(name)); // allow retry after a failed fetch
    cache.set(name, c);
  }
  return c;
}
