import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';

type Customer = {
  id: string;
  email: string;
  name: string | null;
  phone: string | null;
  status: string;
  subscription_status: string | null;
  sms_provider: string | null;
  fonecloud_sender_id: string | null;
  twilio_phone_number: string | null;
  created_at: string;
};

type Pagination = {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
};

type Response = {
  data: Customer[];
  pagination: Pagination;
};

export const CustomerListPage: React.FC = () => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [rows, setRows] = useState<Customer[]>([]);
  const [pagination, setPagination] = useState<Pagination | null>(null);

  const apiBase =
    import.meta.env.VITE_ADMIN_API_BASE_URL || 'https://admin-api.replypilot.dk';

  const load = async (page = 1) => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ page: String(page), pageSize: '25' });
      const res = await fetch(`${apiBase}/api/admin/customers?${params.toString()}`, {
        credentials: 'include',
      });
      if (!res.ok) {
        throw new Error('Kunne ikke hente kunder');
      }
      const data: Response = await res.json();
      setRows(data.data);
      setPagination(data.pagination);
    } catch (err: any) {
      setError(err?.message || 'Uventet fejl');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load(1);
  }, []);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Kunder</h1>
          <p className="text-sm text-slate-600">
            Overblik over alle Replypilot-kunder, abonnementstatus og SMS-udbyder.
          </p>
        </div>
      </div>
      <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs font-semibold text-slate-500">
            <tr>
              <th className="px-4 py-3">Kunde</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Abonnement</th>
              <th className="px-4 py-3">SMS-udbyder</th>
              <th className="px-4 py-3">Oprettet</th>
              <th className="px-4 py-3 text-right">Handling</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-slate-500">
                  Indlæser kunder…
                </td>
              </tr>
            )}
            {!loading && rows.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-slate-500">
                  Ingen kunder fundet.
                </td>
              </tr>
            )}
            {!loading &&
              rows.map((c) => (
                <tr key={c.id} className="border-t last:border-b bg-white hover:bg-slate-50/80">
                  <td className="px-4 py-3">
                    <div className="font-medium text-slate-900">
                      {c.name || c.email}
                    </div>
                    <div className="text-xs text-slate-500">{c.email}</div>
                  </td>
                  <td className="px-4 py-3">
                    <span className="inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium text-slate-700">
                      {c.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-700">
                    {c.subscription_status || 'ukendt'}
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-700">
                    {c.sms_provider || 'twilio'}
                    {c.fonecloud_sender_id && (
                      <span className="block text-[11px] text-slate-500">
                        Fonecloud ID: {c.fonecloud_sender_id}
                      </span>
                    )}
                    {c.twilio_phone_number && (
                      <span className="block text-[11px] text-slate-500">
                        Nummer: {c.twilio_phone_number}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-500">
                    {new Date(c.created_at).toLocaleDateString('da-DK')}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Link
                      to={`/customers/${c.id}`}
                      className="inline-flex items-center rounded-md border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
                    >
                      Detaljer
                    </Link>
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
      {error && (
        <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-md px-3 py-2">
          {error}
        </p>
      )}
      {pagination && pagination.totalPages > 1 && (
        <div className="flex justify-between items-center text-xs text-slate-600">
          <div>
            Side {pagination.page} af {pagination.totalPages} · {pagination.total} kunder
          </div>
          <div className="space-x-2">
            <button
              disabled={pagination.page <= 1}
              onClick={() => load(pagination.page - 1)}
              className="rounded-md border border-slate-200 bg-white px-2 py-1 disabled:opacity-50"
            >
              Forrige
            </button>
            <button
              disabled={pagination.page >= pagination.totalPages}
              onClick={() => load(pagination.page + 1)}
              className="rounded-md border border-slate-200 bg-white px-2 py-1 disabled:opacity-50"
            >
              Næste
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

