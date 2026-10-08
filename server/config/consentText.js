/**
 * The exact sentence a guest agrees to when they tick the offers box on the
 * public page. P23 (M14).
 *
 * Every request stores the `version` it was shown, so what a guest agreed to
 * can always be shown later, which India's Digital Personal Data Protection
 * Act expects of consent. Changing the wording means adding a new version
 * here, never editing an old one.
 *
 * `{restaurant}` is replaced with the restaurant's name on the page.
 */
export const CONSENT_TEXTS = Object.freeze({
  '2026-10-v1': 'Send me offers and news from {restaurant} by SMS or WhatsApp.',
});

export const CURRENT_CONSENT_VERSION = '2026-10-v1';
