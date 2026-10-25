// Chat filter for game chat, direct messages and names.
//   level 0: fine.
//   level 1: swearing. The offending words are starred out and the message still goes through.
//   level 2: slurs, hate or telling someone to hurt themselves. The whole message is withheld.
// Messages at level 1 or 2 are reported to the moderation webhook. Text is normalised first, so common
// tricks don't slip past: l33t letters, accents, stretched letters (fuuuck) and spaced-out letters (f u c k).

const LEET = { 0: 'o', 1: 'i', '!': 'i', '|': 'i', 3: 'e', 4: 'a', '@': 'a', 5: 's', $: 's', 7: 't', '+': 't', 8: 'b', 9: 'g' };
const norm = (t) => String(t).normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[0-9!|@$+]/g, (c) => LEET[c] || c);
// letters only, with long runs shortened to two (fuuuuck -> fuuck, but "nigga" keeps its double g)
const squash = (t) => norm(t).replace(/[^a-z]/g, '').replace(/(.)\1{2,}/g, '$1$1');
// the text as single-spaced words, for phrases
const words = (t) => norm(t).replace(/[^a-z]+/g, ' ').trim();

// hate: matched anywhere in the squashed text, or as whole words where a shorter form would hit innocent words
const SEVERE_SQUASHED = [/nigg(a|er|uh|ah|az|as)/, /n+i+gg+e+r/, /fag+ot/, /retard/, /wetback/, /tranny/];
const SEVERE_WORDS = /\b(fags?|kikes?|chinks?|spi(c|ck)s?|coons?|kys|nazi(s)?)\b/;
const SEVERE_PHRASES = [/\bkill (your|ur|you|u|yo) ?self\b/, /\b(hang|neck|shoot) (your|ur|you|u) ?self\b/, /\bgo (die|kill yourself)\b/, /\bheil hitler\b/, /\bsieg heil\b/];
// swearing: matched within each word, with every doubled letter collapsed (fuuuck -> fuck, asshole -> ashole)
const once = (s) => s.replace(/(.)\1+/g, '$1');
const MILD_IN_WORD = /(fuck|fuk|fck|shit|cunt|bitch|biatch|whore|slut|ashole|arsehole|bastard|dickhead|wank|motherf)/;
const MILD_WORDS = /^(dick|dicks|cock|cocks|pusy|pusies|twat|twats|prick|tits|pis)$/;
// real words that happen to contain one of those
const ALLOWED = /^(scunthorpe|shitake|shiitake|dickens|cocktails?|cockpits?|peacocks?|hitchcock|hancock|cockroach(es)?|bastardi)$/;
const mild = (s) => !ALLOWED.test(s) && (MILD_IN_WORD.test(once(s)) || MILD_WORDS.test(once(s)));

export function checkText(text) {
  const raw = String(text || '');
  const sq = squash(raw), ws = words(raw);
  if (SEVERE_SQUASHED.some((r) => r.test(sq)) || SEVERE_WORDS.test(ws) || SEVERE_PHRASES.some((r) => r.test(ws)) || SEVERE_WORDS.test(words(sq))) {
    return { level: 2, clean: '*** message removed by the chat filter ***' };
  }
  let level = 0;
  const clean = raw.split(/(\s+)/).map((tok) => {
    if (!tok.trim()) return tok;
    const s = squash(tok);
    if (s && mild(s)) { level = 1; return '*'.repeat(Math.min(8, tok.length)); }
    return tok;
  }).join('');
  // swearing hidden by spacing letters out ("f u c k") shows up only in the squashed whole
  if (!level && MILD_IN_WORD.test(once(sq)) && /(\b\w\b\s*){4,}/.test(raw)) return { level: 1, clean: raw.replace(/\S/g, '*') };
  return { level, clean };
}

// a name is unacceptable if anything in it would be filtered
export function badName(name) {
  return checkText(name).level > 0 || mild(squash(name));
}
