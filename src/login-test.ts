import { Bot } from './core.js';
async function main() {
  const bot = new Bot({ dryRun: false, delayMs: 0, limit: 0, maxlag: 5 });
  await (bot as any).login();
  const u = await bot.apiGet({ action: 'query', meta: 'userinfo', uiprop: 'rights|groups' });
  const info = u.query.userinfo;
  console.log('LOGGED IN AS:', info.name);
  console.log('groups:', (info.groups || []).join(', '));
  console.log('has bot right:', (info.rights || []).includes('bot'));
  console.log('can edit:', (info.rights || []).includes('edit'));
}
main().catch(e => { console.error('LOGIN FAILED:', e.message); process.exit(2); });
