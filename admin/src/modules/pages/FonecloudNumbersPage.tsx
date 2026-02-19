import React, { useEffect, useState } from 'react';

type FonecloudNumber = {
  id: string;
  phone_number: string;
  customer_id?: string | null;
  allocated_at?: string | null;
  notes?: string | null;
  created_at?: string;
  customer_email?: string | null;
  customer_name?: string | null;
  _section?: 'pool' | 'allocated';
};

export const FonecloudNumbersPage: React.FC = () => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pool, setPool] = useState<FonecloudNumber[]>([]);
  const [allocated, setAllocated] = useState<FonecloudNumber[]>([]);
  const [newNumber, setNewNumber] = useState('');
  const [newNotes, setNewNotes] = useState('');
  const [adding, setAdding] = useState(false);
  const [releasingId, setReleasingId] = useState<string | null>(null);

  const apiBase =
    import.meta.env.VITE_ADMIN_API_BASE_URL || 'https://admin-api.replypilot.dk';

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const [poolRes, allocRes] = await Promise.all([
        fetch(`${apiBase}/api/admin/fonecloud-numbers?status=pool`, { credentials: 'include' }),
        fetch(`${apiBase}/api/admin/fonecloud-numbers?status=allocated`, { credentials: 'include' }),
      ]);
      if (!poolRes.ok || !allocRes.ok) throw new Error('Kunne ikke hente numre');
      const poolData = await poolRes.json();
      const allocData = await allocRes.json();
      setPool(poolData.data || []);
      setAllocated(allocData.data || []);
    } catch (err: any) {
      setError(err?.message || 'Uventet fejl');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    const num = newNumber.trim();
    if (!num) return;
    setAdding(true);
    setError(null);
    try {
      const res = await fetch(`${apiBase}/api/admin/fonecloud-numbers`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ phone_number: num, notes: newNotes.trim() || undefined }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || 'Kunne ikke tilføje nummer');
      setNewNumber('');
      setNewNotes('');
      await load();
    } catch (err: any) {
      setError(err?.message || 'Uventet fejl');
    } finally {
      setAdding(false);
    }
  };

  const handleRelease = async (id: string) => {
    setReleasingId(id);
    setError(null);
    try {
      const res = await fetch(`${apiBase}/api/admin/fonecloud-numbers/${id}/release`, {
        method: 'PATCH',
        credentials: 'include',
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data?.error || 'Kunne ikke frigive nummer');
      }
      await load();
    } catch (err: any) {
      setError(err?.message || 'Uventet fejl');
    } finally {
      setReleasingId(null);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Fonecloud-numre</h1>
        <p className="text-sm text-slate-600">
          Administrer puljen af Fonecloud-numre og tildelte kunder.
        </p>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {error}
        </div>
      )}

      <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="text-sm font-semibold text-slate-900 mb-3">Tilføj nummer til puljen</h2>
        <form onSubmit={handleAdd} className="flex flex-wrap items-end gap-3">
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Telefonnummer</label>
            <input
              type="text"
              value={newNumber}
              onChange={(e) => setNewNumber(e.target.value)}
              placeholder="+4512345678"
              className="rounded-md border border-slate-300 px-3 py-2 text-sm w-44 focus:outline-none focus:ring-2 focus:ring-slate-900 focus:border-slate-900"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Noter (valgfrit)</label>
            <input
              type="text"
              value={newNotes}
              onChange={(e) => setNewNotes(e.target.value)}
              placeholder="fx. batch Q1 2025"
              className="rounded-md border border-slate-300 px-3 py-2 text-sm w-48 focus:outline-none focus:ring-2 focus:ring-slate-900 focus:border-slate-900"
            />
          </div>
          <button
            type="submit"
            disabled={adding || !newNumber.trim()}
            className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
          >
            {adding ? 'Tilføjer…' : 'Tilføj til pulje'}
          </button>
        </form>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
        <h2 className="text-sm font-semibold text-slate-900 px-4 py-3 border-b border-slate-200">
          Tildelte numre
        </h2>
        {loading ? (
          <div className="px-4 py-8 text-center text-slate-500">Indlæser…</div>
        ) : allocated.length === 0 ? (
          <div className="px-4 py-8 text-center text-slate-500">Ingen tildelte numre.</div>
        ) : (
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs font-semibold text-slate-500">
              <tr>
                <th className="px-4 py-3">Nummer</th>
                <th className="px-4 py-3">Kunde</th>
                <th className="px-4 py-3">Tildelt</th>
                <th className="px-4 py-3 text-right">Handling</th>
              </tr>
            </thead>
            <tbody>
              {allocated.map((row) => (
                <tr key={row.id} className="border-t border-slate-100 hover:bg-slate-50/50">
                  <td className="px-4 py-3 font-medium text-slate-900">{row.phone_number}</td>
                  <td className="px-4 py-3 text-slate-600">
                    {row.customer_name || row.customer_email || '–'}
                  </td>
                  <td className="px-4 py-3 text-slate-500 text-xs">
                    {row.allocated_at
                      ? new Date(row.allocated_at).toLocaleString('da-DK')
                      : '–'}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      type="button"
                      onClick={() => handleRelease(row.id)}
                      disabled={releasingId === row.id}
                      className="rounded-md border border-slate-200 px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                    >
                      {releasingId === row.id ? 'Frigiver…' : 'Frigiv'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
        <h2 className="text-sm font-semibold text-slate-900 px-4 py-3 border-b border-slate-200">
          Pulje (tilgængelige numre)
        </h2>
        {loading ? (
          <div className="px-4 py-8 text-center text-slate-500">Indlæser…</div>
        ) : pool.length === 0 ? (
          <div className="px-4 py-8 text-center text-slate-500">Ingen numre i puljen. Tilføj numre ovenfor.</div>
        ) : (
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs font-semibold text-slate-500">
              <tr>
                <th className="px-4 py-3">Nummer</th>
                <th className="px-4 py-3">Noter</th>
                <th className="px-4 py-3">Oprettet</th>
              </tr>
            </thead>
            <tbody>
              {pool.map((row) => (
                <tr key={row.id} className="border-t border-slate-100 hover:bg-slate-50/50">
                  <td className="px-4 py-3 font-medium text-slate-900">{row.phone_number}</td>
                  <td className="px-4 py-3 text-slate-600">{row.notes || '–'}</td>
                  <td className="px-4 py-3 text-slate-500 text-xs">
                    {row.created_at ? new Date(row.created_at).toLocaleString('da-DK') : '–'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
};
