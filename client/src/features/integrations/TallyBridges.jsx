import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { listBridges, makePairingCode, revokeBridge } from '../../api/integrations.js';
import Button from '../../components/ui/Button.jsx';
import Input from '../../components/ui/Input.jsx';
import StateChip from '../../components/ui/StateChip.jsx';
import { formatDayIst, formatTimeIst } from '../../utils/formatDate.js';
import { errorText } from '../online/OnlineSheets.jsx';

import { BRIDGE_WORDS } from './integrationWords.js';

const when = (at) => (at ? `${formatDayIst(at)}, ${formatTimeIst(at)}` : 'never');

/**
 * Tally bridges: the computers allowed to post into Tally. P25 Part L3 and K.
 * The owner makes a one-time pairing code and can switch a bridge off.
 */
export default function TallyBridges({ isOwner, onToast }) {
  const queryClient = useQueryClient();
  const [name, setName] = useState('');
  const [code, setCode] = useState(null);
  const bridges = useQuery({ queryKey: ['integrations', 'tally', 'bridges'], queryFn: listBridges, refetchInterval: 30_000 });
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['integrations', 'tally', 'bridges'] });
  const pair = useMutation({
    mutationFn: () => makePairingCode(name.trim()),
    onSuccess: (made) => {
      setCode(made);
      setName('');
      refresh();
    },
    onError: (error) => onToast({ tone: 'error', message: errorText(error) }),
  });
  const revoke = useMutation({ mutationFn: revokeBridge, onSuccess: refresh, onError: (error) => onToast({ tone: 'error', message: errorText(error) }) });
  const rows = (bridges.data ?? []).filter((bridge) => bridge.state !== 'EXPIRED');

  return (
    <section className="grid gap-3" aria-label="Tally bridges">
      <h2 className="type-title">Tally bridge</h2>
      {bridges.isSuccess && rows.length === 0 && <p className="type-caption text-muted">No computer is paired. Vouchers can still go as a file to import.</p>}
      <ul className="grid gap-2">
        {rows.map((bridge) => {
          const chip = BRIDGE_WORDS[bridge.state];
          return (
            <li key={bridge.id} className="grid gap-1 rounded-xl border border-line bg-surface p-4">
              <div className="flex flex-wrap items-center gap-2">
                <span className="type-heading">{bridge.name}</span>
                <StateChip state={chip.state} word={chip.word} size="sm" />
              </div>
              {bridge.state === 'ACTIVE' && (
                <>
                  <p className="type-caption text-muted">
                    {bridge.machineName ? `${bridge.machineName}. ` : ''}Last seen {when(bridge.lastSeenAt)}.
                  </p>
                  {bridge.companiesSeen.length > 0 && <p className="type-caption text-muted">Open in Tally: {bridge.companiesSeen.join(', ')}</p>}
                  {bridge.ledgersSeenAt && <p className="type-caption text-muted">{bridge.ledgerCount} ledgers read {when(bridge.ledgersSeenAt)}</p>}
                  {isOwner && (
                    <Button variant="quiet" size="sm" className="w-fit" isLoading={revoke.isPending && revoke.variables === bridge.id} onClick={() => revoke.mutate(bridge.id)}>
                      Switch off
                    </Button>
                  )}
                </>
              )}
            </li>
          );
        })}
      </ul>
      {isOwner && (
        <div className="grid gap-2 rounded-xl border border-line p-4">
          <h3 className="type-heading">Pair a new bridge</h3>
          {code ? (
            <>
              <p className="type-body">On the computer with Tally, run:</p>
              <code className="type-label break-all">node bridge.js pair {code.code} --server {window.location.origin}</code>
              <p className="type-caption text-muted">The code works once, until {formatTimeIst(code.expiresAt)}.</p>
              <Button variant="secondary" size="sm" className="w-fit" onClick={() => { setCode(null); refresh(); }}>Done</Button>
            </>
          ) : (
            <div className="flex flex-wrap items-end gap-2">
              <Input label="Name of that computer" value={name} onChange={(event) => setName(event.target.value)} />
              <Button variant="secondary" disabled={!name.trim()} isLoading={pair.isPending} onClick={() => pair.mutate()}>Make a pairing code</Button>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
