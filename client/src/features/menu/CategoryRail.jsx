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
    <nav className="flex w-full flex-col gap-1 border-b border-muted p-4 md:w-64 md:border-r md:border-b-0">
      <h2 className="px-3 pb-2 text-xs font-medium text-muted">Categories</h2>

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
              isSelected ? 'border border-line bg-ok-tint' : 'border-2 border-transparent',
              category.isActive ? '' : 'opacity-55',
            ].join(' ')}
          >
            <button
              type="button"
              onClick={() => onSelect(category.id)}
              className="flex min-h-12 flex-1 items-center justify-between gap-2 px-3 py-3 text-left "
            >
              <span className={`type-caption ${isSelected ? 'text-ink': 'text-muted'}`}>
                {category.name}
              </span>
              <span className="font-mono text-xs text-muted">
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
            className="type-caption text-muted underline-offset-4 hover:underline "
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
            className="type-caption text-muted underline-offset-4 hover:underline "
          >
            {categories.find((c) => c.id === selectedId)?.isActive ? 'Turn off' : 'Turn on'}
          </button>
        </div>
      )}

      {/* P05. Which station this category's dishes go to. */}
      {selectedId && stations.length > 0 && onStationChange && (
        <label className="mt-3 block px-3">
          <span className="mb-1 block text-xs font-medium text-muted">Station</span>
          <select
            value={categories.find((c) => c.id === selectedId)?.stationId ?? ''}
            disabled={isBusy}
            onChange={(event) => onStationChange(selectedId, event.target.value || null)}
            className="min-h-12 w-full rounded-lg border border-muted bg-surface px-2 type-caption"
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
          className="mt-2 min-h-12 rounded-lg px-3 py-3 text-left type-caption text-muted hover:bg-ok-tint/40 "
        >
          +&nbsp;&nbsp;New category
        </button>
      )}
    </nav>
  );
}
