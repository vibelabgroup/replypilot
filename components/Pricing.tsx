import React from 'react';
import { Check, ArrowRight } from 'lucide-react';

interface PricingProps {
    onStart: () => void;
}

export const Pricing: React.FC<PricingProps> = ({ onStart }) => {
    return (
        <section id="pricing" className="py-32 px-6">
            <div className="max-w-7xl mx-auto">
                <div className="flex flex-col lg:flex-row items-center gap-16 lg:gap-24">
                    
                    {/* Left Column: Converting Content */}
                    <div className="lg:w-1/2 text-left space-y-8">
                        <h2 className="text-4xl md:text-5xl font-bold tracking-tight text-slate-900 leading-tight">
                            En lille investering i <br />
                            <span className="text-blue-600">din forretnings fremtid.</span>
                        </h2>
                        <p className="text-lg text-slate-500 leading-relaxed">
                            Hvad er en ny kunde værd for dig? For de fleste af vores kunder er prisen tjent hjem, hvis systemet redder bare én enkelt opgave om måneden.
                        </p>
                        
                        <div className="space-y-6 pt-6">
                            <div className="flex items-start gap-5">
                                <div className="w-12 h-12 bg-black rounded-xl flex items-center justify-center text-white shrink-0 shadow-lg">
                                    <span className="font-bold text-lg">1</span>
                                </div>
                                <div>
                                    <h4 class="font-bold text-slate-900 text-lg mb-1">Tjen pengene hjem dag 1</h4>
                                    <p className="text-slate-500 leading-relaxed">Ingen store startgebyrer. Du betaler en fast lav månedlig pris, der hurtigt tjener sig selv ind.</p>
                                </div>
                            </div>
                            <div className="flex items-start gap-5">
                                <div className="w-12 h-12 bg-white border border-slate-200 rounded-xl flex items-center justify-center text-slate-900 shrink-0 shadow-sm">
                                    <span className="font-bold text-lg">2</span>
                                </div>
                                <div>
                                    <h4 class="font-bold text-slate-900 text-lg mb-1">Ingen risiko</h4>
                                    <p className="text-slate-500 leading-relaxed">Vi tilbyder 14 dages fuld tilfredshedsgaranti. Virker det ikke for dig, får du pengene tilbage.</p>
                                </div>
                            </div>
                            <div className="flex items-start gap-5">
                                <div className="w-12 h-12 bg-white border border-slate-200 rounded-xl flex items-center justify-center text-slate-900 shrink-0 shadow-sm">
                                    <span className="font-bold text-lg">3</span>
                                </div>
                                <div>
                                    <h4 class="font-bold text-slate-900 text-lg mb-1">Vi klarer alt det tekniske</h4>
                                    <p className="text-slate-500 leading-relaxed">Du skal ikke røre en finger. Vi sætter det hele op, så det passer til din virksomhed.</p>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Right Column: Pricing Card */}
                    <div className="lg:w-1/2 w-full relative">
                        {/* Decor element behind */}
                        <div className="absolute inset-0 bg-gradient-to-tr from-blue-100 to-indigo-50 rounded-[3rem] transform rotate-3 scale-105 -z-10 opacity-70"></div>
                        
                        <div className="bg-white rounded-[3rem] p-10 lg:p-12 shadow-2xl relative overflow-hidden border border-slate-100 hover:scale-[1.005] transition-transform duration-300">
                            <div className="absolute top-0 inset-x-0 h-2 bg-black"></div>
                            
                            <div className="mb-10 pt-4">
                                <div className="flex justify-between items-start mb-6">
                                    <span className="inline-block py-1 px-3 rounded-full bg-slate-100 text-xs font-bold text-slate-900 uppercase tracking-widest">Founding Partner</span>
                                    <div className="bg-green-100 text-green-700 text-xs font-bold px-3 py-1 rounded-full">Spar 50%</div>
                                </div>
                                
                                <div className="flex justify-start items-baseline gap-1">
                                    <span className="text-6xl md:text-7xl font-bold text-slate-900 tracking-tighter">1.995</span>
                                    <span className="text-xl font-medium text-slate-400">kr/md</span>
                                </div>
                                <p className="text-slate-400 text-sm mt-3 font-medium">ekskl. moms</p>
                            </div>

                            <div className="space-y-5 mb-12 text-left">
                                <div className="flex items-center gap-4">
                                    <div className="w-6 h-6 rounded-full bg-black text-white flex items-center justify-center shrink-0"><Check className="w-3.5 h-3.5" /></div>
                                    <span className="text-slate-700 font-medium">Ubegrænset SMS svar</span>
                                </div>
                                <div className="flex items-center gap-4">
                                    <div className="w-6 h-6 rounded-full bg-black text-white flex items-center justify-center shrink-0"><Check className="w-3.5 h-3.5" /></div>
                                    <span className="text-slate-700 font-medium">Personlig tilpasning</span>
                                </div>
                                <div className="flex items-center gap-4">
                                    <div className="w-6 h-6 rounded-full bg-black text-white flex items-center justify-center shrink-0"><Check className="w-3.5 h-3.5" /></div>
                                    <span className="text-slate-700 font-medium">Opsætning inkluderet (Værdi 1.500,-)</span>
                                </div>
                                 <div className="flex items-center gap-4">
                                    <div className="w-6 h-6 rounded-full bg-black text-white flex items-center justify-center shrink-0"><Check className="w-3.5 h-3.5" /></div>
                                    <span className="text-slate-700 font-medium">Support 24/7</span>
                                </div>
                            </div>

                            <button onClick={onStart} className="w-full bg-black text-white font-bold text-lg h-16 rounded-2xl hover:bg-slate-900 transition-all shadow-xl hover:shadow-2xl flex items-center justify-center gap-3">
                                Start Nu <ArrowRight className="w-5 h-5" />
                            </button>
                            
                            <p className="text-xs text-slate-400 mt-6 font-medium text-center">Ingen binding. 14 dages tilfredshedsgaranti.</p>
                        </div>
                    </div>

                </div>
                
                <div className="mt-24 text-center border-t border-slate-100 pt-12">
                    <p className="text-slate-400 text-sm font-semibold uppercase tracking-wider mb-8">Bruges allerede af førende håndværkere</p>
                    <div className="flex flex-wrap justify-center gap-10 md:gap-16 opacity-30 grayscale hover:opacity-50 transition-opacity duration-300">
                       <span className="text-2xl font-bold font-serif text-slate-900">MesterByg</span>
                       <span className="text-2xl font-black tracking-tighter text-slate-900">EL-EXPERTEN</span>
                       <span className="text-2xl font-bold italic text-slate-900">VVS-Gruppen</span>
                       <span className="text-2xl font-semibold text-slate-900">TotalEntreprise A/S</span>
                    </div>
                </div>
            </div>
        </section>
    );
};