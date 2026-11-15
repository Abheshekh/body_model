import { afterEach, describe, expect, it, vi } from 'vitest';
import { gzipSync } from 'node:zlib';
import { isGzip, loadManifest, loadPack, slicePack, type Manifest, type PackInfo } from './load';

// Tiny pack: 2 verts, 1 tri. Layout is 4-byte aligned per FORMAT.md.
const arrays: PackInfo['arrays'] = {
  idx: [0, 12], posM: [12, 12], posF: [24, 12], nrmM: [36, 6], nrmF: [44, 6],
  fib: [52, 6], acr: [60, 4], mid: [64, 4], ao: [68, 2],
};
const info: PackInfo = { name: 't', kinds: ['muscle'], load: 'first', file: 't.bin.gz', bytes: 72, gzBytes: 0, verts: 2, tris: 1, arrays };
const raw = new Uint8Array(72);
const dv = new DataView(raw.buffer);
[0, 1, 1].forEach((v, i) => dv.setUint32(i * 4, v, true));
dv.setUint16(12, 65535, true);
dv.setInt8(36, -127);
dv.setInt16(60, 8000, true);
dv.setUint16(64, 7, true);
raw[68] = 255;
const manifest = { version: 1, box: [[0, 0, 0], [1, 1, 1]], sexes: ['male', 'female'], heights: {}, packs: [info], parts: [], credits: '' } as Manifest;

afterEach(() => vi.unstubAllGlobals());

describe('load', () => {
  it('parses the manifest and rejects other versions', async () => {
    const serve = (v: number) => vi.stubGlobal('fetch', async () => new Response(JSON.stringify({ ...manifest, version: v })));
    serve(1);
    expect((await loadManifest()).version).toBe(1);
    serve(2);
    await expect(loadManifest()).rejects.toThrow('version 2');
  });

  it('isGzip sniffs 1f 8b', () => {
    expect(isGzip(gzipSync(raw))).toBe(true);
    expect(isGzip(raw)).toBe(false);
    expect(isGzip(new Uint8Array(0))).toBe(false);
  });

  it('slices a hand-made pack into typed arrays', () => {
    const d = slicePack(info, raw);
    expect([...d.idx]).toEqual([0, 1, 1]);
    expect(d.posM[0]).toBe(65535);
    expect(d.nrmM[0]).toBe(-127);
    expect(d.acr[0]).toBe(8000);
    expect(d.mid[0]).toBe(7);
    expect(d.ao[0]).toBe(255);
    expect(d.posF.length).toBe(6);
  });

  it('loads gzip and plain bytes, caching per name', async () => {
    const f = vi.fn(async () => new Response(gzipSync(raw)));
    vi.stubGlobal('fetch', f);
    const a = loadPack(manifest, 't');
    expect(loadPack(manifest, 't')).toBe(a);
    expect((await a).mid[0]).toBe(7);
    expect(f).toHaveBeenCalledTimes(1);

    const m2 = { ...manifest, packs: [{ ...info, name: 'p' }] } as Manifest;
    vi.stubGlobal('fetch', async () => new Response(raw));
    expect((await loadPack(m2, 'p')).mid[0]).toBe(7);
  });

  it('rejects on a failed fetch and allows retry', async () => {
    const m3 = { ...manifest, packs: [{ ...info, name: 'q' }] } as Manifest;
    vi.stubGlobal('fetch', async () => new Response('', { status: 404 }));
    await expect(loadPack(m3, 'q')).rejects.toThrow('HTTP 404');
    vi.stubGlobal('fetch', async () => new Response(raw));
    expect((await loadPack(m3, 'q')).mid[0]).toBe(7);
  });
});
