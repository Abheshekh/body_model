// Form checks for every exercise record on both sexes (R5 T9a, plan R4 / 2b.6). Reads public/data like
// src/engine/load.ts, runs src/library/form.ts formChecks, writes the table to plans/raw/form.md and ends with
// "failing: N of M" (M = records; a record fails when any check fails on either sex). Exit 1 when N > 0.
// Runs the TypeScript sources directly: Node 24 strips types; the hook below adds the ".ts" the imports leave out.
// Usage: node tools/library/check.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import { registerHooks } from 'node:module';

registerHooks({
  resolve(spec, ctx, next) {
    try { return next(spec, ctx); } catch (e) {
      if (/^\.\.?\//.test(spec) && !/\.\w+$/.test(spec)) return next(spec + '.ts', ctx);
      throw e;
    }
  },
});
const { engineData } = await import('../../src/engine/effort.ts');
const { formChecks } = await import('../../src/library/form.ts');

const root = new URL('../../', import.meta.url);
const read = (f) => JSON.parse(readFileSync(new URL(`public/data/${f}`, root), 'utf8'));
const data = engineData({ rig: read('body/rig.json'), manifest: read('body/manifest.json'), segments: read('segments.json'), strengths: read('strengths.json'), actions: read('actions.json') });
const tables = { loads: read('loads.json'), supports: read('supports.json'), limits: read('joints.json').joints };
const eq = read('equipment.json');
const records = read('exercises.json').exercises;

const out = ['# Form checks (tools/library/check.mjs)', '', '| record | sex | check | ok | frame | value | limit | words |', '|---|---|---|---|---|---|---|---|'];
let failing = 0;
for (const rec of records) {
  let bad = false;
  for (const sex of ['male', 'female']) {
    for (const r of formChecks(rec, sex, data, tables, eq)) {
      bad ||= !r.ok;
      out.push(`| ${rec.id} | ${sex} | ${r.id} | ${r.ok ? 'ok' : 'FAIL'} | ${r.frame} | ${r.value.toFixed(3)} | ${r.limit} | ${r.words} |`);
    }
  }
  if (bad) { failing++; console.log(`FAIL ${rec.id}`); }
}
const last = `failing: ${failing} of ${records.length}`;
out.push('', last, '');
writeFileSync(new URL('docs/done_development/r5-library-tasks/plans/raw/form.md', root), out.join('\n'));
console.log(last);
process.exit(failing ? 1 : 0);
