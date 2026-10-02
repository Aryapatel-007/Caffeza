import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';

import BalanceSeal from '../../components/ui/BalanceSeal.jsx';
import Button from '../../components/ui/Button.jsx';
import ErrorState from '../../components/ui/ErrorState.jsx';
import { BackIcon } from '../../components/ui/icons/index.jsx';
import Input from '../../components/ui/Input.jsx';
import Spinner from '../../components/ui/Spinner.jsx';
import TableTile from '../../components/ui/TableTile.jsx';
import TicketCard from '../../components/ui/TicketCard.jsx';
import Toast from '../../components/ui/Toast.jsx';
import { changedSettings, getSettings, updateSettings } from '../../api/settings.js';
import { useAuth } from '../../context/AuthContext.jsx';
import { ACCENT_PRESETS, checkAccent, EXAMPLE_ACCENT, nightVariant } from '../../utils/colour.js';
import gu from '../i18n/gu.js';
import hi from '../i18n/hi.js';
import { LABELS as WORDS } from '../i18n/labels.js';
import { LABELS } from '../reports/labels.js';
import { errorMessage } from './errorCopy.js';

const PRESET_NAMES = { OCEAN: 'Ocean', INDIGO: 'Indigo', PLUM: 'Plum', OLIVE: 'Olive', ESPRESSO: 'Espresso', GRAPHITE: 'Graphite' };

/** The wordmark field. The design asks for a short name that fits a phone's top bar. */
const WORDMARK_LENGTH = 24;

const LANGUAGES = [
  { value: 'NONE', label: 'None' },
  { value: 'GUJARATI', label: 'Gujarati', words: gu, lang: 'gu' },
  { value: 'HINDI', label: 'Hindi', words: hi, lang: 'hi' },
];

/** R1's tiles, by their contract keys, with the column labels the Today screen shows. */
const TILE_LABELS = {
  billTotalInPaise: LABELS.BILL_TOTAL,
  netSalesInPaise: LABELS.NET_SALES,
  billCount: LABELS.BILLS,
  covers: LABELS.COVERS,
  averagePerCoverInPaise: LABELS.AVERAGE_PER_COVER,
  openTables: LABELS.OPEN_TABLES,
  openItemTotalInPaise: `${LABELS.ITEM_TOTAL}, open tables`,
  unpaidCount: `${LABELS.UNPAID}, count`,
  unpaidInPaise: `${LABELS.UNPAID}, value`,
  lastWeekBillTotalInPaise: LABELS.SAME_WEEKDAY_LAST_WEEK,
};
const ALL_TILES = Object.keys(TILE_LABELS);

/** The accent as the server would resolve it, for the preview. */
function accentOf(appearance) {
  if (appearance.accentPreset === 'CUSTOM') {
    return appearance.accentHex && checkAccent(appearance.accentHex).ok ? appearance.accentHex : null;
  }
  return ACCENT_PRESETS[appearance.accentPreset] ?? ACCENT_PRESETS.OCEAN;
}

/**
 * A subtree drawn in one theme and one accent, whatever the page around it is.
 * The tokens are CSS variables on any element with `data-theme`, so this is
 * the real components in the real theme, not pictures of them.
 */
function Themed({ theme, accent, className = '', children }) {
  const style = accent ? { '--accent': accent, '--accent-night': nightVariant(accent) } : undefined;
  return (
    <div data-theme={theme} style={style} className={`bg-ground text-ink ${className}`}>
      {children}
    </div>
  );
}

/**
 * Appearance. Owner only: the server refuses anyone else through the settings
 * rule, and this screen is gated the same way. P20B, DESIGN-SYSTEM section 11.
 *
 * The accent (six presets or the owner's own colour, checked as it is typed by
 * the client mirror of the server's rules), the wordmark, the second language,
 * and which Today tiles show in which order. A live preview beside the
 * choices draws the real components in the chosen accent, by day or by night.
 * The server still decides on save, and every save asks for a reason.
 */
