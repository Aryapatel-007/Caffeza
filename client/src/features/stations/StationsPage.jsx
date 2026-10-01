import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';

import { createStation, listStations, updateStation } from '../../api/stations.js';
import Button from '../../components/ui/Button.jsx';
import Input from '../../components/ui/Input.jsx';
import Spinner from '../../components/ui/Spinner.jsx';
import Toast from '../../components/ui/Toast.jsx';

/**
 * Kitchen stations. OWNER and MANAGER. P05.
 *
 * Add, rename, reorder, set "prints tickets", switch off. A station is never
 * deleted. Switching one off sends its categories to the first active station
 * until someone moves them, and the toast says how many.
 *
 * Reached from Settings and the dashboard. It is its own page rather than a
 * section of Settings, because Settings is owner-only and a manager runs the
 * kitchen.
 */
export default function StationsPage() {
  const queryClient = useQueryClient();
  const [newName, setNewName] = useState('');
  const [toast, setToast] = useState(null);

  const stations = useQuery({
    queryKey: ['stations', 'all'],
    queryFn: () => listStations({ includeInactive: true }),
  });

  const refresh = () => queryClient.invalidateQueries({ queryKey: ['stations'] });
  const onError = (error) => setToast({ tone: 'error', message: error.message });

  const create = useMutation({
    mutationFn: () =>
      createStation({ name: newName.trim(), displayOrder: (stations.data ?? []).length }),
    onSuccess: () => {
      setNewName('');
      refresh();
    },
    onError,
  });

  const update = useMutation({
    mutationFn: ({ id, changes }) => updateStation(id, changes),
    onSuccess: ({ meta }) => {
      refresh();
      if (meta?.categoriesFallingBack > 0) {
        setToast({
          tone: 'success',
          message: `${meta.categoriesFallingBack} categories now go to the first active station. Move them in the menu.`,
        });
      }
    },
    onError,
  });

  const list = stations.data ?? [];

  return (
    <main className="min-h-full bg-paper">
      <header className="border-b-2 border-ink px-4 py-3">
        <div className="mx-auto flex max-w-2xl items-center justify-between gap-3">
          <div>
            <h1 className="text-[20px] font-semibold leading-7">Kitchen stations</h1>
            <p className="text-[13px] leading-[18px] text-steel">
              Each category&rsquo;s dishes go to its station. The first station takes anything not
              routed.
            </p>
          </div>
          <Link to="/dashboard" className="flex h-11 items-center rounded-[10px] px-3 text-[13px] font-medium text-steel hover:bg-black/5">
            Dashboard
          </Link>
        </div>
      </header>

      <div className="mx-auto grid max-w-2xl gap-4 px-4 py-6">
        {stations.isPending && <Spinner label="Loading stations" />}

        <ul className="divide-y divide-steel/20 border-y-2 border-ink/10">
          {list.map((station, index) => (
            <li key={station.id} className={['flex flex-wrap items-center gap-3 py-3', station.isActive ? '' : 'opacity-55'].join(' ')}>
              <span className="w-6 font-mono text-[13px] text-steel">{index + 1}</span>
              <input
                aria-label={`Name of ${station.name}`}
                defaultValue={station.name}
                maxLength={40}
                onBlur={(event) => {
                  const name = event.target.value.trim();
                  if (name && name !== station.name) update.mutate({ id: station.id, changes: { name } });
                }}
                className="h-11 min-w-0 flex-1 rounded-[10px] border-2 border-steel/40 bg-paper px-3 text-[15px] focus:border-ink focus:outline-none"
              />
              <label className="flex items-center gap-2 text-[13px]">
                <input
                  type="checkbox"
                  checked={station.printsTickets}
                  onChange={(event) =>
                    update.mutate({ id: station.id, changes: { printsTickets: event.target.checked } })
                  }
                  className="h-5 w-5 rounded border-2 border-ink"
                />
                Prints tickets
              </label>
              <div className="flex gap-1">
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={index === 0}
                  onClick={() => update.mutate({ id: station.id, changes: { displayOrder: Math.max(0, station.displayOrder - 1) } })}
                >
                  Up
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => update.mutate({ id: station.id, changes: { displayOrder: station.displayOrder + 1 } })}
                >
                  Down
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => update.mutate({ id: station.id, changes: { isActive: !station.isActive } })}
                >
                  {station.isActive ? 'Turn off' : 'Turn on'}
                </Button>
              </div>
            </li>
          ))}
        </ul>

        <form
          className="flex items-end gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            if (newName.trim()) create.mutate();
          }}
        >
          <Input
            className="flex-1"
            label="New station"
            value={newName}
            maxLength={40}
            onChange={(event) => setNewName(event.target.value)}
            hint="Live Kitchen, Beverages"
          />
          <Button type="submit" isLoading={create.isPending} disabled={!newName.trim()}>
            Add station
          </Button>
        </form>
      </div>

      <Toast tone={toast?.tone} message={toast?.message} onDismiss={() => setToast(null)} />
    </main>
  );
}
