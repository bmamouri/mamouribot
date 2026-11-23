/**
 * وظیفهٔ ۱۶ — offline tests for the tracking-parameter half.
 *
 *   npx tsx src/tasks/task-16/tracking-params.test.ts
 *
 * The URLs are from the 456-page sample (۲۴ نوامبر ۲۰۲۶) named in each case.
 */
import { stripTrackingParams, cleanUrl } from './tracking-params.js';
import { cleanUrls } from './strip-text-fragment.js';

let pass = 0;
const fails: string[] = [];
function ok(what: string, cond: boolean, detail = '') {
  if (cond) { pass++; console.log(`  ✓ ${what}`); }
  else { fails.push(`${what}${detail ? ` — ${detail}` : ''}`); console.log(`  ✗ ${what}\n      ${detail}`); }
}
const eq = (what: string, a: unknown, b: unknown) =>
  ok(what, JSON.stringify(a) === JSON.stringify(b), `${JSON.stringify(a)} ≠ ${JSON.stringify(b)}`);
const url = (u: string) => cleanUrl(u).url;

console.log('== Facebook ==');
eq('mibextid (میلاد زارع)', url('https://www.facebook.com/reel/177944808462352/?mibextid=rS40aB7S9Ucbxw6v'),
   'https://www.facebook.com/reel/177944808462352/');
eq('fbclid on any site (سورن آساطوریان)', url('http://www.anunner.com/?fbclid=IwAR3bzwapJkkTtI4I6QPOaZ8'),
   'http://www.anunner.com/');
eq('fbid/set/type kept; mibextid removed', url('https://www.facebook.com/photo.php?fbid=732743525561632&set=a.311552327680756&type=3&mibextid=WC7FNe'),
   'https://www.facebook.com/photo.php?fbid=732743525561632&set=a.311552327680756&type=3');
eq('__xts__[0], __tn__, paipv, eav go; type and source stay',
   url('https://m.facebook.com/voafarsi/photos/a.453577731440/10158786978551441/?type=3&source=48&__xts__%5B0%5D=12.Abr&__tn__=EH-R&paipv=0&eav=AfZi'),
   'https://m.facebook.com/voafarsi/photos/a.453577731440/10158786978551441/?type=3&source=48');
eq('story_fbid and id kept', url('https://www.facebook.com/story.php?story_fbid=726521816256286&id=100066954217930&mibextid=oFDknk&rdid=5u7ERa86ha6lpVrk'),
   'https://www.facebook.com/story.php?story_fbid=726521816256286&id=100066954217930');
eq('profile.php?id= untouched', url('https://www.facebook.com/profile.php?id=100069390601712'),
   'https://www.facebook.com/profile.php?id=100069390601712');

console.log('\n== Instagram ==');
eq('igsh (غ)', url('https://www.instagram.com/reel/C3xVqkOuhXv/?igsh=MXQzNDB2bTRxOTB4ag=='),
   'https://www.instagram.com/reel/C3xVqkOuhXv/');
eq('utm_source + igshid', url('https://www.instagram.com/p/BpXhWtbH4iG/?utm_source=ig_share_sheet&igshid=cus9ydtb5slz'),
   'https://www.instagram.com/p/BpXhWtbH4iG/');
eq('hl kept', url('https://www.instagram.com/rasadbalochistaan/p/CtL2FUJP1jn/?hl=fa'),
   'https://www.instagram.com/rasadbalochistaan/p/CtL2FUJP1jn/?hl=fa');

console.log('\n== YouTube ==');
eq('si first, v kept (خانواده خشک‌شویی)', url('https://www.youtube.com/watch?si=EhBr_UN_3JIr7m3K&v=Ni8N7Zss6q4&feature=youtu.be'),
   'https://www.youtube.com/watch?v=Ni8N7Zss6q4');
eq('ab_channel', url('https://www.youtube.com/watch?v=I7zx0N5jD3w&ab_channel=Mundukos'),
   'https://www.youtube.com/watch?v=I7zx0N5jD3w');
eq('pp', url('https://www.youtube.com/watch?v=IQlCGC_zSCE&pp=ygUII2VkaWR0ZW0='),
   'https://www.youtube.com/watch?v=IQlCGC_zSCE');
eq('list, index and t (a timestamp) kept', url('https://www.youtube.com/watch?t=511&v=6cSyH3FyJu4&list=PLx&index=3&feature=youtu.be'),
   'https://www.youtube.com/watch?t=511&v=6cSyH3FyJu4&list=PLx&index=3');
eq('youtu.be ?si', url('https://youtu.be/MI9ZpIKgyf0?si=LO89ImlWIrCpM15w'), 'https://youtu.be/MI9ZpIKgyf0');
eq('si on another host is not tracking', url('https://example.com/a?si=5'), 'https://example.com/a?si=5');

