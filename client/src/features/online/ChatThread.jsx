/**
 * One WhatsApp chat, for staff. P39 section 14.
 *
 * The turns as the guest saw them, the guest's coming bookings, and what a
 * person can do: reply inside the 24-hour window, hand the chat back to the
 * assistant, mark it done, and clear a "stop all messages" when the guest asks
 * for messages again. Every rule is on the server; this only asks.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import { clearChatStop, closeChat, getChat, handBackChat, replyToChat } from '../../api/chats.js';
import Button from '../../components/ui/Button.jsx';
import Input from '../../components/ui/Input.jsx';
import Spinner from '../../components/ui/Spinner.jsx';
import StateChip from '../../components/ui/StateChip.jsx';
import { formatDateIst, formatTimeIst } from '../../utils/formatDate.js';
import { errorText } from './OnlineSheets.jsx';

export const CHAT_STATUS_CHIP = Object.freeze({
  NEEDS_STAFF: { state: 'alert', word: 'Needs a person' },
  STAFF: { state: 'open', word: 'With staff' },
  BOT: { state: 'ok', word: 'Assistant' },
  CLOSED: { state: 'free', word: 'Done' },
});

const SPEAKER = { GUEST: 'Guest', ASSISTANT: 'Assistant', STAFF: 'Staff' };

function Turn({ turn, guestName }) {
  const fromGuest = turn.role === 'GUEST';
  return (
    <li className={['flex', fromGuest ? 'justify-start' : 'justify-end'].join(' ')}>
      <div className={['max-w-[85%] rounded-xl border px-3 py-2', fromGuest ? 'border-line bg-surface' : turn.role === 'STAFF' ? 'border-ink bg-sunken' : 'border-line bg-sunken'].join(' ')}>
        <p className="type-caption text-muted">
          {fromGuest ? guestName ?? SPEAKER.GUEST : SPEAKER[turn.role]} · {formatTimeIst(turn.at)}
        </p>
        <p className="type-body whitespace-pre-wrap break-words">{turn.text}</p>
      </div>
    </li>
  );
}

export default function ChatThread({ chatId, onClose, onToast }) {
  const queryClient = useQueryClient();
  const [reply, setReply] = useState('');
  const [stopReason, setStopReason] = useState('');
  const chat = useQuery({ queryKey: ['online', 'chats', chatId], queryFn: () => getChat(chatId), refetchInterval: 15_000 });

  const act = useMutation({
    mutationFn: ({ kind }) => {
      if (kind === 'reply') return replyToChat(chatId, reply.trim());
      if (kind === 'handBack') return handBackChat(chatId);
      if (kind === 'clearStop') return clearChatStop(chatId, stopReason.trim());
      return closeChat(chatId);
    },
    onSuccess: (saved, { kind }) => {
      queryClient.setQueryData(['online', 'chats', chatId], saved);
      queryClient.invalidateQueries({ queryKey: ['online'] });
      if (kind === 'reply') setReply('');
      if (kind === 'clearStop') setStopReason('');
      const words = { reply: 'Reply sent.', handBack: 'Handed back to the assistant.', clearStop: 'Messages are on again for this guest.', done: 'Chat marked done.' };
      onToast({ tone: 'success', message: words[kind] });
      if (kind === 'done') onClose();
    },
    onError: (error) => onToast({ tone: 'error', message: errorText(error) }),
  });

  if (chat.isPending) return <Spinner label="Loading the chat" />;
  if (chat.isError) return <p className="type-body text-alert">{errorText(chat.error)}</p>;

  const data = chat.data;
  const chip = CHAT_STATUS_CHIP[data.status] ?? CHAT_STATUS_CHIP.BOT;
  const busy = act.isPending;

  return (
    <section aria-label={`Chat with ${data.guestFirstName ?? 'a guest'}`} className="grid gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="type-heading">{data.guestFirstName ?? 'Guest'}</h2>
        <StateChip state={chip.state} word={chip.word} />
        <span className="type-caption text-muted">{data.windowOpen ? 'Window open' : 'Window closed'}</span>
      </div>
      {data.handoffReason && <p className="type-caption text-muted">Handed over: {data.handoffReason}</p>}

      {data.bookings.length > 0 && (
        <div className="grid gap-1 rounded-xl border border-line p-3">
          <h3 className="type-label">Coming bookings</h3>
          {data.bookings.map((booking) => (
            <p key={booking.id} className="type-body">
              <span className="type-num-meta">{booking.reference}</span> · {formatDateIst(booking.at)}, {booking.time} · {booking.partySize} people · {booking.status === 'CONFIRMED' ? 'Confirmed' : 'Waiting'}
            </p>
          ))}
        </div>
      )}

      <ol className="grid gap-2">
        {data.turns.map((turn, index) => (
          <Turn key={`${turn.at}-${index}`} turn={turn} guestName={data.guestFirstName} />
        ))}
      </ol>

      {data.windowOpen ? (
        <label className="block">
          <span className="type-label mb-2 block">Reply</span>
          <textarea
            value={reply}
            onChange={(event) => setReply(event.target.value)}
            rows={3}
            maxLength={1000}
            className="type-body min-h-12 w-full rounded-lg border border-muted bg-surface px-3 py-2 text-ink placeholder:text-muted"
          />
          <Button className="mt-2" isLoading={busy} disabled={!reply.trim()} onClick={() => act.mutate({ kind: 'reply' })}>
            Send reply
          </Button>
        </label>
      ) : (
        <p className="type-body rounded-xl border border-line p-3">The guest last wrote more than 24 hours ago, so WhatsApp allows no reply here. Call them instead.</p>
      )}

      <div className="flex flex-wrap gap-2">
        {data.status !== 'BOT' && data.status !== 'CLOSED' && (
          <Button variant="secondary" disabled={busy} onClick={() => act.mutate({ kind: 'handBack' })}>
            Hand back to the assistant
          </Button>
        )}
        {data.status !== 'CLOSED' && (
          <Button variant="secondary" disabled={busy} onClick={() => act.mutate({ kind: 'done' })}>
            Done
          </Button>
        )}
      </div>

      {data.stoppedAll && (
        <div className="grid gap-2 rounded-xl border border-line p-3">
          <p className="type-body">This guest asked to stop all messages, bills included. Turn them back on only if the guest asks.</p>
          <Input label="Why, in a few words" maxLength={200} value={stopReason} onChange={(event) => setStopReason(event.target.value)} />
          <Button variant="secondary" className="w-fit" disabled={busy || !stopReason.trim()} onClick={() => act.mutate({ kind: 'clearStop' })}>
            Turn messages back on
          </Button>
        </div>
      )}
    </section>
  );
}
