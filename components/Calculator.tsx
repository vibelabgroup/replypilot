import React, { useState, useEffect } from 'react';

export const Calculator: React.FC = () => {
    const [calls, setCalls] = useState(2);
    const [value, setValue] = useState(5000);
    const [displayRevenue, setDisplayRevenue] = useState(0);

    const calculateRevenue = (c: number, v: number) => {
        const days = 30;
        const conversionRate = 0.3;
        return Math.round(days * c * conversionRate * v);
    };

    useEffect(() => {
        const target = calculateRevenue(calls, value);
        // Simple easing animation for number
        let startTimestamp: number | null = null;
        const duration = 500;
        const startValue = displayRevenue;

        const step = (timestamp: number) => {
            if (!startTimestamp) startTimestamp = timestamp;
            const progress = Math.min((timestamp - startTimestamp) / duration, 1);
            const easeProgress = 1 - Math.pow(1 - progress, 4);
            const currentVal = Math.floor(easeProgress * (target - startValue) + startValue);
            
            setDisplayRevenue(currentVal);
            
            if (progress < 1) {
                window.requestAnimationFrame(step);
            }
        };
        
        window.requestAnimationFrame(step);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [calls, value]);

    const formatCurrency = (amount: number) => {
        return new Intl.NumberFormat('da-DK', { style: 'currency', currency: 'DKK', maximumFractionDigits: 0 }).format(amount);
    };

    const formatValueDisplay = (val: number) => {
        return val >= 10000 ? (val / 1000) + 'k' : val.toString();
    };

    return (
        <section id="calculator" className="py-32 px-6">
            <div className="max-w-6xl mx-auto">
                <div className="bg-white rounded-[3rem] shadow-2xl shadow-slate-200 border border-slate-100 overflow-hidden flex flex-col lg:flex-row">
                    
                    {/* Controls */}
                    <div className="p-12 lg:p-20 lg:w-1/2 flex flex-col justify-center bg-white">
                        <h2 className="text-3xl font-bold mb-2 tracking-tight">Hvad koster stilhed?</h2>
                        <p class="text-slate-500 mb-12">Træk i skyderne og se potentialet.</p>
                        
                        <div className="space-y-12">
                            {/* Slider 1 */}
                            <div>
                                <div className="flex justify-between mb-4 items-end">
                                    <label className="text-sm font-semibold text-slate-900 uppercase tracking-wide">Missede opkald / dag</label>
                                    <div className="text-3xl font-bold text-slate-900">{calls}</div>
                                </div>
                                <input 
                                    type="range" 
                                    min="1" 
                                    max="15" 
                                    step="1" 
                                    value={calls}
                                    onChange={(e) => setCalls(parseInt(e.target.value))}
                                    className="accent-black"
                                />
                            </div>

                            {/* Slider 2 */}
                            <div>
                                <div className="flex justify-between mb-4 items-end">
                                    <label className="text-sm font-semibold text-slate-900 uppercase tracking-wide">Opgaveværdi</label>
                                    <div className="text-3xl font-bold text-slate-900">{formatValueDisplay(value)}</div>
                                </div>
                                <input 
                                    type="range" 
                                    min="1000" 
                                    max="50000" 
                                    step="1000" 
                                    value={value}
                                    onChange={(e) => setValue(parseInt(e.target.value))}
                                    className="accent-black"
                                />
                            </div>
                        </div>
                    </div>

                    {/* Result */}
                    <div className="bg-black p-12 lg:p-20 lg:w-1/2 text-white flex flex-col justify-center relative overflow-hidden">
                        {/* Decorative Gradients */}
                        <div className="absolute top-0 right-0 w-96 h-96 bg-blue-600/30 rounded-full blur-[100px] -translate-y-1/2 translate-x-1/2"></div>
                        <div className="absolute bottom-0 left-0 w-64 h-64 bg-indigo-600/20 rounded-full blur-[80px] translate-y-1/2 -translate-x-1/2"></div>
                        
                        <div className="relative z-10">
                            <span className="text-blue-400 font-medium tracking-wide text-sm uppercase mb-4 block">Ekstra omsætning pr. md.</span>
                            <div className="text-6xl lg:text-7xl font-bold tracking-tighter mb-6">{formatCurrency(displayRevenue)}</div>
                            <div className="h-1 w-20 bg-blue-500 rounded-full mb-8"></div>
                            <p className="text-slate-400 leading-relaxed text-lg font-light">
                                Baseret på at vi redder bare <span className="text-white font-medium">30%</span> af dine missede opkald. De fleste oplever højere rater.
                            </p>
                        </div>
                    </div>
                </div>
            </div>
        </section>
    );
};