export default function AppearancePage() {
  const queryClient = useQueryClient();
  const { refreshFeatures } = useAuth();
  const query = useQuery({ queryKey: ['settings'], queryFn: getSettings });
  const original = query.data ?? null;

  const [form, setForm] = useState(null);
  const [tiles, setTiles] = useState(null);
  const [hexDraft, setHexDraft] = useState('');
  const [reason, setReason] = useState('');
  const [previewTheme, setPreviewTheme] = useState('day');
  const [toast, setToast] = useState(null);

  useEffect(() => {
    if (!original) return;
    const appearance = original.appearance;
    setForm(structuredClone(appearance));
    setHexDraft(appearance.accentHex ?? '');
    setTiles([
      ...appearance.todayTiles.map((key) => ({ key, on: true })),
      ...ALL_TILES.filter((key) => !appearance.todayTiles.includes(key)).map((key) => ({ key, on: false })),
    ]);
  }, [original]);

  const save = useMutation({
    mutationFn: updateSettings,
    onSuccess: (saved) => {
      queryClient.setQueryData(['settings'], saved);
      setReason('');
      setToast({ tone: 'success', message: 'Appearance saved.' });
      // The accent and wordmark come from /auth/me; read them again so the change shows now.
      refreshFeatures().catch(() => {});
    },
    onError: (error) => setToast({ tone: 'error', message: errorMessage(error) }),
  });

  if (query.isPending || !form || !tiles) {
    return (
      <main className="min-h-full bg-ground p-6">
        <Spinner label="Loading the appearance" />
      </main>
    );
  }
  if (query.isError) {
    return (
      <main className="min-h-full bg-ground p-6">
        <ErrorState error={errorMessage(query.error)} onRetry={() => query.refetch()} />
      </main>
    );
  }

  const set = (field, value) => setForm((current) => ({ ...current, [field]: value }));
  const current = {
    ...form,
    todayTiles: tiles.filter((tile) => tile.on).map((tile) => tile.key),
  };
  const patch = changedSettings({ appearance: original.appearance }, { appearance: current });
  const changedCount = Object.keys(patch.appearance ?? {}).length;

  const isCustom = form.accentPreset === 'CUSTOM';
  const verdict = isCustom ? checkAccent(hexDraft.trim().toUpperCase()) : { ok: true };
  const accent = accentOf(current);
  const canSave = changedCount > 0 && reason.trim() && !save.isPending && (!isCustom || verdict.ok) && current.todayTiles.length > 0;

  const chooseCustomHex = (value) => {
    setHexDraft(value);
    const hex = value.trim().toUpperCase();
    set('accentHex', checkAccent(hex).ok ? hex : form.accentHex);
  };

  const moveTile = (index, step) =>
    setTiles((list) => {
      const next = [...list];
      [next[index], next[index + step]] = [next[index + step], next[index]];
      return next;
    });

  const language = LANGUAGES.find((entry) => entry.value === form.secondLanguage) ?? LANGUAGES[0];

  return (
    <main className="min-h-full bg-ground px-4 py-4 text-ink sm:px-6">
      <div className="mx-auto flex max-w-[1200px] flex-col gap-6">
        <header className="flex items-center gap-3">
          <Link to="/settings" aria-label="Settings" className="flex size-12 items-center justify-center rounded-lg border border-line bg-surface hover:bg-sunken">
            <BackIcon />
          </Link>
          <div>
            <h1 className="type-title">Appearance</h1>
            <p className="type-caption text-muted">How the product looks for everyone at this restaurant. State colours never change.</p>
          </div>
        </header>

        <div className="grid items-start gap-6 lg:grid-cols-[1fr_420px]">
          <div className="flex flex-col gap-6">
            <section className="flex flex-col gap-3 rounded-[10px] border border-line bg-surface p-4">
              <h2 className="type-heading">Accent</h2>
              <p className="type-caption text-muted">The colour of the one main button on each screen, the focus ring and links. Nothing else.</p>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3" role="radiogroup" aria-label="Accent">
                {Object.entries(ACCENT_PRESETS).map(([name, value]) => (
                  <button
                    key={name}
                    type="button"
                    role="radio"
                    aria-checked={form.accentPreset === name}
                    onClick={() => set('accentPreset', name)}
                    className={[
                      'flex flex-col gap-2 overflow-hidden rounded-lg border p-2 text-left',
                      form.accentPreset === name ? 'border-2 border-ink' : 'border-line hover:bg-sunken',
                    ].join(' ')}
                  >
                    <span className="type-label">{PRESET_NAMES[name]}</span>
                    <span className="grid grid-cols-2 gap-1">
                      <Themed theme="day" accent={value} className="rounded-md p-1.5">
                        <span className="type-label flex min-h-8 items-center justify-center rounded-md bg-accent text-on-accent">Pay</span>
                      </Themed>
                      <Themed theme="night" accent={value} className="rounded-md p-1.5">
                        <span className="type-label flex min-h-8 items-center justify-center rounded-md bg-accent text-on-accent">Pay</span>
                      </Themed>
                    </span>
                  </button>
                ))}
                <button
                  type="button"
                  role="radio"
                  aria-checked={isCustom}
                  onClick={() => set('accentPreset', 'CUSTOM')}
                  className={[
                    'type-label flex min-h-24 items-center justify-center rounded-lg border p-2',
                    isCustom ? 'border-2 border-ink' : 'border-line hover:bg-sunken',
                  ].join(' ')}
                >
                  Your own colour
                </button>
              </div>

              {isCustom && (
                <div className="flex flex-col gap-2">
                  <Input
                    label="Your colour, as a six-digit code"
                    value={hexDraft}
                    maxLength={7}
                    placeholder={EXAMPLE_ACCENT}
                    onChange={(event) => chooseCustomHex(event.target.value)}
                  />
                  {hexDraft.trim() !== '' &&
                    (verdict.ok ? (
                      <p className="type-body text-ok">This colour passes every rule.</p>
                    ) : (
                      <div className="flex flex-wrap items-center gap-2 rounded-lg border border-line border-l-[3px] border-l-alert p-3">
                        <p className="type-body flex-1">{verdict.message}</p>
                        <Button variant="secondary" size="sm" onClick={() => set('accentPreset', verdict.nearestPreset)}>
                          Use {PRESET_NAMES[verdict.nearestPreset]}
                        </Button>
                      </div>
                    ))}
                </div>
              )}
            </section>

            <section className="flex flex-col gap-3 rounded-[10px] border border-line bg-surface p-4">
              <h2 className="type-heading">Wordmark</h2>
              <Input
                label="The name in the top bar"
                hint="Leave it empty to use the restaurant's name."
                value={form.wordmark ?? ''}
                maxLength={WORDMARK_LENGTH}
                onChange={(event) => set('wordmark', event.target.value === '' ? null : event.target.value)}
              />
            </section>

            <section className="flex flex-col gap-3 rounded-[10px] border border-line bg-surface p-4">
              <h2 className="type-heading">Second language</h2>
              <p className="type-caption text-muted">A second line under the fixed words on service screens. A device can still choose its own on This device.</p>
              <div className="flex flex-wrap items-end gap-4">
                <div className="flex gap-2" role="radiogroup" aria-label="Second language">
                  {LANGUAGES.map((entry) => (
                    <button
                      key={entry.value}
                      type="button"
                      role="radio"
                      aria-checked={form.secondLanguage === entry.value}
                      onClick={() => set('secondLanguage', entry.value)}
                      className={[
                        'type-label min-h-12 rounded-lg border px-4',
                        form.secondLanguage === entry.value ? 'border-2 border-ink bg-sunken' : 'border-line hover:bg-sunken',
                      ].join(' ')}
                    >
                      {entry.label}
                    </button>
                  ))}
                </div>
                <Themed theme="day" accent={accent} className="rounded-lg p-2">
                  <span className="flex min-h-14 min-w-32 flex-col items-center justify-center rounded-lg bg-accent px-4 text-on-accent">
                    <span className="type-button">{WORDS.pay}</span>
                    {language.words && (
                      <span lang={language.lang} className="type-caption opacity-80">
                        {language.words.pay}
                      </span>
                    )}
                  </span>
                </Themed>
              </div>
            </section>

            <section className="flex flex-col gap-3 rounded-[10px] border border-line bg-surface p-4">
              <h2 className="type-heading">Today tiles</h2>
              <p className="type-caption text-muted">Which figures the Today screen shows, top to bottom. At least one.</p>
              <ol className="flex flex-col divide-y divide-line">
                {tiles.map((tile, index) => (
                  <li key={tile.key} className="flex min-h-14 items-center gap-3 py-1">
                    <label className="flex flex-1 items-center gap-3">
                      <input
                        type="checkbox"
                        checked={tile.on}
                        onChange={(event) =>
                          setTiles((list) => list.map((entry) => (entry.key === tile.key ? { ...entry, on: event.target.checked } : entry)))
                        }
                        className="size-5 accent-[var(--color-accent)]"
                      />
                      <span className={tile.on ? 'type-body' : 'type-body text-muted'}>{TILE_LABELS[tile.key]}</span>
                    </label>
                    <button
                      type="button"
                      aria-label={`Move ${TILE_LABELS[tile.key]} up`}
                      disabled={index === 0}
                      onClick={() => moveTile(index, -1)}
                      className="flex size-12 items-center justify-center rounded-lg border border-line hover:bg-sunken disabled:opacity-40"
                    >
                      <span aria-hidden="true">↑</span>
                    </button>
                    <button
                      type="button"
                      aria-label={`Move ${TILE_LABELS[tile.key]} down`}
                      disabled={index === tiles.length - 1}
                      onClick={() => moveTile(index, 1)}
                      className="flex size-12 items-center justify-center rounded-lg border border-line hover:bg-sunken disabled:opacity-40"
                    >
                      <span aria-hidden="true">↓</span>
                    </button>
                  </li>
                ))}
              </ol>
            </section>

            <section className="flex flex-col gap-3 rounded-[10px] border border-line bg-surface p-4">
              <Input
                label="Why are you changing this?"
                value={reason}
                maxLength={200}
                onChange={(event) => setReason(event.target.value)}
                placeholder="Recorded against every change you just made"
                error={changedCount > 0 && !reason.trim() ? 'A reason is required before this can be saved.' : undefined}
              />
              <div className="flex items-center justify-between gap-3">
                <p className="type-caption text-muted">
                  {changedCount === 0 ? 'Saved as shown.' : `${changedCount} ${changedCount === 1 ? 'change' : 'changes'} to save.`}
                </p>
                <Button disabled={!canSave} isLoading={save.isPending} onClick={() => save.mutate({ reason: reason.trim(), ...patch })}>
                  Save appearance
                </Button>
              </div>
            </section>
          </div>

          <Preview accent={accent} theme={previewTheme} onTheme={setPreviewTheme} />
        </div>
      </div>

      <Toast tone={toast?.tone} message={toast?.message} onDismiss={() => setToast(null)} />
    </main>
  );
}

