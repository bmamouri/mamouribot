/**
 * Read-only access to the Wikimedia replica database (`fawiki_p`).
 *
 * WHY NOT THE API
 * ---------------
 * The one question this exists to answer is "every article title in ns0", for a report
 * that checks each title against a spelling rule. Three ways were tried:
 *
 *   - `list=allpages`: the API caps a page at 50 titles for a client without
 *     apihighlimits, and `core.ts` holds GETs 1.2s apart to stay off the rate limiter.
 *     That is 21,000 requests, about seven hours. Not a daily job.
 *   - `intitle:/regex/` via CirrusSearch: fa.wikipedia does not have the regex plugin
 *     enabled for titles, and it does not say so. The query silently degrades to a
 *     fuzzy term match: `intitle:/فرآیند/` returns 157 "hits" whose first result is
 *     «فرگشت», which does not contain the word at all. A detector built on it would
 *     fire on everything and look like it was working.
 *   - the replica: one query, a few seconds.
 *
 * SO THE RULES STAY IN ONE PLACE
 * ------------------------------
 * This module deliberately offers no WHERE clause for callers to filter with. The
 * temptation is to push each rule into SQL as a `LIKE` prefilter, which then has to be
 * a proven superset of the TypeScript rule or the report silently loses rows — two
 * implementations of one rule, drifting. Instead it hands back every title and the
 * caller's own rule engine is the only authority. 1.07M titles is about 30 MB and a
 * few hundred milliseconds to filter in process.
 *
 * TWO BACKENDS
 * ------------
 *   direct — `mysql2` to the analytics replica, credentials from `~/replica.my.cnf`.
 *            This is how a Toolforge job reaches it; the `sql` CLI wrapper exists on
 *            the bastion but not inside a job image.
 *   ssh    — for a developer machine, which has no route to the replica at all: run
 *            the same query through `become <tool> mysql` over the bastion.
 *
 * `auto` picks direct when the credentials file is there, ssh otherwise.
 */
import { spawn } from 'child_process';
import { existsSync, readFileSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';

export type Backend = 'auto' | 'direct' | 'ssh';

const CREDENTIALS = join(homedir(), 'replica.my.cnf');
const SSH_HOST = process.env.TOOLFORGE_SSH ?? 'mamouri@login.toolforge.org';
const SSH_TOOL = process.env.TOOLFORGE_TOOL ?? 'mamouribot';
/** Which wiki's replica to read. Each has its own host and database. */
export type Wiki = 'fa' | 'en';
const WIKIS: Record<Wiki, { db: string; host: string }> = {
  fa: { db: 'fawiki_p', host: 'fawiki.analytics.db.svc.wikimedia.cloud' },
  en: { db: 'enwiki_p', host: 'enwiki.analytics.db.svc.wikimedia.cloud' },
};

export function chooseBackend(mode: Backend = 'auto'): Exclude<Backend, 'auto'> {
  if (mode !== 'auto') return mode;
  return existsSync(CREDENTIALS) ? 'direct' : 'ssh';
}

/** `~/replica.my.cnf` is an ini file with `[client]`, `user=` and `password=`. */
export function parseCredentials(ini: string): { user: string; password: string } {
  const get = (k: string) => {
    const m = new RegExp(`^\\s*${k}\\s*=\\s*'?([^'\\n\\r]*?)'?\\s*$`, 'm').exec(ini);
    if (!m) throw new Error(`replica.my.cnf has no ${k}`);
    return m[1];
  };
  return { user: get('user'), password: get('password') };
}

function run(cmd: string, args: string[], stdin: string, timeoutMs: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args, { stdio: ['pipe', 'pipe', 'pipe'] });
    let out = '', err = '';
    const timer = setTimeout(() => { p.kill('SIGKILL'); reject(new Error(`${cmd} timed out after ${timeoutMs}ms`)); }, timeoutMs);
    p.stdout.setEncoding('utf8');
    p.stdout.on('data', c => { out += c; });
    p.stderr.on('data', c => { err += c; });
    p.on('error', e => { clearTimeout(timer); reject(e); });
    p.on('close', code => {
      clearTimeout(timer);
      if (code !== 0) reject(new Error(`${cmd} exited ${code}: ${err.slice(0, 500)}`));
      else resolve(out);
    });
    p.stdin.end(stdin);
  });
}

