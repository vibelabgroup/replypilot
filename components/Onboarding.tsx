import React, { useState, useEffect } from 'react';
import { OnboardingData } from '../types';
import { Bot, Building2, CheckCircle2, ChevronRight, Bell, Sparkles, Smartphone, Globe, Search, Database, Mail, MessageSquare, Loader2, MapPin, Calendar, FileText, BadgeCheck, Map, Clock, Pencil, ExternalLink } from 'lucide-react';
import { analyzeCompanyInfo } from '../services/aiService';
import { trackEvent } from '../services/telemetry';

const API_BASE = import.meta.env.VITE_API_BASE_URL || window.location.origin.replace(/\/$/, '');

interface OnboardingProps {
    onComplete: () => void;
}

export const Onboarding: React.FC<OnboardingProps> = ({ onComplete }) => {
    const [step, setStep] = useState(1);
    
    // Strict View State to prevent looping back to input
    const [viewState, setViewState] = useState<'input' | 'analyzing' | 'results'>('input');
    
    // Analysis Steps State for Visual Feedback
    const [analysisSteps, setAnalysisSteps] = useState([
        { id: 1, text: "Scanner hjemmeside for data", status: 'waiting' },
        { id: 2, text: "Identificerer CVR & Kontaktinfo", status: 'waiting' },
        { id: 3, text: "Krydstjekker via CVR-register / Proff.dk", status: 'waiting' },
        { id: 4, text: "Genererer virksomhedsprofil", status: 'waiting' }
    ]);
    
    const [data, setData] = useState<OnboardingData>({
        companyName: '',
        website: '',
        industry: '',
        description: '',
        // Enhanced Data
        cvr: '',
        foundingYear: '',
        address: '',
        serviceArea: '',
        servicesList: [],
        openingHours: '',
        
        assistantName: '',
        tone: 'professional',
        notifications: {
            sms: true,
            email: true,
            phoneNumber: '',
            emailAddress: ''
        }
    });

    // The Twilio number that this tenant should forward to.
    // We either load an existing one or provision a new one
    // when onboarding is completed.
    const [twilioNumber, setTwilioNumber] = useState<string | null>(null);
    const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
    const [saveError, setSaveError] = useState<string | null>(null);

    // Preload any existing settings so onboarding "remembers" what was entered
    useEffect(() => {
        const loadInitialSettings = async () => {
            try {
                const [meRes, settingsRes] = await Promise.all([
                    fetch(`${API_BASE}/api/auth/me`, {
                        credentials: 'include',
                    }).catch(() => null),
                    fetch(`${API_BASE}/api/settings`, {
                        credentials: 'include',
                    }).catch(() => null),
                ]);

                if (!meRes && !settingsRes) return;

                const meJson = meRes && meRes.ok ? await meRes.json().catch(() => null) : null;
                const settingsJson = settingsRes && settingsRes.ok ? await settingsRes.json().catch(() => null) : null;

                const existingCompany = settingsJson?.settings?.company;
                const existingNotifications = settingsJson?.settings?.notifications;
                const currentUser = meJson?.user;
                const existingPhoneNumbers = settingsJson?.settings?.phoneNumbers || [];

                // If we already have a Twilio number, remember it so we
                // can show the correct forwarding code on the final step.
                if (existingPhoneNumbers.length > 0) {
                    const primary = existingPhoneNumbers[0];
                    if (primary?.phone_number) {
                        setTwilioNumber(primary.phone_number);
                    }
                }

                setData(prev => {
                    let next = { ...prev };

                    // Prefer saved company settings; otherwise fall back to customer name
                    const companyNameFromSettings = existingCompany?.company_name;
                    const companyNameFromCustomer = currentUser?.customer?.name;
                    if (!next.companyName && (companyNameFromSettings || companyNameFromCustomer)) {
                        next.companyName = companyNameFromSettings || companyNameFromCustomer;
                    }

                    // Pre-fill website if we already have it in settings
                    if (!next.website && existingCompany?.website) {
                        next.website = existingCompany.website;
                    }

                    // Pre-fill notification preferences (SMS + email) from existing settings / user
                    const smsPhoneFromSettings = existingNotifications?.sms_phone;
                    const emailFromSettings = existingNotifications?.email;
                    const emailFromUser = currentUser?.email;

                    next.notifications = {
                        ...next.notifications,
                        sms: existingNotifications?.sms_enabled ?? next.notifications.sms,
                        email: existingNotifications?.email_enabled ?? next.notifications.email,
                        phoneNumber: next.notifications.phoneNumber || smsPhoneFromSettings || '',
                        emailAddress: next.notifications.emailAddress || emailFromSettings || emailFromUser || '',
                    };

                    return next;
                });
            } catch (err) {
                console.error('Failed to preload onboarding settings', err);
            }
        };

        loadInitialSettings();
    }, []);

    const updateStepStatus = (id: number, status: 'active' | 'done') => {
        setAnalysisSteps(prev => prev.map(s => s.id === id ? { ...s, status } : s));
    };

    const handleAnalyze = async () => {
        if (!data.companyName) return;
        trackEvent('onboarding_analysis_started');
        
        setViewState('analyzing');

        // Sequence of simulated analysis
        updateStepStatus(1, 'active');
        await new Promise(r => setTimeout(r, 1500)); // Website scan
        updateStepStatus(1, 'done');

        updateStepStatus(2, 'active');
        await new Promise(r => setTimeout(r, 1000)); // CVR ID
        updateStepStatus(2, 'done');

        updateStepStatus(3, 'active'); // External Verify start
        
        // Trigger AI Call during step 3 to optimize time
        const resultPromise = analyzeCompanyInfo(data.companyName, data.website);
        
        await new Promise(r => setTimeout(r, 1500)); // Simulating Proff lookup time
        updateStepStatus(3, 'done');

        updateStepStatus(4, 'active');
        const result = await resultPromise;
        updateStepStatus(4, 'done');

        setData(prev => ({
            ...prev,
            companyName: result.officialName || prev.companyName,
            cvr: result.cvr || '',
            foundingYear: result.foundingYear || '',
            address: result.address || '',
            serviceArea: result.serviceArea || '',
            servicesList: result.services || [],
            openingHours: result.openingHours || 'Man-Fre: 08-16',
            description: result.description || 'Ingen beskrivelse fundet.',
            industry: result.industry
        }));

        setViewState('results');
        trackEvent('onboarding_analysis_completed');
    };

    const buildDraftPayload = () => {
        const rawWebsite = data.website?.trim() || '';
        const website =
            !rawWebsite
                ? ''
                : rawWebsite.startsWith('http://') || rawWebsite.startsWith('https://')
                    ? rawWebsite
                    : `https://${rawWebsite}`;

        const company = {
            companyName: data.companyName || 'Min virksomhed',
            website,
            industry: data.industry || undefined,
            address: data.address || undefined,
        };

        const servicesText = (data.servicesList || []).join(', ');
        const opening = data.openingHours || 'Man-fre 08-16';
        const description = data.description || 'Ingen specifik beskrivelse angivet.';

        const systemPrompt = [
            `Du er en AI-receptionist for virksomheden "${data.companyName || 'kunden'}".`,
            description && `Virksomhedsbeskrivelse: ${description}`,
            servicesText && `Ydelser / services: ${servicesText}.`,
            data.address && `Adresse: ${data.address}.`,
            data.serviceArea && `Dækningsområde: ${data.serviceArea}.`,
            `Åbningstider: ${opening}.`,
            data.assistantName && `Du præsenterer dig som "${data.assistantName}".`,
            'Svar altid på dansk, vær hjælpsom og kvalificér kundeemner ved at stille opklarende spørgsmål.',
        ]
            .filter(Boolean)
            .join(' ');

        const ai = {
            systemPrompt,
            responseTone: (data.tone as any) || 'professional',
            language: 'da',
            autoResponseEnabled: true,
            autoResponseDelaySeconds: 30,
            workingHoursOnly: true,
            fallbackMessage:
                'Tak for din henvendelse. Vi vender tilbage hurtigst muligt med et konkret svar.',
        };

        const notifications = {
            emailEnabled: !!data.notifications.email,
            emailNewLead: true,
            emailNewMessage: false,
            emailDailyDigest: true,
            emailWeeklyReport: true,
            smsEnabled: !!data.notifications.sms,
            smsPhone: data.notifications.phoneNumber || '',
            smsNewLead: true,
            smsNewMessage: false,
            digestType: 'daily' as const,
            digestTime: '09:00',
        };

        return { company, ai, notifications };
    };

    // Persist current onboarding configuration as a draft from step 1 onward.
    const saveSettings = async () => {
        setSaveState('saving');
        setSaveError(null);
        const res = await fetch(`${API_BASE}/api/onboarding/draft`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify(buildDraftPayload()),
        });

        if (!res.ok) {
            const body = await res.json().catch(() => ({}));
            throw new Error(body?.error || 'Kunne ikke gemme onboarding');
        }
        setSaveState('saved');
    };

    useEffect(() => {
        if (step < 1) return;
        const timer = window.setTimeout(async () => {
            try {
                await saveSettings();
            } catch (err) {
                console.error('Autosave failed', err);
                setSaveState('error');
                setSaveError('Autosave fejlede. Prøv igen.');
            }
        }, 800);

        return () => window.clearTimeout(timer);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [
        data.companyName,
        data.website,
        data.industry,
        data.description,
        data.address,
        data.serviceArea,
        data.openingHours,
        data.assistantName,
        data.tone,
        data.notifications.sms,
        data.notifications.email,
        data.notifications.phoneNumber,
        data.notifications.emailAddress,
        step,
        viewState,
    ]);

    const handleNext = async () => {
        if (step === 3) {
            try {
                await saveSettings();
            } catch (err) {
                console.error('Error saving onboarding settings', err);
                setSaveState('error');
                setSaveError('Der opstod en fejl ved gemning. Du kan fortsætte, men ændringer kan mangle.');
            }
        }

        if (step < 4) {
            setStep(prev => prev + 1);
            trackEvent('onboarding_step_completed', { step });
        }
    };

    const renderStep1 = () => (
        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="text-center mb-8">
                <div className="w-16 h-16 bg-blue-50 rounded-2xl flex items-center justify-center mx-auto mb-4 text-blue-600">
                    <Building2 className="w-8 h-8" />
                </div>
                <h2 className="text-2xl font-bold text-slate-900">Virksomhedsprofil</h2>
                <p className="text-slate-500">Vi analyserer din virksomhed for at træne AI'en automatisk.</p>
            </div>
            
            <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm space-y-4">
                
                {/* INPUT VIEW */}
                {viewState === 'input' && (
                    <>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wide mb-2">Virksomhedsnavn</label>
                                <div className="relative">
                                    <input 
                                        type="text" 
                                        className="w-full h-12 pl-10 pr-4 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                                        placeholder="Tømrer Hansen ApS"
                                        value={data.companyName}
                                        onChange={e => setData({...data, companyName: e.target.value})}
                                    />
                                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                                </div>
                            </div>
                            <div>
                                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wide mb-2">Hjemmeside (Valgfri)</label>
                                <div className="relative">
                                    <input 
                                        type="text" 
                                        className="w-full h-12 pl-10 pr-4 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                                        placeholder="www.hansen.dk"
                                        value={data.website}
                                        onChange={e => setData({...data, website: e.target.value})}
                                    />
                                    <Globe className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                                </div>
                            </div>
                        </div>
                        <button 
                            onClick={handleAnalyze}
                            disabled={!data.companyName}
                            className="w-full h-12 bg-slate-900 text-white font-medium rounded-xl hover:bg-slate-800 transition-all flex items-center justify-center gap-2 disabled:opacity-70 mt-2"
                        >
                            <Sparkles className="w-4 h-4" />
                            Hent info & Træn AI
                        </button>
                    </>
                )}

                {/* ANALYZING VIEW */}
                {viewState === 'analyzing' && (
                    <div className="bg-slate-50 rounded-xl p-6 border border-slate-100">
                        <div className="space-y-4">
                            {analysisSteps.map((step) => (
                                <div key={step.id} className="flex items-center justify-between">
                                    <div className="flex items-center gap-3">
                                        <div className={`w-6 h-6 rounded-full flex items-center justify-center transition-colors ${step.status === 'done' ? 'bg-green-500 text-white' : (step.status === 'active' ? 'bg-blue-100 text-blue-600' : 'bg-slate-200 text-slate-400')}`}>
                                            {step.status === 'done' ? <CheckCircle2 className="w-4 h-4" /> : (step.status === 'active' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <div className="w-2 h-2 rounded-full bg-slate-400" />)}
                                        </div>
                                        <span className={`text-sm font-medium ${step.status === 'active' ? 'text-blue-600' : (step.status === 'done' ? 'text-slate-700' : 'text-slate-400')}`}>
                                            {step.text}
                                        </span>
                                    </div>
                                    {step.status === 'done' && <span className="text-xs font-bold text-green-600 bg-green-50 px-2 py-1 rounded">OK</span>}
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {/* RESULTS VIEW - FULLY EDITABLE */}
                {viewState === 'results' && (
                    <div className="bg-slate-50 rounded-xl p-6 border border-slate-100 animate-in fade-in zoom-in duration-300">
                        {/* Corporate Header */}
                        <div className="flex flex-col md:flex-row md:items-start justify-between mb-6 pb-6 border-b border-slate-200 gap-4">
                            <div className="flex-1 w-full">
                                <div className="relative group">
                                    <input 
                                        type="text" 
                                        value={data.companyName}
                                        onChange={e => setData({...data, companyName: e.target.value})}
                                        className="font-bold text-xl text-slate-900 bg-transparent border-b border-transparent hover:border-slate-300 focus:border-blue-500 focus:outline-none w-full transition-colors pb-1"
                                    />
                                    <Pencil className="w-3 h-3 text-slate-400 absolute top-1.5 right-0 opacity-0 group-hover:opacity-100 transition-opacity" />
                                </div>
                                <div className="flex items-center gap-4 mt-2">
                                    <div className="flex items-center gap-2 text-sm text-slate-500">
                                        <BadgeCheck className="w-4 h-4 text-blue-500 fill-blue-50" /> 
                                        Verificeret
                                    </div>
                                    {data.website && (
                                        <div className="flex items-center gap-1 text-sm text-slate-500">
                                            <Globe className="w-3.5 h-3.5" />
                                            <a href={data.website.startsWith('http') ? data.website : `https://${data.website}`} target="_blank" rel="noopener noreferrer" className="hover:text-blue-600 hover:underline flex items-center gap-0.5">
                                                {data.website} <ExternalLink className="w-3 h-3" />
                                            </a>
                                        </div>
                                    )}
                                </div>
                            </div>
                            
                            <div className="w-full md:w-auto bg-white border border-slate-200 p-2 rounded-lg shadow-sm">
                                <label className="block text-[10px] text-slate-400 font-bold uppercase tracking-wider mb-1">CVR Nummer</label>
                                <input 
                                    type="text" 
                                    value={data.cvr}
                                    placeholder="Indtast CVR"
                                    onChange={e => setData({...data, cvr: e.target.value})}
                                    className="font-mono font-medium text-slate-700 bg-transparent outline-none w-full text-sm placeholder:text-slate-300"
                                />
                            </div>
                        </div>

                        {/* Editable Key Metrics Grid */}
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                            <div className="bg-white p-3 rounded-xl border border-slate-100 shadow-sm focus-within:ring-2 focus-within:ring-blue-100 transition-all">
                                <label className="flex items-center gap-2 mb-1 text-slate-400 text-[10px] font-bold uppercase tracking-wide">
                                    <Calendar className="w-3.5 h-3.5" /> Etableret
                                </label>
                                <input 
                                    type="text"
                                    value={data.foundingYear}
                                    onChange={e => setData({...data, foundingYear: e.target.value})}
                                    placeholder="Årstal"
                                    className="text-sm font-semibold text-slate-900 w-full outline-none bg-transparent"
                                />
                            </div>
                            
                            <div className="bg-white p-3 rounded-xl border border-slate-100 shadow-sm md:col-span-2 focus-within:ring-2 focus-within:ring-blue-100 transition-all">
                                <div className="flex flex-col h-full justify-between">
                                    <div className="flex gap-4 mb-1">
                                        <label className="flex items-center gap-2 text-slate-400 text-[10px] font-bold uppercase tracking-wide w-1/2">
                                            <MapPin className="w-3.5 h-3.5" /> Adresse
                                        </label>
                                        <label className="flex items-center gap-2 text-slate-400 text-[10px] font-bold uppercase tracking-wide w-1/2">
                                            <Map className="w-3.5 h-3.5" /> Dækning
                                        </label>
                                    </div>
                                    <div className="flex gap-4">
                                        <input 
                                            type="text"
                                            value={data.address}
                                            onChange={e => setData({...data, address: e.target.value})}
                                            placeholder="Adresse"
                                            className="text-sm font-semibold text-slate-900 w-1/2 outline-none bg-transparent"
                                        />
                                        <div className="w-px bg-slate-100"></div>
                                        <input 
                                            type="text"
                                            value={data.serviceArea}
                                            onChange={e => setData({...data, serviceArea: e.target.value})}
                                            placeholder="Område"
                                            className="text-sm font-semibold text-blue-600 w-1/2 outline-none bg-transparent"
                                        />
                                    </div>
                                </div>
                            </div>
                            
                            <div className="bg-white p-3 rounded-xl border border-slate-100 shadow-sm focus-within:ring-2 focus-within:ring-blue-100 transition-all">
                                <label className="flex items-center gap-2 mb-1 text-slate-400 text-[10px] font-bold uppercase tracking-wide">
                                    <Clock className="w-3.5 h-3.5" /> Åbent
                                </label>
                                <input 
                                    type="text"
                                    value={data.openingHours?.split(',')[0]}
                                    onChange={e => setData({...data, openingHours: e.target.value})}
                                    placeholder="08:00 - 16:00"
                                    className="text-sm font-semibold text-slate-900 w-full outline-none bg-transparent"
                                />
                            </div>
                        </div>

                        {/* Service Cloud */}
                        <div className="mb-6 bg-slate-50/50 p-4 rounded-xl border border-slate-100">
                             <div className="flex items-center justify-between mb-3">
                                <span className="text-xs font-bold text-slate-500 uppercase tracking-wide flex items-center gap-1">
                                    <FileText className="w-3.5 h-3.5" /> Identificerede Services
                                </span>
                                <span className="text-[10px] bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full font-bold">
                                    {data.servicesList?.length || 0} fundet
                                </span>
                             </div>
                             <div className="flex flex-wrap gap-2 max-h-[200px] overflow-y-auto pr-1">
                                 {data.servicesList && data.servicesList.map((srv, i) => (
                                     <span key={i} className="px-3 py-1.5 bg-white text-slate-700 text-xs font-semibold rounded-lg border border-slate-200 shadow-sm hover:border-blue-300 transition-colors cursor-default group relative">
                                         {srv}
                                         <button 
                                            onClick={() => setData(prev => ({...prev, servicesList: prev.servicesList?.filter((_, idx) => idx !== i)}))}
                                            className="absolute -top-1 -right-1 bg-red-500 text-white rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
                                         >
                                             <svg className="w-2 h-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path></svg>
                                         </button>
                                     </span>
                                 ))}
                                 <button 
                                    className="px-3 py-1.5 bg-white border border-dashed border-slate-300 text-slate-400 text-xs font-semibold rounded-lg hover:border-blue-400 hover:text-blue-500 transition-colors flex items-center gap-1"
                                    onClick={() => {
                                        const newService = prompt("Tilføj service:");
                                        if (newService) setData(prev => ({...prev, servicesList: [...(prev.servicesList || []), newService]}));
                                    }}
                                 >
                                     + Tilføj
                                 </button>
                             </div>
                        </div>

                        {/* Description Area */}
                        <div>
                            <div className="flex justify-between items-center mb-2">
                                <span className="text-xs font-bold text-slate-500 uppercase tracking-wide">
                                    AI Profil Beskrivelse
                                </span>
                                <div className="flex items-center gap-1 text-[10px] text-green-600 font-bold bg-green-50 px-2 py-1 rounded-full border border-green-100">
                                    <Database className="w-3 h-3" /> Data synkroniseret
                                </div>
                            </div>
                            <textarea 
                                className="w-full h-32 p-4 bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none transition-all resize-none text-sm leading-relaxed text-slate-600 shadow-sm"
                                value={data.description}
                                onChange={e => setData({...data, description: e.target.value})}
                            ></textarea>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );

    const renderStep2 = () => (
        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="text-center mb-8">
                <div className="w-16 h-16 bg-purple-50 rounded-2xl flex items-center justify-center mx-auto mb-4 text-purple-600">
                    <Bot className="w-8 h-8" />
                </div>
                <h2 className="text-2xl font-bold text-slate-900">Design din AI-Assistent</h2>
                <p className="text-slate-500">Vælg personlighed og toneleje.</p>
            </div>

            <div className="space-y-6">
                <div>
                    <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wide mb-2">Navngiv din assistent</label>
                    <input 
                        type="text" 
                        className="w-full h-14 px-4 bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none transition-all text-lg"
                        placeholder="F.eks. Camilla"
                        value={data.assistantName}
                        onChange={e => setData({...data, assistantName: e.target.value})}
                    />
                </div>
                
                <div>
                    <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wide mb-3">Tone of Voice</label>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        {[
                            { id: 'professional', title: 'Formel', desc: 'Høflig, "De/Dem", kortfattet.', color: 'blue' },
                            { id: 'friendly', title: 'Venlig', desc: 'Smilende, "Du", hjælpsom.', color: 'green' },
                            { id: 'casual', title: 'Frisk', desc: 'Kæk, emojies, uformel.', color: 'purple' }
                        ].map((tone) => (
                            <button 
                                key={tone.id}
                                onClick={() => setData({...data, tone: tone.id as any})}
                                className={`relative p-4 rounded-2xl border-2 text-left transition-all duration-200 ${data.tone === tone.id ? `border-${tone.color}-500 bg-${tone.color}-50` : 'border-slate-100 bg-white hover:border-slate-200'}`}
                            >
                                {data.tone === tone.id && (
                                    <div className={`absolute -top-2 -right-2 bg-${tone.color}-500 text-white p-1 rounded-full shadow-sm`}>
                                        <CheckCircle2 className="w-3 h-3" />
                                    </div>
                                )}
                                <span className={`block font-bold text-slate-900 mb-1`}>{tone.title}</span>
                                <span className="text-xs text-slate-500 leading-snug block">{tone.desc}</span>
                            </button>
                        ))}
                    </div>
                </div>

                <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 mt-4">
                    <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Eksempel på svar</p>
                    <div className="bg-white p-3 rounded-lg shadow-sm border border-slate-100 text-sm text-slate-600 italic">
                        "{data.tone === 'professional' ? 'Goddag. Tak for din henvendelse til Tømrer Hansen. Jeg skal bede om...' : 
                          data.tone === 'friendly' ? 'Hej! 👋 Tak fordi du ringer. Jeg vil rigtig gerne hjælpe dig med...' : 
                          'Halløj! Fedt du rækker ud. Hvad kan vi fikse for dig i dag? 🔨'}"
                    </div>
                </div>
            </div>
        </div>
    );

    const renderStep3 = () => (
        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="text-center mb-8">
                <div className="w-16 h-16 bg-amber-50 rounded-2xl flex items-center justify-center mx-auto mb-4 text-amber-600">
                    <Bell className="w-8 h-8" />
                </div>
                <h2 className="text-2xl font-bold text-slate-900">Notifikationer</h2>
                <p className="text-slate-500">Hvordan vil du have besked om nye kundeemner?</p>
            </div>

            <div className="space-y-4">
                {/* SMS Toggle */}
                <div className={`p-5 rounded-2xl border-2 transition-all cursor-pointer ${data.notifications.sms ? 'border-black bg-slate-50' : 'border-slate-100 bg-white'}`}
                     onClick={() => setData(prev => ({...prev, notifications: {...prev.notifications, sms: !prev.notifications.sms}}))}>
                    <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-3">
                            <div className="bg-white p-2 rounded-lg border border-slate-200 shadow-sm"><MessageSquare className="w-5 h-5" /></div>
                            <span className="font-bold text-slate-900">SMS Notifikation</span>
                        </div>
                        <div className={`w-6 h-6 rounded-full border flex items-center justify-center transition-colors ${data.notifications.sms ? 'bg-black border-black text-white' : 'border-slate-300 bg-white'}`}>
                            {data.notifications.sms && <CheckCircle2 className="w-4 h-4" />}
                        </div>
                    </div>
                    {data.notifications.sms && (
                        <div className="mt-4 pt-4 border-t border-slate-200 animate-in slide-in-from-top-2">
                             <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wide mb-2">Mobilnummer</label>
                             <input 
                                type="tel" 
                                className="w-full h-10 px-3 bg-white border border-slate-200 rounded-lg focus:ring-1 focus:ring-black outline-none"
                                placeholder="20 30 40 50"
                                value={data.notifications.phoneNumber}
                                onClick={(e) => e.stopPropagation()}
                                onChange={(e) => setData({...data, notifications: {...data.notifications, phoneNumber: e.target.value}})}
                            />
                        </div>
                    )}
                </div>

                {/* Email Toggle */}
                <div className={`p-5 rounded-2xl border-2 transition-all cursor-pointer ${data.notifications.email ? 'border-black bg-slate-50' : 'border-slate-100 bg-white'}`}
                     onClick={() => setData(prev => ({...prev, notifications: {...prev.notifications, email: !prev.notifications.email}}))}>
                    <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-3">
                            <div className="bg-white p-2 rounded-lg border border-slate-200 shadow-sm"><Mail className="w-5 h-5" /></div>
                            <span className="font-bold text-slate-900">Email Resume</span>
                        </div>
                        <div className={`w-6 h-6 rounded-full border flex items-center justify-center transition-colors ${data.notifications.email ? 'bg-black border-black text-white' : 'border-slate-300 bg-white'}`}>
                            {data.notifications.email && <CheckCircle2 className="w-4 h-4" />}
                        </div>
                    </div>
                    {data.notifications.email && (
                        <div className="mt-4 pt-4 border-t border-slate-200 animate-in slide-in-from-top-2">
                             <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wide mb-2">Email adresse</label>
                             <input 
                                type="email" 
                                className="w-full h-10 px-3 bg-white border border-slate-200 rounded-lg focus:ring-1 focus:ring-black outline-none"
                                placeholder="mester@firma.dk"
                                value={data.notifications.emailAddress}
                                onClick={(e) => e.stopPropagation()}
                                onChange={(e) => setData({...data, notifications: {...data.notifications, emailAddress: e.target.value}})}
                            />
                        </div>
                    )}
                </div>
            </div>

            {saveError && (
                <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                    {saveError}
                </div>
            )}
        </div>
    );

    const handleComplete = async () => {
        // When onboarding finishes, ensure settings are persisted so
        // the dashboard "Konfigurer" views are already pre-filled.
        try {
            await saveSettings();
            trackEvent('onboarding_completed');
        } catch (err) {
            console.error('Onboarding settings save failed', err);
            // We still allow the user to proceed to dashboard even if
            // part of the onboarding persistence fails.
        } finally {
            onComplete();
        }
    };

    const renderStep4 = () => {
        const hasPhoneNumber = !!twilioNumber;

        return (
        <div className="text-center space-y-6 animate-in fade-in zoom-in duration-500">
             <div className="w-24 h-24 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-6 text-green-600 shadow-xl shadow-green-100/50 relative">
                 <CheckCircle2 className="w-12 h-12" />
                 <div className="absolute inset-0 bg-green-400 rounded-full opacity-20 animate-ping"></div>
             </div>
             <div>
                <h2 className="text-3xl font-bold text-slate-900 mb-2">
                    {hasPhoneNumber ? 'Tillykke! Alt er klar.' : 'Tillykke! Din AI er under træning.'}
                </h2>
                <p className="text-slate-500 max-w-md mx-auto">
                    {hasPhoneNumber
                        ? `${data.assistantName || 'Din AI-assistent'} er nu trænet på din hjemmeside og klar til at tage imod opkald.`
                        : 'Din betaling er gennemført, og vi er nu i gang med at træne din AI-receptionist på dine virksomhedsdata. Inden for 48 timer får du besked, når alt er klar til brug.'}
                </p>
             </div>

            {hasPhoneNumber ? (
                <div className="bg-slate-900 text-white p-6 rounded-2xl shadow-xl max-w-sm mx-auto my-8 relative overflow-hidden">
                     <div className="absolute top-0 right-0 w-32 h-32 bg-blue-600 rounded-full blur-[50px] opacity-20"></div>
                     <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">Aktiver viderestilling nu</p>
                     <div className="flex items-center justify-center gap-3 bg-white/10 p-4 rounded-xl border border-white/10">
                        <Smartphone className="w-6 h-6 text-blue-400" />
                        <span className="text-2xl font-mono font-bold tracking-wider">
                            {/* Forwarding code to the tenant's Twilio number.
                               We strip the leading + for the GSM service code. */}
                            {`**61*${(twilioNumber || '').replace(/^\+/, '')}#`}
                        </span>
                     </div>
                     <p className="text-xs text-slate-400 mt-3">Tast koden på din mobil og ring op for at aktivere.</p>
                 </div>
            ) : (
                <div className="bg-slate-900 text-white p-6 rounded-2xl shadow-xl max-w-sm mx-auto my-8 relative overflow-hidden">
                    <div className="absolute -top-10 -right-10 w-40 h-40 bg-emerald-500 rounded-full blur-[60px] opacity-30"></div>
                    <div className="flex items-center gap-3 mb-4">
                        <div className="w-10 h-10 rounded-2xl bg-white/10 flex items-center justify-center border border-white/10">
                            <Bot className="w-5 h-5 text-emerald-300" />
                        </div>
                        <div className="text-left">
                            <p className="text-xs font-bold text-emerald-200 uppercase tracking-wider">AI trænes nu</p>
                            <p className="text-sm text-slate-100">Vi finjusterer svar, flows og kvalificering.</p>
                        </div>
                    </div>
                    <ul className="space-y-2 text-sm text-slate-100/90 text-left">
                        <li className="flex items-start gap-2">
                            <CheckCircle2 className="w-4 h-4 text-emerald-300 mt-0.5" />
                            <span>Din virksomhedsprofil og onboarding-data bruges til at træne en skræddersyet AI-receptionist.</span>
                        </li>
                        <li className="flex items-start gap-2">
                            <CheckCircle2 className="w-4 h-4 text-emerald-300 mt-0.5" />
                            <span>Vi tildeler et dedikeret telefonnummer til din konto og tester, at alt fungerer.</span>
                        </li>
                        <li className="flex items-start gap-2">
                            <CheckCircle2 className="w-4 h-4 text-emerald-300 mt-0.5" />
                            <span>Du får besked pr. mail og/eller SMS, så snart viderestillingen er klar til at blive aktiveret.</span>
                        </li>
                    </ul>
                    <p className="text-xs text-slate-300 mt-4 text-left">
                        Typisk går der under 48 timer. Har du spørgsmål, er du altid velkommen til at kontakte os.
                    </p>
                </div>
            )}

             <button 
                onClick={handleComplete}
                className="text-slate-500 hover:text-slate-900 font-medium text-sm flex items-center justify-center gap-1 mx-auto group cursor-pointer"
             >
                Gå til dashboard <ChevronRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
             </button>
        </div>
        );
    };

    return (
        <div className="fixed inset-0 z-[200] bg-[#FAFAFA] flex flex-col">
            {/* Header */}
            <div className="h-20 border-b border-slate-100 bg-white flex items-center justify-between px-8 shrink-0">
                <div className="flex items-center gap-3">
                    <div className="w-8 h-8 bg-black rounded-lg flex items-center justify-center text-white text-sm font-bold shadow-lg">R</div>
                    <span className="font-bold text-slate-900">Replypilot</span>
                </div>
                <div className="flex items-center gap-4">
                    <div className="text-xs text-slate-500">
                        {saveState === 'saving' ? 'Gemmer...' : saveState === 'saved' ? 'Gemt' : saveState === 'error' ? 'Ikke gemt' : ''}
                    </div>
                    <div className="hidden md:flex items-center gap-2">
                        <span className={`w-2 h-2 rounded-full ${step >= 1 ? 'bg-blue-600' : 'bg-slate-200'}`}></span>
                        <span className={`w-2 h-2 rounded-full ${step >= 2 ? 'bg-blue-600' : 'bg-slate-200'}`}></span>
                        <span className={`w-2 h-2 rounded-full ${step >= 3 ? 'bg-blue-600' : 'bg-slate-200'}`}></span>
                        <span className={`w-2 h-2 rounded-full ${step >= 4 ? 'bg-green-500' : 'bg-slate-200'}`}></span>
                    </div>
                    <div className="text-sm font-medium text-slate-500 bg-slate-100 px-3 py-1 rounded-full">
                        Trin {step} af 4
                    </div>
                </div>
            </div>

            {/* Progress Line */}
            <div className="w-full h-1 bg-slate-100 shrink-0">
                <div 
                    className="h-full bg-blue-600 transition-all duration-700 ease-out" 
                    style={{ width: `${(step / 4) * 100}%` }}
                ></div>
            </div>

            {/* Main Content */}
            <div className="flex-1 flex items-center justify-center p-6 overflow-y-auto">
                <div className="w-full max-w-2xl">
                    {step === 1 && renderStep1()}
                    {step === 2 && renderStep2()}
                    {step === 3 && renderStep3()}
                    {step === 4 && renderStep4()}

                    {step < 4 && (
                        <div className="mt-10 flex justify-end pt-6 border-t border-slate-100">
                            <button 
                                onClick={handleNext}
                                disabled={
                                    (step === 1 && viewState !== 'results') ||
                                    (step === 2 && !data.assistantName) ||
                                    (step === 3 && (!data.notifications.sms && !data.notifications.email))
                                }
                                className="bg-black text-white px-8 py-4 rounded-xl font-bold flex items-center gap-2 hover:bg-slate-800 transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-xl shadow-slate-200 hover:-translate-y-1"
                            >
                                {step === 3
                                    ? 'Afslut opsætning'
                                    : 'Næste trin'}
                                <ChevronRight className="w-5 h-5" />
                            </button>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};