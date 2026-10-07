/**
 * Unit tests for the pure parts of the de-stub inventory: title normalisation
 * and ZWNJ variant generation. No network.
 *
 *   npx tsx src/tasks/destub-inventory.test.ts
 */
import { normTemplateName, zwnjVariants, expectedCats, type Inventory } from './destub-inventory-lib.js';

const ZWNJ = '‌';
let fail = 0;
function eq(actual: unknown, expected: unknown, label: string) {
  const a = JSON.stringify(actual), b = JSON.stringify(expected);
  if (a === b) { console.log(`  ✓ ${label}`); return; }
  console.log(`  ✗ ${label}\n      انتظار: ${b}\n      حاصل  : ${a}`);
  fail++;
}

console.log('normTemplateName');
eq(normTemplateName('الگو:فوتبال-خرد'), 'فوتبال-خرد', 'strips the Persian ns prefix');
eq(normTemplateName('Template:Iran-stub'), 'Iran-stub', 'strips the English ns prefix');
eq(normTemplateName(':الگو:فوتبال-خرد'), 'فوتبال-خرد', 'strips a leading colon');
eq(normTemplateName('الگو : فوتبال-خرد'), 'فوتبال-خرد', 'tolerates spaces around the colon');
eq(normTemplateName('فوتبال_خرد'), 'فوتبال خرد', 'underscore becomes a space');
eq(normTemplateName('  فوتبال-خرد \n'), 'فوتبال-خرد', 'trims surrounding whitespace');
eq(normTemplateName('فوتبال   خرد'), 'فوتبال خرد', 'collapses runs of spaces');
eq(normTemplateName('iran-stub'), 'Iran-stub', 'upper-cases the first character');
eq(normTemplateName('IRAN-STUB'), 'IRAN-STUB', 'leaves the rest of the case alone');
// The load-bearing negative: a trailing ZWNJ makes a DIFFERENT page title, so
// trimming it would map a redlink onto a real template.
eq(normTemplateName(`فوتبال-خرد${ZWNJ}`), `فوتبال-خرد${ZWNJ}`, 'does NOT trim a trailing ZWNJ');
eq(normTemplateName(`ریاضی${ZWNJ}دان-خرد`), `ریاضی${ZWNJ}دان-خرد`, 'leaves an internal ZWNJ intact');
// A colon that is part of the name, not a namespace.
eq(normTemplateName('الگو:خرد:آزمایش'), 'خرد:آزمایش', 'strips only the namespace prefix');
eq(normTemplateName('فوتبال:خرد'), 'فوتبال:خرد', 'keeps a non-namespace prefix');

console.log('zwnjVariants');
eq(zwnjVariants(`ریاضی${ZWNJ}دان`).sort(), ['ریاضیدان', 'ریاضی دان'].sort(), 'ZWNJ → space and nothing');
eq(zwnjVariants('ریاضی دان'), [`ریاضی${ZWNJ}دان`], 'space → ZWNJ');
eq(zwnjVariants('Iran-stub'), [], 'nothing to vary');

console.log('expectedCats');
const inv = {
  fetched: new Date().toISOString(), metaTemplate: '', allStubsCat: 'همه مقاله‌های خرد',
  templates: {
    'الگو:خرد': { canonical: 'الگو:خرد', aliases: [], cats: ['مقاله‌های خرد'], dispatcher: true as const },
    'الگو:فوتبال-خرد': { canonical: 'الگو:فوتبال-خرد', aliases: [], cats: ['مقاله‌های خرد فوتبال'] },
  },
  index: { 'خرد': 'الگو:خرد', 'فوتبال-خرد': 'الگو:فوتبال-خرد' },
  unresolvedVariants: [],
} satisfies Inventory;
eq(expectedCats(inv, 'الگو:فوتبال-خرد'), ['مقاله‌های خرد فوتبال'], 'plain tag returns its own cats');
eq(expectedCats(inv, 'الگو:خرد'), ['مقاله‌های خرد'], '{{خرد}} bare returns the generic cat');
eq(expectedCats(inv, 'الگو:خرد', 'فوتبال'), ['مقاله‌های خرد فوتبال'], '{{خرد|فوتبال}} follows the argument');
eq(expectedCats(inv, 'الگو:خرد', '  فوتبال '), ['مقاله‌های خرد فوتبال'], 'argument is trimmed');
// A red {{X-خرد}}: unknowable cats, so the caller must defer to a human rather
// than assume none were removed.
eq(expectedCats(inv, 'الگو:خرد', 'موضوع‌ناشناخته'), null, 'unknown argument returns null');

console.log(fail === 0 ? '\nهمهٔ آزمون‌ها موفق.' : `\n${fail} آزمون ناموفق.`);
process.exit(fail === 0 ? 0 : 1);
