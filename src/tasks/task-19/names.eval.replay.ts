/**
 * Measure the name splitter on the held-out pairs (research/persian-names/split.json in the
 * companion repository). Not part of `npm test`: the gold file lives outside this repo.
 *
 *   npx tsx src/tasks/task-19/names.eval.replay.ts ../research/persian-names/split.json
 *
 * Precision = right splits / splits made. Coverage = splits made / names. A wrong split is
 * the expensive error, so the threshold is on precision; coverage is what is left over.
 */
import { readFileSync } from 'fs';
import { SPLITTER, normName } from './names.js';

const file = process.argv[2] ?? '../research/persian-names/split.json';
const { test } = JSON.parse(readFileSync(file, 'utf8')) as { test: [string, string][] };
let made = 0, right = 0;
const wrong: string[] = [], abstained: string[] = [];
for (const [f, l] of test) {
  const full = `${f} ${l}`;
  const got = SPLITTER.split(full);
  if (!got) { abstained.push(full); continue; }
  made++;
  // the gold may keep a title the splitter drops («سید»): compare without titles
  const gf = normName(f).replace(/^(?:سید|سیده|دکتر|حاج|شیخ|میر)\s+/, '');
  if (normName(got[0]) === gf && normName(got[1]) === normName(l)) right++;
  else wrong.push(`${full}  →  [${got[0]}] [${got[1]}]   gold [${f}] [${l}]`);
}
const pct = (a: number, b: number) => (b ? (100 * a / b).toFixed(1) : '0') + '%';
console.log(`names ${test.length}  split ${made}  right ${right}`);
console.log(`precision ${pct(right, made)}   coverage ${pct(made, test.length)}`);
console.log('\nwrong:'); wrong.slice(0, 40).forEach(w => console.log('  ' + w));
console.log('\nabstained (sample):'); abstained.slice(0, 25).forEach(w => console.log('  ' + w));
