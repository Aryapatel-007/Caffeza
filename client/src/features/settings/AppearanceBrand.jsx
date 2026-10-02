import { useRef, useState } from 'react';

import { removeLogo, uploadLogo } from '../../api/brand.js';
import BrandLogo from '../../components/ui/BrandLogo.jsx';
import Button from '../../components/ui/Button.jsx';
import Input from '../../components/ui/Input.jsx';
import { useAuth } from '../../context/AuthContext.jsx';
import { checkBrandPair } from '../../utils/colour.js';
import { errorMessage } from './errorCopy.js';
import { checkLogoFile } from './logoFile.js';

/**
 * The brand parts of the Appearance page. P22, DESIGN-SYSTEM sections 4a, 4d,
 * 11a and 15: the logo slots, the brand colours and the neutral tone. Words
 * from docs/GLOSSARY.md section 14.
 */

const SLOTS = [
  {
    slot: 'LIGHT_GROUND',
    title: 'Logo for light screens',
    hint: 'Dark artwork on a transparent background. Shown by day.',
    theme: 'day',
    ground: 'light',
  },
  {
    slot: 'DARK_GROUND',
    title: 'Logo for dark screens',
    hint: 'Light artwork, on a transparent or its own solid background. Shown by night and on the sign-in screen.',
    theme: 'night',
    ground: 'dark',
  },
];

/** A subtree in one theme and one tone, like the preview's. */
export function Themed({ theme, neutral = 'COOL', style, className = '', children }) {
  return (
    <div data-theme={theme} data-neutral={neutral === 'WARM' ? 'warm' : 'cool'} style={style} className={`bg-ground text-ink ${className}`}>
      {children}
    </div>
  );
}

