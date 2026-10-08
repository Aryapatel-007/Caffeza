import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { createTallyExports, downloadTallyExport, listTallyDays, redoTallyExport, saveFile, sendTallyExport } from '../../api/integrations.js';
import Button from '../../components/ui/Button.jsx';
import ErrorState from '../../components/ui/ErrorState.jsx';
import Input from '../../components/ui/Input.jsx';
import Sheet, { SheetActions } from '../../components/ui/Sheet.jsx';
import StateChip from '../../components/ui/StateChip.jsx';
import { businessDateAfter, businessDateBefore, businessDateToday, endOfMonth, formatBusinessDate, startOfMonth } from '../../utils/formatDate.js';
import { errorText } from '../online/OnlineSheets.jsx';

import { tallyDayChip } from './integrationWords.js';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
/** "26 Sep 2026", as the server writes it in the redo sentence. */
const dateWords = (date) => {
  const [year, month, day] = date.split('-').map(Number);
  return `${day} ${MONTHS[month - 1]} ${year}`;
};
const HELD = ['DOWNLOADED', 'QUEUED', 'POSTED', 'PARTIAL', 'UNKNOWN'];

/** The owner types the sentence before a day may be exported again. */
function RedoSheet({ day, onClose, onDone, onToast }) {
  const sentence = `I have deleted the vouchers for ${dateWords(day.businessDate)} from Tally.`;
  const [typed, setTyped] = useState('');
  const redo = useMutation({
    mutationFn: () => redoTallyExport(day.export.id, typed.trim()),
    onSuccess: () => {
      onDone();
      onToast({ tone: 'success', message: `${formatBusinessDate(day.businessDate)} built again. Import or send the new one.` });
    },
    onError: (error) => onToast({ tone: 'error', message: errorText(error) }),
  });
  return (
    <Sheet
      title="Export this day again"
      subtitle={formatBusinessDate(day.businessDate)}
      onClose={onClose}
      footer={<SheetActions onCancel={onClose} confirmLabel="Build it again" disabled={typed.trim() !== sentence || redo.isPending} onConfirm={() => redo.mutate()} />}
    >
      <div className="grid gap-3">
        <p className="type-body">This day may already be in Tally. Delete its vouchers in Tally first, or every amount is counted twice.</p>
        <p className="type-body">Then type this sentence exactly:</p>
        <p className="type-label">{sentence}</p>
        <Input label="Sentence" value={typed} onChange={(event) => setTyped(event.target.value)} />
      </div>
    </Sheet>
  );
}

/**
 * The days of a month, each closed, exported, posted, failed or open, with
 * Export, Download file, Send to Tally and, for the owner, Export again.
 * P25 Part L3.
 */
export default function TallyDays({ connection, isOwner, onToast }) {
  const queryClient = useQueryClient();
  const [month, setMonth] = useState(() => startOfMonth(businessDateToday()));
  const [redoing, setRedoing] = useState(null);
  const from = month;
  const to = endOfMonth(month);
  const days = useQuery({ queryKey: ['integrations', 'tally', 'days', from], queryFn: () => listTallyDays({ from, to }) });
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['integrations'] });
  const failed = (error) => onToast({ tone: 'error', message: errorText(error) });
  const exportDays = useMutation({
    mutationFn: async (dates) => {
      for (const date of dates) await createTallyExports({ from: date, to: date });
      return dates.length;
    },
    onSuccess: (count) => {
      refresh();
      onToast({ tone: 'success', message: `${count} ${count === 1 ? 'day' : 'days'} exported. Download the file or send it to Tally.` });
    },
    onError: (error) => {
      refresh();
      failed(error);
    },
  });
  const send = useMutation({
    mutationFn: sendTallyExport,
    onSuccess: () => {
      refresh();
      onToast({ tone: 'success', message: 'Sent to the Tally bridge. It posts within a minute while it runs.' });
    },
    onError: failed,
  });
  const download = useMutation({ mutationFn: downloadTallyExport, onSuccess: (file) => { saveFile(file); refresh(); }, onError: failed });

  const rows = days.data ?? [];
  const ready = rows.filter((day) => day.closed && !day.export).map((day) => day.businessDate);
  const bridge = connection.config.delivery === 'BRIDGE';

  return (
    <section className="grid gap-3" aria-label="Days">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="type-title">Days</h2>
        <div className="flex items-center gap-2">
          <Button variant="secondary" size="sm" onClick={() => setMonth(startOfMonth(businessDateBefore(month, 1)))}>Earlier</Button>
          <span className="type-label">{dateWords(month).split(' ').slice(1).join(' ')}</span>
          <Button variant="secondary" size="sm" onClick={() => setMonth(businessDateAfter(endOfMonth(month), 1))}>Later</Button>
        </div>
      </div>
      <Button className="w-fit" disabled={ready.length === 0} isLoading={exportDays.isPending} onClick={() => exportDays.mutate(ready)}>
        Export {ready.length > 0 ? `${ready.length} closed ${ready.length === 1 ? 'day' : 'days'}` : 'closed days'}
      </Button>
      {days.isError && <ErrorState error={days.error} onRetry={days.refetch} />}
      <ul className="grid gap-1">
        {rows.map((day) => {
          const chip = tallyDayChip(day);
          const exported = day.export;
          return (
            <li key={day.businessDate} className="grid gap-2 border-b border-line py-2 sm:grid-cols-[9rem_1fr_auto] sm:items-center">
              <span className="type-label">{formatBusinessDate(day.businessDate)}</span>
              <div className="grid gap-1">
                <StateChip state={chip.state} word={chip.word} size="sm" className="w-fit" />
                {exported?.lineErrors?.map((line) => <p key={line} className="type-caption text-alert">{line}</p>)}
              </div>
              <div className="flex flex-wrap gap-2">
                {exported && ['BUILT', 'DOWNLOADED'].includes(exported.status) && (
                  <Button variant="secondary" size="sm" onClick={() => download.mutate(exported.id)}>Download file</Button>
                )}
                {exported && bridge && ['BUILT', 'FAILED'].includes(exported.status) && (
                  <Button variant="secondary" size="sm" isLoading={send.isPending && send.variables === exported.id} onClick={() => send.mutate(exported.id)}>Send to Tally</Button>
                )}
                {exported && isOwner && HELD.includes(exported.status) && (
                  <Button variant="quiet" size="sm" onClick={() => setRedoing(day)}>Export again</Button>
                )}
              </div>
            </li>
          );
        })}
      </ul>
      {redoing && <RedoSheet day={redoing} onClose={() => setRedoing(null)} onDone={() => { setRedoing(null); refresh(); }} onToast={onToast} />}
    </section>
  );
}
