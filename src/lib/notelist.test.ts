/**
 * Offline unit tests for the notelist classifier. No network, runs in `npm test`.
 *
 * Exists because the manual replay harness (notelist-missing.replay.ts) needs the
 * network and `.env`, so it is NOT part of `npm test` — and two regressions already
 * shipped past it: a namespace expansion that put MamouriBot into an edit war with
 * two humans on الگو:یادچپ (reverted 4 times), and a classifier blind spot that
 * silently stopped flagging a genuinely broken article (تحریم‌های آمریکا) as
 * anything but "clean". Both cases are pinned here as regression tests, with the
 * real wikitext shapes that broke, so a future change to this file cannot
 * reintroduce either without `npm test` catching it first.
 */
import {
  classify, containerIsMisplaced, containerIsSplit, hasContainerFor, hasNestedRefTemplate,
  looksLikeTemplateDefinition, looksMalformed, usedGroups,
} from './notelist.js';

let pass = 0, fail = 0;
function check(name: string, cond: boolean) {
  if (cond) pass++;
  else { fail++; console.log(`FAIL ${name}`); }
}

// ---- looksLikeTemplateDefinition: the incident guard ----
{
  // الگو:یادچپ's actual shape — an <includeonly> block building the #tag:ref call,
  // plus a trailing <noinclude> doc block. Standalone render triggers the Cite
  // error by construction; this must never be auto-fixed.
  const yadchap = `<includeonly>{{#tag:ref|{{{1|}}}|group=persian-alpha}}</includeonly><noinclude>
{{documentation}}
</noinclude>`;
  check('یادچپ-shaped template IS flagged as a template definition',
    looksLikeTemplateDefinition(yadchap));
  check('classify() defers it as unknown, not clean or missing-container',
    classify(yadchap, ['persian-alpha']).kind === 'unknown');

  // الگو:شجره‌نامه هرا's actual shape — bare <ref group> inside {{Tree chart}} calls,
  // no includeonly wrapper at all, but still a page meant to be transcluded.
  const treeChart = `{{Tree chart|AAA |AAA= الف<ref group="پ">یادداشت</ref>}}`;
  check('a template WITHOUT includeonly/noinclude is not caught by this guard alone',
    !looksLikeTemplateDefinition(treeChart));
  // (caught instead by looksMalformed on a single-letter non-Latin group — see below)

  // an ordinary article must never be caught by this guard
  const article = 'متن مقاله.<ref group="x">یادداشت</ref>\n== یادداشت‌ها ==\n{{یادداشت‌ها|گروه=x}}';
  check('an ordinary article is NOT flagged as a template definition', !looksLikeTemplateDefinition(article));
  check('a clean article classifies as clean', classify(article, ['x']).kind === 'clean');
}

// ---- containerIsSplit: تحریم‌های آمریکا regression ----
{
  // simplified shape of the live article: a group used, collected by its container,
  // then used AGAIN after the container — Cite only collects refs before the list.
  const split = `
<ref group="persian-alpha" name="OFAC">foo</ref>
== توضیحات ==
<references group="persian-alpha"/>
== منابع ==
<ref group="persian-alpha">bar</ref>
`;
  check('a container with notes split before AND after it is detected',
    containerIsSplit(split, 'persian-alpha'));
  check('classify() reports split-container, not a false clean',
    classify(split, ['persian-alpha']).kind === 'split-container');

  // every use before the container: NOT split (this is the ordinary clean case)
  const clean = `<ref group="x">a</ref>\n<ref group="x">b</ref>\n<references group="x"/>`;
  check('every use before its container is NOT split', !containerIsSplit(clean, 'x'));
  check('classifies as clean', classify(clean, ['x']).kind === 'clean');

  // every use after the container: this is misplaced-container, not split,
  // and must still be caught (containerIsMisplaced is checked first in classify)
  const misplaced = `<references group="x"/>\n== بدنه ==\n<ref group="x">a</ref>\n<ref group="x">b</ref>`;
  check('a container entirely above every use is NOT split (it is misplaced)',
    !containerIsSplit(misplaced, 'x'));
  check('containerIsMisplaced catches the fully-above case',
    containerIsMisplaced(misplaced, 'x'));
  check('classify() reports misplaced-container for it', classify(misplaced, ['x']).kind === 'misplaced-container');
}

// ---- the <references> self-match bug (shared false positive, fixed alongside split) ----
{
  // <references group="x"/> starts with the literal string "<ref" — hasNestedRefTemplate,
  // containerIsMisplaced and containerIsSplit all used a `<ref[^>]*group=` pattern that,
  // without the (?!erences) guard, matched the container as if it were a USE of its own
  // group. That would have made every clean page with a self-closing container look like
  // its own container was "stranded" relative to itself.
  const onlyContainer = `<references group="x"/>`;
  check('a lone <references> tag is not mistaken for a use of its own group',
    !containerIsMisplaced(onlyContainer, 'x') && !containerIsSplit(onlyContainer, 'x'));

  const noNestedRef = `<ref group="x">plain text, no sfn</ref>\n<references group="x"/>`;
  check('hasNestedRefTemplate does not fire on the container line itself',
    !hasNestedRefTemplate(noNestedRef, 'x'));
}

// ---- existing classes untouched by the incident fix (no regression) ----
{
  const missing = 'متن.<ref group="x">یادداشت</ref>';
  check('missing-container still detected with no container at all',
    classify(missing, ['x']).kind === 'missing-container');

  const nested = '<ref group="x">{{sfn|Smith|2020}}</ref>\n<references group="x"/>';
  check('nested-ref still detected ({{sfn}} inside a raw grouped ref)',
    classify(nested, ['x']).kind === 'nested-ref');

  check('a URL in group= is still malformed', looksMalformed('https://example.com'));
  check('a bare number in group= is still malformed', looksMalformed('3'));
  check('a normal group name is not malformed', !looksMalformed('persian-alpha'));

  check('hasContainerFor still recognises {{یادداشت‌ها}} for persian-alpha',
    hasContainerFor('{{یادداشت‌ها}}', 'persian-alpha'));
  check('usedGroups still finds a plain <ref group=…>',
    usedGroups('<ref group="x">a</ref>').includes('x'));
}

console.log(`${pass + fail} checks, ${fail} failing`);
if (fail) process.exit(1);