function LogoSlot({ slot, title, hint, theme, ground, neutral, reason, onDone }) {
  const { features, refreshFeatures } = useAuth();
  const meta = features.appearance?.logos?.[slot] ?? null;
  const input = useRef(null);
  const [problem, setProblem] = useState(null);
  const [busy, setBusy] = useState(false);

  const run = async (action, success) => {
    setBusy(true);
    setProblem(null);
    try {
      await action();
      await refreshFeatures().catch(() => {});
      onDone(success);
    } catch (error) {
      setProblem(errorMessage(error));
    } finally {
      setBusy(false);
    }
  };

  const choose = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    const checked = await checkLogoFile(file);
    if (!checked.ok) {
      setProblem(checked.message);
      return;
    }
    await run(() => uploadLogo(slot, { image: checked.image, reason: reason.trim() }), 'Logo saved.');
  };

  const needsReason = !reason.trim();

  return (
    <div className="flex flex-col gap-3 rounded-[10px] border border-line p-3">
      <div>
        <h3 className="type-label">{title}</h3>
        <p className="type-caption text-muted">{hint}</p>
      </div>
      <Themed theme={theme} neutral={neutral} className="flex min-h-24 items-center justify-center rounded-lg p-3">
        {meta ? (
          <BrandLogo slot={slot} ground={ground} height={64} maxWidth={240} />
        ) : (
          <span className="type-caption text-muted">No logo</span>
        )}
      </Themed>
      {meta && (
        <p className="type-num-meta text-muted">
          {meta.width} × {meta.height} px · {meta.contentType.replace('image/', '').toUpperCase()}
        </p>
      )}
      {problem && (
        <p role="alert" className="type-body rounded-lg border border-line border-l-[3px] border-l-alert p-3">
          {problem}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <input ref={input} type="file" accept="image/png,image/webp,image/jpeg" className="hidden" onChange={choose} />
        <Button variant="secondary" disabled={busy || needsReason} isLoading={busy} onClick={() => input.current?.click()}>
          Upload
        </Button>
        {meta && (
          <Button variant="secondary" disabled={busy || needsReason} onClick={() => run(() => removeLogo(slot, reason.trim()), 'Logo removed.')}>
            Remove
          </Button>
        )}
      </div>
    </div>
  );
}

export function LogoSection({ neutral, onDone }) {
  const [reason, setReason] = useState('');
  return (
    <section className="flex flex-col gap-3 rounded-[10px] border border-line bg-surface p-4">
      <h2 className="type-heading">Logo</h2>
      <p className="type-caption text-muted">
        PNG, WebP or JPEG, at most 200 KB and 1024 pixels, at least 128. Not SVG. The logo is never recoloured or cropped. When a
        screen has no logo for its ground, the other one is shown on a plate in the brand colour.
      </p>
      <Input
        label="Why are you changing the logo?"
        value={reason}
        maxLength={200}
        onChange={(event) => setReason(event.target.value)}
        hint="Recorded with the change. Needed before Upload or Remove."
      />
      <div className="grid gap-3 sm:grid-cols-2">
        {SLOTS.map((entry) => (
          <LogoSlot key={entry.slot} {...entry} neutral={neutral} reason={reason} onDone={(message) => { setReason(''); onDone(message); }} />
        ))}
      </div>
    </section>
  );
}

/** "8.9 to 1", and whether that reads. */
function contrastWords(brandHex, onBrandHex) {
  if (!brandHex || !onBrandHex) return null;
  const verdict = checkBrandPair(brandHex, onBrandHex);
  if (verdict.ratio === null) return { ok: false, text: verdict.message };
  const ratio = `${verdict.ratio.toFixed(1)} to 1`;
  return verdict.ok
    ? { ok: true, text: `Text on the brand colour reads at ${ratio}. Easy to read.` }
    : { ok: false, text: verdict.message };
}

const HEX = /^#[0-9a-fA-F]{6}$/;

export function BrandColours({ form, set }) {
  const [brandDraft, setBrandDraft] = useState(form.brandHex ?? '');
  const [onBrandDraft, setOnBrandDraft] = useState(form.onBrandHex ?? '');

  const update = (field, setDraft) => (event) => {
    const value = event.target.value;
    setDraft(value);
    const hex = value.trim().toUpperCase();
    if (hex === '') set(field, null);
    else if (HEX.test(hex)) set(field, hex);
  };

  const words = contrastWords(form.brandHex, form.onBrandHex);
  const onlyOne = Boolean(form.brandHex) !== Boolean(form.onBrandHex);

  return (
    <section className="flex flex-col gap-3 rounded-[10px] border border-line bg-surface p-4">
      <h2 className="type-heading">Brand colours</h2>
      <p className="type-caption text-muted">
        The logo&apos;s own background, and the colour of text on it. Used only for the sign-in panel and the plate behind a logo. Never
        a button and never a state.
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        <Input label="Brand colour" value={brandDraft} maxLength={7} placeholder="#4A2E2A" onChange={update('brandHex', setBrandDraft)} />
        <Input label="Text on the brand colour" value={onBrandDraft} maxLength={7} placeholder="#F2D7BC" onChange={update('onBrandHex', setOnBrandDraft)} />
      </div>
      {onlyOne && <p className="type-body text-muted">Set both colours, or clear both.</p>}
      {words && <p className={`type-body ${words.ok ? 'text-ok' : 'text-alert'}`}>{words.text}</p>}
    </section>
  );
}

const TONES = [
  { value: 'COOL', label: 'Cool', words: 'Green-grey, like a steel counter. The default.' },
  { value: 'WARM', label: 'Warm', words: 'Linen and espresso, like a cafe menu.' },
];

export function NeutralTone({ value, onChange }) {
  return (
    <section className="flex flex-col gap-3 rounded-[10px] border border-line bg-surface p-4">
      <h2 className="type-heading">Neutral tone</h2>
      <p className="type-caption text-muted">The page, the cards and the text. State colours stay the same in both.</p>
      <div className="grid gap-2 sm:grid-cols-2" role="radiogroup" aria-label="Neutral tone">
        {TONES.map((tone) => (
          <button
            key={tone.value}
            type="button"
            role="radio"
            aria-checked={value === tone.value}
            onClick={() => onChange(tone.value)}
            className={[
              'flex flex-col gap-2 rounded-lg border p-2 text-left',
              value === tone.value ? 'border-2 border-ink' : 'border-line hover:bg-sunken',
            ].join(' ')}
          >
            <span className="type-label">{tone.label}</span>
            <span className="grid grid-cols-2 gap-1">
              {['day', 'night'].map((theme) => (
                <Themed key={theme} theme={theme} neutral={tone.value} className="flex flex-col gap-1 rounded-md p-2">
                  <span className="rounded-md border border-line bg-surface px-2 py-1">
                    <span className="type-label block">T 4</span>
                    <span className="type-caption block text-muted">3 guests</span>
                  </span>
                  <span className="h-2 rounded-sm bg-sunken" aria-hidden="true" />
                </Themed>
              ))}
            </span>
            <span className="type-caption text-muted">{tone.words}</span>
          </button>
        ))}
      </div>
    </section>
  );
}
