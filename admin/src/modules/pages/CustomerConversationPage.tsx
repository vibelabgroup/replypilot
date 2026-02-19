import React, { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';

type Conversation = {
  id: number;
  customer_id: number;
  lead_name: string | null;
  lead_phone: string;
  lead_email: string | null;
  status: string;
  message_count: number;
  ai_response_count: number;
  last_message_at: string | null;
  created_at: string;
  ai_agent_name?: string | null;
};

type Message = {
  id: number;
  conversation_id: number;
  direction: string;
  sender: string;
  content: string;
  created_at: string;
};

type ConversationResponse = {
  conversation: Conversation;
  messages: Message[];
};

export const CustomerConversationPage: React.FC = () => {
  const { id, conversationId } = useParams();
  const [data, setData] = useState<ConversationResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const apiBase =
    import.meta.env.VITE_ADMIN_API_BASE_URL || 'https://admin-api.replypilot.dk';

  useEffect(() => {
    if (!id || !conversationId) return;
    setLoading(true);
    setError(null);
    fetch(
      `${apiBase}/api/admin/customers/${id}/conversations/${conversationId}`,
      { credentials: 'include' }
    )
      .then((res) => {
        if (!res.ok) throw new Error('Kunne ikke hente samtale');
        return res.json();
      })
      .then(setData)
      .catch((err: any) => setError(err?.message || 'Uventet fejl'))
      .finally(() => setLoading(false));
  }, [id, conversationId, apiBase]);

  if (loading) {
    return (
      <div className="p-4">
        <p className="text-sm text-slate-500">Indlæser samtale…</p>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="p-4">
        <p className="text-sm text-red-600 bg-red-50 rounded-md px-2 py-1.5 inline-block">
          {error || 'Kunne ikke hente samtale'}
        </p>
        <div className="mt-3">
          <Link
            to={`/customers/${id}`}
            className="text-sm font-medium text-slate-900 hover:underline"
          >
            ← Tilbage til kunde
          </Link>
        </div>
      </div>
    );
  }

  const { conversation, messages } = data;
  const isInbound = (m: Message) => m.direction === 'inbound' || m.sender === 'lead';

  const hasMissedCallActivity = messages.some((m) =>
    m.content.startsWith(
      'En potentiel kunde har lige ringet til virksomheden, men opkaldet kunne ikke besvares.'
    )
  );

  const visibleMessages = messages.filter(
    (m) =>
      !m.content.startsWith(
        'En potentiel kunde har lige ringet til virksomheden, men opkaldet kunne ikke besvares.'
      )
  );

  const getSenderLabel = (m: Message) => {
    if (m.sender === 'ai') {
      return conversation.ai_agent_name || 'AI';
    }
    if (m.sender === 'lead') {
      return conversation.lead_name || conversation.lead_phone;
    }
    return m.sender;
  };

  return (
    <div className="p-4 space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Link
          to={`/customers/${id}`}
          className="text-sm font-medium text-slate-600 hover:text-slate-900"
        >
          ← Tilbage til kunde
        </Link>
        <span className="text-slate-300">|</span>
        <h1 className="text-lg font-semibold text-slate-900">
          Samtale med {conversation.lead_name || conversation.lead_phone}
        </h1>
        <span className="inline-flex items-center rounded-full border border-slate-200 px-2 py-0.5 text-xs font-medium text-slate-700">
          {conversation.status}
        </span>
      </div>

      <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-3 text-sm">
        <div className="grid gap-1 text-slate-600">
          <span>Lead: {conversation.lead_name || '—'}</span>
          <span>Telefon: {conversation.lead_phone}</span>
          {conversation.lead_email && (
            <span>E-mail: {conversation.lead_email}</span>
          )}
          <span>
            Oprettet: {new Date(conversation.created_at).toLocaleString('da-DK')} ·{' '}
            {conversation.message_count} besked(er)
          </span>
        </div>
      </div>

      <div className="space-y-2">
        <h2 className="text-sm font-semibold text-slate-900">Beskedtråd</h2>
        {hasMissedCallActivity && (
          <div className="mb-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
            Mistet opkald fra {conversation.lead_name || conversation.lead_phone}. AI'en har
            efterfølgende sendt en SMS til leadet.
          </div>
        )}
        {visibleMessages.length === 0 ? (
          <p className="text-sm text-slate-500 py-4">Ingen beskeder i denne samtale.</p>
        ) : (
          <ul className="space-y-3">
            {visibleMessages.map((m) => (
              <li
                key={m.id}
                className={`rounded-lg border px-3 py-2 max-w-[85%] ${
                  isInbound(m)
                    ? 'border-slate-200 bg-white ml-0 mr-auto'
                    : 'border-slate-200 bg-slate-100 ml-auto mr-0'
                }`}
              >
                <div className="flex items-center gap-2 text-xs text-slate-500 mb-1">
                  <span className="font-medium">{getSenderLabel(m)}</span>
                  <span>{new Date(m.created_at).toLocaleString('da-DK')}</span>
                </div>
                <div className="text-sm text-slate-800 whitespace-pre-wrap break-words">
                  {m.content}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
};
