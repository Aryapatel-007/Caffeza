import { useState } from 'react';

import Button from '../../components/ui/Button.jsx';
import Input from '../../components/ui/Input.jsx';

/**
 * The left-hand rail: laminated menu dividers.
 *
 * Inline rename and the on/off toggle live here. Turning a category off does
 * not cascade to its items, which is why the copy says "turned off" rather
 * than anything that sounds like a delete.
 */
export default function CategoryRail({
  categories,
  selectedId,
  onSelect,
  onRename,
  onToggleActive,
  onCreate,
  isBusy,
  stations = [],
  onStationChange,
}) {
  const [renamingId, setRenamingId] = useState(null);
  const [draftName, setDraftName] = useState('');
  const [isAdding, setIsAdding] = useState(false);
  const [newName, setNewName] = useState('');

  function startRename(category) {
    setRenamingId(category.id);
    setDraftName(category.name);
  }

  function commitRename(event) {
    event.preventDefault();
    const name = draftName.trim();
    if (name) onRename(renamingId, name);
    setRenamingId(null);
  }

  function commitCreate(event) {
    event.preventDefault();
    const name = newName.trim();
    if (name) onCreate(name);
    setNewName('');
    setIsAdding(false);
  }

  return (
    <nav className="flex w-full flex-col gap-1 border-b border-steel/35 p-4 md:w-64 md:border-r md:border-b-0">
      <h2 className="px-3 pb-2 text-xs font-medium tracking-[0.06em] text-steel">CATEGORIES</h2>

      {categories.map((category) => {
        const isSelected = category.id === selectedId;

        if (category.id === renamingId) {
          return (
            <form key={category.id} onSubmit={commitRename} className="px-1 py-1">
              <Input
                label="Rename category"
                value={draftName}
                autoFocus
                onChange={(event) => setDraftName(event.target.value)}
                onBlur={() => setRenamingId(null)}
              />
            </form>
          );
        }

        return (
          <div
            key={category.id}
            className={[
              'group flex items-center gap-2 rounded-lg',
              isSelected ? 'border-2 border-ink bg-patta-tint' : 'border-2 border-transparent',
              category.isActive ? '' : 'opacity-55',
            ].join(' ')}
          >
            <button
              type="button"
              onClick={() => onSelect(category.id)}
              className="flex min-h-[44px] flex-1 items-center justify-between gap-2 px-3 py-2.5 text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
            >
              <span className={`text-[13px] font-medium ${isSelected ? 'text-ink' : 'text-steel'}`}>
                {category.name}
              </span>
              <span className="font-mono text-xs text-steel">
                {category.isActive ? '' : 'Off'}
              </span>
            </button>
          </div>
        );
      })}

      {selectedId && (
        <div className="mt-1 flex gap-3 px-3">
          <button
            type="button"
            disabled={isBusy}
            onClick={() => {
              const category = categories.find((c) => c.id === selectedId);
              if (category) startRename(category);
            }}
            className="text-[13px] font-medium text-steel underline-offset-4 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-steel"
          >
            Rename
          </button>
          <button
            type="button"
            disabled={isBusy}
            onClick={() => {
              const category = categories.find((c) => c.id === selectedId);
              if (category) onToggleActive(category);
            }}
            className="text-[13px] font-medium text-steel underline-offset-4 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-steel"
          >
            {categories.find((c) => c.id === selectedId)?.isActive ? 'Turn off' : 'Turn on'}
          </button>
        </div>
      )}

      {/* P05. Which station this category's dishes go to. */}
      {selectedId && stations.length > 0 && onStationChange && (
        <label className="mt-3 block px-3">
          <span className="mb-1 block text-xs font-medium tracking-[0.06em] text-steel">STATION</span>
          <select
            value={categories.find((c) => c.id === selectedId)?.stationId ?? ''}
            disabled={isBusy}
            onChange={(event) => onStationChange(selectedId, event.target.value || null)}
            className="h-11 w-full rounded-lg border-2 border-steel/40 bg-paper px-2 text-[13px] focus:border-ink focus:outline-none"
          >
            <option value="">First station (default)</option>
            {stations.map((station) => (
              <option key={station.id} value={station.id}>
                {station.name}
              </option>
            ))}
          </select>
        </label>
      )}

      {isAdding ? (
        <form onSubmit={commitCreate} className="mt-3 flex flex-col gap-2 px-1">
          <Input
            label="New category"
            value={newName}
            autoFocus
            onChange={(event) => setNewName(event.target.value)}
            hint="Starters, Mains, Breads"
          />
          <div className="flex gap-2">
            <Button type="submit" size="sm" isLoading={isBusy}>
              Add category
            </Button>
            <Button type="button" size="sm" variant="secondary" onClick={() => setIsAdding(false)}>
              Cancel
            </Button>
          </div>
        </form>
      ) : (
        <button
          type="button"
          onClick={() => setIsAdding(true)}
          className="mt-2 min-h-[44px] rounded-lg px-3 py-2.5 text-left text-[13px] font-medium text-steel hover:bg-patta-tint/40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
        >
          +&nbsp;&nbsp;New category
        </button>
      )}
    </nav>
  );
}