/**
 * Every article title in ns0, spaces not underscores.
 *
 * A zero here would be indistinguishable from "the wiki is empty", and this feeds a
 * report that publishes a page, so an empty result is treated as a failure rather than
 * as a clean run with nothing to say. See
 * lessons/verification-and-gates/a-zero-needs-a-positive-control.md.
 */
export async function articleTitles(mode: Backend = 'auto'): Promise<string[]> {
  const rows = await queryRows(
    'SELECT page_title FROM page WHERE page_namespace = 0 AND page_is_redirect = 0',
    { mode });
  return rows.map(r => r.page_title.replace(/_/g, ' '));
}

/**
 * Any SELECT, as rows of strings, from either wiki's replica.
 *
 * Everything is a string: the ssh backend goes through `mysql --batch`, which has no
 * types to give, so the direct backend is coerced to match rather than the two
 * disagreeing depending on where the bot happens to be running. Callers parse.
 *
 * Same zero rule as above — an empty result is a failure, not a clean run.
 */
export async function queryRows(
  sql: string, opts: { wiki?: Wiki; mode?: Backend } = {},
): Promise<Record<string, string>[]> {
  const wiki = opts.wiki ?? 'fa';
  const backend = chooseBackend(opts.mode ?? 'auto');
  const rows = backend === 'direct' ? await rowsViaMysql(sql, wiki) : await rowsViaSsh(sql, wiki);
  if (!rows.length) throw new Error(`replica returned no rows over ${backend} (${wiki}) — refusing to treat that as an empty wiki`);
  return rows;
}

async function rowsViaSsh(sql: string, wiki: Wiki): Promise<Record<string, string>[]> {
  // `mysql` directly, not the `sql` wrapper: the wrapper treats any argument after the
  // database name as part of the query ("More than one argument given; joining SQL
  // query words with spaces") and so silently swallows --batch, producing no output
  // and no error.
  //
  // --batch gives tab-separated output with a header line and no box drawing;
  // --raw stops mysql escaping tabs and newlines inside values, which would otherwise
  // turn one title into two rows.
  // The credentials path is spelled out rather than written as $HOME: the variable
  // would be expanded by the login shell, as the `mamouri` user, before `become`
  // switches to the tool, and point at the wrong home.
  const { db, host } = WIKIS[wiki];
  const home = `/data/project/${SSH_TOOL}`;
  const remote = `cat > ${home}/.replica.sql && mysql --defaults-file=${home}/replica.my.cnf `
    + `-h ${host} ${db} --batch --raw < ${home}/.replica.sql`;
  const out = await run('ssh', ['-o', 'BatchMode=yes', SSH_HOST,
    `become ${SSH_TOOL} bash -c ${JSON.stringify(remote)}`], sql, 10 * 60_000);
  const lines = out.split('\n').filter(l => l.length > 0);
  if (!lines.length) throw new Error(`no output from the replica over ssh: ${out.slice(0, 200)}`);
  const cols = lines[0].split('\t');
  return lines.slice(1).map(l => {
    const cells = l.split('\t');
    return Object.fromEntries(cols.map((c, i) => [c, cells[i] ?? ''])) as Record<string, string>;
  });
}

async function rowsViaMysql(sql: string, wiki: Wiki): Promise<Record<string, string>[]> {
  const { user, password } = parseCredentials(readFileSync(CREDENTIALS, 'utf8'));
  // Imported lazily so a developer machine, which uses the ssh backend, does not need
  // the driver installed at all.
  const mysql = await import('mysql2/promise');
  const { db, host } = WIKIS[wiki];
  const conn = await mysql.createConnection({
    host, user, password, database: db,
    // page_title is binary; without this the driver hands back Buffers.
    charset: 'utf8mb4', connectTimeout: 30_000,
  });
  try {
    const [rows] = await conn.query(sql) as unknown as [Record<string, unknown>[]];
    // Coerced to strings so this backend and the ssh one return the same shape; several
    // of these columns are binary and would otherwise arrive as Buffers.
    return rows.map(r => Object.fromEntries(Object.entries(r).map(
      ([k, v]) => [k, Buffer.isBuffer(v) ? v.toString('utf8') : v === null ? '' : String(v)])));
  } finally {
    await conn.end();
  }
}
