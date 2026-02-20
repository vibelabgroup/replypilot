import React from 'react';

export const ContactUs: React.FC = () => {
    return (
        <article className="min-h-screen bg-[#FAFAFA] pt-28 pb-20 px-6">
            <div className="max-w-3xl mx-auto text-slate-800">
                <h1 className="text-3xl md:text-4xl font-bold text-slate-900 tracking-tight mb-4">
                    Kontakt
                </h1>
                <p className="text-slate-600 leading-relaxed mb-10">
                    Klar til at høre, hvordan Replypilot kan passe til din virksomhed?
                    Send os en mail, så vender vi tilbage hurtigst muligt.
                </p>

                <div className="bg-white rounded-2xl p-6 md:p-8 border border-slate-100 shadow-sm">
                    <h2 className="text-xl font-bold text-slate-900 mb-4">Direkte kontakt</h2>
                    <p className="text-slate-600 mb-2">
                        Email:{' '}
                        <a href="mailto:hi@replypilot.dk" className="text-blue-600 hover:underline font-semibold">
                            hi@replypilot.dk
                        </a>
                    </p>
                    <p className="text-slate-500 text-sm">
                        Vi svarer typisk inden for 1 hverdag.
                    </p>
                </div>
            </div>
        </article>
    );
};
