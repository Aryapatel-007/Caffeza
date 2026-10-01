import Bilingual from './Bilingual.jsx';
import { METHOD_LABELS } from './labels.js';

const METHOD_ICON = { CASH: '₹', UPI: '◈', CARD: '▭' };

/**
 * One large button per payment method, in display order. P08.
 *
 * Shared by taking a payment and correcting one, so both draw the same tiles.
 * The built-in methods keep their Gujarati pair; a method the owner added shows
 * its own name, because it is a brand and is not translated.
 */
export default function MethodButtons({ methods, selected = null, onPick }) {
  if (methods.length === 0) {
    return (
      <p className="text-[13px] leading-[18px] text-mirch">
        No payment method can be used for this bill. An owner can add one in Settings.
      </p>
    );
  }

  return (
    <div className="grid grid-cols-2 gap-3">
      {methods.map((method) => {
        const label = METHOD_LABELS[method.code] && method.name === METHOD_LABELS[method.code].en
          ? METHOD_LABELS[method.code]
          : null;
        const chosen = selected === method.code;
        return (
          <button
            key={method.code}
            type="button"
            aria-pressed={chosen}
            onClick={() => onPick(method)}
            className={[
              'flex min-h-[88px] flex-col items-center justify-center gap-2 rounded-2xl shadow-card transition-transform duration-100 active:translate-y-0.5',
              'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink',
              chosen ? 'bg-chana-soft ring-2 ring-chana' : 'bg-white hover:bg-linen',
            ].join(' ')}
          >
            <span aria-hidden="true" className="font-mono text-2xl">
              {METHOD_ICON[method.code] ?? (method.kind === 'PLATFORM' ? '◎' : '···')}
            </span>
            {label ? (
              <Bilingual label={label} size="sm" align="center" />
            ) : (
              <span className="text-center text-[13px] leading-[18px] text-ink">{method.name}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}
