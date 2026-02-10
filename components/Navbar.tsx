import React from 'react';

interface NavbarProps {
    onOpenModal: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({ onOpenModal }) => {
    return (
        <nav className="fixed w-full z-50 transition-all duration-300 glass-nav">
            <div className="max-w-7xl mx-auto px-6 h-20 flex items-center justify-between">
            <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-black rounded-xl flex items-center justify-center text-white font-bold text-xl shadow-lg">R</div>
                    <span className="font-bold text-xl tracking-tight">Replypilot</span>
                </div>
                <div className="hidden md:flex items-center gap-10 text-sm font-medium text-slate-500">
                    <a href="#features" className="hover:text-black transition-colors">Funktioner</a>
                    <a href="#calculator" className="hover:text-black transition-colors">Beregn værdi</a>
                    <a href="#pricing" className="hover:text-black transition-colors">Priser</a>
                </div>
                <div className="flex items-center gap-6">
                    <button className="text-sm font-semibold text-slate-500 hover:text-black transition-colors">
                        Log ind
                    </button>
                    <button 
                        onClick={onOpenModal}
                        className="bg-black text-white text-sm font-semibold px-6 py-3 rounded-full hover:bg-slate-800 transition-all hover:scale-105 active:scale-95 shadow-xl shadow-black/5"
                    >
                        Kom i gang
                    </button>
                </div>
            </div>
        </nav>
    );
};