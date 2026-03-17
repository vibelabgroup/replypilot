import React, { useEffect, useState } from 'react';

// Types for email account management
type EmailAccount = {
  id: string;
  provider: 'gmail' | 'outlook';
  email_address: string;
  display_name: string | null;
  status: 'active' | 'disabled' | 'error';
  last_sync_at: string | null;
  send_as_discovered_at: string | null;
  send_as_sync_error: string | null;
  created_at: string;
  updated_at: string;
};

type SendAsAlias = {
  id: string;
  send_as_email: string;
  display_name: string | null;
  reply_to_address: string | null;
  is_primary: boolean;
  is_default: boolean;
  treat_as_alias: boolean;
  verification_status: 'accepted' | 'pending' | 'error';
  last_verified_at: string | null;
  is_active: boolean;
  created_at: string;
};

type StoreEmailRouting = {
  id: string;
  store_name: string;
  store_domain: string;
  default_from_email: string | null;
  reply_to_email: string | null;
  email_signature: string | null;
  availableAliases: SendAsAlias[];
  hasValidAlias: boolean;
};

// Email Account Management Component
export const EmailAccountSection: React.FC<{ customerId: string }> = ({ customerId }) => {
  const [emailAccounts, setEmailAccounts] = useState<EmailAccount[]>([]);
  const [selectedAccount, setSelectedAccount] = useState<EmailAccount | null>(null);
  const [aliases, setAliases] = useState<SendAsAlias[]>([]);
  const [storeRouting, setStoreRouting] = useState<StoreEmailRouting[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const apiBase = process.env.REACT_APP_ADMIN_API_URL || 'http://localhost:3100';

  // Load email accounts
  const fetchEmailAccounts = async () => {
    try {
      const res = await fetch(`${apiBase}/api/admin/customers/${customerId}/email-accounts`, {
        credentials: 'include',
      });
      if (!res.ok) throw new Error('Failed to fetch email accounts');
      const data = await res.json();
      setEmailAccounts(data.data || []);
    } catch (err: any) {
      setError(err.message);
    }
  };

  // Load send-as aliases for selected account
  const fetchAliases = async (accountId: string) => {
    try {
      const res = await fetch(`${apiBase}/api/admin/email-accounts/${accountId}/aliases`, {
        credentials: 'include',
      });
      if (!res.ok) throw new Error('Failed to fetch aliases');
      const data = await res.json();
      setAliases(data.data || []);
    } catch (err: any) {
      setError(err.message);
    }
  };

  // Load store email routing
  const fetchStoreRouting = async () => {
    try {
      const res = await fetch(`${apiBase}/api/admin/customers/${customerId}/store-email-routing`, {
        credentials: 'include',
      });
      if (!res.ok) throw new Error('Failed to fetch store routing');
      const data = await res.json();
      setStoreRouting(data.data || []);
    } catch (err: any) {
      setError(err.message);
    }
  };

  // Test send-as alias
  const testAlias = async (aliasId: string) => {
    try {
      const res = await fetch(`${apiBase}/api/admin/email-accounts/${selectedAccount?.id}/test-alias`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ aliasId }),
        credentials: 'include',
      });
      if (!res.ok) throw new Error('Test failed');
      setMessage('Test email sent successfully!');
    } catch (err: any) {
      setError(err.message);
    }
  };

  // Refresh aliases
  const refreshAliases = async () => {
    if (!selectedAccount) return;
    
    try {
      const res = await fetch(`${apiBase}/api/admin/email-accounts/${selectedAccount.id}/refresh-aliases`, {
        method: 'POST',
        credentials: 'include',
      });
      if (!res.ok) throw new Error('Refresh failed');
      await fetchAliases(selectedAccount.id);
      setMessage('Aliases refreshed successfully!');
    } catch (err: any) {
      setError(err.message);
    }
  };

  // Update store email routing
  const updateStoreRouting = async (storeId: string, config: any) => {
    try {
      const res = await fetch(`${apiBase}/api/admin/store-connections/${storeId}/email-routing`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config),
        credentials: 'include',
      });
      if (!res.ok) throw new Error('Update failed');
      await fetchStoreRouting();
      setMessage('Store email routing updated successfully!');
    } catch (err: any) {
      setError(err.message);
    }
  };

  useEffect(() => {
    const loadAll = async () => {
      setLoading(true);
      await Promise.all([fetchEmailAccounts(), fetchStoreRouting()]);
      setLoading(false);
    };
    loadAll();
  }, [customerId]);

  useEffect(() => {
    if (selectedAccount) {
      fetchAliases(selectedAccount.id);
    }
  }, [selectedAccount]);

  if (loading) {
    return (
      <div className="rounded-xl border bg-white p-4 space-y-3">
        <h2 className="text-sm font-semibold text-slate-900">Email Accounts & Aliases</h2>
        <p className="text-xs text-slate-500">Loading...</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Email Accounts Section */}
      <div className="rounded-xl border bg-white p-4 space-y-3">
        <div className="flex justify-between items-center">
          <h2 className="text-sm font-semibold text-slate-900">Email Accounts</h2>
          <button
            onClick={() => window.open(`/tenant/oauth/gmail/connect?customerId=${customerId}`, '_blank')}
            className="text-xs bg-slate-900 text-white px-3 py-1.5 rounded-md hover:bg-slate-800"
          >
            Connect Gmail
          </button>
        </div>

        {emailAccounts.length === 0 ? (
          <p className="text-xs text-slate-500">No email accounts connected</p>
        ) : (
          <div className="space-y-2">
            {emailAccounts.map((account) => (
              <div
                key={account.id}
                className={`p-3 border rounded-lg cursor-pointer transition-colors ${
                  selectedAccount?.id === account.id
                    ? 'border-slate-900 bg-slate-50'
                    : 'border-slate-200 hover:border-slate-300'
                }`}
                onClick={() => setSelectedAccount(account)}
              >
                <div className="flex justify-between items-start">
                  <div>
                    <div className="font-medium text-sm text-slate-900">
                      {account.display_name || account.email_address}
                    </div>
                    <div className="text-xs text-slate-500">{account.email_address}</div>
                    <div className="text-xs text-slate-400 capitalize">{account.provider}</div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span
                      className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${
                        account.status === 'active'
                          ? 'bg-green-100 text-green-700'
                          : account.status === 'error'
                          ? 'bg-red-100 text-red-700'
                          : 'bg-slate-100 text-slate-700'
                      }`}
                    >
                      {account.status}
                    </span>
                    {account.send_as_discovered_at && (
                      <span className="text-xs text-slate-400">Aliases loaded</span>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Send-As Aliases Section */}
      {selectedAccount && (
        <div className="rounded-xl border bg-white p-4 space-y-3">
          <div className="flex justify-between items-center">
            <h3 className="text-sm font-semibold text-slate-900">
              Send-As Aliases ({selectedAccount.email_address})
            </h3>
            <div className="flex gap-2">
              <button
                onClick={refreshAliases}
                className="text-xs bg-slate-100 text-slate-700 px-3 py-1.5 rounded-md hover:bg-slate-200"
              >
                Refresh
              </button>
            </div>
          </div>

          {aliases.length === 0 ? (
            <p className="text-xs text-slate-500">No send-as aliases discovered</p>
          ) : (
            <div className="overflow-x-auto rounded-lg border border-slate-200">
              <table className="min-w-full text-sm">
                <thead className="bg-slate-50 text-left text-xs font-semibold text-slate-500">
                  <tr>
                    <th className="px-3 py-2">Email</th>
                    <th className="px-3 py-2">Display Name</th>
                    <th className="px-3 py-2">Status</th>
                    <th className="px-3 py-2">Type</th>
                    <th className="px-3 py-2">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {aliases.map((alias) => (
                    <tr key={alias.id} className="border-t border-slate-100">
                      <td className="px-3 py-2">
                        <div className="font-medium text-slate-900">{alias.send_as_email}</div>
                        {alias.reply_to_address && (
                          <div className="text-xs text-slate-500">Reply-to: {alias.reply_to_address}</div>
                        )}
                      </td>
                      <td className="px-3 py-2 text-slate-700">{alias.display_name || '-'}</td>
                      <td className="px-3 py-2">
                        <span
                          className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${
                            alias.verification_status === 'accepted'
                              ? 'bg-green-100 text-green-700'
                              : alias.verification_status === 'pending'
                              ? 'bg-yellow-100 text-yellow-700'
                              : 'bg-red-100 text-red-700'
                          }`}
                        >
                          {alias.verification_status}
                        </span>
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex gap-1">
                          {alias.is_primary && (
                            <span className="inline-flex items-center rounded-full bg-blue-100 text-blue-700 px-2 py-0.5 text-[11px]">
                              Primary
                            </span>
                          )}
                          {alias.is_default && (
                            <span className="inline-flex items-center rounded-full bg-purple-100 text-purple-700 px-2 py-0.5 text-[11px]">
                              Default
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-3 py-2">
                        <button
                          onClick={() => testAlias(alias.id)}
                          disabled={alias.verification_status !== 'accepted'}
                          className="text-xs bg-slate-100 text-slate-700 px-2 py-1 rounded hover:bg-slate-200 disabled:opacity-50"
                        >
                          Test
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Store Email Routing Section */}
      <div className="rounded-xl border bg-white p-4 space-y-3">
        <h3 className="text-sm font-semibold text-slate-900">Store Email Routing</h3>
        
        {storeRouting.length === 0 ? (
          <p className="text-xs text-slate-500">No store connections configured</p>
        ) : (
          <div className="space-y-3">
            {storeRouting.map((store) => (
              <StoreRoutingRow
                key={store.id}
                store={store}
                availableAliases={aliases}
                onUpdate={(config) => updateStoreRouting(store.id, config)}
              />
            ))}
          </div>
        )}
      </div>

      {/* Messages */}
      {message && (
        <div className="rounded-md bg-green-50 border border-green-100 p-3">
          <p className="text-sm text-green-700">{message}</p>
        </div>
      )}
      {error && (
        <div className="rounded-md bg-red-50 border border-red-100 p-3">
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}
    </div>
  );
};

// Store Routing Row Component
const StoreRoutingRow: React.FC<{
  store: StoreEmailRouting;
  availableAliases: SendAsAlias[];
  onUpdate: (config: any) => void;
}> = ({ store, availableAliases, onUpdate }) => {
  const [editing, setEditing] = useState(false);
  const [config, setConfig] = useState({
    default_from_email: store.default_from_email || '',
    reply_to_email: store.reply_to_email || '',
    email_signature: store.email_signature || '',
  });

  const handleSave = () => {
    onUpdate(config);
    setEditing(false);
  };

  const handleCancel = () => {
    setConfig({
      default_from_email: store.default_from_email || '',
      reply_to_email: store.reply_to_email || '',
      email_signature: store.email_signature || '',
    });
    setEditing(false);
  };

  return (
    <div className="border border-slate-200 rounded-lg p-3">
      <div className="flex justify-between items-start mb-2">
        <div>
          <div className="font-medium text-sm text-slate-900">{store.store_name}</div>
          <div className="text-xs text-slate-500">{store.store_domain}</div>
        </div>
        <div className="flex items-center gap-2">
          <span
            className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${
              store.hasValidAlias
                ? 'bg-green-100 text-green-700'
                : 'bg-yellow-100 text-yellow-700'
            }`}
          >
            {store.hasValidAlias ? 'Valid' : 'Needs Config'}
          </span>
          {!editing && (
            <button
              onClick={() => setEditing(true)}
              className="text-xs bg-slate-100 text-slate-700 px-2 py-1 rounded hover:bg-slate-200"
            >
              Configure
            </button>
          )}
        </div>
      </div>

      {editing ? (
        <div className="space-y-3">
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">
              From Email
            </label>
            <select
              value={config.default_from_email}
              onChange={(e) => setConfig({ ...config, default_from_email: e.target.value })}
              className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-xs"
            >
              <option value="">Select email address</option>
              {availableAliases
                .filter(a => a.verification_status === 'accepted')
                .map((alias) => (
                  <option key={alias.id} value={alias.send_as_email}>
                    {alias.display_name ? `${alias.display_name} <${alias.send_as_email}>` : alias.send_as_email}
                  </option>
                ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">
              Reply-To Email
            </label>
            <input
              type="email"
              value={config.reply_to_email}
              onChange={(e) => setConfig({ ...config, reply_to_email: e.target.value })}
              placeholder="reply@example.com"
              className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-xs"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">
              Email Signature
            </label>
            <textarea
              value={config.email_signature}
              onChange={(e) => setConfig({ ...config, email_signature: e.target.value })}
              placeholder="Optional email signature"
              rows={3}
              className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-xs"
            />
          </div>

          <div className="flex gap-2">
            <button
              onClick={handleSave}
              className="text-xs bg-slate-900 text-white px-3 py-1.5 rounded hover:bg-slate-800"
            >
              Save
            </button>
            <button
              onClick={handleCancel}
              className="text-xs bg-slate-100 text-slate-700 px-3 py-1.5 rounded hover:bg-slate-200"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <div className="text-xs text-slate-600">
          {store.default_from_email ? (
            <div>From: {store.default_from_email}</div>
          ) : (
            <div className="text-slate-400 italic">No from email configured</div>
          )}
          {store.reply_to_email && <div>Reply-To: {store.reply_to_email}</div>}
          {store.email_signature && (
            <div className="mt-1 text-slate-500">Signature configured</div>
          )}
        </div>
      )}
    </div>
  );
};
