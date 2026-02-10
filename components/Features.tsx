import React from 'react';
import { Bot, Zap, Clock, BellRing, CalendarCheck2, SmartphoneNfc } from 'lucide-react';
import { FEATURES } from '../constants';

const IconMap = {
    Bot: Bot,
    Zap: Zap,
    Clock: Clock,
    BellRing: BellRing,
    CalendarCheck2: CalendarCheck2,
    SmartphoneNfc: SmartphoneNfc
};

export const Features: React.FC = () => {
    return (
        <section id="features" className="py-32 px-6 bg-[#FAFAFA]">
            <div className="max-w-7xl mx-auto">
                <div className="max-w-2xl mx-auto text-center mb-20">
                    <h2 className="text-4xl md:text-5xl font-bold text-slate-900 mb-6 tracking-tight">Usynlig for dig.<br />Uundværlig for forretningen.</h2>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                    {FEATURES.map((feature, idx) => {
                        const Icon = IconMap[feature.icon];
                        return (
                            <div key={idx} className="glass-card p-10 rounded-[2rem] hover:-translate-y-1 transition-transform duration-300">
                                <div className={`w-14 h-14 rounded-2xl flex items-center justify-center mb-8 ${idx === 0 ? 'bg-black text-white shadow-lg shadow-black/20' : 'bg-white border border-slate-100 text-slate-900 shadow-sm'}`}>
                                    <Icon className="w-7 h-7" />
                                </div>
                                <h3 className="text-xl font-bold mb-3 text-slate-900">{feature.title}</h3>
                                <p className="text-slate-500 leading-relaxed">
                                    {feature.description}
                                </p>
                            </div>
                        );
                    })}
                </div>
            </div>
        </section>
    );
};