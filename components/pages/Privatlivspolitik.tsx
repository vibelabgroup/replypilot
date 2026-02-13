import React from 'react';

const formatDate = (d: Date) => {
    return d.toLocaleDateString('da-DK', { day: 'numeric', month: 'long', year: 'numeric' });
};

export const Privatlivspolitik: React.FC = () => {
    const updatedDate = formatDate(new Date());

    return (
        <article className="min-h-screen bg-[#FAFAFA] pt-28 pb-20 px-6">
            <div className="max-w-3xl mx-auto text-slate-800">
                <h1 className="text-3xl md:text-4xl font-bold text-slate-900 tracking-tight mb-2">
                    Privatlivspolitik for Vibe Lab
                </h1>
                <p className="text-slate-500 text-sm font-medium mb-12">
                    Senest opdateret: {updatedDate}
                </p>

                <section className="space-y-8">
                    <div>
                        <h2 className="text-xl font-bold text-slate-900 mb-3">1. Dataansvarlig</h2>
                        <p className="text-slate-600 leading-relaxed mb-4">
                            Vibe Lab er dataansvarlig for behandlingen af de personoplysninger, som vi modtager om dig som kunde (kontaktperson).
                        </p>
                        <div className="bg-white rounded-xl p-6 border border-slate-100 shadow-sm mb-4">
                            <p className="font-semibold text-slate-900">Vibe Lab</p>
                            <p className="text-slate-600">Calle Cristo de la Epidemia 60, 4 Izq</p>
                            <p className="text-slate-600">29013 Malaga, Spanien</p>
                            <p className="text-slate-600">VAT: Y3067844A</p>
                            <p className="text-slate-600">
                                Email:{' '}
                                <a href="mailto:support@vibelab.cloud" className="text-blue-600 hover:underline">
                                    support@vibelab.cloud
                                </a>
                            </p>
                        </div>
                        <p className="text-slate-600 leading-relaxed italic">
                            Bemærk: For de data (samtaler/lydfiler), vi behandler på vegne af din virksomhed gennem vores AI-service, henvises til vores Databehandleraftale.
                        </p>
                    </div>

                    <div>
                        <h2 className="text-xl font-bold text-slate-900 mb-3">
                            2. Formål med behandling og kategorier af oplysninger
                        </h2>
                        <p className="text-slate-600 leading-relaxed mb-4">
                            Vi behandler personoplysninger til følgende formål:
                        </p>

                        <div className="space-y-4">
                            <div>
                                <h3 className="text-lg font-semibold text-slate-900 mb-2">
                                    A. Levering af AI Receptionist Service
                                </h3>
                                <p className="text-slate-600 leading-relaxed mb-2">
                                    For at kunne levere vores ydelse behandler vi:
                                </p>
                                <ul className="list-disc list-inside text-slate-600 space-y-1 pl-2">
                                    <li>
                                        <strong>Stamoplysninger:</strong> Navn, firmanavn, adresse, e-mail og telefonnummer.
                                    </li>
                                    <li>
                                        <strong>Trafikdata:</strong> Oplysninger om opkald (tidspunkt, varighed, nummeret der ringer).
                                    </li>
                                    <li>
                                        <strong>Lydoptagelser og Transskribering:</strong> Samtaler behandles af vores AI for at kunne besvare henvendelser og videregive beskeder til dig.
                                    </li>
                                </ul>
                            </div>

                            <div>
                                <h3 className="text-lg font-semibold text-slate-900 mb-2">
                                    B. Fakturering og Administration
                                </h3>
                                <ul className="list-disc list-inside text-slate-600 space-y-1 pl-2">
                                    <li>Betalingsoplysninger og fakturahistorik.</li>
                                </ul>
                            </div>

                            <div>
                                <h3 className="text-lg font-semibold text-slate-900 mb-2">
                                    C. Webanalyse og Cookies
                                </h3>
                                <p className="text-slate-600 leading-relaxed mb-2">
                                    Vi bruger Google Analytics til at analysere trafikken på vores hjemmeside og forbedre brugeroplevelsen.
                                </p>
                                <ul className="list-disc list-inside text-slate-600 space-y-1 pl-2">
                                    <li><strong>Data:</strong> IP-adresser (anonymiseret), geografisk placering, browser-type.</li>
                                    <li><strong>Opbevaring:</strong> Data sendes til Google LLC.</li>
                                    <li><strong>Fravalg:</strong> Du kan fravælge cookies via vores cookie-banner.</li>
                                </ul>
                            </div>
                        </div>
                    </div>

                    <div>
                        <h2 className="text-xl font-bold text-slate-900 mb-3">3. Retsgrundlag</h2>
                        <p className="text-slate-600 leading-relaxed">
                            Behandlingen af dine oplysninger er baseret på <strong>GDPR Artikel 6, stk. 1, litra b</strong>{' '}
                            (nødvendig for opfyldelse af en kontrakt), da vi ikke kan levere servicen uden at behandle disse data.
                        </p>
                    </div>

                    <div>
                        <h2 className="text-xl font-bold text-slate-900 mb-3">4. Modtagere af personoplysninger</h2>
                        <p className="text-slate-600 leading-relaxed mb-3">
                            Vi videregiver kun dine personoplysninger, når det er nødvendigt for at levere servicen. Vi benytter følgende underleverandører (Databehandlere):
                        </p>
                        <ul className="list-disc list-inside text-slate-600 space-y-1 pl-2 mb-3">
                            <li><strong>Twilio Inc. (USA):</strong> Telefoni og SMS-gateway.</li>
                            <li><strong>Google LLC (USA/EU):</strong> AI-motor (Gemini) og Analyse.</li>
                            <li><strong>Hostinger International Ltd. (EU):</strong> Server-hosting og database.</li>
                        </ul>
                        <p className="text-slate-600 leading-relaxed">
                            Overførsel til tredjelande (USA) sker på baggrund af <em>EU-U.S. Data Privacy Framework</em> eller EU-Kommissionens standardkontrakter (SCC).
                        </p>
                    </div>

                    <div>
                        <h2 className="text-xl font-bold text-slate-900 mb-3">5. Opbevaring af data</h2>
                        <p className="text-slate-600 leading-relaxed mb-3">
                            Vi opbevarer personoplysninger, så længe det er nødvendigt for at opfylde de formål, de er indsamlet til.
                        </p>
                        <ul className="list-disc list-inside text-slate-600 space-y-1 pl-2">
                            <li>Lydfiler og transskriberinger slettes løbende eller anonymiseres, når formålet (beskedformidling) er opfyldt.</li>
                            <li>Bogføringsmateriale opbevares i 5 år i henhold til regnskabslovgivningen.</li>
                        </ul>
                    </div>

                    <div>
                        <h2 className="text-xl font-bold text-slate-900 mb-3">6. Dine Rettigheder</h2>
                        <p className="text-slate-600 leading-relaxed">
                            Du har ret til indsigt i, berigtigelse af eller sletning af dine personoplysninger. Henvendelse herom skal ske til{' '}
                            <a href="mailto:support@vibelab.cloud" className="text-blue-600 hover:underline">
                                support@vibelab.cloud
                            </a>
                            .
                        </p>
                    </div>

                    <div>
                        <h2 className="text-xl font-bold text-slate-900 mb-3">7. Klagemuligheder</h2>
                        <p className="text-slate-600 leading-relaxed">
                            Du har ret til at indgive en klage til Datatilsynet i Danmark (datatilsynet.dk) eller til den spanske databeskyttelsesmyndighed (AEPD).
                        </p>
                    </div>
                </section>
            </div>
        </article>
    );
};

