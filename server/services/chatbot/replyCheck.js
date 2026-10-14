/**
 * The server's check on every reply before it reaches a guest. P51 section 12
 * step 6.
 *
 * The model words the reply; this decides whether it may be sent. Every rupee
 * amount, time, link and booking reference in it must appear in what the
 * server gave the model (tool results, the facts block, earlier results kept in
 * the chat) or in the guest's own words. A claim that messages are stopped
 * must be true in the database. A claim that a booking is confirmed needs a
 * source that says so. And it must be short.
 */

export const MAX_REPLY_CHARACTERS = 900;
export const MAX_BUTTONS = 3;
export const MAX_BUTTON_CHARACTERS = 20;

const OPTIONS_LINE = /\n?\s*\[Options:\s*([^\]]+)\]\s*$/i;
const AMOUNT = /(?:₹|\bRs\.?|\bINR)\s?(\d[\d,]*(?:\.\d{1,2})?)/gi;
const TIME_12 = /\b(\d{1,2})(?:[:.](\d{2}))?\s?(am|pm|a\.m\.|p\.m\.)/gi;
const TIME_24 = /\b([01]?\d|2[0-3]):([0-5]\d)\b(?!\s?(?:am|pm|a\.m\.|p\.m\.))/gi;
const LINK = /https?:\/\/[^\s)\]]+/gi;
const REFERENCE = /\b[RW]-\d+\b/gi;
/** Words that tell a guest their messages are stopped, in the languages the assistant speaks. */
const STOP_CLAIM = /(unsubscrib|you (?:won'?t|will not) (?:get|receive)|(?:won'?t|will not) (?:send|message) you|no (?:more|longer)[^.]{0,25}(?:message|offer|promotion)|stopped (?:sending|your|all|the)|band kar (?:diya|di|diye|denge)|nahi (?:bheje|aayenge|milenge)|નહીં મોકલ|બંધ કર|नहीं भेज|बंद कर)/i;
/** A claim that a booking IS confirmed; "the restaurant will confirm it" is not one. */
const CONFIRMED_CLAIM = /\b(?:is|are|has been|have been|now)\s+confirmed\b|\byour (?:table|booking)(?: is)? confirmed\b|कन्फर्म हो (?:गई|गया)|કન્ફર્મ થ(?:ઈ|યું)/i;

const paiseOf = (text) => Math.round(Number(String(text).replace(/,/g, '')) * 100);

function amountsIn(text) {
  return [...String(text).matchAll(AMOUNT)].map((match) => paiseOf(match[1]));
}

/** Every time in a text, as minutes after midnight. */
function timesIn(text) {
  const found = [];
  for (const match of String(text).matchAll(TIME_12)) {
    const hour = Number(match[1]);
    const minute = Number(match[2] ?? 0);
    if (hour < 1 || hour > 12 || minute > 59) continue;
    const pm = /^p/i.test(match[3]);
    found.push(((hour % 12) + (pm ? 12 : 0)) * 60 + minute);
  }
  for (const match of String(text).matchAll(TIME_24)) found.push(Number(match[1]) * 60 + Number(match[2]));
  return found;
}

/** The reply without its options line, and the buttons it asked for. */
export function splitOptions(reply) {
  const match = String(reply ?? '').match(OPTIONS_LINE);
  if (!match) return { text: String(reply ?? '').trim(), buttons: [] };
  const buttons = match[1]
    .split('|')
    .map((option) => option.trim().slice(0, MAX_BUTTON_CHARACTERS))
    .filter(Boolean)
    .slice(0, MAX_BUTTONS);
  return { text: String(reply).slice(0, match.index).trim(), buttons };
}

/**
 * `{ ok, reasons, text, buttons }`. `allowed` is everything the reply may draw
 * facts from, as text. `messagesAreStopped` is the database's own answer: the
 * guest has no live offers consent, or has stopped all messages.
 */
export function checkReply(reply, { allowed, messagesAreStopped }) {
  const { text, buttons } = splitOptions(reply);
  const reasons = [];
  if (!text) reasons.push('The reply is empty.');
  if (text.length > MAX_REPLY_CHARACTERS) reasons.push(`The reply is longer than ${MAX_REPLY_CHARACTERS} characters.`);

  const corpus = String(allowed ?? '');
  const allowedAmounts = new Set(amountsIn(corpus));
  for (const amount of amountsIn(text)) {
    if (!allowedAmounts.has(amount)) reasons.push(`The amount ₹${(amount / 100).toFixed(2)} did not come from a tool.`);
  }
  const allowedTimes = new Set(timesIn(corpus));
  for (const minutes of timesIn(text)) {
    if (!allowedTimes.has(minutes)) reasons.push(`The time ${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')} did not come from a tool.`);
  }
  for (const link of text.match(LINK) ?? []) {
    if (!corpus.includes(link.replace(/[.,]$/, ''))) reasons.push('A link did not come from a tool.');
  }
  const upperCorpus = corpus.toUpperCase();
  for (const reference of text.match(REFERENCE) ?? []) {
    if (!upperCorpus.includes(reference.toUpperCase())) reasons.push(`The reference ${reference} did not come from a tool.`);
  }
  if (STOP_CLAIM.test(text) && !messagesAreStopped) reasons.push('The reply says messages are stopped, but stop_messages was not called.');
  if (CONFIRMED_CLAIM.test(text) && !/confirmed/i.test(corpus)) reasons.push('The reply says a booking is confirmed; it is a request the restaurant still has to confirm.');

  return { ok: reasons.length === 0, reasons, text, buttons };
}

export default { checkReply, splitOptions };
