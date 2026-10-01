import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate, useParams } from 'react-router-dom';

import { createUser, getUser, updateUser } from '../../api/users.js';
import { listStations } from '../../api/stations.js';
import Button from '../../components/ui/Button.jsx';
import ErrorMessage from '../../components/ui/ErrorMessage.jsx';
import Input from '../../components/ui/Input.jsx';
import Select from '../../components/ui/Select.jsx';
import Spinner from '../../components/ui/Spinner.jsx';
import { useAuth } from '../../context/AuthContext.jsx';
import { ROLES, roleOptions } from './roles.js';

const EMPTY = { name: '', phone: '', email: '', role: ROLES.CASHIER, password: '', stationId: '' };

/** Add and edit share a form, because they are the same fields. */
export default function StaffFormPage() {
  const { userId } = useParams();
  const navigate = useNavigate();
  const { user: actor } = useAuth();

  const isEditing = Boolean(userId);

  const [form, setForm] = useState(EMPTY);
  // P05. Stations, for a KITCHEN user's station picker.
  const stations = useQuery({ queryKey: ['stations'], queryFn: () => listStations() });
  const [isLoading, setIsLoading] = useState(isEditing);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!isEditing) return undefined;

    let cancelled = false;
    async function load() {
      try {
        const staff = await getUser(userId);
        if (!cancelled) {
          setForm({
            name: staff.name,
            phone: staff.phone,
            email: staff.email ?? '',
            role: staff.role,
            password: '',
            stationId: staff.stationId ?? '',
          });
        }
      } catch (loadError) {
        if (!cancelled) setError(loadError);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [isEditing, userId]);

  const set = (field) => (event) => setForm((current) => ({ ...current, [field]: event.target.value }));

  async function handleSubmit(event) {
    event.preventDefault();
    setError(null);
    setIsSaving(true);

    try {
      if (isEditing) await updateUser(userId, form);
      else await createUser(form);
      navigate('/staff');
    } catch (saveError) {
      setError(saveError);
    } finally {
      setIsSaving(false);
    }
  }

  if (isLoading) {
    return (
      <div className="p-6">
        <Spinner label="Loading this person details" />
      </div>
    );
  }

  return (
    <main className="min-h-full bg-slate-50 p-6">
      <div className="mx-auto w-full max-w-md">
        <h1 className="text-xl font-semibold text-slate-900">
          {isEditing ? 'Edit staff member' : 'Add staff member'}
        </h1>

        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          <Input label="Name" required value={form.name} onChange={set('name')} disabled={isSaving} />

          <Input
            label="Mobile number"
            type="tel"
            inputMode="numeric"
            required={!isEditing}
            value={form.phone}
            onChange={set('phone')}
            disabled={isEditing || isSaving}
            hint={
              isEditing
                ? 'A phone number cannot be changed. It is the login identity, so a change means a new record.'
                : '10 digits. It must not already be registered.'
            }
          />

          <Input
            label="Email (optional)"
            type="email"
            value={form.email}
            onChange={set('email')}
            disabled={isSaving}
          />

          {/* A manager does not see Owner here. The server refuses it anyway. */}
          <Select
            label="Role"
            value={form.role}
            onChange={set('role')}
            options={roleOptions(actor?.role)}
            disabled={isSaving}
          />

          {/* P05. A kitchen login opens on its own station's tickets. */}
          {form.role === ROLES.KITCHEN && (stations.data ?? []).length > 0 && (
            <Select
              label="Station"
              value={form.stationId}
              onChange={set('stationId')}
              options={[
                { value: '', label: 'All stations' },
                ...(stations.data ?? []).map((station) => ({ value: station.id, label: station.name })),
              ]}
              disabled={isSaving}
            />
          )}

          {!isEditing && (
            <Input
              label="Initial password"
              type="password"
              required
              value={form.password}
              onChange={set('password')}
              disabled={isSaving}
              hint="At least 8 characters. Tell them what it is; they can change it themselves."
            />
          )}

          {error && <ErrorMessage error={error} />}

          <div className="flex gap-3 pt-2">
            <Button type="submit" isLoading={isSaving}>
              {isEditing ? 'Save changes' : 'Add staff member'}
            </Button>
            <Button type="button" variant="secondary" onClick={() => navigate('/staff')} disabled={isSaving}>
              Cancel
            </Button>
          </div>
        </form>
      </div>
    </main>
  );
}
