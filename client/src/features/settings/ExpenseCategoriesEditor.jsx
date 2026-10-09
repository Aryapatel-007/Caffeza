import { useState } from 'react';

import Input from '../../components/ui/Input.jsx';
import { paiseToInput, parseRupeesToPaise } from '../../utils/formatMoney.js';

/** A code from a name: capitals, digits and _, 2 to 30. The server checks it again. */
const codeFrom = (label) =>
  label
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 30);

/**
 * The cash book's expense categories. P29 Part F, API-CONTRACT M7 "Settings
 * added by P29". The whole list is saved with the settings form. A category
 * keeps its code once used, so a renamed category keeps its history: the name
 * may change, the code never does. Other is always there and on.
 */
export default function ExpenseCategoriesEditor({ categories, onChange }) {
  const [draft, setDraft] = useState('');
  const update = (index, changes) => onChange(categories.map((entry, at) => (at === index ? { ...entry, ...changes } : entry)));
  const newCode = codeFrom(draft);
  const canAdd = newCode.length >= 2 && !categories.some((entry) => entry.code === newCode);

  return (
    <div className="flex flex-col gap-3">
      <ul className="flex flex-col gap-2">
        {categories.map((entry, index) => (
          <li key={entry.code} className="flex flex-wrap items-end gap-3">
            <div className="min-w-0 flex-1">
              <Input label={`Name of ${entry.code}`} maxLength={40} value={entry.label} onChange={(event) => update(index, { label: event.target.value })} />
            </div>
            <label className="flex min-h-12 items-center gap-2">
              <input
                type="checkbox"
                checked={entry.isActive}
                disabled={entry.code === 'OTHER'}
                onChange={(event) => update(index, { isActive: event.target.checked })}
                className="size-5 accent-[var(--color-accent)]"
              />
              <span className="type-body">In use</span>
            </label>
          </li>
        ))}
      </ul>
      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-0 flex-1">
          <Input label="A new category" maxLength={40} value={draft} onChange={(event) => setDraft(event.target.value)} placeholder="Flowers" />
        </div>
        <button
          type="button"
          disabled={!canAdd}
          onClick={() => {
            const other = categories.findIndex((entry) => entry.code === 'OTHER');
            const added = { code: newCode, label: draft.trim(), isActive: true };
            // New categories go before Other, which stays last.
            onChange(other === -1 ? [...categories, added] : [...categories.slice(0, other), added, ...categories.slice(other)]);
            setDraft('');
          }}
          className="type-button min-h-12 rounded-lg border border-ink bg-surface px-4 hover:bg-sunken disabled:opacity-50"
        >
          Add category
        </button>
      </div>
    </div>
  );
}

/** P29 Part F. An amount in rupees that keeps what is typed, and reports whole paise when it reads as money. */
export function RupeesInput({ label, paise, onChange }) {
  const [text, setText] = useState(() => paiseToInput(paise));
  return (
    <Input
      label={label}
      inputMode="decimal"
      value={text}
      onChange={(event) => {
        setText(event.target.value);
        const value = parseRupeesToPaise(event.target.value);
        if (value !== null) onChange(value);
      }}
    />
  );
}
