import React, { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';

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
  company_city?: string | null;
  company_postal_code?: string | null;
  company_country?: string | null;
  contact_name?: string | null;
  contact_email?: string | null;
  contact_phone?: string | null;
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
  fonecloud_number_id?: string | null;
  fonecloud_phone_number?: string | null;
  // AI configuration (joined from ai_settings)
  ai_agent_name?: string | null;
  ai_tone?: string | null;
  ai_language?: string | null;
  ai_custom_instructions?: string | null;
  ai_max_message_length?: number | null;
  ai_gemini_model?: string | null;
  ai_groq_model?: string | null;
  // Notification preferences (summary)
  notify_email_enabled?: boolean;
  notify_email_new_lead?: boolean;
  notify_email_new_message?: boolean;
  notify_email_daily_digest?: boolean;
  notify_email_weekly_report?: boolean;
  notify_sms_enabled?: boolean;
  notify_sms_phone?: string | null;
  notify_sms_new_lead?: boolean;
  notify_sms_new_message?: boolean;
  notify_digest_type?: string | null;
  notify_digest_time?: string | null;
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
  const [allocating, setAllocating] = useState(false);
  const [releasing, setReleasing] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [testNumber, setTestNumber] = useState('');
  const [testBody, setTestBody] = useState('');
  const [testing, setTesting] = useState(false);
  const [conversations, setConversations] = useState<
    Array<{
      id: number;
      lead_name: string | null;
      lead_phone: string;
      lead_email: string | null;
      status: string;
      message_count: number;
      last_message_at: string | null;
      created_at: string;
      last_message_preview: string | null;
    }>
  >([]);
  const [convLoading, setConvLoading] = useState(false);
  const [convError, setConvError] = useState<string | null>(null);
  const [aiAgentName, setAiAgentName] = useState('');
  const [aiTone, setAiTone] = useState('');
  const [aiLanguage, setAiLanguage] = useState('da');
  const [aiMaxLength, setAiMaxLength] = useState<number | ''>('');
  const [aiInstructions, setAiInstructions] = useState('');
  const [savingAi, setSavingAi] = useState(false);
  const [aiPrimaryProvider, setAiPrimaryProvider] = useState<'gemini' | 'openai' | 'groq'>('gemini');
  const [aiSecondaryProvider, setAiSecondaryProvider] = useState<'' | 'gemini' | 'openai' | 'groq'>('');
  const [aiGeminiModel, setAiGeminiModel] = useState('');
  const [aiGroqModel, setAiGroqModel] = useState('');

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
      setAiAgentName(data.customer.ai_agent_name || '');
      setAiTone(data.customer.ai_tone || '');
      setAiLanguage(data.customer.ai_language || 'da');
      setAiMaxLength(
        typeof data.customer.ai_max_message_length === 'number'
          ? data.customer.ai_max_message_length
          : ''
      );
      setAiInstructions(data.customer.ai_custom_instructions || '');
      const primary = (data as any).customer.primary_provider as 'gemini' | 'openai' | 'groq' | undefined;
      const secondary = (data as any).customer.secondary_provider as 'gemini' | 'openai' | 'groq' | undefined;
      setAiPrimaryProvider(primary === 'openai' ? 'openai' : primary === 'groq' ? 'groq' : 'gemini');
      setAiSecondaryProvider(secondary === 'gemini' || secondary === 'openai' || secondary === 'groq' ? secondary : '');
      setAiGeminiModel((data as any).customer.ai_gemini_model || '');
      setAiGroqModel((data as any).customer.ai_groq_model || '');
    } catch (err: any) {
      setError(err?.message || 'Uventet fejl');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [id]);

  const loadConversations = async () => {
    if (!id) return;
    setConvLoading(true);
    setConvError(null);
    try {
      const res = await fetch(
        `${apiBase}/api/admin/customers/${id}/conversations?limit=25&offset=0`,
        { credentials: 'include' }
      );
      if (!res.ok) throw new Error('Kunne ikke hente samtaler');
      const json = await res.json();
      setConversations(json.data || []);
    } catch (err: any) {
      setConvError(err?.message || 'Uventet fejl');
    } finally {
      setConvLoading(false);
    }
  };

  useEffect(() => {
    if (id) loadConversations();
  }, [id]);

  const handleSaveAi = async () => {
    if (!id) return;
    setSavingAi(true);
    setMessage(null);
    setError(null);
    try {
      const res = await fetch(`${apiBase}/api/admin/customers/${id}/ai`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          agent_name: aiAgentName || null,
          tone: aiTone || null,
          language: aiLanguage || null,
          custom_instructions: aiInstructions || null,
          max_message_length:
            typeof aiMaxLength === 'number' ? aiMaxLength : null,
          primary_provider: aiPrimaryProvider,
          secondary_provider: aiSecondaryProvider || null,
          gemini_model: aiGeminiModel.trim() || null,
          groq_model: aiGroqModel.trim() || null,
        }),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(payload?.error || 'Kunne ikke opdatere AI-indstillinger');
      }
      setMessage('AI-indstillinger opdateret');
      await load();
    } catch (err: any) {
      setError(err?.message || 'Uventet fejl');
    } finally {
      setSavingAi(false);
    }
  };

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

  const handleAllocateFonecloud = async () => {
    if (!id) return;
    setAllocating(true);
    setMessage(null);
    setError(null);
    try {
      const res = await fetch(`${apiBase}/api/admin/customers/${id}/allocate-fonecloud-number`, {
        method: 'POST',
        credentials: 'include',
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(payload?.error || 'Kunne ikke tildele nummer');
      }
      setMessage('Fonecloud-nummer tildelt');
      await load();
    } catch (err: any) {
      setError(err?.message || 'Uventet fejl');
    } finally {
      setAllocating(false);
    }
  };

  const handleReleaseFonecloud = async () => {
    if (!id || !data?.customer.fonecloud_number_id) return;
    setReleasing(true);
    setMessage(null);
    setError(null);
    try {
      const res = await fetch(
        `${apiBase}/api/admin/fonecloud-numbers/${data.customer.fonecloud_number_id}/release`,
        { method: 'PATCH', credentials: 'include' }
      );
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(payload?.error || 'Kunne ikke frigive nummer');
      }
      setMessage('Fonecloud-nummer frigivet');
      await load();
    } catch (err: any) {
      setError(err?.message || 'Uventet fejl');
    } finally {
      setReleasing(false);
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
                <p className="text-xs text-slate-600 mb-1">Aktivt SMS-nummer (Twilio)</p>
                <p className="text-xs font-mono text-slate-800">
                  {customer.twilio_phone_number}
                </p>
              </div>
            )}
            {provider === 'fonecloud' && customer.fonecloud_phone_number && (
              <div>
                <p className="text-xs text-slate-600 mb-1">Fonecloud-nummer</p>
                <p className="text-xs font-mono text-slate-800">
                  {customer.fonecloud_phone_number}
                </p>
                <button
                  type="button"
                  onClick={handleReleaseFonecloud}
                  disabled={releasing}
                  className="mt-1 rounded-md border border-slate-200 px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                >
                  {releasing ? 'Frigiver…' : 'Frigiv nummer'}
                </button>
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
              <>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Fonecloud sender ID (fallback)
                  </label>
                  <input
                    type="text"
                    value={fonecloudId}
                    onChange={(e) => setFonecloudId(e.target.value)}
                    className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-slate-900 focus:border-slate-900"
                    placeholder="fx. FC-1234"
                  />
                </div>
                {!customer.fonecloud_phone_number && (
                  <button
                    type="button"
                    onClick={handleAllocateFonecloud}
                    disabled={allocating}
                    className="w-full rounded-md border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60"
                  >
                    {allocating ? 'Tildeler…' : 'Tildel nummer fra pulje'}
                  </button>
                )}
              </>
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
          {(customer.company_postal_code || customer.company_city || customer.company_country) && (
            <p className="text-xs text-slate-600">
              By / postnr / land:{' '}
              <span className="font-medium text-slate-900">
                {[customer.company_postal_code, customer.company_city, customer.company_country]
                  .filter(Boolean)
                  .join(' ')}
              </span>
            </p>
          )}
          {(customer.contact_name || customer.contact_email || customer.contact_phone) && (
            <div className="mt-2 space-y-1">
              <p className="text-xs font-medium text-slate-700">Kontaktperson</p>
              {customer.contact_name && (
                <p className="text-xs text-slate-600">
                  Navn:{' '}
                  <span className="font-medium text-slate-900">
                    {customer.contact_name}
                  </span>
                </p>
              )}
              {customer.contact_email && (
                <p className="text-xs text-slate-600">
                  E-mail:{' '}
                  <span className="font-medium text-slate-900">
                    {customer.contact_email}
                  </span>
                </p>
              )}
              {customer.contact_phone && (
                <p className="text-xs text-slate-600">
                  Telefon:{' '}
                  <span className="font-medium text-slate-900">
                    {customer.contact_phone}
                  </span>
                </p>
              )}
            </div>
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

        <div className="rounded-xl border bg-white p-4 space-y-4">
          <div className="flex items-center justify-between gap-2">
            <div>
              <h2 className="text-sm font-semibold text-slate-900">AI-konfiguration</h2>
              <p className="text-xs text-slate-600">
                Justér agentnavn, tone og instruktioner for denne kundes AI-receptionist.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Agentnavn
              </label>
              <input
                type="text"
                value={aiAgentName}
                onChange={(e) => setAiAgentName(e.target.value)}
                className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-slate-900 focus:border-slate-900"
                placeholder="Fx Maja, Anna eller Replypilot"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Tone
              </label>
              <select
                value={aiTone}
                onChange={(e) => setAiTone(e.target.value)}
                className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-slate-900 focus:border-slate-900"
              >
                <option value="">Standard</option>
                <option value="professionel">Professionel</option>
                <option value="venlig">Venlig</option>
                <option value="uformel">Uformel</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Sprog
              </label>
              <select
                value={aiLanguage}
                onChange={(e) => setAiLanguage(e.target.value)}
                className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-slate-900 focus:border-slate-900"
              >
                <option value="da">Dansk</option>
                <option value="en">Engelsk</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Maks. beskedlængde (tegn)
              </label>
              <input
                type="number"
                min={50}
                max={500}
                value={aiMaxLength}
                onChange={(e) =>
                  setAiMaxLength(
                    e.target.value ? Math.min(500, Math.max(50, Number(e.target.value))) : ''
                  )
                }
                className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-slate-900 focus:border-slate-900"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Primær AI-udbyder
              </label>
              <select
                value={aiPrimaryProvider}
                onChange={(e) => {
                  const v = e.target.value as 'gemini' | 'openai' | 'groq';
                  setAiPrimaryProvider(v === 'openai' ? 'openai' : v === 'groq' ? 'groq' : 'gemini');
                }}
                className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-slate-900 focus:border-slate-900"
              >
                <option value="gemini">Gemini</option>
                <option value="openai">OpenAI</option>
                <option value="groq">Groq (free tier)</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Sekundær (fallback)
              </label>
              <select
                value={aiSecondaryProvider}
                onChange={(e) => {
                  const v = e.target.value as '' | 'gemini' | 'openai' | 'groq';
                  setAiSecondaryProvider(v);
                }}
                className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-slate-900 focus:border-slate-900"
              >
                <option value="">Ingen</option>
                <option value="gemini">Gemini</option>
                <option value="openai">OpenAI</option>
                <option value="groq">Groq (free tier)</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Gemini-model (override)
              </label>
              <input
                type="text"
                value={aiGeminiModel}
                onChange={(e) => setAiGeminiModel(e.target.value)}
                className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-slate-900 focus:border-slate-900"
                placeholder="Tom = systemstandard"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Groq-model (override)
              </label>
              <input
                type="text"
                value={aiGroqModel}
                onChange={(e) => setAiGroqModel(e.target.value)}
                className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-slate-900 focus:border-slate-900"
                placeholder="Tom = systemstandard"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">
              Specialinstruktioner til AI'en
            </label>
            <textarea
              value={aiInstructions}
              onChange={(e) => setAiInstructions(e.target.value)}
              className="w-full min-h-[90px] rounded-md border border-slate-300 px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-slate-900 focus:border-slate-900 resize-y"
              placeholder="Beskriv kort hvad kunden laver, tone of voice, og hvad AI'en altid skal spørge om."
            />
          </div>

          <div className="flex justify-end">
            <button
              type="button"
              onClick={handleSaveAi}
              disabled={savingAi}
              className="inline-flex items-center rounded-md bg-slate-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-800 disabled:opacity-60"
            >
              {savingAi ? 'Gemmer…' : 'Gem AI-indstillinger'}
            </button>
          </div>
        </div>
      </div>

      <div className="rounded-xl border bg-white p-4 space-y-2">
        <h2 className="text-sm font-semibold text-slate-900">Notifikationer</h2>
        <p className="text-xs text-slate-600 mb-1">E-mail</p>
        <p className="text-xs text-slate-700">
          {customer.notify_email_enabled ? 'Aktiveret' : 'Deaktiveret'}
          {customer.notify_email_enabled && (
            <>
              {' · '}
              {[
                customer.notify_email_new_lead && 'nye leads',
                customer.notify_email_new_message && 'nye beskeder',
                customer.notify_email_daily_digest && 'daglig oversigt',
                customer.notify_email_weekly_report && 'ugentlig rapport',
              ]
                .filter(Boolean)
                .join(', ')}
            </>
          )}
        </p>
        <p className="text-xs text-slate-600 mt-2 mb-1">SMS</p>
        <p className="text-xs text-slate-700">
          {customer.notify_sms_enabled ? 'Aktiveret' : 'Deaktiveret'}
          {customer.notify_sms_enabled && customer.notify_sms_phone && (
            <> · {customer.notify_sms_phone}</>
          )}
          {customer.notify_sms_enabled && (
            <>
              {' · '}
              {[
                customer.notify_sms_new_lead && 'nye leads',
                customer.notify_sms_new_message && 'nye beskeder',
              ]
                .filter(Boolean)
                .join(', ')}
            </>
          )}
        </p>
        {customer.notify_digest_type && (
          <p className="text-xs text-slate-600 mt-2">
            Samlerapport:{' '}
            <span className="font-medium text-slate-900">
              {customer.notify_digest_type} kl. {customer.notify_digest_time || '09:00'}
            </span>
          </p>
        )}
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

      <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-3">
        <h2 className="text-sm font-semibold text-slate-900">Beskedoversigt</h2>
        <p className="text-xs text-slate-600">
          Samtaler med leads som AI-agenten har håndteret for denne kunde. Klik for at se hele tråden.
        </p>
        {convLoading && (
          <p className="text-xs text-slate-500 py-4">Indlæser samtaler…</p>
        )}
        {convError && (
          <p className="text-xs text-red-600 bg-red-50 rounded-md px-2 py-1.5">
            {convError}
          </p>
        )}
        {!convLoading && !convError && conversations.length === 0 && (
          <p className="text-xs text-slate-500 py-4">Ingen samtaler endnu.</p>
        )}
        {!convLoading && conversations.length > 0 && (
          <div className="overflow-x-auto rounded-lg border border-slate-200">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50 text-left text-xs font-semibold text-slate-500">
                <tr>
                  <th className="px-3 py-2">Lead</th>
                  <th className="px-3 py-2">Status</th>
                  <th className="px-3 py-2">Sidste besked</th>
                  <th className="px-3 py-2">Oprettet</th>
                  <th className="px-3 py-2 text-right">Handling</th>
                </tr>
              </thead>
              <tbody>
                {conversations.map((conv) => (
                  <tr
                    key={conv.id}
                    className="border-t border-slate-100 bg-white hover:bg-slate-50/80"
                  >
                    <td className="px-3 py-2">
                      <div className="font-medium text-slate-900">
                        {conv.lead_name || conv.lead_phone}
                      </div>
                      {conv.lead_name && (
                        <div className="text-[11px] text-slate-500">{conv.lead_phone}</div>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      <span className="inline-flex items-center rounded-full border border-slate-200 px-2 py-0.5 text-[11px] font-medium text-slate-700">
                        {conv.status}
                      </span>
                    </td>
                    <td className="px-3 py-2 max-w-[200px]">
                      <span className="line-clamp-2 text-xs text-slate-600">
                        {conv.last_message_preview || '—'}
                      </span>
                      {conv.last_message_at && (
                        <div className="text-[11px] text-slate-400 mt-0.5">
                          {new Date(conv.last_message_at).toLocaleString('da-DK')}
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-2 text-xs text-slate-500">
                      {new Date(conv.created_at).toLocaleDateString('da-DK')}
                    </td>
                    <td className="px-3 py-2 text-right">
                      <Link
                        to={`/customers/${id}/conversations/${conv.id}`}
                        className="inline-flex items-center rounded-md border border-slate-200 bg-white px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50"
                      >
                        Se samtale
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
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

