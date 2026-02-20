import React from 'react';

const formatDate = (d: Date) => {
    return d.toLocaleDateString('da-DK', { day: 'numeric', month: 'long', year: 'numeric' });
};

export const Handelsbetingelser: React.FC = () => {
    const effectiveDate = formatDate(new Date());

    return (
        <article className="min-h-screen bg-[#FAFAFA] pt-28 pb-20 px-6">
            <div className="max-w-3xl mx-auto text-slate-800">
                <h1 className="text-3xl md:text-4xl font-bold text-slate-900 tracking-tight mb-2">
                    Handelsbetingelser for Vibe Lab (Replypilot)
                </h1>
                <p className="text-slate-500 text-sm font-medium mb-12">
                    Gældende fra: {effectiveDate}
                </p>

                <section className="space-y-8">
                    <div>
                        <h2 className="text-xl font-bold text-slate-900 mb-3">1. Generelle Oplysninger</h2>
                        <p className="text-slate-600 leading-relaxed mb-4">
                            Disse handelsbetingelser gælder for alle aftaler om køb af ydelser indgået mellem erhvervskunder (herefter "Kunden") og:
                        </p>
                        <div className="bg-white rounded-xl p-6 border border-slate-100 shadow-sm">
                            <p className="font-semibold text-slate-900">Vibe Lab</p>
                            <p className="text-slate-600">Calle Cristo de la Epidemia 60, 4 Izq</p>
                            <p className="text-slate-600">29013 Malaga, Spanien</p>
                            <p className="text-slate-600">VAT-nr.: Y3067844A</p>
                            <p className="text-slate-600">Tlf.: +34 634 00 50 59</p>
                            <p className="text-slate-600">
                                Email: <a href="mailto:hi@replypilot.dk" className="text-blue-600 hover:underline">hi@replypilot.dk</a>
                            </p>
                            <p className="text-slate-500 text-sm mt-2">(Herefter "Vibe Lab" eller "Selskabet")</p>
                        </div>
                    </div>

                    <div>
                        <h2 className="text-xl font-bold text-slate-900 mb-3">2. Ydelsens Beskrivelse</h2>
                        <p className="text-slate-600 leading-relaxed mb-3">
                            Vibe Lab leverer en AI-baseret telefonpasnings- og receptionistløsning ("Servicen"). Servicen inkluderer tildeling af et unikt telefonnummer samt teknisk opsætning, der muliggør viderestilling af Kundens opkald til Vibe Labs AI-system.
                        </p>
                        <p className="text-slate-600 leading-relaxed">
                            Systemet drives teknisk via en integration af telefoni (Twilio) og AI-sprogmodeller (Google Gemini), der administreres via Selskabets egne servere (Hostinger VPS).
                        </p>
                    </div>

                    <div>
                        <h2 className="text-xl font-bold text-slate-900 mb-3">3. Aftaleindgåelse og Opsætning</h2>
                        <p className="text-slate-600 leading-relaxed">
                            Aftalen anses for indgået, når Kunden har accepteret tilbuddet eller gennemført bestillingen online.
                            Vibe Lab leverer det unikke telefonnummer og den nødvendige viderestillingskode til Kunden. Det er Kundens eget ansvar at aktivere viderestillingen på deres teleudbyders netværk ved hjælp af den udleverede kode.
                        </p>
                    </div>

                    <div>
                        <h2 className="text-xl font-bold text-slate-900 mb-3">4. Priser og Betaling</h2>
                        <p className="text-slate-600 leading-relaxed mb-3">
                            Prisen for abonnementet er <strong>1.995 DKK ekskl. moms pr. måned</strong>.
                        </p>
                        <ul className="list-disc list-inside text-slate-600 space-y-2 pl-2">
                            <li><strong>Moms:</strong> Da Vibe Lab er en spansk virksomhed, faktureres ydelsen uden dansk moms til momsregistrerede virksomheder i Danmark i henhold til reglerne om <strong>Reverse Charge</strong> (moms omvendt betalingspligt). Kunden er selv ansvarlig for eventuel momsindberetning i Danmark.</li>
                            <li>Betaling trækkes månedsvis forud via det tilknyttede betalingskort.</li>
                        </ul>
                    </div>

                    <div>
                        <h2 className="text-xl font-bold text-slate-900 mb-3">5. Prøveperiode og Bindingsperiode</h2>
                        <p className="text-slate-600 leading-relaxed mb-4">
                            Aftalen er underlagt en særlig struktur for prøveperiode og binding:
                        </p>

                        <h3 className="text-lg font-semibold text-slate-900 mb-2">5.1. De første 30 dage (Prøveperiode)</h3>
                        <p className="text-slate-600 leading-relaxed mb-3">
                            Kunden har fuld ret til at opsige aftalen frit inden for de første 30 dage fra aftalens startdato.
                        </p>
                        <ul className="list-disc list-inside text-slate-600 space-y-1 pl-2 mb-4">
                            <li>Ved opsigelse inden for de første 30 dage faktureres Kunden <strong>kun for den første måned</strong> (1.995 DKK).</li>
                            <li>Der påløber ingen yderligere omkostninger eller binding, såfremt opsigelsen er modtaget inden udløbet af dag 30.</li>
                        </ul>

                        <h3 className="text-lg font-semibold text-slate-900 mb-2">5.2. Automatisk Forlængelse og 12 Måneders Binding</h3>
                        <p className="text-slate-600 leading-relaxed mb-3">
                            Såfremt Kunden <strong>ikke</strong> har opsagt aftalen skriftligt inden udløbet af de første 30 dage, overgår abonnementet automatisk til en bindingsperiode på <strong>12 måneder</strong>.
                        </p>
                        <ul className="list-disc list-inside text-slate-600 space-y-1 pl-2">
                            <li>Bindingsperioden beregnes fra aftalens oprindelige startdato (den første måned indgår således i de 12 måneder).</li>
                            <li>Kunden er herefter forpligtet til at betale den månedlige abonnementspris i de resterende 11 måneder af bindingsperioden.</li>
                            <li>Det er ikke muligt at opsige abonnementet til ophør i løbet af bindingsperioden.</li>
                        </ul>
                    </div>

                    <div>
                        <h2 className="text-xl font-bold text-slate-900 mb-3">6. Opsigelse efter Bindingsperioden</h2>
                        <p className="text-slate-600 leading-relaxed mb-3">
                            Efter udløbet af bindingsperioden på 12 måneder fortsætter abonnementet som et løbende abonnement, der kan opsiges med løbende måned + 1 måneds varsel.
                        </p>
                        <p className="text-slate-600 leading-relaxed">
                            Opsigelse skal ske skriftligt til <a href="mailto:hi@replypilot.dk" className="text-blue-600 hover:underline">hi@replypilot.dk</a>.
                        </p>
                    </div>

                    <div>
                        <h2 className="text-xl font-bold text-slate-900 mb-3">7. Kundens Ansvar</h2>
                        <p className="text-slate-600 leading-relaxed">
                            Kunden indestår for, at det anvendte telefonnummer tilhører Kunden, og at Kunden har ret til at viderestille opkald fra dette nummer. Kunden er ansvarlig for eventuelle takster eller gebyrer, som Kundens egen teleudbyder måtte opkræve for viderestilling af opkald.
                        </p>
                    </div>

                    <div>
                        <h2 className="text-xl font-bold text-slate-900 mb-3">8. Driftsstabilitet og Ansvar</h2>
                        <p className="text-slate-600 leading-relaxed">
                            Vibe Lab tilstræber højest mulige driftsstabilitet (oppetid), men garanterer ikke for nedetid forårsaget af tredjeparts teleoperatører (Twilio), internetudbydere eller force majeure. Vibe Lab kan ikke gøres erstatningsansvarlig for driftstab, tidstab, profit tab, tab af data eller andre indirekte tab, der måtte opstå som følge af nedbrud, fejl i AI-forståelsen eller manglende viderestilling.
                        </p>
                    </div>

                    <div>
                        <h2 className="text-xl font-bold text-slate-900 mb-3">9. Lovvalg og Værneting</h2>
                        <p className="text-slate-600 leading-relaxed">
                            Enhver tvist mellem Vibe Lab og Kunden afgøres efter spansk ret, idet Selskabet er hjemmehørende i Spanien. Værneting er retten i Malaga, medmindre præceptiv lovgivning foreskriver andet.
                        </p>
                    </div>
                </section>
            </div>
        </article>
    );
};
