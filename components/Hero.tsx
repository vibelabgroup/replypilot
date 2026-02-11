import React from 'react';
import { PhoneDemo } from './PhoneDemo';
import { ChevronRight, Check } from 'lucide-react';

export const Hero: React.FC = () => {
    return (
        <section id="hero" className="pt-40 pb-20 px-6 relative overflow-hidden min-h-screen flex items-center">
            {/* Abstract Modern Background */}
            <div className="absolute top-0 right-0 w-[800px] h-[800px] bg-gradient-to-b from-blue-50 to-transparent rounded-full blur-3xl -z-10 opacity-60 mix-blend-multiply"></div>
            <div className="absolute bottom-0 left-0 w-[600px] h-[600px] bg-gradient-to-t from-indigo-50 to-transparent rounded-full blur-3xl -z-10 opacity-60 mix-blend-multiply"></div>

            <div className="max-w-7xl mx-auto w-full flex flex-col md:flex-row items-center gap-16 md:gap-24">
                
                {/* Phone Demo (Left - Desktop/Tablet) */}
                <div className="hidden md:flex w-full md:w-1/2 justify-center md:justify-end order-2 md:order-1 fade-in-up">
                    <PhoneDemo />
                </div>

                {/* Content (Right) */}
                <div className="w-full md:w-1/2 order-1 md:order-2 text-center md:text-left fade-in-up delay-100">
                    <div className="inline-flex items-center gap-2 py-1 px-4 rounded-full bg-slate-100 border border-slate-200 text-xs font-semibold text-slate-600 mb-8 tracking-wide uppercase">
                        <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></span>
                        AI Receptionist
                    </div>
                    <h1 className="text-6xl md:text-7xl lg:text-8xl font-bold tracking-tighter text-slate-900 mb-6 md:mb-8 leading-[0.95]">
                        Aldrig mere <br /> <span className="text-transparent bg-clip-text bg-gradient-to-br from-blue-600 to-indigo-600">missede opkald.</span>
                    </h1>

                    {/* Phone Demo (Inline - Mobile) */}
                    <div className="mb-6 md:hidden flex justify-center">
                        <PhoneDemo />
                    </div>

                    <p className="text-xl text-slate-500 mb-10 leading-relaxed font-normal max-w-xl mx-auto md:mx-0">
                        Replypilot konverterer tabte opkald til SMS-samtaler med det samme. Helt automatisk. 24/7.
                    </p>
                    
                    <div className="flex flex-col sm:flex-row items-center justify-center md:justify-start gap-5 mb-12">
                        <a href="#calculator" className="w-full sm:w-auto px-10 py-5 bg-black text-white rounded-full font-semibold text-lg hover:bg-slate-800 transition-all shadow-2xl hover:shadow-black/20 hover:-translate-y-1">
                            Beregn gevinst
                        </a>
                        <a href="#features" className="w-full sm:w-auto px-10 py-5 bg-white text-slate-900 border border-slate-200 rounded-full font-semibold text-lg hover:bg-slate-50 transition-all flex items-center justify-center gap-2 group shadow-sm hover:shadow-md">
                            Sådan virker det <ChevronRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
                        </a>
                    </div>

                    <div className="flex items-center justify-center md:justify-start gap-8 text-sm font-medium text-slate-500">
                        <div className="flex items-center gap-2">
                            <Check className="w-4 h-4 text-black" />
                            Opsat på 5 min.
                        </div>
                        <div className="flex items-center gap-2">
                            <Check className="w-4 h-4 text-black" />
                            Ingen app påkrævet
                        </div>
                    </div>
                </div>
            </div>
        </section>
    );
};