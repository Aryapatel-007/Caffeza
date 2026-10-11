/**
 * WhatsApp chats, for the till. P39 section 14, `/online/chats`, OWNER,
 * MANAGER and CASHIER.
 *
 * Chats that need a person first, then the rest by last message. On a wide
 * screen the list and the open chat sit side by side; on a phone the open
 * chat takes the screen, with a way back to the list.
 */
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';

import { listChats } from '../../api/chats.js';
import { getInbox } from '../../api/online.js';
import EmptyState from '../../components/ui/EmptyState.jsx';
import Spinner from '../../components/ui/Spinner.jsx';
import StateChip from '../../components/ui/StateChip.jsx';
import Toast from '../../components/ui/Toast.jsx';
import { formatTimeIst } from '../../utils/formatDate.js';
import ChatThread, { CHAT_STATUS_CHIP } from './ChatThread.jsx';
import { INBOX_QUERY_KEY } from './OnlineAlerts.jsx';
import { OnlineTabs } from './OnlineInboxPage.jsx';
import { errorText } from './OnlineSheets.jsx';

function ChatRow({ chat, selected, onOpen }) {
  const chip = CHAT_STATUS_CHIP[chat.status] ?? CHAT_STATUS_CHIP.BOT;
  return (
    <li>
      <button
        type="button"
        onClick={onOpen}
        aria-current={selected ? 'true' : undefined}
        className={['grid min-h-12 w-full gap-1 rounded-xl border px-3 py-2 text-left', selected ? 'border-ink bg-sunken' : 'border-line bg-surface hover:bg-sunken'].join(' ')}
      >
        <span className="flex flex-wrap items-center gap-2">
          <span className="type-label">{chat.guestFirstName ?? 'Guest'}</span>
          <StateChip state={chip.state} word={chip.word} size="sm" />
          <span className="type-caption ml-auto text-muted">{formatTimeIst(chat.lastMessageAt)}</span>
        </span>
        {chat.lastText && <span className="type-caption line-clamp-2 text-muted">{chat.lastText}</span>}
      </button>
    </li>
  );
}

export default function ChatsPage() {
  const [openId, setOpenId] = useState(null);
  const [toast, setToast] = useState(null);
  const inbox = useQuery({ queryKey: INBOX_QUERY_KEY, queryFn: getInbox, refetchInterval: 15_000 });
  const chats = useQuery({ queryKey: ['online', 'chats'], queryFn: listChats, refetchInterval: 15_000 });

  return (
    <main className="v2 min-h-full bg-ground text-ink">
      <header className="px-4 pt-4">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="type-title">Chats</h1>
            <p className="type-caption text-muted">Guests on WhatsApp. The assistant answers what it can and hands the rest to you.</p>
          </div>
          <OnlineTabs current="chats" inbox={inbox.data} />
        </div>
      </header>

      <div className="mx-auto grid max-w-5xl gap-6 px-4 py-6 md:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
        <div className={openId ? 'hidden md:block' : ''}>
          {chats.isPending && <Spinner label="Loading chats" />}
          {chats.isError && <p className="type-body text-alert">{errorText(chats.error)}</p>}
          {chats.isSuccess && chats.data.length === 0 && (
            <EmptyState title="No chats yet" description="When a guest writes to your WhatsApp number, the chat shows here." />
          )}
          <ul className="grid gap-2">
            {chats.data?.map((chat) => (
              <ChatRow key={chat.id} chat={chat} selected={chat.id === openId} onOpen={() => setOpenId(chat.id)} />
            ))}
          </ul>
        </div>

        <div className={openId ? '' : 'hidden md:block'}>
          {openId ? (
            <>
              <button type="button" onClick={() => setOpenId(null)} className="type-button mb-3 flex min-h-12 items-center underline underline-offset-4 md:hidden">
                Back to chats
              </button>
              <ChatThread key={openId} chatId={openId} onClose={() => setOpenId(null)} onToast={setToast} />
            </>
          ) : (
            <p className="type-body text-muted">Choose a chat to read it.</p>
          )}
        </div>
      </div>

      {toast && <Toast tone={toast.tone} message={toast.message} onDismiss={() => setToast(null)} />}
    </main>
  );
}
