import React from 'react';

const formatDate = (d: Date) => {
    return d.toLocaleDateString('da-DK', { day: 'numeric', month: 'long', year: 'numeric' });
};

export const Tilfredshedsgaranti: React.FC = () => {
    const effectiveDate = formatDate(new Date());

    return (
        <article className="min-h-screen bg-[#FAFAFA] pt-28 pb-20 px-6">
            <div className="max-w-3xl mx-auto text-slate-800">
                <h1 className="text-3xl md:text-4xl font-bold text-slate-900 tracking-tight mb-2">
                    14 dages tilfredshedsgaranti
                </h1>
                <p className="text-slate-500 text-sm font-medium mb-12">
                    Gældende fra: {effectiveDate}
                </p>

                <section className="space-y-8">
                    <div>
                        <h2 className="text-xl font-bold text-slate-900 mb-3">Hvad dækker garantien?</h2>
                        <p className="text-slate-600 leading-relaxed mb-4">
                            Hos Replypilot (Vibe Lab) ønsker vi, at du skal være tryg ved dit valg. Derfor tilbyder vi en <strong>14 dages tilfredshedsgaranti</strong> fra den dag, du indgår aftale og modtager din ydelse.
                        </p>
                        <p className="text-slate-600 leading-relaxed">
                            Inden for de første 14 dage kan du opsige aftalen og få refunderet det beløb, du har betalt – med den undtagelse, der er beskrevet nedenfor.
                        </p>
                    </div>

                    <div>
                        <h2 className="text-xl font-bold text-slate-900 mb-3">Undtagelse: Oprettelse af telefonnummer (200 DKK)</h2>
                        <p className="text-slate-600 leading-relaxed mb-4">
                            Den eneste del af beløbet, vi ikke kan refundere, er <strong>oprettelsen af det interne telefonnummer</strong> til din konto. Vi bliver selv faktureret for denne oprettelse uanset om du fortsætter som kunde eller ej, og derfor kan vi desværre ikke tilbagebetale disse 200 DKK ved opsigelse inden for garantiperioden.
                        </p>
                        <div className="bg-white rounded-xl p-6 border border-slate-100 shadow-sm">
                            <p className="font-semibold text-slate-900 mb-1">Ikke-refunderbart beløb</p>
                            <p className="text-slate-600">200 DKK (oprettelse af telefonnummer)</p>
                            <p className="text-slate-500 text-sm mt-2">
                                Alt andet du har betalt (f.eks. abonnementspris for den første periode) refunderes fuldt ud, når du benytter dig af tilfredshedsgarantien.
                            </p>
                        </div>
                    </div>

                    <div>
                        <h2 className="text-xl font-bold text-slate-900 mb-3">Sådan benytter du dig af garantien</h2>
                        <p className="text-slate-600 leading-relaxed mb-3">
                            For at gøre brug af 14 dages tilfredshedsgarantien skal du:
                        </p>
                        <ul className="list-disc list-inside text-slate-600 space-y-2 pl-2">
                            <li>Opsige aftalen skriftligt inden udløbet af 14 dage fra startdatoen.</li>
                            <li>Kontakte os på <a href="mailto:hi@replypilot.dk" className="text-blue-600 hover:underline">hi@replypilot.dk</a> med din anmodning om refusion.</li>
                        </ul>
                        <p className="text-slate-600 leading-relaxed mt-4">
                            Når vi har modtaget din anmodning, behandler vi refusionen så hurtigt som muligt. Det refunderbare beløb (alt undtagen de 200 DKK for nummeroprettelse) tilbagebetales til samme betalingsmetode, som du brugte ved køb.
                        </p>
                    </div>

                    <div>
                        <h2 className="text-xl font-bold text-slate-900 mb-3">Spørgsmål?</h2>
                        <p className="text-slate-600 leading-relaxed">
                            Har du spørgsmål om vores tilfredshedsgaranti eller refusion, er du velkommen til at skrive til os på{' '}
                            <a href="mailto:hi@replypilot.dk" className="text-blue-600 hover:underline">hi@replypilot.dk</a>.
                        </p>
                    </div>
                </section>
            </div>
        </article>
    );
};
