import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useParams } from 'react-router-dom';

import { deleteMapping, listMappings, listUnmapped, saveMapping } from '../../api/integrations.js';
import { listMenuItems } from '../../api/menu.js';
import Button from '../../components/ui/Button.jsx';
import EmptyState from '../../components/ui/EmptyState.jsx';
import ErrorState from '../../components/ui/ErrorState.jsx';
import Input from '../../components/ui/Input.jsx';
import StateChip from '../../components/ui/StateChip.jsx';
import Toast from '../../components/ui/Toast.jsx';
import { errorText } from '../online/OnlineSheets.jsx';

/** Our dishes matching what was typed, each size its own choice. */
function DishSearch({ onPick, busy }) {
  const [search, setSearch] = useState('');
  const results = useQuery({
    queryKey: ['menu-items', 'search', search],
    queryFn: () => listMenuItems({ search, limit: 8 }),
    enabled: search.trim().length >= 2,
  });
  const choices = (results.data?.data ?? []).flatMap((item) =>
    item.variants?.length ? item.variants.map((variant) => ({ item, variant })) : [{ item, variant: null }],
  );
  return (
    <div className="grid gap-2">
      <Input label="Our dish" placeholder="Type two letters of its name" value={search} onChange={(event) => setSearch(event.target.value)} />
      {choices.length > 0 && (
        <ul className="grid gap-1">
          {choices.map(({ item, variant }) => (
            <li key={`${item.id}:${variant?.id ?? ''}`}>
              <Button variant="secondary" size="sm" fullWidth disabled={busy} onClick={() => onPick({ menuItemId: item.id, variantId: variant?.id ?? null })}>
                {variant ? `${item.name} (${variant.name})` : item.name}
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/**
 * Item mapping. P25 Part L2. Which of our dishes each platform item is:
 * unmapped items first, newest first, each with a search over our menu.
 */
export default function ItemMappingPage() {
  const { provider } = useParams();
  const queryClient = useQueryClient();
  const [toast, setToast] = useState(null);
  const unmapped = useQuery({ queryKey: ['integrations', provider, 'unmapped'], queryFn: () => listUnmapped(provider) });
  const mapped = useQuery({ queryKey: ['integrations', provider, 'mappings'], queryFn: () => listMappings(provider) });
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['integrations', provider] });
  const save = useMutation({
    mutationFn: (body) => saveMapping(provider, body),
    onSuccess: (_mapping, body) => {
      refresh();
      setToast({ tone: 'success', message: `${body.externalName ?? 'The item'} is matched.` });
    },
    onError: (error) => setToast({ tone: 'error', message: errorText(error) }),
  });
  const remove = useMutation({ mutationFn: (id) => deleteMapping(provider, id), onSuccess: refresh, onError: (error) => setToast({ tone: 'error', message: errorText(error) }) });

  const waiting = unmapped.data ?? [];
  const rows = mapped.data?.data ?? [];
  return (
    <main className="v2 min-h-full bg-ground">
      <header className="border-b border-line px-4 py-3">
        <div className="mx-auto max-w-3xl">
          <Link to={`/settings/integrations/${provider}`} className="type-caption underline underline-offset-4">Integrations</Link>
          <h1 className="type-heading">Item mapping</h1>
          <p className="type-caption text-muted">Which of your dishes each platform item is. An order with an unmatched item waits for a person.</p>
        </div>
      </header>
      <div className="mx-auto grid max-w-3xl gap-6 px-4 py-6">
        {(unmapped.isError || mapped.isError) && <ErrorState error={unmapped.error ?? mapped.error} onRetry={() => { unmapped.refetch(); mapped.refetch(); }} />}
        <section className="grid gap-3" aria-label="Not matched yet">
          <h2 className="type-title">Not matched yet</h2>
          {unmapped.isSuccess && waiting.length === 0 && <EmptyState title="Every item seen is matched" description="New platform items appear here when an order brings them." />}
          {waiting.map((entry) => (
            <article key={`${entry.externalItemId}:${entry.externalVariantId ?? ''}`} className="grid gap-3 rounded-xl border border-open bg-surface p-4">
              <div className="flex flex-wrap items-center gap-2">
                <StateChip state="open" word="Not matched" size="sm" />
                <span className="type-body">{entry.externalName}</span>
                <span className="type-caption text-muted">in {entry.orderCount} {entry.orderCount === 1 ? 'order' : 'orders'}</span>
              </div>
              <DishSearch
                busy={save.isPending}
                onPick={(choice) => save.mutate({ externalItemId: entry.externalItemId, externalVariantId: entry.externalVariantId, externalName: entry.externalName, ...choice })}
              />
            </article>
          ))}
        </section>
        <section className="grid gap-2" aria-label="Matched">
          <h2 className="type-title">Matched</h2>
          {mapped.isSuccess && rows.length === 0 && <p className="type-caption text-muted">Nothing matched yet.</p>}
          <ul className="grid gap-1">
            {rows.map((row) => (
              <li key={row.id} className="flex flex-wrap items-center justify-between gap-2 border-b border-line py-2">
                <span className="type-body">{row.externalName ?? row.externalItemId}</span>
                <Button variant="quiet" size="sm" isLoading={remove.isPending && remove.variables === row.id} onClick={() => remove.mutate(row.id)}>Remove</Button>
              </li>
            ))}
          </ul>
        </section>
      </div>
      {toast && <Toast tone={toast.tone} message={toast.message} onDismiss={() => setToast(null)} />}
    </main>
  );
}
