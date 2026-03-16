import React, { useState, useEffect, useCallback } from 'react';
import { Mail, Send, Eye, Edit3, CheckCircle, XCircle, RefreshCw, ChevronLeft, Clock, Inbox, FileText } from 'lucide-react';

interface EmailInboxProps {
  apiBase: string;
}

type EmailTab = 'conversations' | 'drafts';

interface EmailConversation {
  id: string;
  email_subject: string;
  lead_name: string;
  lead_email: string;
  status: string;
  message_count: number;
  ai_response_count: number;
  last_message_at: string;
  created_at: string;
  account_email: string;
  account_name: string;
}

interface EmailDraft {
  id: string;
  subject: string;
  to_addresses: string[];
  body_plain: string;
  body_html: string;
  status: string;
  ai_model: string;
  sent_at: string | null;
  created_at: string;
  account_email: string;
  account_name: string;
  original_from: string;
  original_subject: string;
  original_snippet: string;
  original_body: string;
  conversation_id: string;
}

interface ConversationMessage {
  id: string;
  direction: string;
  sender: string;
  content: string;
  channel: string;
  created_at: string;
  from_address: string;
  to_addresses: string[];
  subject: string;
  snippet: string;
}

interface EmailStats {
  active_accounts: number;
  open_conversations: number;
  pending_drafts: number;
  sent_drafts: number;
}

