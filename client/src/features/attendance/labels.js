/**
 * The clock screen's words, in English and Hindi.
 *
 * D6 in the decision log: the clock screen — and only the clock screen — carries
 * a pair for every label. English is primary and set larger; Hindi sits below in
 * a quieter weight. Both are always on screen. There is no language switcher,
 * because a switcher is a thing you have to read to use.
 *
 * No i18n library. Eleven strings on one screen do not justify one, and it would
 * then have to apply to six modules. Nothing else in the product is translated;
 * do not import this file outside features/attendance/.
 */
export const CLOCK_LABELS = {
  title: { en: 'Clock in / out', hi: 'हाज़िरी' },
  pickName: { en: 'Tap your name', hi: 'अपना नाम चुनें' },
  enterPin: { en: 'Enter your PIN', hi: 'अपना पिन डालें' },
  clockedIn: { en: "You're clocked in", hi: 'आप अंदर हैं' },
  clockedOut: { en: "You're clocked out", hi: 'आप बाहर हैं' },
  since: { en: 'Since', hi: 'से' },
  worked: { en: 'Worked', hi: 'काम किया' },
  undo: { en: 'Undo', hi: 'वापस लें' },
  wrongPin: { en: 'Wrong PIN. Try again.', hi: 'ग़लत पिन। फिर कोशिश करें।' },
  pinLocked: { en: 'PIN locked. Ask a manager.', hi: 'पिन लॉक है। मैनेजर से कहें।' },
  back: { en: 'Back', hi: 'पीछे' },
  clear: { en: 'Clear', hi: 'मिटाएँ' },
};

/** IN / OUT read on the state stamp, paired the same way. */
export const STATE_LABELS = {
  in: { en: 'In', hi: 'अंदर' },
  out: { en: 'Out', hi: 'बाहर' },
};
