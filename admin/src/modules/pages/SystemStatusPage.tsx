import React, { useEffect, useState } from 'react';

type HealthResponse = {
  status: string;
  db: { healthy: boolean; error?: string };
  redis: { healthy: boolean; error?: string };
  sms: {
    twilio: { configured: boolean };
    fonecloud: { configured: boolean };
  };
  stripe: { configured: boolean; healthy: boolean; error?: string };
};

export const SystemStatusPage: React.FC = () => {
  const [data, setData] = useState<HealthResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const apiBase = import.meta.env.VITE_ADMIN_API_BASE_URL || '';

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${apiBase}/api/admin/health`);
      if (!res.ok) {
        throw new Error('Kunne ikke hente systemstatus');
      }
      const data: HealthResponse = await res.json();
      setData(data);
    } catch (err: any) {
      setError(err?.message || 'Uventet fejl');
    } finally {
      setLoading(false);
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
            healthy={data.sms.twilio.configured}
            description={
              data.sms.twilio.configured ? 'Miljøvariabler sat' : 'TWILIO_* mangler'
            }
          />
          <StatusCard
            title="Fonecloud"
            healthy={data.sms.fonecloud.configured}
            description={
              data.sms.fonecloud.configured
                ? 'Miljøvariabler sat'
                : 'FONECLOUD_* mangler'
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