const formatDate = (iso: string) => {
  if (!iso) return '';
  const d = new Date(iso);
  const now = new Date();
  const diff = now.getTime() - d.getTime();
  if (diff < 60_000) return 'Lige nu';
  if (diff < 3600_000) return `${Math.floor(diff / 60_000)} min siden`;
  if (diff < 86400_000) return `${Math.floor(diff / 3600_000)}t siden`;
  return d.toLocaleDateString('da-DK', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
};

export const EmailInbox: React.FC<EmailInboxProps> = ({ apiBase }) => {
  const [tab, setTab] = useState<EmailTab>('conversations');
  const [conversations, setConversations] = useState<EmailConversation[]>([]);
  const [drafts, setDrafts] = useState<EmailDraft[]>([]);
  const [stats, setStats] = useState<EmailStats | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Detail views
  const [selectedConversation, setSelectedConversation] = useState<EmailConversation | null>(null);
  const [conversationMessages, setConversationMessages] = useState<ConversationMessage[]>([]);
  const [selectedDraft, setSelectedDraft] = useState<EmailDraft | null>(null);
  const [editingBody, setEditingBody] = useState('');
  const [actionLoading, setActionLoading] = useState(false);
  const [actionMessage, setActionMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const tenantToken = (() => {
    try {
      return localStorage.getItem('tenantToken') || '';
    } catch { return ''; }
  })();

  const authHeaders = useCallback((): Record<string, string> => {
    const h: Record<string, string> = { 'Content-Type': 'application/json' };
    if (tenantToken) h['Authorization'] = `Bearer ${tenantToken}`;
    return h;
  }, [tenantToken]);

  const fetchStats = useCallback(async () => {
    try {
      const res = await fetch(`${apiBase}/api/tenant/email/stats`, {
        credentials: 'include',
        headers: authHeaders(),
      });
      if (res.ok) {
        const data = await res.json();
        setStats(data.data);
      }
    } catch { /* ignore */ }
  }, [apiBase, authHeaders]);

  const fetchConversations = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${apiBase}/api/tenant/email/conversations?limit=50`, {
        credentials: 'include',
        headers: authHeaders(),
      });
      if (!res.ok) throw new Error('Kunne ikke hente email-samtaler');
      const data = await res.json();
      setConversations(data.data || []);
    } catch (err: any) {
      setError(err?.message || 'Fejl');
    } finally {
      setLoading(false);
    }
  }, [apiBase, authHeaders]);

  const fetchDrafts = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${apiBase}/api/tenant/email/drafts?limit=50`, {
        credentials: 'include',
        headers: authHeaders(),
      });
      if (!res.ok) throw new Error('Kunne ikke hente email-kladder');
      const data = await res.json();
      setDrafts(data.data || []);
    } catch (err: any) {
      setError(err?.message || 'Fejl');
    } finally {
      setLoading(false);
    }
  }, [apiBase, authHeaders]);

  const fetchConversationMessages = async (conversationId: string) => {
    try {
      const res = await fetch(`${apiBase}/api/tenant/email/conversations/${conversationId}/messages`, {
        credentials: 'include',
        headers: authHeaders(),
      });
      if (res.ok) {
        const data = await res.json();
        setConversationMessages(data.data || []);
      }
    } catch { /* ignore */ }
  };

  const fetchDraftDetail = async (draftId: string) => {
    try {
      const res = await fetch(`${apiBase}/api/tenant/email/drafts/${draftId}`, {
        credentials: 'include',
        headers: authHeaders(),
      });
      if (res.ok) {
        const data = await res.json();
        setSelectedDraft(data.data);
        setEditingBody(data.data.body_plain || '');
      }
    } catch { /* ignore */ }
  };

  useEffect(() => {
    fetchStats();
    if (tab === 'conversations') fetchConversations();
    if (tab === 'drafts') fetchDrafts();
  }, [tab, fetchStats, fetchConversations, fetchDrafts]);

  // Auto-refresh every 30s
  useEffect(() => {
    const interval = setInterval(() => {
      fetchStats();
      if (tab === 'conversations') fetchConversations();
      if (tab === 'drafts') fetchDrafts();
    }, 30_000);
    return () => clearInterval(interval);
  }, [tab, fetchStats, fetchConversations, fetchDrafts]);

  const handleSendDraft = async (draftId: string) => {
    setActionLoading(true);
    setActionMessage(null);
    try {
      const res = await fetch(`${apiBase}/api/tenant/email/drafts/${draftId}/send`, {
        method: 'POST',
        credentials: 'include',
        headers: authHeaders(),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Kunne ikke sende');
      }
      setActionMessage({ type: 'success', text: 'Email sendt!' });
      setSelectedDraft(null);
      fetchDrafts();
      fetchStats();
    } catch (err: any) {
      setActionMessage({ type: 'error', text: err?.message || 'Fejl ved afsendelse' });
    } finally {
      setActionLoading(false);
    }
  };

  const handleUpdateDraft = async (draftId: string, updates: Record<string, any>) => {
    setActionLoading(true);
    setActionMessage(null);
    try {
      const res = await fetch(`${apiBase}/api/tenant/email/drafts/${draftId}`, {
        method: 'PATCH',
        credentials: 'include',
        headers: authHeaders(),
        body: JSON.stringify(updates),
      });
      if (!res.ok) throw new Error('Kunne ikke opdatere kladde');
      const data = await res.json();
      setSelectedDraft(data.data);
      setEditingBody(data.data.body_plain || '');
      setActionMessage({ type: 'success', text: 'Kladde opdateret' });
      fetchDrafts();
    } catch (err: any) {
      setActionMessage({ type: 'error', text: err?.message || 'Fejl' });
    } finally {
      setActionLoading(false);
    }
  };

  const handleDiscardDraft = async (draftId: string) => {
    if (!confirm('Er du sikker på du vil kassere denne kladde?')) return;
    await handleUpdateDraft(draftId, { status: 'discarded' });
    setSelectedDraft(null);
    fetchDrafts();
  };

  const handlePushDraft = async (draftId: string) => {
    setActionLoading(true);
    setActionMessage(null);
    try {
      const res = await fetch(`${apiBase}/api/tenant/email/drafts/${draftId}/push`, {
        method: 'POST',
        credentials: 'include',
        headers: authHeaders(),
      });
      if (!res.ok) throw new Error('Kunne ikke gemme kladde i din indbakke');
      setActionMessage({ type: 'success', text: 'Kladde gemt i din email-indbakke!' });
    } catch (err: any) {
      setActionMessage({ type: 'error', text: err?.message || 'Fejl' });
    } finally {
      setActionLoading(false);
    }
  };

  // --- Render helpers ---

  const renderStats = () => {
    if (!stats) return null;
    return (
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        {[
          { label: 'Aktive konti', value: stats.active_accounts, icon: Mail },
          { label: 'Åbne samtaler', value: stats.open_conversations, icon: Inbox },
          { label: 'Ventende kladder', value: stats.pending_drafts, icon: FileText },
          { label: 'Sendte svar', value: stats.sent_drafts, icon: Send },
        ].map((s) => (
          <div key={s.label} className="bg-white rounded-xl border border-gray-200 p-4 flex items-center gap-3">
            <div className="bg-blue-50 p-2 rounded-lg">
              <s.icon className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <div className="text-2xl font-bold text-gray-900">{s.value}</div>
              <div className="text-xs text-gray-500">{s.label}</div>
            </div>
          </div>
        ))}
      </div>
    );
  };

  const renderConversationList = () => (
    <div className="space-y-2">
      {conversations.length === 0 && !loading && (
        <div className="text-center py-12 text-gray-500">
          <Mail className="w-12 h-12 mx-auto mb-3 text-gray-300" />
          <p className="text-lg font-medium">Ingen email-samtaler endnu</p>
          <p className="text-sm mt-1">Tilslut en Gmail eller Outlook konto under Indstillinger for at komme i gang.</p>
        </div>
      )}
      {conversations.map((c) => (
        <button
          key={c.id}
          onClick={() => { setSelectedConversation(c); fetchConversationMessages(c.id); }}
          className="w-full text-left bg-white rounded-xl border border-gray-200 p-4 hover:border-blue-300 hover:shadow-sm transition-all"
        >
          <div className="flex items-start justify-between">
            <div className="min-w-0 flex-1">
              <div className="font-semibold text-gray-900 truncate">{c.email_subject || '(intet emne)'}</div>
              <div className="text-sm text-gray-600 truncate">{c.lead_email || c.lead_name}</div>
              <div className="flex items-center gap-2 mt-1">
                <span className="text-xs text-gray-400">{c.account_email}</span>
                <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">{c.message_count} beskeder</span>
                {c.ai_response_count > 0 && (
                  <span className="text-xs bg-blue-50 text-blue-600 px-2 py-0.5 rounded-full">{c.ai_response_count} AI-svar</span>
                )}
              </div>
            </div>
            <div className="text-xs text-gray-400 whitespace-nowrap ml-3">
              {formatDate(c.last_message_at || c.created_at)}
            </div>
          </div>
        </button>
      ))}
    </div>
  );

  const renderConversationDetail = () => {
    if (!selectedConversation) return null;
    return (
      <div>
        <button
          onClick={() => { setSelectedConversation(null); setConversationMessages([]); }}
          className="flex items-center gap-1 text-sm text-blue-600 hover:text-blue-800 mb-4"
        >
          <ChevronLeft className="w-4 h-4" /> Tilbage til samtaler
        </button>
        <div className="bg-white rounded-xl border border-gray-200 p-5 mb-4">
          <h3 className="text-lg font-bold text-gray-900">{selectedConversation.email_subject || '(intet emne)'}</h3>
          <p className="text-sm text-gray-500">Fra: {selectedConversation.lead_email} &middot; Konto: {selectedConversation.account_email}</p>
        </div>
        <div className="space-y-3">
          {conversationMessages.map((m) => (
            <div
              key={m.id}
              className={`rounded-xl p-4 ${
                m.direction === 'inbound'
                  ? 'bg-gray-50 border border-gray-200'
                  : 'bg-blue-50 border border-blue-200'
              }`}
            >
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-medium text-gray-600">
                  {m.direction === 'inbound' ? (m.from_address || 'Kunde') : 'AI-svar'}
                </span>
                <span className="text-xs text-gray-400">{formatDate(m.created_at)}</span>
              </div>
              <div className="text-sm text-gray-800 whitespace-pre-wrap">{m.content}</div>
            </div>
          ))}
          {conversationMessages.length === 0 && (
            <div className="text-center py-6 text-gray-400 text-sm">Ingen beskeder fundet</div>
          )}
        </div>
      </div>
    );
  };

  const renderDraftList = () => (
    <div className="space-y-2">
      {drafts.length === 0 && !loading && (
        <div className="text-center py-12 text-gray-500">
          <FileText className="w-12 h-12 mx-auto mb-3 text-gray-300" />
          <p className="text-lg font-medium">Ingen kladder endnu</p>
          <p className="text-sm mt-1">AI-genererede svar vil dukke op her når der modtages nye emails.</p>
        </div>
      )}
      {drafts.map((d) => (
        <button
          key={d.id}
          onClick={() => fetchDraftDetail(d.id)}
          className="w-full text-left bg-white rounded-xl border border-gray-200 p-4 hover:border-blue-300 hover:shadow-sm transition-all"
        >
          <div className="flex items-start justify-between">
            <div className="min-w-0 flex-1">
              <div className="font-semibold text-gray-900 truncate">{d.subject || '(intet emne)'}</div>
              <div className="text-sm text-gray-600 truncate">
                Til: {(d.to_addresses || []).join(', ')}
              </div>
              <div className="flex items-center gap-2 mt-1">
                <span className={`text-xs px-2 py-0.5 rounded-full ${
                  d.status === 'draft' ? 'bg-yellow-50 text-yellow-700' :
                  d.status === 'sent' ? 'bg-green-50 text-green-700' :
                  d.status === 'approved' ? 'bg-blue-50 text-blue-700' :
                  'bg-gray-100 text-gray-600'
                }`}>
                  {d.status === 'draft' ? 'Kladde' : d.status === 'sent' ? 'Sendt' : d.status === 'approved' ? 'Godkendt' : d.status}
                </span>
                {d.ai_model && <span className="text-xs text-gray-400">{d.ai_model}</span>}
              </div>
            </div>
            <div className="text-xs text-gray-400 whitespace-nowrap ml-3">
              {formatDate(d.sent_at || d.created_at)}
            </div>
          </div>
        </button>
      ))}
    </div>
  );

  const renderDraftDetail = () => {
    if (!selectedDraft) return null;
    const isDraft = selectedDraft.status === 'draft';
    return (
      <div>
        <button
          onClick={() => { setSelectedDraft(null); setActionMessage(null); }}
          className="flex items-center gap-1 text-sm text-blue-600 hover:text-blue-800 mb-4"
        >
          <ChevronLeft className="w-4 h-4" /> Tilbage til kladder
        </button>

        {actionMessage && (
          <div className={`mb-4 p-3 rounded-lg text-sm ${
            actionMessage.type === 'success' ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-red-50 text-red-700 border border-red-200'
          }`}>
            {actionMessage.text}
          </div>
        )}

        {/* Original email context */}
        {selectedDraft.original_from && (
          <div className="bg-gray-50 rounded-xl border border-gray-200 p-4 mb-4">
            <div className="text-xs font-medium text-gray-500 mb-1">Original email</div>
            <div className="text-sm font-semibold text-gray-800">{selectedDraft.original_subject}</div>
            <div className="text-sm text-gray-600">Fra: {selectedDraft.original_from}</div>
            {selectedDraft.original_body && (
              <div className="mt-2 text-sm text-gray-700 whitespace-pre-wrap max-h-40 overflow-y-auto border-t border-gray-200 pt-2">
                {selectedDraft.original_body.slice(0, 1000)}
              </div>
            )}
          </div>
        )}

        {/* Draft content */}
        <div className="bg-white rounded-xl border border-gray-200 p-5 mb-4">
          <div className="flex items-center justify-between mb-3">
            <div>
              <div className="font-semibold text-gray-900">{selectedDraft.subject}</div>
              <div className="text-sm text-gray-500">Til: {(selectedDraft.to_addresses || []).join(', ')}</div>
              <div className="text-sm text-gray-400">Fra: {selectedDraft.account_email}</div>
            </div>
            <span className={`text-xs px-2 py-1 rounded-full ${
              isDraft ? 'bg-yellow-50 text-yellow-700' :
              selectedDraft.status === 'sent' ? 'bg-green-50 text-green-700' :
              'bg-gray-100 text-gray-600'
            }`}>
              {isDraft ? 'Kladde' : selectedDraft.status === 'sent' ? 'Sendt' : selectedDraft.status}
            </span>
          </div>

          {isDraft ? (
            <textarea
              value={editingBody}
              onChange={(e) => setEditingBody(e.target.value)}
              className="w-full min-h-[200px] border border-gray-300 rounded-lg p-3 text-sm text-gray-800 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 resize-y"
            />
          ) : (
            <div className="text-sm text-gray-800 whitespace-pre-wrap bg-gray-50 rounded-lg p-4">
              {selectedDraft.body_plain}
            </div>
          )}
        </div>

        {/* Actions */}
        {isDraft && (
          <div className="flex flex-wrap gap-3">
            <button
              onClick={() => handleUpdateDraft(selectedDraft.id, { bodyPlain: editingBody })}
              disabled={actionLoading}
              className="flex items-center gap-2 px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
            >
              <Edit3 className="w-4 h-4" /> Gem ændringer
            </button>
            <button
              onClick={() => handleSendDraft(selectedDraft.id)}
              disabled={actionLoading}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
            >
              <Send className="w-4 h-4" /> Send email
            </button>
            <button
              onClick={() => handlePushDraft(selectedDraft.id)}
              disabled={actionLoading}
              className="flex items-center gap-2 px-4 py-2 bg-indigo-100 hover:bg-indigo-200 text-indigo-700 rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
            >
              <Inbox className="w-4 h-4" /> Gem i indbakke
            </button>
            <button
              onClick={() => handleDiscardDraft(selectedDraft.id)}
              disabled={actionLoading}
              className="flex items-center gap-2 px-4 py-2 bg-red-50 hover:bg-red-100 text-red-600 rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
            >
              <XCircle className="w-4 h-4" /> Kassér
            </button>
          </div>
        )}
      </div>
    );
  };

  return (
    <div>
      {renderStats()}

      {/* Tabs */}
      <div className="flex gap-1 mb-6 bg-gray-100 rounded-xl p-1">
        <button
          onClick={() => { setTab('conversations'); setSelectedConversation(null); setSelectedDraft(null); }}
          className={`flex-1 flex items-center justify-center gap-2 py-2.5 px-4 rounded-lg text-sm font-medium transition-colors ${
            tab === 'conversations' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-600 hover:text-gray-800'
          }`}
        >
          <Inbox className="w-4 h-4" />
          Samtaler
          {stats && stats.open_conversations > 0 && (
            <span className="bg-blue-100 text-blue-700 text-xs px-1.5 py-0.5 rounded-full">{stats.open_conversations}</span>
          )}
        </button>
        <button
          onClick={() => { setTab('drafts'); setSelectedConversation(null); setSelectedDraft(null); }}
          className={`flex-1 flex items-center justify-center gap-2 py-2.5 px-4 rounded-lg text-sm font-medium transition-colors ${
            tab === 'drafts' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-600 hover:text-gray-800'
          }`}
        >
          <FileText className="w-4 h-4" />
          AI-kladder
          {stats && stats.pending_drafts > 0 && (
            <span className="bg-yellow-100 text-yellow-700 text-xs px-1.5 py-0.5 rounded-full">{stats.pending_drafts}</span>
          )}
        </button>
      </div>

      {/* Refresh */}
      <div className="flex justify-end mb-3">
        <button
          onClick={() => { fetchStats(); tab === 'conversations' ? fetchConversations() : fetchDrafts(); }}
          className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700"
        >
          <RefreshCw className={`w-3 h-3 ${loading ? 'animate-spin' : ''}`} /> Opdater
        </button>
      </div>

      {error && (
        <div className="mb-4 p-3 rounded-lg bg-red-50 text-red-700 border border-red-200 text-sm">{error}</div>
      )}

      {loading && !conversations.length && !drafts.length && (
        <div className="text-center py-12 text-gray-400">
          <RefreshCw className="w-8 h-8 mx-auto animate-spin mb-2" />
          <p>Indlæser...</p>
        </div>
      )}

      {/* Content */}
      {tab === 'conversations' && (selectedConversation ? renderConversationDetail() : renderConversationList())}
      {tab === 'drafts' && (selectedDraft ? renderDraftDetail() : renderDraftList())}
    </div>
  );
};
