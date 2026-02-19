import React, { useEffect, useState } from 'react';

type HealthResponse = {
  status: string;
  db: { healthy: boolean; error?: string };
  redis: { healthy: boolean; error?: string };
  sms: {
    twilio: { configured: boolean; healthy?: boolean; error?: string };
    fonecloud: { configured: boolean; healthy?: boolean; error?: string };
  };
  stripe: { configured: boolean; healthy: boolean; error?: string };
  gemini: { configured: boolean; healthy: boolean; error?: string };
};

export const SystemStatusPage: React.FC = () => {
  const [data, setData] = useState<HealthResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [defaultProvider, setDefaultProvider] = useState<'twilio' | 'fonecloud'>('twilio');
  const [savingDefault, setSavingDefault] = useState(false);
  const [defaultError, setDefaultError] = useState<string | null>(null);

  const apiBase =
    import.meta.env.VITE_ADMIN_API_BASE_URL || 'https://admin-api.replypilot.dk';

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const [healthRes, defaultRes] = await Promise.all([
        fetch(`${apiBase}/api/admin/health`),
        fetch(`${apiBase}/api/admin/sms-default`, { credentials: 'include' }),
      ]);

      if (!healthRes.ok) {
        throw new Error('Kunne ikke hente systemstatus');
      }
      const data: HealthResponse = await healthRes.json();
      setData(data);

      if (defaultRes.ok) {
        const json = await defaultRes.json();
        if (json?.provider === 'fonecloud' || json?.provider === 'twilio') {
          setDefaultProvider(json.provider);
        }
      }
    } catch (err: any) {
      setError(err?.message || 'Uventet fejl');
    } finally {
      setLoading(false);
    }
  };

  const handleSaveDefaultProvider = async () => {
    setSavingDefault(true);
    setDefaultError(null);
    try {
      const res = await fetch(`${apiBase}/api/admin/sms-default`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ provider: defaultProvider }),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(payload?.error || 'Kunne ikke gemme standard SMS-udbyder');
      }
    } catch (err: any) {
      setDefaultError(err?.message || 'Uventet fejl ved gem af standard SMS-udbyder');
    } finally {
      setSavingDefault(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Systemstatus</h1>
          <p className="text-sm text-slate-600">
            Overblik over kernekomponenter: database, Redis, SMS-udbydere og Stripe.
          </p>
        </div>
        <button
          onClick={load}
          className="rounded-md border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
        >
          Opdater
        </button>
      </div>

      {loading && <p className="text-sm text-slate-600">Indlæser systemstatus…</p>}

      {error && (
        <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-md px-3 py-2">
          {error}
        </p>
      )}

      {data && (
        <div className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            <StatusCard
              title="Database"
              healthy={data.db.healthy}
              description={data.db.healthy ? 'Forbinder til Postgres' : data.db.error}
            />
            <StatusCard
              title="Redis"
              healthy={data.redis.healthy}
              description={data.redis.healthy ? 'Forbinder til Redis' : data.redis.error}
            />
            <StatusCard
              title="Twilio"
              healthy={
                data.sms.twilio.configured &&
                (data.sms.twilio.healthy ?? true)
              }
              description={
                !data.sms.twilio.configured
                  ? 'TWILIO_* mangler'
                  : data.sms.twilio.healthy === false
                  ? data.sms.twilio.error || 'Fejl ved Twilio API-kald'
                  : 'Twilio API-forbindelse OK'
              }
            />
            <StatusCard
              title="Fonecloud"
              healthy={
                data.sms.fonecloud.configured &&
                (data.sms.fonecloud.healthy ?? true)
              }
              description={
                !data.sms.fonecloud.configured
                  ? 'FONECLOUD_* mangler'
                  : data.sms.fonecloud.healthy === false
                  ? data.sms.fonecloud.error || 'Fejl ved Fonecloud API-kald'
                  : 'Fonecloud API-forbindelse OK'
              }
            />
            <StatusCard
              title="Stripe"
              healthy={data.stripe.configured && data.stripe.healthy}
              description={
                !data.stripe.configured
                  ? 'STRIPE_SECRET_KEY mangler'
                  : data.stripe.healthy
                  ? 'API-kald lykkes'
                  : data.stripe.error || 'Fejl ved Stripe-kald'
              }
            />
            <StatusCard
              title="Gemini"
              healthy={data.gemini.configured && data.gemini.healthy}
              description={
                !data.gemini.configured
                  ? 'GEMINI_API_KEY mangler'
                  : data.gemini.healthy
                  ? 'Gemini API-forbindelse OK'
                  : data.gemini.error || 'Fejl ved Gemini API-kald'
              }
            />
          </div>

          <div className="rounded-xl border bg-white p-4 flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-sm font-semibold text-slate-900">
                  Standard SMS-udbyder for nye kunder
                </h2>
                <p className="text-xs text-slate-600">
                  Bruges når nye kunder oprettes (signup / checkout), før der vælges
                  individuel udbyder.
                </p>
              </div>
            </div>
            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
              <select
                value={defaultProvider}
                onChange={(e) =>
                  setDefaultProvider(e.target.value === 'fonecloud' ? 'fonecloud' : 'twilio')
                }
                className="w-full sm:w-auto rounded-md border border-slate-300 px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-slate-900 focus:border-slate-900"
              >
                <option value="twilio">Twilio</option>
                <option value="fonecloud">Fonecloud</option>
              </select>
              <button
                onClick={handleSaveDefaultProvider}
                disabled={savingDefault}
                className="inline-flex items-center rounded-md bg-slate-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-800 disabled:opacity-60"
              >
                {savingDefault ? 'Gemmer…' : 'Gem standard'}
              </button>
            </div>
            {defaultError && (
              <p className="text-xs text-red-600 bg-red-50 border border-red-100 rounded-md px-2 py-1.5">
                {defaultError}
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

const StatusCard: React.FC<{ title: string; healthy: boolean; description?: string }> = ({
  title,
  healthy,
  description,
}) => {
  return (
    <div className="rounded-xl border bg-white p-4 flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-slate-900">{title}</h2>
        <span
          className={[
            'inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium border',
            healthy
              ? 'bg-emerald-50 text-emerald-700 border-emerald-100'
              : 'bg-red-50 text-red-700 border-red-100',
          ].join(' ')}
        >
          {healthy ? 'OK' : 'Fejl'}
        </span>
      </div>
      {description && <p className="text-xs text-slate-600">{description}</p>}
    </div>
  );
};

