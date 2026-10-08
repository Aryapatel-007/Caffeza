import { useAuth } from '../../context/AuthContext.jsx';
import { DENSITIES, TEXT_SIZES, THEMES, useDeviceSettings } from './useDeviceSettings.js';

const THEME_LABELS = { AUTO: 'Automatic', DAY: 'Day', NIGHT: 'Night' };
const DENSITY_LABELS = { COMFORTABLE: 'Comfortable', COMPACT: 'Compact' };
const LANGUAGE_LABELS = { NONE: 'None', GUJARATI: 'Gujarati', HINDI: 'Hindi' };

/**
 * "This device". Every role. P05, extended in P20A with DESIGN-SYSTEM
 * section 11b: theme, density, text size and the second language.
 *
 * The printer and the look are properties of the computer or tablet, not of
 * whoever signs in, so these are kept on the device, under one storage key.
 * Nothing here goes to the server.
 */
export default function DeviceSettingsPage() {
  const { user, features } = useAuth();
  const [settings, update] = useDeviceSettings();
  const isKitchen = user?.role === 'KITCHEN' || user?.role === 'OWNER' || user?.role === 'MANAGER';
  const restaurantLanguage = features.appearance?.secondLanguage ?? 'NONE';

  return (
    <main className="v2 min-h-full bg-ground px-4 py-4 text-ink sm:px-6">
      <div className="mx-auto flex max-w-xl flex-col gap-6">
        <header>
          <h1 className="type-title">This device</h1>
          <p className="type-caption text-muted">Saved on this computer or tablet only, whoever signs in.</p>
        </header>

        <Choice
          legend="Theme"
          hint="Automatic is Day on every screen, the kitchen included. Choose Night for a dim counter."
          options={THEMES.map((value) => ({ value, label: THEME_LABELS[value] }))}
          value={settings.theme}
          onChange={(theme) => update({ theme })}
        />

        <Choice
          legend="Density"
          hint="Compact tightens the spacing. Text stays the same size."
          options={DENSITIES.map((value) => ({ value, label: DENSITY_LABELS[value] }))}
          value={settings.density}
          onChange={(density) => update({ density })}
        />

        <Choice
          legend="Text size"
          options={TEXT_SIZES.map((value) => ({ value, label: `${value}%` }))}
          value={settings.textSize}
          onChange={(textSize) => update({ textSize })}
        />

        <Choice
          legend="Second language"
          hint="A second line under the fixed words on service screens: Pay, Print bill, Send to kitchen, and the states."
          options={[
            { value: null, label: `The restaurant's choice, ${LANGUAGE_LABELS[restaurantLanguage]}` },
            ...['NONE', 'GUJARATI', 'HINDI'].map((value) => ({ value, label: LANGUAGE_LABELS[value] })),
          ]}
          value={settings.secondLanguage}
          onChange={(secondLanguage) => update({ secondLanguage })}
        />

        <Choice
          legend="Paper width"
          options={[
            { value: 80, label: '80 mm, 48 characters' },
            { value: 58, label: '58 mm, 32 characters' },
          ]}
          value={settings.paperMm}
          onChange={(paperMm) => update({ paperMm })}
        />

        {/* P23. The online alert, per device: a captain's phone or a second till can be quiet. */}
        <label className="flex min-h-12 items-start gap-3">
          <input
            type="checkbox"
            checked={settings.onlineAlerts}
            onChange={(event) => update({ onlineAlerts: event.target.checked })}
            className="mt-1 size-5 accent-[var(--color-accent)]"
          />
          <span>
            <span className="type-body block">Online alerts on this device</span>
            <span className="type-caption block text-muted">A chime and a banner when an online order or booking arrives.</span>
          </span>
        </label>
        <label className="flex min-h-12 items-start gap-3">
          <input
            type="checkbox"
            checked={settings.speakAlerts}
            disabled={!settings.onlineAlerts}
            onChange={(event) => update({ speakAlerts: event.target.checked })}
            className="mt-1 size-5 accent-[var(--color-accent)] disabled:opacity-50"
          />
          <span>
            <span className="type-body block">Speak alerts</span>
            <span className="type-caption block text-muted">Reads the new order aloud, for example "New takeaway order, W 42, 3 items".</span>
          </span>
        </label>

        {isKitchen && (
          <label className="flex min-h-12 items-start gap-3">
            <input
              type="checkbox"
              checked={settings.autoPrintKots}
              onChange={(event) =>
                // Turning it on starts fresh: the kitchen screen marks what is
                // already on screen as printed, so no backlog comes out.
                update({ autoPrintKots: event.target.checked, autoPrintArmedAt: Date.now() })
              }
              className="mt-1 size-5 accent-[var(--color-accent)]"
            />
            <span>
              <span className="type-body block">Print new tickets automatically</span>
              <span className="type-caption block text-muted">For a kitchen screen showing one station. Each new ticket prints once.</span>
            </span>
          </label>
        )}
      </div>
    </main>
  );
}

function Choice({ legend, hint, options, value, onChange }) {
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="type-heading mb-1">{legend}</legend>
      {hint && <p className="type-caption -mt-1 text-muted">{hint}</p>}
      {options.map((option) => (
        <label
          key={String(option.value)}
          className={[
            'flex min-h-12 cursor-pointer items-center gap-3 rounded-lg border px-3',
            value === option.value ? 'border-2 border-ink bg-sunken' : 'border-line bg-surface hover:bg-sunken',
          ].join(' ')}
        >
          <input
            type="radio"
            name={legend}
            checked={value === option.value}
            onChange={() => onChange(option.value)}
            className="size-5 accent-[var(--color-accent)]"
          />
          <span className="type-body">{option.label}</span>
        </label>
      ))}
    </fieldset>
  );
}
