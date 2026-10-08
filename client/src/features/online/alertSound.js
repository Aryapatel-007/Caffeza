/**
 * The sound of the online alert. P23, DESIGN-SYSTEM's rule that nothing on
 * screen loops: the alert is heard, not animated.
 *
 * A two-note chime made with the Web Audio API, with no sound file to load,
 * and a spoken line through the browser's own speech. Browsers allow sound
 * only after a person has tapped the page, so `unlockSound` is called on the
 * first tap and `soundIsUnlocked` tells the banner whether to ask for one.
 */
import { formatTimeIst, formatWeekdayIst } from '../../utils/formatDate.js';

let context = null;
let unlocked = false;
const listeners = new Set();

export function soundIsUnlocked() {
  return unlocked;
}

export function onUnlockChange(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Called from a tap. Creates or resumes the audio context the chime plays through. */
export function unlockSound() {
  try {
    const AudioContextClass = window.AudioContext ?? window.webkitAudioContext;
    if (!AudioContextClass) return;
    context ??= new AudioContextClass();
    if (context.state === 'suspended') context.resume();
    if (!unlocked) {
      unlocked = true;
      listeners.forEach((listener) => listener(true));
    }
  } catch {
    // No audio on this device. The banner still shows.
  }
}

/** Two short notes, rising. About half a second. */
export function chime() {
  if (!context || context.state !== 'running') return;
  const start = context.currentTime;
  [
    { frequency: 880, at: 0 },
    { frequency: 1320, at: 0.18 },
  ].forEach(({ frequency, at }) => {
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = 'sine';
    oscillator.frequency.value = frequency;
    gain.gain.setValueAtTime(0.0001, start + at);
    gain.gain.exponentialRampToValueAtTime(0.35, start + at + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + at + 0.3);
    oscillator.connect(gain).connect(context.destination);
    oscillator.start(start + at);
    oscillator.stop(start + at + 0.32);
  });
}

/** Says a line aloud in Indian English, after the chime. */
export function speak(text) {
  try {
    if (!('speechSynthesis' in window) || !text) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'en-IN';
    utterance.rate = 0.95;
    const voice = window.speechSynthesis.getVoices().find((candidate) => candidate.lang === 'en-IN');
    if (voice) utterance.voice = voice;
    window.speechSynthesis.speak(utterance);
  } catch {
    // Speech is a help, not a requirement. The chime and the banner remain.
  }
}

/** "7 30 PM" reads better aloud than "7:30 pm". */
const spokenTime = (value) =>
  formatTimeIst(value)
    .replace(':', ' ')
    .replace(/\s?([ap])m$/i, (_, letter) => ` ${letter.toUpperCase()}M`);

/** The line spoken for the newest request, from the inbox's `latest` block. */
export function spokenLine(latest) {
  if (!latest) return '';
  const reference = latest.reference.replace('-', ' ');
  if (latest.kind === 'ONLINE_ORDER') {
    const items = latest.itemCount === 1 ? '1 item' : `${latest.itemCount} items`;
    return `New takeaway order, ${reference}, ${items}, pickup ${spokenTime(latest.pickupAt)}.`;
  }
  const people = latest.partySize === 1 ? '1 person' : `${latest.partySize} people`;
  return `New table booking, ${reference}, ${people}, ${formatWeekdayIst(latest.at)} ${spokenTime(latest.at)}.`;
}
