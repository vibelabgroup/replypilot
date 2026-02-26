import React from 'react';
import { BuilderLiveDemo } from '../BuilderLiveDemo';
import { HowItWorks } from '../HowItWorks';
import { Calculator } from '../Calculator';
import { Features } from '../Features';
import { Pricing } from '../Pricing';
import { Reviews } from '../Reviews';

interface StartForBuildersProps {
    onStart: () => void;
}

export const StartForBuilders: React.FC<StartForBuildersProps> = ({ onStart }) => {
    return (
        <div className="bg-white">
            {/* Hero / Intro Section */}
            <section className="pt-32 pb-20 px-6 relative overflow-hidden">
                <div className="absolute top-0 right-0 w-[800px] h-[800px] bg-gradient-to-b from-blue-50 to-transparent rounded-full blur-3xl -z-10 opacity-60 mix-blend-multiply" />
                <div className="absolute bottom-0 left-0 w-[600px] h-[600px] bg-gradient-to-t from-indigo-50 to-transparent rounded-full blur-3xl -z-10 opacity-60 mix-blend-multiply" />

                <div className="max-w-7xl mx-auto w-full flex flex-col lg:flex-row items-center gap-16 lg:gap-24">
                    {/* Text Content */}
                    <div className="w-full lg:w-1/2 order-2 lg:order-1 text-center lg:text-left space-y-8">
                        <div className="inline-flex items-center gap-2 py-1 px-4 rounded-full bg-slate-100 border border-slate-200 text-xs font-semibold text-slate-600 tracking-wide uppercase">
                            <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                            AI Receptionist til håndværkere
                        </div>

                        <h1 className="text-4xl sm:text-5xl md:text-6xl lg:text-7xl font-bold tracking-tighter text-slate-900 leading-[0.95]">
                            Gør missede byggeopgaver
                            <br />
                            til bookede jobs.
                        </h1>

                        <p className="text-lg sm:text-xl text-slate-500 leading-relaxed max-w-xl mx-auto lg:mx-0">
                            Replypilot svarer på dine opkald, når du står på taget, i kælderen eller hos en kunde.
                            Kunderne skriver med din AI-receptionist på SMS – du får et færdigt overblik over opgaven.
                        </p>

                        <div className="flex flex-col sm:flex-row items-center justify-center lg:justify-start gap-4">
                            <a
                                href="#live-demo"
                                className="w-full sm:w-auto px-8 py-4 bg-black text-white rounded-full font-semibold text-base sm:text-lg hover:bg-slate-800 transition-all shadow-2xl hover:shadow-black/20 hover:-translate-y-0.5"
                            >
                                Prøv live demoen
                            </a>
                            <button
                                type="button"
                                onClick={onStart}
                                className="w-full sm:w-auto px-8 py-4 bg-white text-slate-900 border border-slate-200 rounded-full font-semibold text-base sm:text-lg hover:bg-slate-50 transition-all shadow-sm hover:shadow-md"
                            >
                                Start med Replypilot
                            </button>
                        </div>

                        <div className="flex flex-col sm:flex-row items-center justify-center lg:justify-start gap-4 text-sm font-medium text-slate-500">
                            <div>Bygget til tømrere, murere, VVS&apos;ere &amp; elektrikere</div>
                            <div className="hidden sm:inline-block w-px h-4 bg-slate-300" />
                            <div className="flex items-center gap-2">
                                <span className="w-1.5 h-1.5 rounded-full bg-black" />
                                Opsat på 5 min. Ingen app.
                            </div>
                        </div>
                    </div>

                    {/* Live Demo Phone */}
                    <div
                        id="live-demo"
                        className="w-full lg:w-1/2 flex justify-center lg:justify-end order-1 lg:order-2 mb-8 lg:mb-0"
                    >
                        <BuilderLiveDemo />
                    </div>
                </div>
            </section>

            {/* How it works – reuse existing component */}
            <HowItWorks />

            {/* Calculator: potential extra revenue */}
            <Calculator />

            {/* Features overview */}
            <Features />

            {/* Pricing block with same design, wired to signup/onboarding */}
            <Pricing onStart={onStart} />

            {/* Social proof – existing reviews from håndværkere */}
            <Reviews />
        </div>
    );
};

