import Input from '../../components/ui/Input.jsx';
import Select from '../../components/ui/Select.jsx';
import Button from '../../components/ui/Button.jsx';

import { Checkbox } from '../settings/settingsParts.jsx';
import { valueAt, withValue } from './providerForms.js';

/** The Pine Labs machine list: a name and its client ID, one per row. */
function Machines({ value = [], onChange, disabled }) {
  const set = (index, key, text) => onChange(value.map((row, at) => (at === index ? { ...row, [key]: text } : row)));
  return (
    <fieldset className="grid gap-2">
      <legend className="type-label">Card machines</legend>
      {value.map((row, index) => (
        <div key={index} className="grid grid-cols-[1fr_1fr_auto] items-end gap-2">
          <Input label="Name" value={row.name} disabled={disabled} onChange={(event) => set(index, 'name', event.target.value)} />
          <Input label="Client ID" value={row.clientId} disabled={disabled} onChange={(event) => set(index, 'clientId', event.target.value)} />
          <Button variant="quiet" size="sm" disabled={disabled || value.length === 1} onClick={() => onChange(value.filter((_, at) => at !== index))}>
            Remove
          </Button>
        </div>
      ))}
      <Button variant="secondary" size="sm" className="w-fit" disabled={disabled} onClick={() => onChange([...value, { name: '', clientId: '' }])}>
        Add a card machine
      </Button>
    </fieldset>
  );
}

/** One provider's settings, drawn from its field list. */
export default function ConfigFields({ fields, config, onChange, disabled, errors = {} }) {
  const set = (path) => (value) => onChange(withValue(config, path, value));
  return fields.map((field) => {
    const value = valueAt(config, field.path);
    const error = errors[`config.${field.path}`] ?? errors[field.path];
    if (field.kind === 'check') {
      return <Checkbox key={field.path} label={field.label} hint={field.hint} checked={Boolean(value)} disabled={disabled} onChange={set(field.path)} />;
    }
    if (field.kind === 'select') {
      return <Select key={field.path} label={field.label} value={value ?? ''} options={field.options} disabled={disabled} error={error} onChange={(event) => set(field.path)(event.target.value)} />;
    }
    if (field.kind === 'machines') {
      return <Machines key={field.path} value={value} disabled={disabled} onChange={set(field.path)} />;
    }
    return (
      <Input
        key={field.path}
        label={field.optional ? `${field.label} (optional)` : field.label}
        hint={field.hint}
        error={error}
        type={field.kind === 'number' ? 'number' : 'text'}
        min={field.min}
        max={field.max}
        value={value ?? ''}
        disabled={disabled}
        onChange={(event) => set(field.path)(field.kind === 'number' ? Number(event.target.value) : event.target.value)}
      />
    );
  });
}
