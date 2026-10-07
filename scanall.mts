import { apiGet } from '/Users/baqer/dev/homelab/wikipedia/bots/src/lib/fa-wiki.js';
import { readFileSync } from 'fs';
const titles = readFileSync('/tmp/repair-titles.txt', 'utf8').split('\n').map(s => s.trim()).filter(Boolean);
const bad: string[] = [];
let done = 0;
for (const t of titles) {
  const r = await apiGet({ action: 'parse', page: t, prop: 'text', formatversion: '2' });
  const html = r.parse?.text ?? '';
  const nd = html.replace(/<[^>]+>/g, ' ').split('نیازمند').length - 1;
  if (nd) bad.push(`${t} (${nd})`);
  if (++done % 20 === 0) console.error(`  …${done}/${titles.length}`);
}
console.log(`pages showing «نیازمند» after the repair: ${bad.length} of ${titles.length}`);
bad.forEach(b => console.log('   ', b));
