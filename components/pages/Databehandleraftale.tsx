import React from 'react';

export const Databehandleraftale: React.FC = () => {
    return (
        <article className="min-h-screen bg-[#FAFAFA] pt-28 pb-20 px-6">
            <div className="max-w-3xl mx-auto text-slate-800">
                <h1 className="text-3xl md:text-4xl font-bold text-slate-900 tracking-tight mb-8">
                    Databehandleraftale
                </h1>

                <div className="space-y-6 mb-8">
                    <p className="text-slate-600 leading-relaxed"><strong>Mellem</strong></p>
                    <div className="bg-white rounded-xl p-6 border border-slate-100 shadow-sm">
                        <p className="text-slate-500 text-sm mb-1">(Kunden)</p>
                        <p className="font-semibold text-slate-900">[Kunde Navn/Firma]</p>
                        <p className="text-slate-500 text-sm mt-2">(Herefter &quot;Den Dataansvarlige&quot;)</p>
                    </div>
                    <p className="text-slate-600 leading-relaxed"><strong>Og</strong></p>
                    <div className="bg-white rounded-xl p-6 border border-slate-100 shadow-sm">
                        <p className="font-semibold text-slate-900">Vibe Lab</p>
                        <p className="text-slate-600">Calle Cristo de la Epidemia 60, 4 Izq</p>
                        <p className="text-slate-600">29013 Malaga, Spanien</p>
                        <p className="text-slate-600">VAT: Y3067844A</p>
                        <p className="text-slate-500 text-sm mt-2">(Herefter &quot;Databehandleren&quot;)</p>
                    </div>
                </div>

                <section className="space-y-8">
                    <div>
                        <h2 className="text-xl font-bold text-slate-900 mb-3">1. Baggrund og formål</h2>
                        <p className="text-slate-600 leading-relaxed mb-3">
                            Denne aftale fastsætter rettigheder og forpligtelser i forbindelse med Databehandlerens behandling af personoplysninger på vegne af Den Dataansvarlige.
                        </p>
                        <p className="text-slate-600 leading-relaxed">
                            Databehandleren leverer en AI-baseret telefonpasnings- og receptionistløsning (&quot;Hovedaftalen&quot;), hvorved Databehandleren modtager, optager, transskriberer og videreformidler opkald fra Den Dataansvarliges kunder/kontakter.
                        </p>
                    </div>

                    <div>
                        <h2 className="text-xl font-bold text-slate-900 mb-3">2. Instruks</h2>
                        <p className="text-slate-600 leading-relaxed">
                            Databehandleren må kun behandle personoplysninger efter dokumenteret instruks fra Den Dataansvarlige. Hovedaftalen og denne aftale udgør instruksen. Formålet er udelukkende at levere den aftalte AI-receptionist service.
                        </p>
                    </div>

                    <div>
                        <h2 className="text-xl font-bold text-slate-900 mb-3">3. Fortrolighed</h2>
                        <p className="text-slate-600 leading-relaxed">
                            Databehandleren sikrer, at alle personer, der er autoriseret til at behandle personoplysningerne (herunder medarbejdere og teknisk personale), har forpligtet sig til fortrolighed.
                        </p>
                    </div>

                    <div>
                        <h2 className="text-xl font-bold text-slate-900 mb-3">4. Sikkerhed ved behandlingen</h2>
                        <p className="text-slate-600 leading-relaxed mb-3">
                            Databehandleren iværksætter passende tekniske og organisatoriske foranstaltninger for at sikre et sikkerhedsniveau, der passer til risiciene (GDPR artikel 32).
                        </p>
                        <p className="text-slate-600 leading-relaxed">
                            Databehandleren anvender kryptering af data i transit og i hvile, samt streng adgangskontrol til de servere (Hostinger VPS), hvorpå data behandles.
                        </p>
                    </div>

                    <div>
                        <h2 className="text-xl font-bold text-slate-900 mb-3">5. Brug af underdatabehandlere</h2>
                        <p className="text-slate-600 leading-relaxed mb-3">
                            Den Dataansvarlige giver hermed Databehandleren generel tilladelse til at gøre brug af underdatabehandlere til levering af ydelsen. En liste over godkendte underdatabehandlere findes i <strong>Bilag C</strong>.
                        </p>
                        <p className="text-slate-600 leading-relaxed">
                            Databehandleren skal underrette Den Dataansvarlige om eventuelle planlagte ændringer vedrørende tilføjelse eller udskiftning af underdatabehandlere med passende varsel, således at Den Dataansvarlige har mulighed for at gøre indsigelse.
                        </p>
                    </div>

                    <div>
                        <h2 className="text-xl font-bold text-slate-900 mb-3">6. De registreredes rettigheder</h2>
                        <p className="text-slate-600 leading-relaxed">
                            Databehandleren bistår Den Dataansvarlige med at opfylde forpligtelsen til at besvare anmodninger om udøvelse af de registreredes rettigheder (f.eks. indsigt i eller sletning af en optaget samtale).
                        </p>
                    </div>

                    <div>
                        <h2 className="text-xl font-bold text-slate-900 mb-3">7. Anmeldelse af brud på persondatasikkerheden</h2>
                        <p className="text-slate-600 leading-relaxed">
                            Databehandleren underretter uden unødig forsinkelse Den Dataansvarlige efter at være blevet opmærksom på et brud på persondatasikkerheden.
                        </p>
                    </div>

                    <div>
                        <h2 className="text-xl font-bold text-slate-900 mb-3">8. Sletning og tilbagelevering af oplysninger</h2>
                        <p className="text-slate-600 leading-relaxed">
                            Ved ophør af tjenesten skal Databehandleren slette alle personoplysninger (lydfiler, logs, transskriptioner), medmindre lovgivning kræver fortsat opbevaring.
                        </p>
                    </div>
                </section>

                <hr className="my-10 border-slate-200" />

                <section className="space-y-8">
                    <div>
                        <h3 className="text-lg font-bold text-slate-900 mb-3">BILAG A: Oplysninger om behandlingen</h3>
                        <ul className="list-none text-slate-600 space-y-2">
                            <li><strong>1. Formål:</strong> Automatiseret besvarelse af opkald, transskribering og booking.</li>
                            <li><strong>2. Typer af personoplysninger:</strong> Navn, telefonnummer, stemmeoptagelser (lyd), samtalens indhold.</li>
                            <li><strong>3. Kategorier af registrerede:</strong> Personer der ringer til Den Dataansvarliges telefonnummer.</li>
                        </ul>
                    </div>

                    <div>
                        <h3 className="text-lg font-bold text-slate-900 mb-3">BILAG B: Sikkerhedsforanstaltninger</h3>
                        <p className="text-slate-600 leading-relaxed mb-3">
                            Databehandleren opretholder følgende sikkerhedsniveau:
                        </p>
                        <ol className="list-decimal list-inside text-slate-600 space-y-2 pl-2">
                            <li>Adgang til servere (VPS) er begrænset via SSH-keys og firewalls.</li>
                            <li>Al datatrafik mellem systemerne (Twilio &lt;-&gt; n8n &lt;-&gt; Gemini) foregår via krypterede forbindelser (HTTPS/TLS).</li>
                            <li>Lydfiler opbevares i sikre miljøer og slettes automatisk jf. retention policy.</li>
                        </ol>
                    </div>

                    <div>
                        <h3 className="text-lg font-bold text-slate-900 mb-3">BILAG C: Godkendte underdatabehandlere</h3>
                        <p className="text-slate-600 leading-relaxed mb-4">
                            Den Dataansvarlige godkender brugen af følgende leverandører:
                        </p>
                        <div className="overflow-x-auto border border-slate-200 rounded-xl">
                            <table className="w-full text-sm text-left">
                                <thead>
                                    <tr className="bg-slate-50 border-b border-slate-200">
                                        <th className="px-4 py-3 font-semibold text-slate-900">Navn</th>
                                        <th className="px-4 py-3 font-semibold text-slate-900">Lokation</th>
                                        <th className="px-4 py-3 font-semibold text-slate-900">Beskrivelse</th>
                                    </tr>
                                </thead>
                                <tbody className="text-slate-600">
                                    <tr className="border-b border-slate-100">
                                        <td className="px-4 py-3 font-medium text-slate-900">Twilio Inc.</td>
                                        <td className="px-4 py-3">USA / Global</td>
                                        <td className="px-4 py-3">Telefoni-infrastruktur og optagelse af lyd. (DPF-certificeret).</td>
                                    </tr>
                                    <tr className="border-b border-slate-100">
                                        <td className="px-4 py-3 font-medium text-slate-900">Google LLC</td>
                                        <td className="px-4 py-3">USA / EU</td>
                                        <td className="px-4 py-3">AI og Sprogmodeller (Gemini) samt Analyse. (DPF-certificeret).</td>
                                    </tr>
                                    <tr>
                                        <td className="px-4 py-3 font-medium text-slate-900">Hostinger International Ltd.</td>
                                        <td className="px-4 py-3">EU (Litauen)</td>
                                        <td className="px-4 py-3">Server Hosting (VPS) til afvikling af n8n-software og databaser.</td>
                                    </tr>
                                </tbody>
                            </table>
                        </div>
                    </div>
                </section>
            </div>
        </article>
    );
};
