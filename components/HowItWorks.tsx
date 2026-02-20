import React from 'react';
import { PhoneCall, Bot, CalendarCheck2 } from 'lucide-react';

const STEPS = [
    {
        title: 'Kunden ringer ind',
        description: 'Opkaldet bliver besvaret med det samme - også uden for normal åbningstid.',
        icon: PhoneCall
    },
    {
        title: 'AI kvalificerer behovet',
        description: 'Replypilot stiller de rigtige spørgsmål, svarer professionelt og holder kunden engageret.',
        icon: Bot
    },
    {
        title: 'Du får en varm lead',
        description: 'Aftale, lead-data og næste skridt leveres direkte til dig, så du kan lukke salget hurtigt.',
        icon: CalendarCheck2
    }
];

export const HowItWorks: React.FC = () => {
    return (
        <section className="py-24 md:py-28 px-6 bg-[#FAFAFA]">
            <div className="max-w-7xl mx-auto">
                <div className="max-w-2xl mx-auto text-center mb-14 md:mb-16">
                    <h2 className="text-4xl md:text-5xl font-bold text-slate-900 mb-5 tracking-tight">Sådan virker det</h2>
                    <p className="text-lg text-slate-500">Fra første opkald til en klar kunde-dialog - i 3 enkle trin.</p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-6 md:gap-8">
                    {STEPS.map((step, idx) => {
                        const Icon = step.icon;
                        return (
                            <article
                                key={step.title}
                                className="relative rounded-[2rem] border border-slate-100 bg-white p-8 md:p-9 shadow-sm"
                            >
                                <div className="mb-6 flex items-center justify-between">
                                    <div className="w-12 h-12 rounded-2xl bg-slate-900 text-white flex items-center justify-center">
                                        <Icon className="w-6 h-6" />
                                    </div>
                                    <span className="text-sm font-semibold text-slate-400">Trin {idx + 1}</span>
                                </div>
                                <h3 className="text-xl font-bold text-slate-900 mb-3">{step.title}</h3>
                                <p className="text-slate-500 leading-relaxed">{step.description}</p>
                            </article>
                        );
                    })}
                </div>
            </div>
        </section>
    );
};
