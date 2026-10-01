import { Link } from 'react-router-dom';

import { useAuth } from '../../context/AuthContext.jsx';
import { useDeviceSettings } from './useDeviceSettings.js';

/**
 * "This device". Every role. P05.
 *
 * The printer is a property of the computer or tablet, not of whoever signs
 * in, so these are kept on the device. Nothing here goes to the server.
 */
export default function DeviceSettingsPage() {
  const { user } = useAuth();
  const [settings, update] = useDeviceSettings();
  const isKitchen = user?.role === 'KITCHEN' || user?.role === 'OWNER' || user?.role === 'MANAGER';

  return (
    <main className="min-h-full bg-paper">
      <header className="border-b border-black/5 px-4 py-3">
        <div className="mx-auto flex max-w-xl items-center justify-between gap-3">
          <div>
            <h1 className="text-[20px] font-semibold leading-7">This device</h1>
            <p className="text-[13px] leading-[18px] text-steel">
              Saved on this computer or tablet only, whoever signs in.
            </p>
          </div>
          <Link
            to="/dashboard"
            className="flex h-11 items-center rounded-xl px-3 text-[13px] font-medium text-steel hover:bg-black/5"
          >
            Dashboard
          </Link>
        </div>
      </header>

      <div className="mx-auto grid max-w-xl gap-6 px-4 py-6">
        <fieldset className="grid gap-2">
          <legend className="mb-2 text-[12px] font-medium uppercase tracking-[0.06em] text-steel">
            Paper width
          </legend>
          {[
            { value: 80, label: '80 mm, 48 characters' },
            { value: 58, label: '58 mm, 32 characters' },
          ].map((choice) => (
            <label key={choice.value} className="flex min-h-12 items-center gap-3 rounded-xl border-2 border-steel/40 px-3">
              <input
                type="radio"
                name="paper"
                checked={settings.paperMm === choice.value}
                onChange={() => update({ paperMm: choice.value })}
                className="size-4 accent-[var(--color-ink)]"
              />
              <span className="text-[15px]">{choice.label}</span>
            </label>
          ))}
        </fieldset>

        {isKitchen && (
          <label className="flex items-start gap-3">
            <input
              type="checkbox"
              checked={settings.autoPrintKots}
              onChange={(event) =>
                // Turning it on starts fresh: the kitchen screen marks what is
                // already on screen as printed, so no backlog comes out.
                update({ autoPrintKots: event.target.checked, autoPrintArmedAt: Date.now() })
              }
              className="mt-1 h-5 w-5 rounded border border-black/5 shadow-card"
            />
            <span>
              <span className="text-[15px]">Print new tickets automatically</span>
              <span className="block text-[13px] text-steel">
                For a kitchen screen showing one station. Each new ticket prints once.
              </span>
            </span>
          </label>
        )}
      </div>
    </main>
  );
}
