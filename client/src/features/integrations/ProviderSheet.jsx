import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';

import { newWebhookAddress, pauseIntegration, resumeIntegration, saveIntegration, testIntegration } from '../../api/integrations.js';
import Button from '../../components/ui/Button.jsx';
import Input from '../../components/ui/Input.jsx';
import Select from '../../components/ui/Select.jsx';
import Sheet from '../../components/ui/Sheet.jsx';
import StateChip from '../../components/ui/StateChip.jsx';
import { errorText } from '../online/OnlineSheets.jsx';

import ConfigFields from './ConfigFields.jsx';
import EventLog from './EventLog.jsx';
import { connectionChip } from './integrationWords.js';
import { credentialLabel, DEFAULT_ENVIRONMENT, ENVIRONMENTS, PROVIDER_DEFAULTS, PROVIDER_FIELDS } from './providerForms.js';

/** A secret field: "ending 7Q2X" and Replace, or a box to type a new one. */
function SecretField({ field, hint, value, onChange, disabled }) {
  const [replacing, setReplacing] = useState(!hint);
  if (!replacing) {
    return (
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="type-body">{credentialLabel(field)}: ending {hint}</span>
        {!disabled && <Button variant="secondary" size="sm" onClick={() => setReplacing(true)}>Replace</Button>}
      </div>
    );
  }
  return <Input label={credentialLabel(field)} type="password" autoComplete="off" value={value} disabled={disabled} onChange={(event) => onChange(event.target.value)} />;
}

/**
 * One partner's connection. P25 Part L1. The owner edits it; a manager reads
 * it. Secrets are never shown, only their last four characters.
 */
export default function ProviderSheet({ entry, canEdit, onClose, onToast }) {
  const queryClient = useQueryClient();
  const connection = entry.connection;
  const [environment, setEnvironment] = useState(connection?.environment ?? DEFAULT_ENVIRONMENT[entry.provider] ?? 'PRODUCTION');
  const [config, setConfig] = useState({ ...(PROVIDER_DEFAULTS[entry.provider] ?? {}), ...(connection?.config ?? {}) });
  const [secrets, setSecrets] = useState({});
  const [webhookUrl, setWebhookUrl] = useState(null);
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['integrations'] });
  const waiting = entry.availability === 'WAITING_FOR_PARTNER';

  const done = (message) => (result) => {
    if (result?.webhookUrl) setWebhookUrl(result.webhookUrl);
    refresh();
    onToast({ tone: 'success', message });
  };
  const failed = (error) => onToast({ tone: 'error', message: errorText(error) });
  const save = useMutation({
    mutationFn: () => saveIntegration(entry.provider, { environment, credentials: secrets, config }),
    onSuccess: done(`${entry.name} saved. Test the connection next.`),
    onError: failed,
  });
  const test = useMutation({ mutationFn: () => testIntegration(entry.provider), onSuccess: done(`${entry.name} answered. It is connected.`), onError: (error) => { refresh(); failed(error); } });
  const pause = useMutation({ mutationFn: () => pauseIntegration(entry.provider), onSuccess: done(`${entry.name} paused.`), onError: failed });
  const resume = useMutation({ mutationFn: () => resumeIntegration(entry.provider), onSuccess: done(`${entry.name} running again.`), onError: failed });
  const address = useMutation({ mutationFn: () => newWebhookAddress(entry.provider), onSuccess: done('New address made. The old one stopped working.'), onError: failed });

  const chip = connectionChip(entry);
  const fields = PROVIDER_FIELDS[entry.provider] ?? [];
  const busy = save.isPending || test.isPending;

  return (
    <Sheet
      title={entry.name}
      subtitle={entry.kindWord}
      wide
      onClose={onClose}
      footer={canEdit && !waiting ? <Button fullWidth isLoading={save.isPending} onClick={() => save.mutate()}>Save</Button> : null}
    >
      <div className="grid gap-4">
        <div className="flex flex-wrap items-center gap-2">
          <StateChip state={chip.state} word={chip.word} />
          {connection?.lastError && <p className="type-caption text-alert">{connection.lastError}</p>}
        </div>
        {waiting ? (
          <p className="type-body">{entry.unavailableReason}</p>
        ) : (
          <>
            <Select label="Environment" value={environment} options={ENVIRONMENTS} disabled={!canEdit} onChange={(event) => setEnvironment(event.target.value)} />
            {(entry.credentialFields ?? []).map((field) => (
              <SecretField
                key={field}
                field={field}
                hint={connection?.credentialHints?.[field]}
                value={secrets[field] ?? ''}
                disabled={!canEdit}
                onChange={(value) => setSecrets({ ...secrets, [field]: value })}
              />
            ))}
            <ConfigFields fields={fields} config={config} onChange={setConfig} disabled={!canEdit} errors={save.error?.fields} />

            {canEdit && connection && (
              <div className="flex flex-wrap gap-2">
                <Button variant="secondary" isLoading={test.isPending} disabled={busy} onClick={() => test.mutate()}>Test connection</Button>
                {connection.status === 'PAUSED' ? (
                  <Button variant="secondary" isLoading={resume.isPending} onClick={() => resume.mutate()}>Resume</Button>
                ) : (
                  connection.status === 'ACTIVE' && <Button variant="secondary" isLoading={pause.isPending} onClick={() => pause.mutate()}>Pause</Button>
                )}
              </div>
            )}

            {connection?.hasWebhook && (
              <div className="grid gap-2 rounded-xl border border-line p-4">
                <h3 className="type-heading">Webhook address</h3>
                {webhookUrl ? (
                  <>
                    <p className="type-caption text-muted">Shown once. Give it to the partner now.</p>
                    <code className="type-caption break-all">{webhookUrl}</code>
                  </>
                ) : (
                  <p className="type-caption text-muted">Set. It is shown only when it is made.</p>
                )}
                {canEdit && <Button variant="secondary" size="sm" className="w-fit" isLoading={address.isPending} onClick={() => address.mutate()}>Make a new address</Button>}
              </div>
            )}

            {entry.kind === 'ORDER_CHANNEL' && connection && (
              <Link to={`/settings/integrations/${entry.provider}/mapping`} className="type-button inline-flex min-h-12 w-fit items-center underline underline-offset-4">
                Item mapping
              </Link>
            )}
            {entry.provider === 'TALLY' && connection && (
              <Link to="/settings/tally" className="type-button inline-flex min-h-12 w-fit items-center underline underline-offset-4">
                Ledger mapping, exports and bridges
              </Link>
            )}
            {connection && <EventLog provider={entry.provider} />}
          </>
        )}
      </div>
    </Sheet>
  );
}
