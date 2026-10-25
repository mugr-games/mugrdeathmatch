// Moderation reports to a Discord channel through a webhook (DISCORD_WEBHOOK_URL). Filtered messages and the
// owner's bans and kicks are posted as embeds, one at a time, waiting when Discord asks us to slow down.
// Mentions are switched off so nothing a player types can ping the channel.

const WEBHOOK = /^https:\/\/((ptb|canary)\.)?discord(app)?\.com\/api\/webhooks\/\d+\/[\w-]+$/;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const safe = (s, n) => String(s ?? '').replace(/`/g, 'ˋ').slice(0, n);

export function createReporter(url) {
  url = String(url || '').trim();
  const ok = WEBHOOK.test(url);
  if (!url) console.log('[moderation] DISCORD_WEBHOOK_URL is not set: filtered messages are only logged here');
  else if (!ok) console.log('[moderation] DISCORD_WEBHOOK_URL doesn\'t look like a Discord webhook address; reports are off');
  const queue = [];
  let busy = false;

  async function pump() {
    if (busy) return;
    busy = true;
    while (queue.length) {
      const body = queue.shift();
      try {
        const r = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
        if (r.status === 429) { // rate limited: wait as long as Discord says, then try the same one again
          const j = await r.json().catch(() => ({}));
          queue.unshift(body);
          await sleep(Math.min(30, j.retry_after || 2) * 1000);
          continue;
        }
        if (!r.ok) console.error('[moderation] webhook answered', r.status);
      } catch (e) { console.error('[moderation] webhook failed', e.message); }
      await sleep(1100);
    }
    busy = false;
  }

  function post(embed) {
    if (!ok || queue.length > 40) return; // a flood of reports is dropped rather than piling up
    queue.push({ username: 'MUGR Moderation', allowed_mentions: { parse: [] }, embeds: [{ ...embed, timestamp: new Date().toISOString() }] });
    pump();
  }

  return {
    // a filtered chat line, direct message or name
    flagged({ kind, who, account, where, text, level }) {
      console.log(`[moderation] ${level === 2 ? 'blocked' : 'starred'} ${kind} from ${who}: ${String(text).slice(0, 200)}`);
      post({
        title: level === 2 ? `Blocked ${kind}` : `Filtered ${kind}`,
        color: level === 2 ? 0xd83c3e : 0xe8a33d,
        description: '```\n' + safe(text, 900) + '\n```',
        fields: [
          { name: 'Player', value: safe(who, 64) || '?', inline: true },
          { name: 'Account', value: safe(account, 64) || 'guest', inline: true },
          { name: 'Where', value: safe(where, 100) || '?', inline: true },
          { name: 'Severity', value: level === 2 ? 'Slur, hate or self-harm: message withheld' : 'Swearing: starred out', inline: false },
        ],
      });
    },
    // owner actions: bans, unbans, kicks
    action(title, text) {
      console.log(`[moderation] ${title}: ${text}`);
      post({ title: safe(title, 200), color: 0x5865f2, description: safe(text, 1500) });
    },
  };
}
