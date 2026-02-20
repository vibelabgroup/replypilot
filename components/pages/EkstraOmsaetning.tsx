import React from 'react';
import { Link } from 'react-router-dom';
import { Calculator } from '../Calculator';

export const EkstraOmsaetning: React.FC = () => {
    return (
        <article className="min-h-screen bg-[#FAFAFA] pt-28 pb-20">
            <section className="px-6">
                <div className="max-w-4xl mx-auto text-center">
                    <h1 className="text-4xl md:text-5xl font-bold tracking-tight text-slate-900 mb-4">
                        Se din potentielle ekstra omsætning
                    </h1>
                    <p className="text-slate-600 text-lg leading-relaxed max-w-2xl mx-auto">
                        Hver gang telefonen ikke bliver taget, kan det koste en opgave. Brug beregneren herunder
                        og få et realistisk estimat på, hvad hurtig opfølgning kan være værd for din virksomhed.
                    </p>
                </div>
            </section>

            <Calculator />

            <section className="px-6">
                <div className="max-w-4xl mx-auto bg-white border border-slate-100 rounded-3xl p-8 md:p-10 shadow-sm text-center">
                    <h2 className="text-2xl md:text-3xl font-bold text-slate-900 mb-3">
                        Klar til at omsætte flere henvendelser?
                    </h2>
                    <p className="text-slate-600 leading-relaxed mb-6">
                        Vi hjælper dig i gang med opsætning, tilpasning og drift, så du hurtigt kan mærke effekten.
                    </p>
                    <Link
                        to="/contact-us"
                        className="inline-flex items-center justify-center bg-black text-white font-semibold px-7 py-3 rounded-full hover:bg-slate-900 transition-colors"
                    >
                        Kontakt os
                    </Link>
                </div>
            </section>
        </article>
    );
};
