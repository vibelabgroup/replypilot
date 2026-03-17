// Critical fix: Update admin CustomerDetailPage to include EmailAccountSection
// This replaces the existing CustomerDetailPage.tsx with enhanced functionality

import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';

// Import existing components and types
import { useAdminAuth } from '../hooks/useAdminAuth';
import { LoadingSpinner } from '../ui/LoadingSpinner';
import { EmailAccountSection } from '../components/EmailAccountSection';

// Types (existing from original file)
type Customer = {
  id: string;
  email: string;
  name: string | null;
  phone: string | null;
  status: string;
  subscription_status: string | null;
  sms_provider: string | null;
  fonecloud_sender_id: string | null;
  shopify_enabled?: boolean;
  max_store_connections?: number | null;
  created_at: string;
  updated_at: string;
};

type StoreConnection = {
  id: string;
  platform: 'woo' | 'shopify';
  store_name: string | null;
  store_domain: string;
  status: string;
  support_emails?: string[] | null;
  last_sync_at: string | null;
  created_at: string;
  updated_at: string;
};

export const CustomerDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAdminAuth();

  const [customer, setCustomer] = useState<Customer | null>(null);
  const [storeConnections, setStoreConnections] = useState<StoreConnection[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'overview' | 'stores' | 'email'>('overview');

  const apiBase = process.env.REACT_APP_ADMIN_API_URL || 'http://localhost:3100';

  // Fetch customer data
  const fetchCustomer = async () => {
    try {
      const res = await fetch(`${apiBase}/api/admin/customers/${id}`, {
        credentials: 'include',
      });
      if (!res.ok) throw new Error('Failed to fetch customer');
      const data = await res.json();
      setCustomer(data);
    } catch (err: any) {
      setError(err.message);
    }
  };

  // Fetch store connections
  const fetchStoreConnections = async () => {
    try {
      const res = await fetch(`${apiBase}/api/admin/customers/${id}/store-connections`, {
        credentials: 'include',
      });
      if (!res.ok) throw new Error('Failed to fetch store connections');
      const data = await res.json();
      setStoreConnections(data.data || []);
    } catch (err: any) {
      setError(err.message);
    }
  };

  useEffect(() => {
    if (!id) return;
    
    const loadData = async () => {
      setLoading(true);
      await Promise.all([fetchCustomer(), fetchStoreConnections()]);
      setLoading(false);
    };
    
    loadData();
  }, [id]);

  if (authLoading || loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <LoadingSpinner />
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-md bg-red-50 border border-red-100 p-4">
        <p className="text-sm text-red-700">Error: {error}</p>
      </div>
    );
  }

  if (!customer) {
    return (
      <div className="rounded-md bg-yellow-50 border border-yellow-100 p-4">
        <p className="text-sm text-yellow-700">Customer not found</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">
            {customer.name || customer.email}
          </h1>
          <p className="text-sm text-slate-500">{customer.email}</p>
        </div>
        <button
          onClick={() => navigate('/admin/customers')}
          className="text-sm text-slate-600 hover:text-slate-900"
        >
          ← Back to Customers
        </button>
      </div>

      {/* Tabs */}
      <div className="border-b border-slate-200">
        <nav className="-mb-px flex space-x-8">
          {[
            { key: 'overview', label: 'Overview' },
            { key: 'stores', label: `Store Connections (${storeConnections.length})` },
            { key: 'email', label: 'Email Accounts' },
          ].map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key as any)}
              className={`py-2 px-1 border-b-2 font-medium text-sm ${
                activeTab === tab.key
                  ? 'border-slate-900 text-slate-900'
                  : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </nav>
      </div>

      {/* Tab Content */}
      {activeTab === 'overview' && (
        <div className="space-y-6">
          {/* Customer Info */}
          <div className="rounded-xl border bg-white p-6">
            <h2 className="text-lg font-semibold text-slate-900 mb-4">Customer Information</h2>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700">Email</label>
                <p className="text-sm text-slate-900">{customer.email}</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700">Name</label>
                <p className="text-sm text-slate-900">{customer.name || 'Not set'}</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700">Phone</label>
                <p className="text-sm text-slate-900">{customer.phone || 'Not set'}</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700">Status</label>
                <p className="text-sm text-slate-900 capitalize">{customer.status}</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700">Subscription</label>
                <p className="text-sm text-slate-900 capitalize">
                  {customer.subscription_status || 'None'}
                </p>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700">SMS Provider</label>
                <p className="text-sm text-slate-900 capitalize">
                  {customer.sms_provider || 'None'}
                </p>
              </div>
            </div>
          </div>

          {/* Quick Stats */}
          <div className="grid grid-cols-3 gap-6">
            <div className="rounded-xl border bg-white p-6">
              <h3 className="text-sm font-medium text-slate-700">Store Connections</h3>
              <p className="text-2xl font-semibold text-slate-900 mt-2">
                {storeConnections.length}
              </p>
            </div>
            <div className="rounded-xl border bg-white p-6">
              <h3 className="text-sm font-medium text-slate-700">Active Stores</h3>
              <p className="text-2xl font-semibold text-slate-900 mt-2">
                {storeConnections.filter(sc => sc.status === 'active').length}
              </p>
            </div>
            <div className="rounded-xl border bg-white p-6">
              <h3 className="text-sm font-medium text-slate-700">Customer Since</h3>
              <p className="text-2xl font-semibold text-slate-900 mt-2">
                {new Date(customer.created_at).toLocaleDateString()}
              </p>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'stores' && (
        <div className="space-y-4">
          {storeConnections.length === 0 ? (
            <div className="rounded-xl border bg-white p-6 text-center">
              <p className="text-sm text-slate-500">No store connections configured</p>
            </div>
          ) : (
            storeConnections.map((store) => (
              <div key={store.id} className="rounded-xl border bg-white p-4">
                <div className="flex justify-between items-start">
                  <div>
                    <h3 className="font-medium text-slate-900">{store.store_name}</h3>
                    <p className="text-sm text-slate-500">{store.store_domain}</p>
                    <p className="text-xs text-slate-400 capitalize mt-1">
                      {store.platform} • {store.status}
                    </p>
                  </div>
                  <div className="text-right">
                    <span
                      className={`inline-flex items-center rounded-full px-2 py-1 text-xs font-medium ${
                        store.status === 'active'
                          ? 'bg-green-100 text-green-700'
                          : 'bg-slate-100 text-slate-700'
                      }`}
                    >
                      {store.status}
                    </span>
                    {store.last_sync_at && (
                      <p className="text-xs text-slate-400 mt-1">
                        Last sync: {new Date(store.last_sync_at).toLocaleDateString()}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {activeTab === 'email' && (
        <EmailAccountSection customerId={customer.id} />
      )}
    </div>
  );
};
