import React from 'react';

export const AboutUs: React.FC = () => {
    return (
        <article className="min-h-screen bg-[#FAFAFA] pt-28 pb-20 px-6">
            <div className="max-w-3xl mx-auto text-slate-800">
                <h1 className="text-3xl md:text-4xl font-bold text-slate-900 tracking-tight mb-4">
                    Om os
                </h1>
                <p className="text-slate-600 leading-relaxed mb-10">
                    Replypilot er bygget til håndværksvirksomheder, der vil undgå tabte opkald og omsætte flere henvendelser til kunder.
                    Vi kombinerer AI, telefoni og enkel opsætning, så du får et system, der arbejder for dig døgnet rundt.
                </p>

                <section className="space-y-6">
                    <div className="bg-white rounded-2xl p-6 border border-slate-100 shadow-sm">
                        <h2 className="text-xl font-bold text-slate-900 mb-2">Vores mission</h2>
                        <p className="text-slate-600 leading-relaxed">
                            At give mindre og mellemstore virksomheder samme professionelle tilgængelighed som de største aktører,
                            uden at det kræver flere ansatte eller mere administration.
                        </p>
                    </div>

                    <div className="bg-white rounded-2xl p-6 border border-slate-100 shadow-sm">
                        <h2 className="text-xl font-bold text-slate-900 mb-2">Det får du med Replypilot</h2>
                        <ul className="list-disc list-inside text-slate-600 space-y-1">
                            <li>Automatiske og hurtige svar på henvendelser</li>
                            <li>Færre tabte leads og mere struktur i din opfølgning</li>
                            <li>Opsætning og support, så du kan fokusere på driften</li>
                        </ul>
                    </div>

                    <div className="bg-white rounded-2xl p-6 border border-slate-100 shadow-sm">
                        <h2 className="text-xl font-bold text-slate-900 mb-2">Kontakt teamet</h2>
                        <p className="text-slate-600 leading-relaxed">
                            Har du spørgsmål til produktet eller onboarding, kan du altid skrive til{' '}
                            <a href="mailto:hi@replypilot.dk" className="text-blue-600 hover:underline">
                                hi@replypilot.dk
                            </a>
                            .
                        </p>
                    </div>
                </section>
            </div>
        </article>
    );
};
