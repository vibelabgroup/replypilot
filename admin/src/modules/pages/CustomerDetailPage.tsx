import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';

type Customer = {
  id: string;
  email: string;
  name: string | null;
  phone: string | null;
  status: string;
  subscription_status: string | null;
  sms_provider: string | null;
  fonecloud_sender_id: string | null;
  // Company / settings (joined from company_settings)
  company_name?: string | null;
  company_phone_number?: string | null;
  company_address?: string | null;
  website?: string | null;
  industry?: string | null;
  vat_number?: string | null;
  service_area?: string | null;
  opening_hours?: any;
  forwarding_number?: string | null;
  email_forward?: string | null;
  company_notes?: string | null;
  // Telephony
  twilio_phone_number?: string | null;
  // AI configuration (joined from ai_settings)
  ai_agent_name?: string | null;
  ai_tone?: string | null;
  ai_language?: string | null;
  ai_custom_instructions?: string | null;
  ai_max_message_length?: number | null;
};

type Usage = {
  conversations_count: number;
  messages_count: number;
};

type DetailResponse = {
  customer: Customer;
  usage: Usage;
};

export const CustomerDetailPage: React.FC = () => {
  const { id } = useParams();
  const [data, setData] = useState<DetailResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [provider, setProvider] = useState<string>('twilio');
  const [fonecloudId, setFonecloudId] = useState<string>('');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [testNumber, setTestNumber] = useState('');
  const [testBody, setTestBody] = useState('');
  const [testing, setTesting] = useState(false);

  const apiBase =
    import.meta.env.VITE_ADMIN_API_BASE_URL || 'https://admin-api.replypilot.dk';

  const load = async () => {
    if (!id) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${apiBase}/api/admin/customers/${id}`, {
        credentials: 'include',
      });
      if (!res.ok) {
        throw new Error('Kunne ikke hente kunde');
      }
      const data: DetailResponse = await res.json();
      setData(data);
      setProvider(data.customer.sms_provider || 'twilio');
      setFonecloudId(data.customer.fonecloud_sender_id || '');
    } catch (err: any) {
      setError(err?.message || 'Uventet fejl');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [id]);

  const handleSaveSms = async () => {
    if (!id) return;
    setSaving(true);
    setMessage(null);
    setError(null);
    try {
      const res = await fetch(`${apiBase}/api/admin/customers/${id}/sms`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          provider,
          fonecloud_sender_id: fonecloudId || null,
        }),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(payload?.error || 'Kunne ikke opdatere SMS-indstillinger');
      }
      setMessage('SMS-indstillinger opdateret');
      await load();
    } catch (err: any) {
      setError(err?.message || 'Uventet fejl');
    } finally {
      setSaving(false);
    }
  };

  const handleTestSms = async () => {
    if (!id) return;
    setTesting(true);
    setMessage(null);
    setError(null);
    try {
      const res = await fetch(`${apiBase}/api/admin/customers/${id}/test-sms`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ to: testNumber, body: testBody }),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(payload?.error || 'Kunne ikke køe test-SMS');
      }
      setMessage('Test-SMS er køet via job-køen');
      setTestBody('');
    } catch (err: any) {
      setError(err?.message || 'Uventet fejl');
    } finally {
      setTesting(false);
    }
  };

  if (loading) {
    return <p className="text-sm text-slate-600">Indlæser kunde…</p>;
  }

  if (!data || !id) {
    return <p className="text-sm text-red-600">Kunde ikke fundet.</p>;
  }

  const { customer, usage } = data;

  const openingHours = customer.opening_hours || null;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">
          {customer.name || customer.email}
        </h1>
        <p className="text-sm text-slate-600">
          {customer.email} · {customer.phone || 'intet telefonnummer'}
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <div className="rounded-xl border bg-white p-4">
          <h2 className="text-sm font-semibold text-slate-900 mb-2">Status</h2>
          <p className="text-xs text-slate-600 mb-1">Kundestatus</p>
          <p className="inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium text-slate-700 mb-2">
            {customer.status}
          </p>
          <p className="text-xs text-slate-600 mb-1">Abonnement</p>
          <p className="text-xs text-slate-800">
            {customer.subscription_status || 'ukendt'}
          </p>
        </div>

        <div className="rounded-xl border bg-white p-4">
          <h2 className="text-sm font-semibold text-slate-900 mb-2">Brug</h2>
          <p className="text-xs text-slate-600 mb-1">Samtaler</p>
          <p className="text-xl font-semibold text-slate-900 mb-3">
            {usage.conversations_count}
          </p>
          <p className="text-xs text-slate-600 mb-1">Beskeder</p>
          <p className="text-xl font-semibold text-slate-900">
            {usage.messages_count}
          </p>
        </div>

        <div className="rounded-xl border bg-white p-4">
          <h2 className="text-sm font-semibold text-slate-900 mb-2">SMS-udbyder</h2>
          <div className="space-y-3">
            {customer.twilio_phone_number && (
              <div>
                <p className="text-xs text-slate-600 mb-1">Aktivt SMS-nummer</p>
                <p className="text-xs font-mono text-slate-800">
                  {customer.twilio_phone_number}
                </p>
              </div>
            )}
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Udbyder
              </label>
              <select
                value={provider}
                onChange={(e) => setProvider(e.target.value)}
                className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-slate-900 focus:border-slate-900"
              >
                <option value="twilio">Twilio</option>
                <option value="fonecloud">Fonecloud</option>
              </select>
            </div>
            {provider === 'fonecloud' && (
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Fonecloud sender ID
                </label>
                <input
                  type="text"
                  value={fonecloudId}
                  onChange={(e) => setFonecloudId(e.target.value)}
                  className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-slate-900 focus:border-slate-900"
                  placeholder="fx. FC-1234"
                />
              </div>
            )}
            <button
              onClick={handleSaveSms}
              disabled={saving}
              className="w-full rounded-md bg-slate-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-800 disabled:opacity-60"
            >
              {saving ? 'Gemmer…' : 'Gem SMS-indstillinger'}
            </button>
          </div>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="rounded-xl border bg-white p-4 space-y-2">
          <h2 className="text-sm font-semibold text-slate-900">Virksomhed</h2>
          <p className="text-xs text-slate-600">
            Navn:{' '}
            <span className="font-medium text-slate-900">
              {customer.company_name || customer.name || 'Ikke angivet'}
            </span>
          </p>
          {customer.website && (
            <p className="text-xs text-slate-600">
              Website:{' '}
              <a
                href={customer.website}
                target="_blank"
                rel="noreferrer"
                className="text-xs font-medium text-slate-900 underline underline-offset-2"
              >
                {customer.website}
              </a>
            </p>
          )}
          {customer.industry && (
            <p className="text-xs text-slate-600">
              Branche:{' '}
              <span className="font-medium text-slate-900">{customer.industry}</span>
            </p>
          )}
          {customer.vat_number && (
            <p className="text-xs text-slate-600">
              CVR:{' '}
              <span className="font-mono text-slate-900">{customer.vat_number}</span>
            </p>
          )}
          {customer.company_address && (
            <p className="text-xs text-slate-600">
              Adresse:{' '}
              <span className="font-medium text-slate-900">
                {customer.company_address}
              </span>
            </p>
          )}
          {customer.service_area && (
            <p className="text-xs text-slate-600">
              Dækningsområde:{' '}
              <span className="font-medium text-slate-900">
                {customer.service_area}
              </span>
            </p>
          )}
          {openingHours && (
            <div className="mt-2">
              <p className="text-xs font-medium text-slate-700 mb-1">Åbningstider</p>
              <div className="grid grid-cols-2 gap-1 text-[11px] text-slate-600">
                {Object.entries(openingHours).map(([day, hours]: any) => (
                  <div key={day} className="flex justify-between">
                    <span className="capitalize">{day}</span>
                    <span className="font-mono">
                      {hours?.open && hours?.close
                        ? `${hours.open}–${hours.close}`
                        : 'Lukket'}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="rounded-xl border bg-white p-4 space-y-2">
          <h2 className="text-sm font-semibold text-slate-900">AI-konfiguration</h2>
          <p className="text-xs text-slate-600">
            Agentnavn:{' '}
            <span className="font-medium text-slate-900">
              {customer.ai_agent_name || 'Ikke angivet'}
            </span>
          </p>
          <p className="text-xs text-slate-600">
            Tone:{' '}
            <span className="font-medium text-slate-900">
              {customer.ai_tone || 'standard'}
            </span>
          </p>
          <p className="text-xs text-slate-600">
            Sprog:{' '}
            <span className="font-medium text-slate-900">
              {customer.ai_language || 'da'}
            </span>
          </p>
          {typeof customer.ai_max_message_length === 'number' && (
            <p className="text-xs text-slate-600">
              Maks. beskedlængde:{' '}
              <span className="font-medium text-slate-900">
                {customer.ai_max_message_length} tegn
              </span>
            </p>
          )}
          {customer.ai_custom_instructions && (
            <div className="mt-2">
              <p className="text-xs font-medium text-slate-700 mb-1">
                Specialinstruktioner
              </p>
              <p className="text-xs text-slate-700 line-clamp-3">
                {customer.ai_custom_instructions}
              </p>
            </div>
          )}
        </div>
      </div>

      <div className="rounded-xl border bg-white p-4 space-y-3">
        <h2 className="text-sm font-semibold text-slate-900">Test-SMS</h2>
        <p className="text-xs text-slate-600">
          Send en enkelt test-SMS via den valgte udbyder til at verificere routing og opsætning.
        </p>
        <div className="grid gap-3 md:grid-cols-[1.5fr,3fr,auto]">
          <input
            type="text"
            placeholder="+45…"
            value={testNumber}
            onChange={(e) => setTestNumber(e.target.value)}
            className="rounded-md border border-slate-300 px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-slate-900 focus:border-slate-900"
          />
          <input
            type="text"
            placeholder="Besked til test-SMS"
            value={testBody}
            onChange={(e) => setTestBody(e.target.value)}
            className="rounded-md border border-slate-300 px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-slate-900 focus:border-slate-900"
          />
          <button
            onClick={handleTestSms}
            disabled={testing || !testNumber || !testBody}
            className="rounded-md bg-slate-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-800 disabled:opacity-60"
          >
            {testing ? 'Sender…' : 'Send test'}
          </button>
        </div>
      </div>

      {message && (
        <p className="text-sm text-emerald-700 bg-emerald-50 border border-emerald-100 rounded-md px-3 py-2">
          {message}
        </p>
      )}
      {error && (
        <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-md px-3 py-2">
          {error}
        </p>
      )}
    </div>
  );
};

