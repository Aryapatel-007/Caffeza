/**
 * The cafe's own Razorpay account, in Settings. P24, owner only.
 *
 * The secrets are typed once, sent once, and never shown again: the server
 * keeps them sealed and only ever answers with the key id and the mode. The
 * webhook address is shown to paste into Razorpay's dashboard.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import { connectPaymentGateway, disconnectPaymentGateway, getPaymentGateway } from '../../api/settings.js';
import Button from '../../components/ui/Button.jsx';
import Input from '../../components/ui/Input.jsx';
import StateChip from '../../components/ui/StateChip.jsx';

export default function PaymentGatewayPanel() {
  const queryClient = useQueryClient();
  const gateway = useQuery({ queryKey: ['payment-gateway'], queryFn: getPaymentGateway });
  const [draft, setDraft] = useState({ keyId: '', keySecret: '', webhookSecret: '', reason: '' });
  const set = (field) => (event) => setDraft((current) => ({ ...current, [field]: event.target.value }));
  const done = (data) => {
    queryClient.setQueryData(['payment-gateway'], data);
    setDraft({ keyId: '', keySecret: '', webhookSecret: '', reason: '' });
  };
  const connect = useMutation({ mutationFn: () => connectPaymentGateway({ ...draft, keyId: draft.keyId.trim() }), onSuccess: done });
  const disconnect = useMutation({ mutationFn: () => disconnectPaymentGateway(draft.reason.trim()), onSuccess: done });

  if (!gateway.data) return null;
  const { connected, keyId, mode, webhookUrl, serverReady } = gateway.data;
  const error = connect.error ?? disconnect.error;

  return (
    <div className="grid gap-3 rounded-lg border border-line p-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="type-heading">Razorpay</span>
        {connected ? (
          <StateChip state="ok" word={mode === 'LIVE' ? 'Connected, live' : 'Connected, test mode'} size="sm" />
        ) : (
          <StateChip state="free" word="Not connected" size="sm" />
        )}
      </div>
      <p className="type-caption text-muted">
        Guests pay into your own Razorpay account. We never hold the money. Refunds for declined or expired requests go back automatically.
      </p>
      {!serverReady && (
        <p className="type-label rounded-lg border border-alert bg-alert-tint px-3 py-2 text-alert">
          Online payment is not set up on this server yet. Ask your developer to set PAYMENT_SECRETS_KEY.
        </p>
      )}
      {connected && <p className="type-body">Key id <span className="type-num-meta">{keyId}</span></p>}
      {webhookUrl && (
        <p className="type-caption break-all text-muted">
          In Razorpay, Settings, Webhooks: add <span className="type-num-meta text-ink">{webhookUrl}</span> for the event payment_link.paid, with the webhook secret below.
        </p>
      )}
      {serverReady && (
        <>
          <div className="grid gap-3 sm:grid-cols-2">
            <Input label="Key id" placeholder="rzp_live_…" autoComplete="off" value={draft.keyId} onChange={set('keyId')} />
            <Input label="Key secret" type="password" autoComplete="new-password" value={draft.keySecret} onChange={set('keySecret')} />
            <Input label="Webhook secret" type="password" autoComplete="new-password" value={draft.webhookSecret} onChange={set('webhookSecret')} />
            <Input label="Why" value={draft.reason} maxLength={200} onChange={set('reason')} placeholder="Recorded in the activity log" />
          </div>
          {error && <p className="type-body text-alert">{error.message}</p>}
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              disabled={!draft.keyId || !draft.keySecret || !draft.webhookSecret || !draft.reason.trim()}
              isLoading={connect.isPending}
              onClick={() => connect.mutate()}
            >
              {connected ? 'Replace keys' : 'Connect Razorpay'}
            </Button>
            {connected && (
              <Button type="button" variant="danger" disabled={!draft.reason.trim()} isLoading={disconnect.isPending} onClick={() => disconnect.mutate()}>
                Disconnect
              </Button>
            )}
          </div>
        </>
      )}
    </div>
  );
}
