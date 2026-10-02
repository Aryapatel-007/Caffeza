import { useTheme } from '../../context/ThemeProvider.jsx';
import gu from './gu.js';
import hi from './hi.js';
import { LABELS } from './labels.js';

const LANGUAGES = { GUJARATI: { code: 'gu', words: gu }, HINDI: { code: 'hi', words: hi } };

/**
 * The second-language line for a fixed word, in the active language, or null.
 * The restaurant's `secondLanguage`, overridden by this device's setting.
 */
export function useSecondLine(k, english = LABELS[k], { keep = false } = {}) {
  const { secondLanguage } = useTheme();
  const language = LANGUAGES[secondLanguage];
  // A renamed payment method keeps its own name and no translation.
  if (!language || (!keep && english !== LABELS[k])) return null;
  const words = language.words[k];
  return words ? { lang: language.code, words } : null;
}

/**
 * An English word with its second-language line under it. DESIGN-SYSTEM 5d:
 * Anek Gujarati or Anek Devanagari, at `caption` size, in `muted`. With no
 * second language set, the English alone.
 *
 * `en` overrides the English, for a payment method an owner renamed; the
 * second line then disappears rather than translating the wrong word. `keep`
 * keeps it, for an English line that only adds a count to the fixed word
 * ("Send 3 to kitchen" over "Send to kitchen" in Gujarati).
 */
export default function Bilingual({ k, en, keep = false, size = 'md', align = 'left', className = '' }) {
  const english = en ?? LABELS[k] ?? k;
  const second = useSecondLine(k, english, { keep });
  const first = { sm: 'type-label', md: 'type-button', lg: 'type-heading' }[size] ?? 'type-button';

  return (
    <span className={`flex flex-col ${align === 'center' ? 'items-center text-center' : 'items-start'} ${className}`}>
      <span className={first}>{english}</span>
      {second && (
        <span lang={second.lang} className="type-caption opacity-80">
          {second.words}
        </span>
      )}
    </span>
  );
}
