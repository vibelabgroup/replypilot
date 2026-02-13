import React from 'react';
import { Link } from 'react-router-dom';

export const Footer: React.FC = () => {
    return (
        <footer className="bg-white py-12 px-6 border-t border-slate-100">
            <div className="max-w-7xl mx-auto flex flex-col md:flex-row justify-between items-center gap-8">
                <Link to="/" className="flex items-center gap-3">
                    <div className="w-8 h-8 bg-black rounded-lg flex items-center justify-center text-white text-sm font-bold">R</div>
                    <span className="font-bold text-slate-900">Replypilot</span>
                </Link>
                <p className="text-slate-400 text-sm font-medium">&copy; 2025 Replypilot ApS</p>
                <div className="flex gap-8 text-sm font-medium text-slate-500">
                    <Link to="/privatliv" className="hover:text-black transition-colors">Privatliv</Link>
                    <Link to="/handelsbetingelser" className="hover:text-black transition-colors">Handelsbetingelser</Link>
                    <Link to="/databehandleraftale" className="hover:text-black transition-colors">Databehandleraftale</Link>
                </div>
            </div>
        </footer>
    );
};