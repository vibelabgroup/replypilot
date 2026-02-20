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
                            href="mailto:support@vibelab.cloud"
                            className="inline-flex items-center text-sm font-semibold text-blue-600 hover:text-blue-700 transition-colors"
                        >
                            support@vibelab.cloud
                        </a>
                    </div>

                    <div className="flex flex-col gap-3 text-sm font-medium text-slate-500">
                        <Link to="/about-us" className="hover:text-black transition-colors">About us</Link>
                        <Link to="/contact-us" className="hover:text-black transition-colors">Contact us</Link>
                        <Link to="/ekstra-omsaetning" className="hover:text-black transition-colors">Ekstra omsætning</Link>
                        <Link to="/privatliv" className="hover:text-black transition-colors">Privatliv</Link>
                        <Link to="/handelsbetingelser" className="hover:text-black transition-colors">Handelsbetingelser</Link>
                        <Link to="/databehandleraftale" className="hover:text-black transition-colors">Databehandleraftale</Link>
                    </div>
                </div>

                <div className="mt-10 pt-8 border-t border-slate-100 flex flex-col gap-5">
                    <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                        <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-400">Betaling via Stripe</span>
                        <div className="flex flex-wrap items-center gap-2">
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl border border-slate-200 bg-white text-slate-700 text-xs font-medium">
                                <SiStripe className="w-4 h-4" aria-hidden="true" />
                            Stripe
                            </span>
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl border border-slate-200 bg-white text-slate-700 text-xs font-medium">
                                <FaCcVisa className="w-4 h-4" aria-hidden="true" />
                            Visa
                            </span>
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl border border-slate-200 bg-white text-slate-700 text-xs font-medium">
                                <FaCcMastercard className="w-4 h-4" aria-hidden="true" />
                            Mastercard
                            </span>
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl border border-slate-200 bg-white text-slate-700 text-xs font-medium">
                                <FaCcAmex className="w-4 h-4" aria-hidden="true" />
                            AmEx
                            </span>
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl border border-slate-200 bg-white text-slate-700 text-xs font-medium">
                                <FaCcApplePay className="w-4 h-4" aria-hidden="true" />
                            Apple Pay
                            </span>
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl border border-slate-200 bg-white text-slate-700 text-xs font-medium">
                                <SiGooglepay className="w-4 h-4" aria-hidden="true" />
                            Google Pay
                            </span>
                        </div>
                    </div>

                    <p className="text-slate-400 text-sm font-medium">&copy; 2026 Replypilot ApS</p>
                </div>
            </div>
        </footer>
    );
};