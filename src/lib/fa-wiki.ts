/**
 * Minimal fa.wikipedia API client shared by the one-off scripts in ../.
 * Cookie jar + two-step login + CSRF, with the plain-text-429 retry fa throttles
 * bursts with.
 */
import { readFileSync } from 'fs';

export const API = 'https://fa.wikipedia.org/w/api.php';

/**
 * Which wiki the helpers below talk to. Defaults to fa so every existing
 * caller is unaffected; call useWiki() first to retarget (the login is SUL, so
 * the same bot password works on en.wikipedia and Wikidata).
 */
let endpoint = API;
export function useWiki(url: string) {
  endpoint = url;
}

export const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Brave/1.71 Chrome/130.0.0.0 Safari/537.36';

export function loadEnv(path = '.env') {
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    const m = line.match(/^([A-Z_]+)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
}

export const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

const jar = new Map<string, string>();
export const cookie = () => [...jar].map(([k, v]) => `${k}=${v}`).join('; ');
function eat(r: Response) {
  for (const c of r.headers.getSetCookie()) {
    const [kv] = c.split(';');
    const i = kv.indexOf('=');
    jar.set(kv.slice(0, i).trim(), kv.slice(i + 1).trim());
  }
}

/** fa answers a burst with a plain-text body under HTTP 200; back off and retry. */
async function json(make: () => [string, RequestInit], what: string) {
  for (let attempt = 0; ; attempt++) {
    const [url, init] = make();
    let body: string;
    try {
      const r = await fetch(url, init);
      eat(r);
      body = await r.text();
    } catch (e) {
      // transport-level failure (DNS blip, reset connection) — same backoff
      if (attempt >= 5) throw e;
      console.log(`  ${what} request failed, retrying (${attempt + 1})`);
      await sleep(30000 * (attempt + 1));
      continue;
    }
    try {
      return JSON.parse(body) as any;
    } catch {
      if (attempt >= 5) throw new Error(`non-JSON on ${what}: ${body.slice(0, 120)}`);
      console.log(`  throttled on ${what}, backing off (${attempt + 1})`);
      await sleep(30000 * (attempt + 1));
    }
  }
}

export async function apiGet(p: Record<string, string>) {
  const u = new URL(endpoint);
  u.searchParams.set('format', 'json');
  u.searchParams.set('formatversion', '2');
  for (const k in p) u.searchParams.set(k, p[k]);
  await sleep(1200);
  return json(() => [u.toString(), { headers: { 'User-Agent': UA, cookie: cookie() } }], p.action);
}

export async function apiPost(p: Record<string, string>) {
  return json(
    () => [
      endpoint,
      {
        method: 'POST',
        headers: {
          'User-Agent': UA,
          cookie: cookie(),
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({ format: 'json', formatversion: '2', ...p }),
      },
    ],
    p.action,
  );
}

/** Logs in and returns the CSRF token, hard-gated on the expected identity. */
export async function login(expected = 'Mamouri') {
  const lt = (await apiGet({ action: 'query', meta: 'tokens', type: 'login' })).query.tokens
    .logintoken;
  const li = await apiPost({
    action: 'login',
    lgname: process.env.WIKIPEDIA_USERNAME!,
    lgpassword: process.env.WIKIPEDIA_PASSWORD!,
    lgtoken: lt,
  });
  if (li.login?.result !== 'Success') throw new Error(JSON.stringify(li));
  const token = (await apiGet({ action: 'query', meta: 'tokens' })).query.tokens.csrftoken;
  const who = await apiGet({ action: 'query', meta: 'userinfo' });
  if (who.query.userinfo.name !== expected)
    throw new Error(`wrong identity: ${who.query.userinfo.name}`);
  return token;
}

export async function readPage(title: string) {
  const q = await apiGet({
    action: 'query',
    titles: title,
    prop: 'revisions',
    rvprop: 'content|ids|timestamp',
    rvslots: 'main',
  });
  const p = q.query.pages[0];
  return {
    title,
    missing: !!p.missing,
    text: (p.revisions?.[0].slots.main.content as string) ?? '',
    revid: p.revisions?.[0].revid as number | undefined,
    timestamp: p.revisions?.[0].timestamp as string | undefined,
  };
}

export async function save(p: Record<string, string>) {
  let r = await apiPost(p);
  if (r.error?.code === 'abusefilter-warning') r = await apiPost(p); // ack the warning
  if (r.error) throw new Error(JSON.stringify(r.error));
  return r.edit;
}

/** Replaces `from` with `to`, asserting the anchor occurs exactly once. */
export function spliceOnce(text: string, from: string, to: string, where: string) {
  const n = text.split(from).length - 1;
  if (n !== 1) throw new Error(`anchor appears ${n}x in ${where}: ${JSON.stringify(from)}`);
  return text.replace(from, to);
}