/** A fixed moment for the preview: tables open half an hour, a ticket twenty minutes old. */
const minutesAgo = (minutes) => new Date(Date.now() - minutes * 60_000).toISOString();

function Preview({ accent, theme, onTheme }) {
  return (
    <aside aria-label="Preview" className="flex flex-col gap-3 lg:sticky lg:top-4">
      <div className="flex items-center justify-between">
        <h2 className="type-heading">Preview</h2>
        <div className="flex gap-1" role="radiogroup" aria-label="Preview theme">
          {['day', 'night'].map((value) => (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={theme === value}
              onClick={() => onTheme(value)}
              className={['type-label min-h-12 rounded-lg border px-4', theme === value ? 'border-2 border-ink bg-sunken' : 'border-line'].join(' ')}
            >
              {value === 'day' ? 'Day' : 'Night'}
            </button>
          ))}
        </div>
      </div>
      <Themed theme={theme} accent={accent} className="pointer-events-none flex flex-col gap-3 rounded-[10px] border border-line p-3">
        <div className="grid grid-cols-2 gap-2">
          <TableTile name="T 1" floorState="FREE" compact />
          <TableTile name="T 2" floorState="OPEN" guestCount={2} amountInPaise={46200} openedAt={minutesAgo(34)} targetMinutes={90} compact />
          <TableTile name="T 3" floorState="SERVED" guestCount={4} amountInPaise={124000} openedAt={minutesAgo(58)} targetMinutes={90} compact />
          <TableTile name="T 4" floorState="BILL_PRINTED" guestCount={3} amountInPaise={48300} openedAt={minutesAgo(71)} targetMinutes={90} compact />
        </div>
        <TicketCard
          kotNumber={412}
          place="T 14"
          subtitle="Dine-in · Live Kitchen"
          firedAt={minutesAgo(19)}
          targetMinutes={15}
          lines={[
            { id: 'a', quantity: 1, itemName: 'Creamy Pesto Pasta', status: 'PENDING', addOnNames: [] },
            { id: 'b', quantity: 2, itemName: 'Cheesy Tornado', status: 'PENDING', addOnNames: ['Extra cheese'] },
          ]}
          onLineReady={() => {}}
          onAllReady={() => {}}
        />
        <BalanceSeal checks={[{ id: 'C1', passed: true }, { id: 'C3', passed: true }, { id: 'C4', passed: true }]} scope="for 26 Sep 2026" />
        <span className="type-button flex min-h-12 items-center justify-center rounded-lg bg-accent text-on-accent">Record payment</span>
      </Themed>
    </aside>
  );
}
