import React from 'react';
import { Link } from 'react-router-dom';
import { FaCcAmex, FaCcApplePay, FaCcMastercard, FaCcVisa } from 'react-icons/fa';
import { SiGooglepay, SiStripe } from 'react-icons/si';

export const Footer: React.FC = () => {
    return (
        <footer className="bg-white py-12 px-6 border-t border-slate-100">
            <div className="max-w-7xl mx-auto">
                <div className="flex flex-col lg:flex-row justify-between gap-10 lg:gap-16">
                    <div className="space-y-4">
                        <Link to="/" className="flex items-center gap-3 w-fit">
                            <div className="w-8 h-8 bg-black rounded-lg flex items-center justify-center text-white text-sm font-bold">R</div>
                            <span className="font-bold text-slate-900">Replypilot</span>
                        </Link>
                        <p className="text-slate-500 text-sm leading-relaxed max-w-sm">
                            Har du spørgsmål? Skriv til os, så hjælper vi dig hurtigt videre.
                        </p>
                        <a
                            href="mailto:hi@replypilot.dk"
                            className="inline-flex items-center text-sm font-semibold text-blue-600 hover:text-blue-700 transition-colors"
                        >
                            hi@replypilot.dk
                        </a>
                    </div>

                    <div className="flex flex-col gap-3 text-sm font-medium text-slate-500">
                        <Link to="/about-us" className="hover:text-black transition-colors">Om os</Link>
                        <Link to="/contact-us" className="hover:text-black transition-colors">Kontakt</Link>
                        <Link to="/ekstra-omsaetning" className="hover:text-black transition-colors">Ekstra omsætning</Link>
                        <Link to="/privatliv" className="hover:text-black transition-colors">Privatliv</Link>
                        <Link to="/handelsbetingelser" className="hover:text-black transition-colors">Handelsbetingelser</Link>
                        <Link to="/tilfredshedsgaranti" className="hover:text-black transition-colors">14 dages tilfredshedsgaranti</Link>
                        <Link to="/databehandleraftale" className="hover:text-black transition-colors">Databehandleraftale</Link>
                    </div>
                </div>

                <div className="mt-10 pt-8 border-t border-slate-100 flex flex-col gap-5">
                    <div className="flex flex-wrap items-center gap-2.5">
                        <span className="inline-flex items-center justify-center w-9 h-9 rounded-xl border border-slate-200 bg-white text-slate-700">
                            <SiStripe className="w-4.5 h-4.5" aria-label="Stripe" />
                        </span>
                        <span className="inline-flex items-center justify-center w-9 h-9 rounded-xl border border-slate-200 bg-white text-slate-700">
                            <FaCcVisa className="w-4.5 h-4.5" aria-label="Visa" />
                        </span>
                        <span className="inline-flex items-center justify-center w-9 h-9 rounded-xl border border-slate-200 bg-white text-slate-700">
                            <FaCcMastercard className="w-4.5 h-4.5" aria-label="Mastercard" />
                        </span>
                        <span className="inline-flex items-center justify-center w-9 h-9 rounded-xl border border-slate-200 bg-white text-slate-700">
                            <FaCcAmex className="w-4.5 h-4.5" aria-label="American Express" />
                        </span>
                        <span className="inline-flex items-center justify-center w-9 h-9 rounded-xl border border-slate-200 bg-white text-slate-700">
                            <FaCcApplePay className="w-4.5 h-4.5" aria-label="Apple Pay" />
                        </span>
                        <span className="inline-flex items-center justify-center w-9 h-9 rounded-xl border border-slate-200 bg-white text-slate-700">
                            <SiGooglepay className="w-4.5 h-4.5" aria-label="Google Pay" />
                        </span>
                    </div>

                    <p className="text-slate-400 text-sm font-medium">&copy; 2026 Replypilot</p>
                </div>
            </div>
        </footer>
    );
};