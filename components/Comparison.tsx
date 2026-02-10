import React from 'react';
import { PhoneMissed, PhoneForwarded, UserPlus, Check } from 'lucide-react';

export const Comparison: React.FC = () => {
    return (
        <section className="py-32 px-6 bg-white">
            <div className="max-w-7xl mx-auto">
                <div className="text-center mb-20">
                    <h2 className="text-4xl md:text-5xl font-bold text-slate-900 mb-6 tracking-tight">Fortid vs. Fremtid</h2>
                    <p class="text-lg text-slate-500 max-w-2xl mx-auto">Hvorfor nøjes med det næstbedste, når du kan få det hele?</p>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-stretch">
                    
                    {/* Column 1: The Old Ways */}
                    <div className="p-10 rounded-[40px] bg-[#F5F5F7] border border-slate-100 flex flex-col justify-between">
                        <div>
                            <h3 className="text-2xl font-bold text-slate-900 mb-2">Den Gamle Måde</h3>
                            <p class="text-slate-500 mb-10">Dine nuværende alternativer</p>
                            
                            <div className="mb-10 pb-10 border-b border-slate-200/60">
                                <div className="flex items-center gap-3 mb-4">
                                    <div className="w-8 h-8 rounded-full bg-white flex items-center justify-center text-slate-400 shadow-sm"><PhoneMissed className="w-4 h-4" /></div>
                                    <h4 class="font-semibold text-slate-700">Ubesvarede Opkald</h4>
                                </div>
                                <ul className="space-y-4 pl-11">
                                    <li className="text-sm text-slate-500 flex gap-2"><span className="text-red-400 font-bold">×</span> 0 kr. i udgift, men dyrt i tabt omsætning</li>
                                    <li className="text-sm text-slate-500 flex gap-2"><span class="text-red-400 font-bold">×</span> Kunden ringer videre til konkurrenten</li>
                                    <li className="text-sm text-slate-500 flex gap-2"><span class="text-red-400 font-bold">×</span> Du ringer tilbage når kunden har glemt dig</li>
                                </ul>
                            </div>

                            <div className="mb-10 pb-10 border-b border-slate-200/60">
                                <div className="flex items-center gap-3 mb-4">
                                    <div className="w-8 h-8 rounded-full bg-white flex items-center justify-center text-slate-400 shadow-sm"><PhoneForwarded className="w-4 h-4" /></div>
                                    <h4 class="font-semibold text-slate-700">Telefonpasning Bureau</h4>
                                </div>
                                <ul className="space-y-4 pl-11">
                                    <li className="text-sm text-slate-500 flex gap-2"><span className="text-orange-400 font-bold">-</span> Dyr løsning (3.500 - 5.000 kr/md)</li>
                                    <li className="text-sm text-slate-500 flex gap-2"><span class="text-orange-400 font-bold">-</span> Begrænset åbningstid (kun 8-16)</li>
                                    <li className="text-sm text-slate-500 flex gap-2"><span class="text-orange-400 font-bold">-</span> Passiv besked (du skal stadig ringe retur)</li>
                                </ul>
                            </div>

                            <div>
                                <div className="flex items-center gap-3 mb-4">
                                    <div className="w-8 h-8 rounded-full bg-white flex items-center justify-center text-slate-400 shadow-sm"><UserPlus className="w-4 h-4" /></div>
                                    <h4 class="font-semibold text-slate-700">Fastansat Sekretær</h4>
                                </div>
                                <ul className="space-y-4 pl-11">
                                    <li className="text-sm text-slate-500 flex gap-2"><span className="text-red-500 font-bold">-</span> Meget dyr (25.000+ kr/md + pension)</li>
                                    <li className="text-sm text-slate-500 flex gap-2"><span class="text-red-500 font-bold">-</span> Sygedage, feriepenge og barsel</li>
                                    <li className="text-sm text-slate-500 flex gap-2"><span class="text-red-500 font-bold">-</span> Stadig kun på arbejde 37 timer om ugen</li>
                                </ul>
                            </div>
                        </div>
                    </div>

                    {/* Column 2: AutoSvar AI */}
                    <div className="p-10 rounded-[40px] bg-black text-white shadow-2xl relative overflow-hidden flex flex-col justify-center">
                        <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-blue-600/20 rounded-full blur-[100px] -translate-y-1/2 translate-x-1/2 opacity-60"></div>
                        <div className="absolute bottom-0 left-0 w-[300px] h-[300px] bg-indigo-600/10 rounded-full blur-[80px] translate-y-1/2 -translate-x-1/2"></div>
                        
                        <div className="relative z-10 h-full flex flex-col">
                            <div className="flex justify-between items-center mb-2">
                                <h3 className="text-3xl font-bold text-white tracking-tight">AutoSvar AI</h3>
                                <div className="bg-white/10 backdrop-blur-md px-3 py-1 rounded-full border border-white/10">
                                    <span className="text-xs font-bold text-blue-300 uppercase tracking-wider">Anbefalet</span>
                                </div>
                            </div>
                            <p class="text-slate-400 mb-12">Den moderne løsning der betaler sig selv hjem</p>
                            
                            <div className="space-y-8 flex-1">
                                <div className="flex items-start gap-5 group">
                                    <div className="w-10 h-10 rounded-2xl bg-blue-600/20 flex items-center justify-center shrink-0 border border-blue-500/30 group-hover:bg-blue-600/30 transition-colors">
                                        <Check className="w-5 h-5 text-blue-400" />
                                    </div>
                                    <div>
                                        <span className="block text-lg font-bold text-white mb-1">Fast lav pris</span>
                                        <p class="text-sm text-slate-400 leading-relaxed">Kun 1.995 kr/md. Ingen minutpriser. Ingen skjulte gebyrer. Alt inklusivt.</p>
                                    </div>
                                </div>

                                <div className="flex items-start gap-5 group">
                                    <div className="w-10 h-10 rounded-2xl bg-blue-600/20 flex items-center justify-center shrink-0 border border-blue-500/30 group-hover:bg-blue-600/30 transition-colors">
                                        <Check className="w-5 h-5 text-blue-400" />
                                    </div>
                                    <div>
                                        <span className="block text-lg font-bold text-white mb-1">Åbent 24/7/365</span>
                                        <p class="text-sm text-slate-400 leading-relaxed">Vi dækker weekender, aftener, ferier og helligdage. Din butik lukker aldrig.</p>
                                    </div>
                                </div>

                                <div className="flex items-start gap-5 group">
                                    <div className="w-10 h-10 rounded-2xl bg-blue-600/20 flex items-center justify-center shrink-0 border border-blue-500/30 group-hover:bg-blue-600/30 transition-colors">
                                        <Check className="w-5 h-5 text-blue-400" />
                                    </div>
                                    <div>
                                        <span className="block text-lg font-bold text-white mb-1">Svarer på {'<'} 5 sekunder</span>
                                        <p class="text-sm text-slate-400 leading-relaxed">Kunden modtager svar øjeblikkeligt og stopper med at ringe til dine konkurrenter.</p>
                                    </div>
                                </div>

                                <div className="flex items-start gap-5 group">
                                    <div className="w-10 h-10 rounded-2xl bg-blue-600/20 flex items-center justify-center shrink-0 border border-blue-500/30 group-hover:bg-blue-600/30 transition-colors">
                                        <Check className="w-5 h-5 text-blue-400" />
                                    </div>
                                    <div>
                                        <span className="block text-lg font-bold text-white mb-1">Aktiv fastholdelse</span>
                                        <p class="text-sm text-slate-400 leading-relaxed">Vi tager ikke bare imod beskeder. Vi starter en dialog, svarer på spørgsmål og booker aftalen.</p>
                                    </div>
                                </div>
                            </div>
                            
                            <div className="mt-10 pt-8 border-t border-white/10">
                                <p class="text-center text-sm font-medium text-slate-300">"Det er som at have en sælger på arbejde døgnet rundt."</p>
                            </div>
                        </div>
                    </div>

                </div>
            </div>
        </section>
    );
};