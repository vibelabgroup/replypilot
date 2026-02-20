import React, { useState, useEffect } from 'react';
import { Phone, Clock, TrendingUp, Settings, LogOut, MessageSquare, User, Calendar, Mail, MapPin, X, ChevronRight as ChevronRightIcon } from 'lucide-react';
import { trackEvent } from '../services/telemetry';

interface DashboardProps {
    onLogout: () => void;
    initialLeadId?: number | null;
    hasActiveSubscription: boolean;
    onStartCheckout: (acceptedTerms: boolean, acceptedDpa: boolean) => Promise<void>;
    onRefreshEntitlement: () => Promise<'unknown' | 'unpaid' | 'paid'>;
}

export const Dashboard: React.FC<DashboardProps> = ({
    onLogout,
    initialLeadId = null,
    hasActiveSubscription,
    onStartCheckout,
    onRefreshEntitlement,
}) => {
    const [selectedLead, setSelectedLead] = useState<any>(null);
    const [leadTimeline, setLeadTimeline] = useState<any[]>([]);
    const [leads, setLeads] = useState<any[]>([]);
    const [notificationSettings, setNotificationSettings] = useState<any | null>(null);
    const [notificationHistory, setNotificationHistory] = useState<any[]>([]);
    const [companySettings, setCompanySettings] = useState<any | null>(null);
    const [aiSettings, setAiSettings] = useState<any | null>(null);
    const [smsSettings, setSmsSettings] = useState<any | null>(null);
    const [activeTab, setActiveTab] = useState<'overview' | 'customers' | 'settings'>('overview');
    const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);
    const [smsProvider, setSmsProvider] = useState<'twilio' | 'fonecloud'>('twilio');
    const [fonecloudSenderId, setFonecloudSenderId] = useState('');
    const [acceptedTerms, setAcceptedTerms] = useState(false);
    const [acceptedDpa, setAcceptedDpa] = useState(false);
    const [checkoutLoading, setCheckoutLoading] = useState(false);
    const [checkoutError, setCheckoutError] = useState<string | null>(null);
    const [refreshingEntitlement, setRefreshingEntitlement] = useState(false);
    const isLocked = !hasActiveSubscription;

    useEffect(() => {
        if (isLocked) {
            trackEvent('dashboard_unpaid_viewed');
        } else {
            trackEvent('dashboard_unlocked');
        }
    }, [isLocked]);

    useEffect(() => {
        const fetchSettings = async () => {
            try {
                const apiBase =
                    import.meta.env.VITE_API_BASE_URL || window.location.origin.replace(/\/$/, "");
                const res = await fetch(`${apiBase}/api/settings`, {
                    credentials: 'include',
                });
                if (res.ok) {
                    const data = await res.json();
                    setCompanySettings(data.company);
                    setAiSettings(data.ai);
                    setSmsSettings(data.sms);
                    if (data.sms) {
                        setSmsProvider((data.sms.provider === 'fonecloud' ? 'fonecloud' : 'twilio'));
                        setFonecloudSenderId(data.sms.fonecloud_sender_id || '');
                    }
                }

                const notifRes = await fetch(`${apiBase}/api/settings/notifications`, {
                    credentials: 'include',
                });
                if (notifRes.ok) {
                    const notifData = await notifRes.json();
                    setNotificationSettings(notifData);
                }
            } catch (err) {
                console.warn('Kunne ikke hente indstillinger', err);
            }
        };
        fetchSettings();
    }, []);

    const loadNotificationHistory = async () => {
        try {
            const apiBase =
                import.meta.env.VITE_API_BASE_URL || window.location.origin.replace(/\/$/, "");
            const res = await fetch(`${apiBase}/api/notifications/history?limit=40`, {
                credentials: 'include',
            });
            if (!res.ok) return;
            const data = await res.json();
            setNotificationHistory(Array.isArray(data.notifications) ? data.notifications : []);
        } catch (err) {
            console.warn('Kunne ikke hente notifikationshistorik', err);
        }
    };

    const mapLeadSummary = (lead: any) => ({
        id: lead.id,
        name: lead?.name || lead?.conversation_name || lead?.phone || 'Ukendt lead',
        time: lead?.created_at ? new Date(lead.created_at).toLocaleString('da-DK') : '-',
        topic: lead?.qualification || 'Nyt lead',
        msg: lead?.last_message || 'Ingen besked endnu',
        email: lead?.email || '-',
        phone: lead?.phone || '-',
        address: '-',
        conversation_id: lead?.conversation_id || null,
    });

    const loadLeads = async () => {
        try {
            const apiBase =
                import.meta.env.VITE_API_BASE_URL || window.location.origin.replace(/\/$/, "");
            const res = await fetch(`${apiBase}/api/leads?limit=50`, {
                credentials: 'include',
            });
            if (res.ok) {
                const data = await res.json();
                setLeads((data.leads || []).map(mapLeadSummary));
            }
        } catch (err) {
            console.warn('Kunne ikke hente leads', err);
        }
    };

    const openLead = async (lead: any) => {
        if (isLocked) {
            return;
        }
        const baseLead = mapLeadSummary(lead || {});
        setSelectedLead(baseLead);
        setLeadTimeline([]);

        if (!baseLead.id) {
            return;
        }

        try {
            const apiBase =
                import.meta.env.VITE_API_BASE_URL || window.location.origin.replace(/\/$/, "");
            const res = await fetch(`${apiBase}/api/leads/${baseLead.id}`, {
                credentials: 'include',
            });
            if (!res.ok) {
                return;
            }
            const data = await res.json();
            const detailedLead = data.lead || {};
            setSelectedLead({
                ...baseLead,
                name: detailedLead.name || baseLead.name,
                topic: detailedLead.qualification || baseLead.topic,
                msg: data.timeline?.[data.timeline.length - 1]?.content || baseLead.msg,
                email: detailedLead.email || baseLead.email,
                phone: detailedLead.phone || baseLead.phone,
                address: detailedLead.address || '-',
                summary: `Status: ${detailedLead.conversation_status || 'aktiv'}${detailedLead.converted_at ? ' (konverteret)' : ''}`,
            });
            setLeadTimeline(Array.isArray(data.timeline) ? data.timeline : []);
        } catch (err) {
            console.warn('Kunne ikke hente lead-detaljer', err);
        }
    };

    useEffect(() => {
        if (isLocked) {
            setLeads([]);
            return;
        }
        loadLeads();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isLocked]);

    useEffect(() => {
        if (isLocked) {
            setNotificationHistory([]);
            return;
        }
        loadNotificationHistory();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isLocked]);

    useEffect(() => {
        if (!initialLeadId) return;
        const existingLead = leads.find((lead) => Number(lead.id) === Number(initialLeadId));
        if (existingLead) {
            openLead(existingLead);
        } else if (leads.length > 0) {
            openLead({ id: initialLeadId });
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [initialLeadId, leads.length]);

    const updateCompanyField = (field: string, value: any) => {
        setCompanySettings((prev: any) => ({
            ...(prev || {}),
            [field]: value,
        }));
    };

    const updateAiField = (field: string, value: any) => {
        setAiSettings((prev: any) => ({
            ...(prev || {}),
            [field]: value,
        }));
    };

    const saveCompanyAndAiSettings = async () => {
        try {
            const apiBase =
                import.meta.env.VITE_API_BASE_URL || window.location.origin.replace(/\/$/, "");
            const res = await fetch(`${apiBase}/api/settings`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({
                    company: companySettings || {},
                    ai: aiSettings || {},
                    sms: smsSettings
                        ? {
                            provider: smsSettings.provider,
                            fonecloud_sender_id: smsSettings.fonecloud_sender_id,
                        }
                        : {},
                }),
            });

            if (!res.ok) {
                console.error('Kunne ikke gemme indstillinger');
                return;
            }

            const data = await res.json();
            setCompanySettings(data.company);
            setAiSettings(data.ai);
            setSmsSettings(data.sms);
        } catch (err) {
            console.error('Fejl ved gem af indstillinger', err);
        }
    };

    const saveSmsSettings = async () => {
        try {
            const apiBase =
                import.meta.env.VITE_API_BASE_URL || window.location.origin.replace(/\/$/, "");
            const res = await fetch(`${apiBase}/api/settings`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({
                    company: companySettings || {},
                    ai: aiSettings || {},
                    sms: {
                        provider: smsProvider,
                        fonecloud_sender_id: smsProvider === 'fonecloud' ? fonecloudSenderId : undefined,
                    },
                }),
            });
            if (!res.ok) {
                console.error('Kunne ikke gemme SMS-indstillinger');
                return;
            }
            const data = await res.json();
            setSmsSettings(data.sms);
            setIsSettingsModalOpen(false);
        } catch (err) {
            console.error('Fejl ved gem af SMS-indstillinger', err);
        }
    };

    const updateNotificationField = (field: string, value: any) => {
        setNotificationSettings((prev: any) => ({
            ...(prev || {}),
            [field]: value,
        }));
    };

    const saveNotificationSettings = async () => {
        try {
            const apiBase =
                import.meta.env.VITE_API_BASE_URL || window.location.origin.replace(/\/$/, "");
            const payload = {
                emailEnabled: !!notificationSettings?.email_enabled,
                emailNewLead: !!notificationSettings?.email_new_lead,
                emailNewMessage: !!notificationSettings?.email_new_message,
                emailDailyDigest: !!notificationSettings?.email_daily_digest,
                emailWeeklyReport: !!notificationSettings?.email_weekly_report,
                smsEnabled: !!notificationSettings?.sms_enabled,
                smsPhone: notificationSettings?.sms_phone || '',
                smsNewLead: !!notificationSettings?.sms_new_lead,
                smsNewMessage: !!notificationSettings?.sms_new_message,
                notifyLeadManaged: notificationSettings?.notify_lead_managed !== false,
                notifyLeadConverted: notificationSettings?.notify_lead_converted !== false,
                notifyAiFailed: notificationSettings?.notify_ai_failed !== false,
                cadenceMode: notificationSettings?.cadence_mode || 'immediate',
                cadenceIntervalMinutes: notificationSettings?.cadence_interval_minutes
                    ? Number(notificationSettings.cadence_interval_minutes)
                    : null,
                maxNotificationsPerDay: notificationSettings?.max_notifications_per_day
                    ? Number(notificationSettings.max_notifications_per_day)
                    : null,
                quietHoursStart: notificationSettings?.quiet_hours_start || null,
                quietHoursEnd: notificationSettings?.quiet_hours_end || null,
                timezone: notificationSettings?.timezone || 'Europe/Copenhagen',
                digestType: notificationSettings?.digest_type || 'daily',
                digestTime: notificationSettings?.digest_time || '09:00',
            };

            const res = await fetch(`${apiBase}/api/settings/notifications`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify(payload),
            });
            if (!res.ok) {
                console.error('Kunne ikke gemme notifikationsindstillinger');
                return;
            }
            const data = await res.json();
            setNotificationSettings(data);
            await loadNotificationHistory();
        } catch (err) {
            console.error('Fejl ved gem af notifikationsindstillinger', err);
        }
    };

    const handleStartCheckout = async () => {
        setCheckoutError(null);
        setCheckoutLoading(true);
        try {
            trackEvent('checkout_started_from_dashboard');
            await onStartCheckout(acceptedTerms, acceptedDpa);
        } catch (err) {
            const message = err instanceof Error ? err.message : 'Kunne ikke starte betaling';
            setCheckoutError(message);
            setCheckoutLoading(false);
        }
    };

    const handleRefreshEntitlement = async () => {
        setRefreshingEntitlement(true);
        try {
            await onRefreshEntitlement();
        } finally {
            setRefreshingEntitlement(false);
        }
    };

    return (
        <div className="min-h-screen bg-[#FAFAFA] font-sans text-slate-900 animate-in fade-in duration-500">
           {/* Navigation */}
           <nav className="fixed w-full z-50 bg-white/80 backdrop-blur-md border-b border-slate-200">
               <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
                   <div className="flex items-center gap-8">
                       <div className="flex items-center gap-2">
                           <div className="w-8 h-8 bg-black rounded-lg flex items-center justify-center text-white text-sm font-bold shadow-lg">R</div>
                           <span className="font-bold text-lg tracking-tight">Replypilot Dashboard</span>
                       </div>
                       
                       {/* Main Menu */}
                       <div className="hidden md:flex items-center gap-1 bg-slate-100/50 p-1 rounded-lg">
                           <button
                               className={`px-4 py-1.5 text-sm font-semibold rounded-md transition-all ${
                                   activeTab === 'overview'
                                       ? 'text-slate-900 bg-white shadow-sm border border-slate-200/50'
                                       : 'text-slate-500 hover:text-slate-900 hover:bg-slate-200/50'
                               }`}
                               onClick={() => setActiveTab('overview')}
                           >
                               Oversigt
                           </button>
                           <button
                               className={`px-4 py-1.5 text-sm font-medium rounded-md transition-all ${
                                   activeTab === 'customers'
                                       ? 'text-slate-900 bg-white shadow-sm border border-slate-200/50'
                                       : 'text-slate-500 hover:text-slate-900 hover:bg-slate-200/50'
                               }`}
                               onClick={() => setActiveTab('customers')}
                           >
                               Kunder
                           </button>
                           <button
                               className={`px-4 py-1.5 text-sm font-medium rounded-md transition-all ${
                                   activeTab === 'settings'
                                       ? 'text-slate-900 bg-white shadow-sm border border-slate-200/50'
                                       : 'text-slate-500 hover:text-slate-900 hover:bg-slate-200/50'
                               }`}
                               onClick={() => setActiveTab('settings')}
                           >
                               Indstillinger
                           </button>
                       </div>
                   </div>

                   <button onClick={onLogout} className="text-sm font-medium text-slate-500 hover:text-black flex items-center gap-2 transition-colors">
                       <LogOut className="w-4 h-4" /> Log ud
                   </button>
               </div>
           </nav>

           <div className="pt-24 pb-12 px-6 max-w-7xl mx-auto">
               {isLocked && (
                   <div className="mb-6 rounded-2xl border border-amber-200 bg-amber-50 p-5">
                       <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
                           <div>
                               <h3 className="text-base font-bold text-amber-900">Aktivering mangler</h3>
                               <p className="text-sm text-amber-800">
                                   Du kan se en forhåndsvisning af dashboardet, men funktioner er låst indtil betaling er gennemført.
                               </p>
                           </div>
                           <button
                               onClick={handleRefreshEntitlement}
                               disabled={refreshingEntitlement}
                               className="px-3 py-2 rounded-lg text-sm font-semibold border border-amber-300 text-amber-900 hover:bg-amber-100 disabled:opacity-60"
                           >
                               {refreshingEntitlement ? 'Opdaterer...' : 'Jeg har betalt - opdater status'}
                           </button>
                       </div>

                       <div className="mt-4 space-y-2">
                           <label className="flex items-start gap-2 text-sm text-amber-900">
                               <input
                                   type="checkbox"
                                   checked={acceptedTerms}
                                   onChange={(e) => setAcceptedTerms(e.target.checked)}
                               />
                               <span>
                                   Jeg accepterer <a href="/handelsbetingelser" target="_blank" rel="noopener noreferrer" className="underline">handelsbetingelserne</a>.
                               </span>
                           </label>
                           <label className="flex items-start gap-2 text-sm text-amber-900">
                               <input
                                   type="checkbox"
                                   checked={acceptedDpa}
                                   onChange={(e) => setAcceptedDpa(e.target.checked)}
                               />
                               <span>
                                   Jeg accepterer <a href="/databehandleraftale" target="_blank" rel="noopener noreferrer" className="underline">databehandleraftalen (DPA)</a>.
                               </span>
                           </label>
                       </div>

                       {checkoutError && (
                           <p className="mt-3 text-sm text-red-700">{checkoutError}</p>
                       )}

                       <button
                           onClick={handleStartCheckout}
                           disabled={checkoutLoading || !acceptedTerms || !acceptedDpa}
                           className="mt-4 px-5 py-2.5 rounded-xl bg-black text-white text-sm font-semibold hover:bg-slate-800 disabled:opacity-60"
                       >
                           {checkoutLoading ? 'Starter betaling...' : 'Aktiver abonnement'}
                       </button>
                   </div>
               )}

               {activeTab === 'overview' && (
                   <>
                       {/* Stats Row */}
                       <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
                           <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm hover:shadow-md transition-shadow">
                               <div className="flex items-center justify-between mb-4">
                                   <span className="text-slate-500 text-sm font-medium">Håndterede opkald</span>
                                   <div className="w-10 h-10 bg-blue-50 text-blue-600 rounded-xl flex items-center justify-center"><Phone className="w-5 h-5" /></div>
                               </div>
                               <div className="flex items-baseline gap-2">
                                    <div className="text-3xl font-bold text-slate-900">12</div>
                                    <span className="text-xs text-green-600 font-bold bg-green-50 px-2 py-0.5 rounded-full">+4 i dag</span>
                               </div>
                           </div>
                           <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm hover:shadow-md transition-shadow">
                               <div className="flex items-center justify-between mb-4">
                                   <span className="text-slate-500 text-sm font-medium">Sparet tid</span>
                                   <div className="w-10 h-10 bg-purple-50 text-purple-600 rounded-xl flex items-center justify-center"><Clock className="w-5 h-5" /></div>
                               </div>
                               <div className="flex items-baseline gap-2">
                                    <div className="text-3xl font-bold text-slate-900">45 min</div>
                                    <span className="text-xs text-slate-400 font-medium">Denne uge</span>
                               </div>
                           </div>
                           <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm hover:shadow-md transition-shadow">
                               <div className="flex items-center justify-between mb-4">
                                   <span className="text-slate-500 text-sm font-medium">Potentiel Omsætning</span>
                                   <div className="w-10 h-10 bg-green-50 text-green-600 rounded-xl flex items-center justify-center"><TrendingUp className="w-5 h-5" /></div>
                               </div>
                               <div className="flex items-baseline gap-2">
                                    <div className="text-3xl font-bold text-slate-900">15.000 kr</div>
                                    <span className="text-xs text-slate-400 font-medium">Estimeret</span>
                               </div>
                           </div>
                       </div>

                       {/* Main Content */}
                       <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                           {/* Recent Activity */}
                           <div className="lg:col-span-2 bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden flex flex-col">
                               <div className="p-6 border-b border-slate-50 flex justify-between items-center bg-slate-50/50">
                                   <h3 className="font-bold text-lg text-slate-900">Seneste Kundeemner</h3>
                                   <button
                                       disabled={isLocked}
                                       className="text-sm text-blue-600 font-medium hover:text-blue-700 hover:underline disabled:opacity-50 disabled:no-underline"
                                   >
                                       Se alle
                                   </button>
                               </div>
                               <div className="divide-y divide-slate-50">
                                   {isLocked && (
                                       <div className="p-6 text-sm text-slate-500">
                                           Kundeemner vises efter aktivering af abonnement.
                                       </div>
                                   )}
                                   {!isLocked && leads.map((lead, i) => (
                                       <button 
                                            key={i} 
                                            onClick={() => openLead(lead)}
                                            className="w-full text-left p-6 flex items-start gap-4 hover:bg-slate-50 transition-colors cursor-pointer group focus:outline-none focus:bg-slate-50"
                                       >
                                           <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center shrink-0 text-slate-500 group-hover:bg-white group-hover:text-blue-600 group-hover:shadow-sm transition-all border border-transparent group-hover:border-slate-100">
                                               <User className="w-5 h-5" />
                                           </div>
                                           <div className="flex-1">
                                               <div className="flex justify-between items-start mb-1">
                                                   <div className="flex items-center gap-2">
                                                        <span className="font-bold text-slate-900">{lead.name}</span>
                                                        <span className="px-2 py-0.5 bg-blue-50 text-blue-700 text-[10px] font-bold uppercase tracking-wide rounded-full">{lead.topic}</span>
                                                   </div>
                                                   <span className="text-xs text-slate-400 font-medium">{lead.time}</span>
                                               </div>
                                               <p className="text-sm text-slate-500 line-clamp-1 group-hover:text-slate-600">
                                                   {lead.msg}
                                               </p>
                                           </div>
                                           <ChevronRightIcon className="w-4 h-4 text-slate-300 group-hover:text-slate-400 group-hover:translate-x-1 transition-all" />
                                       </button>
                                   ))}
                               </div>
                           </div>

                           {/* Settings / Status Side Panel */}
                           <div className="space-y-6">
                                <div className="bg-black text-white rounded-3xl p-6 shadow-2xl relative overflow-hidden group">
                                    <div className="absolute top-0 right-0 w-40 h-40 bg-blue-600 rounded-full blur-[60px] opacity-20 group-hover:opacity-30 transition-opacity"></div>
                                    
                                    <div className="relative z-10">
                                        <h3 className="font-bold text-lg mb-1">
                                            {aiSettings?.agent_name
                                                ? `${aiSettings.agent_name} – AI receptionist`
                                                : companySettings?.company_name
                                                    ? `${companySettings.company_name}s AI receptionist`
                                                    : 'Digital Receptionist'}
                                        </h3>
                                        <div className="flex items-center gap-2 mb-8">
                                            <span className="relative flex h-2.5 w-2.5">
                                              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                                              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-green-500"></span>
                                            </span>
                                            <span className="text-sm font-medium text-slate-300">Aktiv & Klar</span>
                                        </div>
                                        
                                        <div className="space-y-3">
                                            <div className="flex items-center justify-between text-sm text-slate-400 border-b border-white/10 pb-2">
                                                <span>Model</span>
                                                <span className="text-white">Gemini 2.5</span>
                                            </div>
                                            <div className="flex items-center justify-between text-sm text-slate-400 border-b border-white/10 pb-2">
                                                <span>Tone</span>
                                                <span className="text-white">
                                                    {aiSettings?.tone || 'Professionel'}
                                                </span>
                                            </div>
                                            <div className="flex items-center justify-between text-sm text-slate-400 pb-2">
                                                <span>Viderestilling</span>
                                                <span className="text-white">
                                                    {companySettings?.forwarding_number || 'Aktiv'}
                                                </span>
                                            </div>
                                        </div>

                                        <button
                                            disabled={isLocked}
                                            className="w-full mt-6 py-3 bg-white/10 hover:bg-white/20 rounded-xl font-medium transition-colors text-sm backdrop-blur-sm border border-white/10 flex items-center justify-center gap-2"
                                            onClick={() => setActiveTab('settings')}
                                        >
                                            <Settings className="w-4 h-4" /> Konfigurer AI
                                        </button>
                                    </div>
                                </div>

                                <div className="bg-white rounded-3xl border border-slate-100 shadow-sm p-6">
                                    <h3 className="font-bold text-slate-900 mb-4 flex items-center gap-2">
                                        <Calendar className="w-4 h-4 text-slate-400" />
                                        Kalender
                                    </h3>
                                    <div className="p-4 bg-slate-50 rounded-xl text-center">
                                        <p className="text-sm text-slate-500 mb-2">Ingen møder i dag</p>
                                        <button disabled={isLocked} className="text-xs font-bold text-blue-600 hover:text-blue-700 disabled:opacity-50">Synkroniser Kalender</button>
                                    </div>
                                    <div className="mt-4 p-4 bg-slate-50 rounded-xl border border-slate-100">
                                        <p className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-1">Notifikationer</p>
                                        <p className="text-sm text-slate-700">
                                            Frekvens: {notificationSettings?.cadence_mode || 'immediate'}
                                        </p>
                                        <p className="text-xs text-slate-500 mt-1">
                                            Kanal: {notificationSettings?.sms_enabled ? 'SMS ' : ''}{notificationSettings?.email_enabled ? 'Email' : ''}
                                        </p>
                                    </div>
                                </div>
                           </div>
                       </div>
                   </>
               )}

               {activeTab === 'customers' && (
                   <div className="bg-white rounded-3xl border border-slate-100 shadow-sm p-6">
                       <div className="flex items-center justify-between mb-6">
                           <div>
                               <h2 className="text-xl font-bold text-slate-900">Kunder</h2>
                               <p className="text-sm text-slate-500">
                                   Overblik over de seneste kundeemner som din AI receptionist har håndteret.
                               </p>
                           </div>
                       </div>
                       {isLocked ? (
                           <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
                               Kundelisten låses op efter betaling.
                           </div>
                       ) : (
                       <div className="overflow-x-auto">
                           <table className="min-w-full text-sm">
                               <thead className="bg-slate-50 text-left text-xs font-semibold text-slate-500">
                                   <tr>
                                       <th className="px-4 py-3">Navn</th>
                                       <th className="px-4 py-3">Emne</th>
                                       <th className="px-4 py-3">Seneste besked</th>
                                       <th className="px-4 py-3">Kontakt</th>
                                       <th className="px-4 py-3 text-right">Tidspunkt</th>
                                   </tr>
                               </thead>
                               <tbody>
                                   {leads.map((lead, i) => (
                                       <tr key={i} className="border-t last:border-b hover:bg-slate-50/60 cursor-pointer" onClick={() => openLead(lead)}>
                                           <td className="px-4 py-3 font-medium text-slate-900">{lead.name}</td>
                                           <td className="px-4 py-3">
                                               <span className="inline-flex items-center rounded-full bg-blue-50 px-2 py-0.5 text-[11px] font-semibold text-blue-700 uppercase tracking-wide">
                                                   {lead.topic}
                                               </span>
                                           </td>
                                           <td className="px-4 py-3 text-slate-600 max-w-xs">
                                               <span className="line-clamp-1">{lead.msg}</span>
                                           </td>
                                           <td className="px-4 py-3 text-xs text-slate-500">
                                               {lead.phone}
                                               <span className="block text-[11px] text-slate-400">{lead.email}</span>
                                           </td>
                                           <td className="px-4 py-3 text-xs text-right text-slate-500">{lead.time}</td>
                                       </tr>
                                   ))}
                               </tbody>
                           </table>
                       </div>
                       )}
                   </div>
               )}

               {activeTab === 'settings' && (
                   <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                       <div className="lg:col-span-2 space-y-6">
                           <fieldset disabled={isLocked} className={isLocked ? 'opacity-70' : ''}>
                           <div className="bg-white rounded-3xl border border-slate-100 shadow-sm p-6">
                               <h2 className="text-lg font-bold text-slate-900 mb-1">Virksomhed</h2>
                               <p className="text-sm text-slate-500 mb-6">
                                   Oplysninger som din AI receptionist bruger til at præsentere virksomheden korrekt.
                               </p>
                               <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                   <div>
                                       <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wide mb-2">
                                           Firmanavn
                                       </label>
                                       <input
                                           type="text"
                                           value={companySettings?.company_name || ''}
                                           onChange={(e) => updateCompanyField('company_name', e.target.value)}
                                           className="w-full h-10 px-3 rounded-lg bg-slate-50 border border-slate-200 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 outline-none text-sm"
                                       />
                                   </div>
                                   <div>
                                       <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wide mb-2">
                                           Telefon til virksomheden
                                       </label>
                                       <input
                                           type="tel"
                                           value={companySettings?.phone_number || ''}
                                           onChange={(e) => updateCompanyField('phone_number', e.target.value)}
                                           className="w-full h-10 px-3 rounded-lg bg-slate-50 border border-slate-200 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 outline-none text-sm"
                                       />
                                   </div>
                                   <div className="md:col-span-2">
                                       <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wide mb-2">
                                           Adresse
                                       </label>
                                       <input
                                           type="text"
                                           value={companySettings?.address || ''}
                                           onChange={(e) => updateCompanyField('address', e.target.value)}
                                           className="w-full h-10 px-3 rounded-lg bg-slate-50 border border-slate-200 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 outline-none text-sm"
                                       />
                                   </div>
                                   <div>
                                       <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wide mb-2">
                                           Åbningstider (kort tekst)
                                       </label>
                                       <input
                                           type="text"
                                           value={companySettings?.opening_hours || ''}
                                           onChange={(e) => updateCompanyField('opening_hours', e.target.value)}
                                           className="w-full h-10 px-3 rounded-lg bg-slate-50 border border-slate-200 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 outline-none text-sm"
                                       />
                                   </div>
                                   <div>
                                       <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wide mb-2">
                                           Viderestillingsnummer
                                       </label>
                                       <input
                                           type="tel"
                                           value={companySettings?.forwarding_number || ''}
                                           onChange={(e) => updateCompanyField('forwarding_number', e.target.value)}
                                           className="w-full h-10 px-3 rounded-lg bg-slate-50 border border-slate-200 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 outline-none text-sm"
                                       />
                                   </div>
                                   <div>
                                       <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wide mb-2">
                                           Email til leads
                                       </label>
                                       <input
                                           type="email"
                                           value={companySettings?.email_forward || ''}
                                           onChange={(e) => updateCompanyField('email_forward', e.target.value)}
                                           className="w-full h-10 px-3 rounded-lg bg-slate-50 border border-slate-200 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 outline-none text-sm"
                                       />
                                   </div>
                                   <div className="md:col-span-2">
                                       <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wide mb-2">
                                           Interne noter til AI'en
                                       </label>
                                       <textarea
                                           value={companySettings?.notes || ''}
                                           onChange={(e) => updateCompanyField('notes', e.target.value)}
                                           className="w-full min-h-[80px] px-3 py-2 rounded-lg bg-slate-50 border border-slate-200 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 outline-none text-sm resize-none"
                                           placeholder="Skriv særlige ønsker, services eller praktisk info som AI'en skal kende."
                                       />
                                   </div>
                               </div>
                           </div>

                           <div className="bg-white rounded-3xl border border-slate-100 shadow-sm p-6">
                               <h2 className="text-lg font-bold text-slate-900 mb-1">AI-receptionist</h2>
                               <p className="text-sm text-slate-500 mb-6">
                                   Finjustér hvordan din AI svarer kunderne – baseret på jeres tone, sprog og vigtigste informationer.
                               </p>

                               <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                                   <div className="md:col-span-2">
                                       <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wide mb-2">
                                           Navn på AI-assistent
                                       </label>
                                       <input
                                           type="text"
                                           value={aiSettings?.agent_name || ''}
                                           onChange={(e) => updateAiField('agent_name', e.target.value)}
                                           className="w-full h-10 px-3 rounded-lg bg-slate-50 border border-slate-200 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 outline-none text-sm"
                                           placeholder="Fx Maja, Anna eller Replypilot"
                                       />
                                   </div>
                                   <div>
                                       <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wide mb-2">
                                           Tone
                                       </label>
                                       <select
                                           value={aiSettings?.tone || ''}
                                           onChange={(e) => updateAiField('tone', e.target.value)}
                                           className="w-full h-10 px-3 rounded-lg bg-slate-50 border border-slate-200 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 outline-none text-sm"
                                       >
                                           <option value="">Vælg tone</option>
                                           <option value="professionel">Professionel</option>
                                           <option value="venlig">Venlig</option>
                                           <option value="uformel">Uformel</option>
                                       </select>
                                   </div>
                                   <div>
                                       <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wide mb-2">
                                           Sprog
                                       </label>
                                       <select
                                           value={aiSettings?.language || 'da'}
                                           onChange={(e) => updateAiField('language', e.target.value)}
                                           className="w-full h-10 px-3 rounded-lg bg-slate-50 border border-slate-200 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 outline-none text-sm"
                                       >
                                           <option value="da">Dansk</option>
                                           <option value="en">Engelsk</option>
                                       </select>
                                   </div>
                                   <div>
                                       <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wide mb-2">
                                           Maks. længde på SMS-svar
                                       </label>
                                       <input
                                           type="number"
                                           min={50}
                                           max={500}
                                           value={aiSettings?.max_message_length ?? ''}
                                           onChange={(e) =>
                                               updateAiField(
                                                   'max_message_length',
                                                   e.target.value ? Number(e.target.value) : null
                                               )
                                           }
                                           className="w-full h-10 px-3 rounded-lg bg-slate-50 border border-slate-200 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 outline-none text-sm"
                                       />
                                   </div>
                               </div>

                               <div>
                                   <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wide mb-2">
                                       Specialinstruktioner til AI'en
                                   </label>
                                   <textarea
                                       value={aiSettings?.custom_instructions || ''}
                                       onChange={(e) => updateAiField('custom_instructions', e.target.value)}
                                       className="w-full min-h-[140px] px-3 py-2 rounded-lg bg-slate-50 border border-slate-200 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 outline-none text-sm resize-none"
                                       placeholder="Beskriv kort hvad I laver, typiske spørgsmål, hvordan I ønsker at AI'en prioriterer henvendelser, og hvilke informationer den altid skal indsamle."
                                   />
                               </div>
                           </div>

                           <div className="bg-white rounded-3xl border border-slate-100 shadow-sm p-6">
                               <h2 className="text-lg font-bold text-slate-900 mb-1">Notifikationer</h2>
                               <p className="text-sm text-slate-500 mb-6">
                                   Vælg hvordan og hvor ofte du vil modtage opdateringer om leads, som AI-agenten håndterer.
                               </p>
                               <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                   <div>
                                       <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wide mb-2">
                                           Frekvens
                                       </label>
                                       <select
                                           value={notificationSettings?.cadence_mode || 'immediate'}
                                           onChange={(e) => updateNotificationField('cadence_mode', e.target.value)}
                                           className="w-full h-10 px-3 rounded-lg bg-slate-50 border border-slate-200 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 outline-none text-sm"
                                       >
                                           <option value="immediate">Med det samme</option>
                                           <option value="hourly">Hver time</option>
                                           <option value="daily">Daglig opsummering</option>
                                           <option value="custom">Brugerdefineret interval</option>
                                       </select>
                                   </div>
                                   <div>
                                       <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wide mb-2">
                                           SMS-nummer
                                       </label>
                                       <input
                                           type="tel"
                                           value={notificationSettings?.sms_phone || ''}
                                           onChange={(e) => updateNotificationField('sms_phone', e.target.value)}
                                           className="w-full h-10 px-3 rounded-lg bg-slate-50 border border-slate-200 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 outline-none text-sm"
                                           placeholder="+45 ..."
                                       />
                                   </div>
                                   <div>
                                       <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wide mb-2">
                                           Brugerdefineret interval (minutter)
                                       </label>
                                       <input
                                           type="number"
                                           min={5}
                                           max={1440}
                                           value={notificationSettings?.cadence_interval_minutes ?? ''}
                                           onChange={(e) => updateNotificationField('cadence_interval_minutes', e.target.value ? Number(e.target.value) : null)}
                                           className="w-full h-10 px-3 rounded-lg bg-slate-50 border border-slate-200 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 outline-none text-sm"
                                       />
                                   </div>
                                   <div className="flex items-end gap-4">
                                       <label className="inline-flex items-center gap-2 text-sm text-slate-700">
                                           <input
                                               type="checkbox"
                                               checked={!!notificationSettings?.email_enabled}
                                               onChange={(e) => updateNotificationField('email_enabled', e.target.checked)}
                                           />
                                           Email
                                       </label>
                                       <label className="inline-flex items-center gap-2 text-sm text-slate-700">
                                           <input
                                               type="checkbox"
                                               checked={!!notificationSettings?.sms_enabled}
                                               onChange={(e) => updateNotificationField('sms_enabled', e.target.checked)}
                                           />
                                           SMS
                                       </label>
                                   </div>
                               </div>
                               <div className="mt-5">
                                   <button
                                       onClick={saveNotificationSettings}
                                       className="px-4 py-2 rounded-lg bg-slate-900 text-white text-sm font-semibold hover:bg-slate-800 transition-colors"
                                   >
                                       Gem notifikationsindstillinger
                                   </button>
                               </div>
                           </div>

                           <div className="bg-white rounded-3xl border border-slate-100 shadow-sm p-6">
                               <div className="flex items-center justify-between mb-4">
                                   <h2 className="text-lg font-bold text-slate-900">Notifikationshistorik</h2>
                                   <button
                                       onClick={loadNotificationHistory}
                                       className="text-xs font-semibold text-blue-600 hover:text-blue-700"
                                   >
                                       Opdater
                                   </button>
                               </div>
                               <div className="space-y-2 max-h-72 overflow-auto">
                                   {notificationHistory.length === 0 ? (
                                       <div className="text-sm text-slate-500 bg-slate-50 border border-slate-100 rounded-lg p-3">
                                           Ingen notifikationer endnu.
                                       </div>
                                   ) : notificationHistory.map((item) => (
                                       <div key={item.id} className="bg-slate-50 border border-slate-100 rounded-lg p-3">
                                           <div className="flex items-center justify-between gap-2">
                                               <div className="text-xs font-semibold text-slate-700 uppercase tracking-wide">
                                                   {item.channel} • {item.type}
                                               </div>
                                               <div className={`text-[11px] font-semibold ${item.status === 'sent' ? 'text-green-700' : item.status === 'failed' ? 'text-red-700' : 'text-slate-500'}`}>
                                                   {item.status}
                                               </div>
                                           </div>
                                           <div className="text-xs text-slate-600 mt-1">
                                               {item.payload?.summary || item.payload?.message || 'Se lead-link for detaljer'}
                                           </div>
                                           <div className="text-[11px] text-slate-400 mt-1">
                                               {new Date(item.sent_at || item.created_at).toLocaleString('da-DK')}
                                           </div>
                                           {item.error_message ? (
                                               <div className="text-[11px] text-red-600 mt-1">{item.error_message}</div>
                                           ) : null}
                                       </div>
                                   ))}
                               </div>
                           </div>

                           <div className="flex justify-end">
                               <button
                                   onClick={saveCompanyAndAiSettings}
                                   className="px-5 py-2.5 rounded-xl bg-black text-white text-sm font-semibold hover:bg-slate-800 transition-colors"
                               >
                                   Gem indstillinger
                               </button>
                           </div>
                           </fieldset>
                           {isLocked && (
                               <div className="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
                                   Indstillinger vises som preview. Aktiver abonnement for at redigere og gemme.
                               </div>
                           )}
                       </div>

                       <div className="space-y-6">
                           <div className="bg-black text-white rounded-3xl p-6 shadow-2xl relative overflow-hidden">
                               <div className="absolute top-0 right-0 w-40 h-40 bg-blue-600 rounded-full blur-[60px] opacity-20"></div>
                               <div className="relative z-10">
                                   <h3 className="font-bold text-lg mb-1">
                                       {aiSettings?.agent_name
                                           ? `${aiSettings.agent_name} – AI agent`
                                           : companySettings?.company_name
                                               ? `${companySettings.company_name}s AI agent`
                                               : 'AI Agent status'}
                                   </h3>
                                   <p className="text-sm text-slate-300 mb-6">
                                       Din AI receptionist er trænet på dine oplysninger og klar til at tage imod nye kundehenvendelser døgnet rundt.
                                   </p>
                                   <div className="space-y-2 text-sm text-slate-200">
                                       <div className="flex items-center justify-between">
                                           <span>Model</span>
                                           <span>Gemini 2.5</span>
                                       </div>
                                       <div className="flex items-center justify-between">
                                           <span>Tone</span>
                                           <span>{aiSettings?.tone || 'Professionel'}</span>
                                       </div>
                                       <div className="flex items-center justify-between">
                                           <span>Sprog</span>
                                           <span>{aiSettings?.language || 'Dansk'}</span>
                                       </div>
                                   </div>
                               </div>
                           </div>
                       </div>
                   </div>
               )}
           </div>

          {/* Lead Detail Modal */}
           {selectedLead && (
               <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
                   <div 
                        className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm transition-opacity" 
                        onClick={() => {
                            setSelectedLead(null);
                            setLeadTimeline([]);
                        }}
                   ></div>
                   <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg relative z-10 overflow-hidden animate-in fade-in zoom-in-95 duration-200">
                       {/* Header */}
                       <div className="p-6 border-b border-slate-100 flex justify-between items-start bg-slate-50/50">
                           <div className="flex items-center gap-4">
                               <div className="w-12 h-12 rounded-full bg-slate-900 text-white flex items-center justify-center font-bold text-lg shadow-lg">
                                    {selectedLead.name.charAt(0)}
                               </div>
                               <div>
                                   <h3 className="text-lg font-bold text-slate-900">{selectedLead.name}</h3>
                                   <p className="text-sm text-slate-500 font-medium">Henvendelse fra {selectedLead.time}</p>
                               </div>
                           </div>
                           <button onClick={() => {
                               setSelectedLead(null);
                               setLeadTimeline([]);
                           }} className="p-2 bg-white hover:bg-slate-100 rounded-full text-slate-400 hover:text-slate-600 transition-colors shadow-sm border border-slate-200">
                               <X className="w-4 h-4" />
                           </button>
                       </div>
                       
                       {/* Content */}
                       <div className="p-6 space-y-6">
                           <div className="flex gap-3">
                               <button disabled={isLocked} className="flex-1 py-3 bg-slate-900 text-white rounded-xl font-bold text-sm flex items-center justify-center gap-2 hover:bg-slate-800 shadow-lg shadow-slate-200 transition-all active:scale-95 disabled:opacity-60">
                                   <Phone className="w-4 h-4" /> Ring op
                               </button>
                               <button disabled={isLocked} className="flex-1 py-3 bg-white border border-slate-200 text-slate-900 rounded-xl font-bold text-sm flex items-center justify-center gap-2 hover:bg-slate-50 hover:border-slate-300 transition-all active:scale-95 disabled:opacity-60">
                                   <MessageSquare className="w-4 h-4" /> Send SMS
                               </button>
                           </div>
                           
                           <div className="bg-blue-50/80 p-5 rounded-xl border border-blue-100">
                                <div className="flex items-center gap-2 mb-2">
                                    <span className="px-2 py-0.5 bg-blue-100 text-blue-700 text-[10px] font-bold uppercase tracking-wide rounded-full">{selectedLead.topic}</span>
                                </div>
                                <p className="text-slate-700 text-sm leading-relaxed font-medium">"{selectedLead.msg}"</p>
                                {selectedLead.summary ? (
                                    <p className="text-xs text-slate-500 mt-3">{selectedLead.summary}</p>
                                ) : null}
                           </div>

                           <div className="space-y-4 pt-2">
                                <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Kontaktinfo</p>
                                <div className="flex items-center gap-4 text-sm text-slate-600 bg-slate-50 p-3 rounded-lg border border-slate-100">
                                    <Phone className="w-4 h-4 text-slate-400 shrink-0" />
                                    <span className="font-medium">{selectedLead.phone}</span>
                                </div>
                                <div className="flex items-center gap-4 text-sm text-slate-600 bg-slate-50 p-3 rounded-lg border border-slate-100">
                                    <Mail className="w-4 h-4 text-slate-400 shrink-0" />
                                    <span className="font-medium">{selectedLead.email}</span>
                                </div>
                                <div className="flex items-center gap-4 text-sm text-slate-600 bg-slate-50 p-3 rounded-lg border border-slate-100">
                                    <MapPin className="w-4 h-4 text-slate-400 shrink-0" />
                                    <span className="font-medium">{selectedLead.address}</span>
                                </div>
                           </div>

                           <div className="space-y-2">
                                <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Aktivitetstidslinje</p>
                                <div className="max-h-52 overflow-auto space-y-2 pr-1">
                                    {leadTimeline.length === 0 ? (
                                        <div className="text-xs text-slate-500 bg-slate-50 p-3 rounded-lg border border-slate-100">
                                            Ingen registrerede beskeder endnu.
                                        </div>
                                    ) : leadTimeline.map((item) => (
                                        <div key={item.id} className="bg-slate-50 p-3 rounded-lg border border-slate-100 text-xs text-slate-600">
                                            <div className="font-semibold text-slate-700 mb-1">
                                                {item.sender} • {new Date(item.created_at).toLocaleString('da-DK')}
                                            </div>
                                            <div>{item.content}</div>
                                        </div>
                                    ))}
                                </div>
                           </div>
                       </div>
                   </div>
              </div>
          )}

           {/* SMS Provider Settings Modal */}
           {isSettingsModalOpen && (
               <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
                   <div
                       className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
                       onClick={() => setIsSettingsModalOpen(false)}
                   ></div>
                   <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md relative z-10 overflow-hidden">
                       <div className="p-4 border-b border-slate-100 flex justify-between items-center">
                           <h3 className="text-base font-semibold text-slate-900">SMS-udbyder</h3>
                           <button
                               onClick={() => setIsSettingsModalOpen(false)}
                               className="p-1.5 rounded-full hover:bg-slate-100 text-slate-400 hover:text-slate-600"
                           >
                               <X className="w-4 h-4" />
                           </button>
                       </div>
                       <div className="p-5 space-y-4">
                           <div className="space-y-1">
                               <label className="text-sm font-medium text-slate-700">
                                   Udbyder
                               </label>
                               <select
                                   className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-400 bg-white"
                                   value={smsProvider}
                                   onChange={(e) =>
                                       setSmsProvider(e.target.value === 'fonecloud' ? 'fonecloud' : 'twilio')
                                   }
                               >
                                   <option value="twilio">Twilio</option>
                                   <option value="fonecloud">Fonecloud</option>
                               </select>
                           </div>

                           {smsProvider === 'fonecloud' && (
                               <div className="space-y-1">
                                   <label className="text-sm font-medium text-slate-700">
                                       Fonecloud Sender ID
                                   </label>
                                   <input
                                       type="text"
                                       className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-400"
                                       value={fonecloudSenderId}
                                       onChange={(e) => setFonecloudSenderId(e.target.value)}
                                       placeholder="Fx SMS eller firmanavn"
                                   />
                               </div>
                           )}

                           <p className="text-xs text-slate-500">
                               Nye SMS'er sendes via den valgte udbyder. Eksisterende samtaler og beskeder
                               påvirkes ikke.
                           </p>

                           <div className="flex justify-end gap-2 pt-2">
                               <button
                                   className="px-3 py-2 text-xs font-medium text-slate-500 hover:text-slate-700"
                                   onClick={() => setIsSettingsModalOpen(false)}
                               >
                                   Annuller
                               </button>
                               <button
                                   className="px-4 py-2 text-xs font-semibold rounded-lg bg-slate-900 text-white hover:bg-slate-800"
                                   onClick={saveSmsSettings}
                               >
                                   Gem indstillinger
                               </button>
                           </div>
                       </div>
                   </div>
               </div>
           )}
        </div>
    );
};