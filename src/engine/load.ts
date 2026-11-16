// Engine data loader (R4 T6b): rig.json, the manifest's muscle parts and the five tables (segments, strengths,
// actions, loads, supports), fetched and assembled once per app run. The engine itself stays fetch-free (effort.ts).
import { loadRig, type Manifest } from '../body/load';
import { engineData, type EngineData } from './effort';
import type { LoadsJson, SupportsJson } from './setup';

export interface Engine { data: EngineData; tables: { loads: LoadsJson; supports: SupportsJson }; sources: string[] }

const get = async (name: string) => {
  const r = await fetch(`${import.meta.env.BASE_URL}data/${name}.json`);
  if (!r.ok) throw new Error(`${name}.json ${r.status}`);
  return r.json();
};

let cache: Promise<Engine> | null = null;

export function loadEngine(manifest: Manifest): Promise<Engine> {
  if (!cache) {
    cache = (async () => {
      const [rig, segments, strengths, actions, loads, supports] = await Promise.all(
        [loadRig(manifest), ...['segments', 'strengths', 'actions', 'loads', 'supports'].map(get)]);
      return {
        data: engineData({ rig, manifest, segments, strengths, actions }),
        tables: { loads, supports },
        sources: [segments, strengths, actions, loads, supports].flatMap((d: { sources: string[] }) => d.sources),
      };
    })();
    cache.catch(() => { cache = null; }); // allow a retry after a failed fetch
  }
  return cache;
}
