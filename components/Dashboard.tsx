import React, { useState, useEffect } from 'react';
import { Phone, Clock, TrendingUp, Settings, LogOut, MessageSquare, User, Calendar, Mail, MapPin, X, ChevronRight as ChevronRightIcon } from 'lucide-react';

interface DashboardProps {
    onLogout: () => void;
}

export const Dashboard: React.FC<DashboardProps> = ({ onLogout }) => {
    const [selectedLead, setSelectedLead] = useState<any>(null);
    const [companySettings, setCompanySettings] = useState<any | null>(null);
    const [aiSettings, setAiSettings] = useState<any | null>(null);
    const [smsSettings, setSmsSettings] = useState<any | null>(null);
    const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);
    const [smsProvider, setSmsProvider] = useState<'twilio' | 'fonecloud'>('twilio');
    const [fonecloudSenderId, setFonecloudSenderId] = useState<string>('');

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
                }
            } catch (err) {
                console.warn('Kunne ikke hente indstillinger', err);
            }
        };
        fetchSettings();
    }, []);

    const openSettingsModal = () => {
        setSmsProvider((smsSettings?.provider as 'twilio' | 'fonecloud') || 'twilio');
        setFonecloudSenderId(smsSettings?.fonecloud_sender_id || '');
        setIsSettingsModalOpen(true);
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
                        fonecloud_sender_id: fonecloudSenderId || null,
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

    const leads = [
        { name: "Morten Jensen", time: "10:42", topic: "Nyt tag", msg: "Spørger til pris på tagrenovering af 140m2 hus...", email: "morten@mail.dk", phone: "20 30 40 50", address: "Hovedgaden 12, 4000 Roskilde" },
        { name: "Lone Svendsen", time: "09:15", topic: "Tilbygning", msg: "Vil gerne have et tilbud på en udestue til sommerhuset.", email: "lone@mail.dk", phone: "21 31 41 51", address: "Strandvejen 4, 3000 Helsingør" },
        { name: "Anders Møller", time: "I går", topic: "Renovering", msg: "Har brug for hjælp til nyt badeværelse hurtigst muligt.", email: "anders@mail.dk", phone: "22 32 42 52", address: "Vesterbro 8, 5000 Odense" },
        { name: "Peter Hansen", time: "I går", topic: "Service", msg: "Spørger om I kører ud til Roskilde området?", email: "peter@mail.dk", phone: "23 33 43 53", address: "Ringvejen 2, 4600 Køge" },
    ];

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
                           <button className="px-4 py-1.5 text-sm font-semibold text-slate-900 bg-white rounded-md shadow-sm border border-slate-200/50">Oversigt</button>
                           <button className="px-4 py-1.5 text-sm font-medium text-slate-500 hover:text-slate-900 hover:bg-slate-200/50 rounded-md transition-all">Kunder</button>
                           <button className="px-4 py-1.5 text-sm font-medium text-slate-500 hover:text-slate-900 hover:bg-slate-200/50 rounded-md transition-all">Indstillinger</button>
                       </div>
                   </div>

                   <button onClick={onLogout} className="text-sm font-medium text-slate-500 hover:text-black flex items-center gap-2 transition-colors">
                       <LogOut className="w-4 h-4" /> Log ud
                   </button>
               </div>
           </nav>

           <div className="pt-24 pb-12 px-6 max-w-7xl mx-auto">
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
                           <button className="text-sm text-blue-600 font-medium hover:text-blue-700 hover:underline">Se alle</button>
                       </div>
                       <div className="divide-y divide-slate-50">
                           {leads.map((lead, i) => (
                               <button 
                                    key={i} 
                                    onClick={() => setSelectedLead(lead)}
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
                                <h3 className="font-bold text-lg mb-1">Digital Receptionist</h3>
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
                                    className="w-full mt-6 py-3 bg-white/10 hover:bg-white/20 rounded-xl font-medium transition-colors text-sm backdrop-blur-sm border border-white/10 flex items-center justify-center gap-2"
                                    onClick={openSettingsModal}
                                >
                                    <Settings className="w-4 h-4" /> Konfigurer
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
                                <button className="text-xs font-bold text-blue-600 hover:text-blue-700">Synkroniser Kalender</button>
                            </div>
                        </div>
                   </div>
               </div>
           </div>

          {/* Lead Detail Modal */}
           {selectedLead && (
               <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
                   <div 
                        className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm transition-opacity" 
                        onClick={() => setSelectedLead(null)}
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
                           <button onClick={() => setSelectedLead(null)} className="p-2 bg-white hover:bg-slate-100 rounded-full text-slate-400 hover:text-slate-600 transition-colors shadow-sm border border-slate-200">
                               <X className="w-4 h-4" />
                           </button>
                       </div>
                       
                       {/* Content */}
                       <div className="p-6 space-y-6">
                           <div className="flex gap-3">
                               <button className="flex-1 py-3 bg-slate-900 text-white rounded-xl font-bold text-sm flex items-center justify-center gap-2 hover:bg-slate-800 shadow-lg shadow-slate-200 transition-all active:scale-95">
                                   <Phone className="w-4 h-4" /> Ring op
                               </button>
                               <button className="flex-1 py-3 bg-white border border-slate-200 text-slate-900 rounded-xl font-bold text-sm flex items-center justify-center gap-2 hover:bg-slate-50 hover:border-slate-300 transition-all active:scale-95">
                                   <MessageSquare className="w-4 h-4" /> Send SMS
                               </button>
                           </div>
                           
                           <div className="bg-blue-50/80 p-5 rounded-xl border border-blue-100">
                                <div className="flex items-center gap-2 mb-2">
                                    <span className="px-2 py-0.5 bg-blue-100 text-blue-700 text-[10px] font-bold uppercase tracking-wide rounded-full">{selectedLead.topic}</span>
                                </div>
                                <p className="text-slate-700 text-sm leading-relaxed font-medium">"{selectedLead.msg}"</p>
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
                       </div>
                   </div>
               </div>
           )}
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