console.log('\n== X / Twitter, Spotify, Google ==');
eq('tweet t and s', url('https://twitter.com/rassool1359/status/1753780392128020550?t=pBEoALvfttgLVwQBDTWelA&s=19'),
   'https://twitter.com/rassool1359/status/1753780392128020550');
eq('ref_src', url('https://twitter.com/HyrcaniHRM/status/1696484758337814624?ref_src=twsrc%5Etfw'),
   'https://twitter.com/HyrcaniHRM/status/1696484758337814624');
eq('lang kept', url('https://x.com/mohd_karashi?lang=en'), 'https://x.com/mohd_karashi?lang=en');
eq('s on a non-tweet x.com page kept', url('https://x.com/search?q=a&s=1'), 'https://x.com/search?q=a&s=1');
eq('spotify si', url('https://open.spotify.com/artist/4O8DQCEBU9I1wQ274THitE?si=K576hxHGQqaTJivzJ8pWDA'),
   'https://open.spotify.com/artist/4O8DQCEBU9I1wQ274THitE');
eq('srsltid, other params in order (جنگ سوریه و افرایم)',
   url('https://www.degruyter.com/document/doi/10.1515/zaw-2022-3006/html?lang=de&srsltid=AfmBOoo7'),
   'https://www.degruyter.com/document/doi/10.1515/zaw-2022-3006/html?lang=de');
eq('utm_* in the middle', url('https://w.com/a?noredirect=on&utm_term=.7052&id=4'), 'https://w.com/a?noredirect=on&id=4');
eq('fragment kept', url('https://x.com/a?utm_source=t&id=5#sec'), 'https://x.com/a?id=5#sec');

console.log('\n== left alone ==');
eq('archive URL is byte-exact', url('https://web.archive.org/web/20250807234612/https://www.youtube.com/watch?si=lVsn&v=Em8t6PHlew4'),
   'https://web.archive.org/web/20250807234612/https://www.youtube.com/watch?si=lVsn&v=Em8t6PHlew4');
eq('entity-encoded query', url('https://www.youtube.com/watch?v=zQELp93xxfo&#x20;Fake&amp;si=1'),
   'https://www.youtube.com/watch?v=zQELp93xxfo&#x20;Fake&amp;si=1');
eq('hash route before the query', url('https://site.ir/#/news?utm_source=x'), 'https://site.ir/#/news?utm_source=x');
{
  const t = 'دیده شود: https://twitter.com/mafiagame/status/1260570564844040194?s=20.';
  ok('last param + trailing period: unchanged', !stripTrackingParams(t).changed);
}
{
  const t = '<!-- https://x.com/a?utm_source=t --><nowiki>https://x.com/b?fbclid=1</nowiki>';
  ok('comments and nowiki untouched', !stripTrackingParams(t).changed);
}

console.log('\n== in wikitext ==');
{
  const t = '<ref>{{یادکرد وب|نشانی=https://www.facebook.com/reel/1/?mibextid=rS40|عنوان=الف}}</ref> و '
    + '[https://www.youtube.com/watch?v=I7zx0N5jD3w&ab_channel=Mundukos ویدئو] و https://x.com/a?utm_source=t.';
  const r = stripTrackingParams(t);
  eq('template param, bracket link and bare URL', r.text,
     '<ref>{{یادکرد وب|نشانی=https://www.facebook.com/reel/1/|عنوان=الف}}</ref> و '
     + '[https://www.youtube.com/watch?v=I7zx0N5jD3w ویدئو] و https://x.com/a?utm_source=t.');
  eq('removed keys reported', r.removed, ['mibextid', 'ab_channel']);
}
{
  const t = "{{Cite web|url=https://www.youtube.com/watch?v=TfFnSorGczc&feature=relmfu}}";
  eq('closing braces not eaten', stripTrackingParams(t).text, '{{Cite web|url=https://www.youtube.com/watch?v=TfFnSorGczc}}');
}
{
  const t = "''https://x.com/a?fbclid=1''";
  eq('italic markup ends the URL', stripTrackingParams(t).text, "''https://x.com/a''");
}

console.log('\n== both halves together ==');
{
  const r = cleanUrls('https://x.com/a?utm_source=t&id=2#:~:text=hello%20world');
  eq('fragment then tracking', r.text, 'https://x.com/a?id=2');
  ok('reports both', r.fragments && r.tracking);
  ok('idempotent', !cleanUrls(r.text).changed);
}

console.log(`\n${pass} گذشت، ${fails.length} افتاد`);
if (fails.length) { console.error('failing:\n  - ' + fails.join('\n  - ')); process.exit(1); }
