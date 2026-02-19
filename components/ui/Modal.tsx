import React, { useState } from 'react';
import { X, Loader2, CheckCircle2 } from 'lucide-react';

interface ModalProps {
    isOpen: boolean;
    onClose: () => void;
    onPaymentComplete: () => void;
}

export const Modal: React.FC<ModalProps> = ({ isOpen, onClose, onPaymentComplete }) => {
    const [isLoading, setIsLoading] = useState(false);
    const [isSuccess, setIsSuccess] = useState(false);
    const [acceptedTerms, setAcceptedTerms] = useState(false);
    const [acceptedDpa, setAcceptedDpa] = useState(false);

    // Pre-filled for better demo experience
    const [formData, setFormData] = useState({
        name: 'Mester Hansen',
        email: 'mester@hansen-byg.dk',
        phone: '20304050'
    });

    if (!isOpen) return null;

    const handlePayment = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsLoading(true);
        try {
            setIsSuccess(true);

            // Persist email locally so we can later verify subscription status
            try {
                window.localStorage.setItem('replypilot_email', formData.email);
            } catch {
                // Ignore storage errors; flow still continues
            }

            const apiBase =
                import.meta.env.VITE_API_BASE_URL || window.location.origin.replace(/\/$/, "");

            const response = await fetch(`${apiBase}/create-checkout-session`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    name: formData.name,
                    email: formData.email,
                    phone: formData.phone,
                    acceptedTerms,
                    acceptedDpa,
                }),
            });

            if (!response.ok) {
                throw new Error("Kunne ikke starte Stripe betaling");
            }

            const data = await response.json();
            if (!data.url) {
                throw new Error("Ugyldigt svar fra betalingsserver");
            }

            // Redirect to Stripe-hosted checkout page
            window.location.href = data.url;

        } catch (error) {
            console.error(error);
            alert("Noget gik galt med betalingen. Prøv venligst igen.");
            setIsLoading(false);
        }
    };

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/60 backdrop-blur-md transition-opacity" onClick={onClose}></div>
            
            <div className="relative bg-white rounded-3xl w-full max-w-md p-8 shadow-2xl transform transition-all scale-100 opacity-100 overflow-hidden min-h-[500px] flex flex-col justify-center">
                {!isSuccess && (
                    <button onClick={onClose} className="absolute top-6 right-6 p-2 rounded-full hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors z-10">
                        <X className="w-5 h-5" />
                    </button>
                )}

                {isSuccess ? (
                    <div className="text-center animate-in fade-in zoom-in duration-500">
                        <div className="w-24 h-24 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-6 text-green-600 shadow-xl shadow-green-100/50">
                             <CheckCircle2 className="w-12 h-12" />
                        </div>
                        <h3 className="text-2xl font-bold text-slate-900 mb-2">Sender dig til betaling</h3>
                        <p className="text-slate-500">
                            Vi sender dig nu videre til Stripe, hvor selve betalingen gennemføres sikkert. Luk ikke dette vindue, mens vi omdirigerer dig.
                        </p>
                        <div className="mt-8 flex justify-center">
                            <Loader2 className="w-6 h-6 text-slate-300 animate-spin" />
                        </div>
                    </div>
                ) : (
                    <>
                        <div className="mb-8">
                            <h3 className="text-2xl font-bold text-slate-900 mb-2">
                                Opret din konto
                            </h3>
                            <p className="text-slate-500 text-sm">
                                Start med dine kontaktoplysninger. Selve betalingen håndteres sikkert af Stripe.
                            </p>
                        </div>

                        <form onSubmit={handlePayment} className="space-y-4">
                                <div>
                                    <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wide mb-2">Navn</label>
                                    <input 
                                        type="text" 
                                        required
                                        className="w-full h-12 px-4 rounded-xl bg-slate-50 border border-slate-200 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 outline-none transition-all"
                                        placeholder="Anders Andersen"
                                        value={formData.name}
                                        onChange={e => setFormData({...formData, name: e.target.value})}
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wide mb-2">Email</label>
                                    <input 
                                        type="email" 
                                        required
                                        className="w-full h-12 px-4 rounded-xl bg-slate-50 border border-slate-200 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 outline-none transition-all"
                                        placeholder="anders@firma.dk"
                                        value={formData.email}
                                        onChange={e => setFormData({...formData, email: e.target.value})}
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wide mb-2">Telefon</label>
                                    <input 
                                        type="tel" 
                                        required
                                        className="w-full h-12 px-4 rounded-xl bg-slate-50 border border-slate-200 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 outline-none transition-all"
                                        placeholder="20 30 40 50"
                                        value={formData.phone}
                                        onChange={e => setFormData({...formData, phone: e.target.value})}
                                    />
                                </div>

                                <div className="space-y-3 mt-4">
                                    <label className="flex items-start gap-3 cursor-pointer group">
                                        <input
                                            type="checkbox"
                                            checked={acceptedTerms}
                                            onChange={(e) => setAcceptedTerms(e.target.checked)}
                                            className="mt-1 w-4 h-4 rounded border-slate-300 text-black focus:ring-black"
                                        />
                                        <span className="text-sm text-slate-600 group-hover:text-slate-900">
                                            Jeg accepterer{' '}
                                            <a href="/handelsbetingelser" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline font-medium" onClick={(e) => e.stopPropagation()}>
                                                handelsbetingelserne
                                            </a>
                                            .
                                        </span>
                                    </label>
                                    <label className="flex items-start gap-3 cursor-pointer group">
                                        <input
                                            type="checkbox"
                                            checked={acceptedDpa}
                                            onChange={(e) => setAcceptedDpa(e.target.checked)}
                                            className="mt-1 w-4 h-4 rounded border-slate-300 text-black focus:ring-black"
                                        />
                                        <span className="text-sm text-slate-600 group-hover:text-slate-900">
                                            Jeg accepterer{' '}
                                            <a href="/databehandleraftale" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline font-medium" onClick={(e) => e.stopPropagation()}>
                                                databehandleraftalen (DPA)
                                            </a>
                                            .
                                        </span>
                                    </label>
                                </div>

                                <button 
                                    type="submit" 
                                    disabled={isLoading || !acceptedTerms || !acceptedDpa}
                                    className="w-full h-14 mt-4 bg-black text-white font-bold rounded-xl hover:bg-slate-800 transition-colors flex items-center justify-center gap-2 shadow-lg disabled:opacity-70 disabled:cursor-not-allowed"
                                >
                                    {isLoading ? <Loader2 className="animate-spin w-5 h-5" /> : 'Betal & Start'}
                                </button>
                            </form>
                        </>
                )}
            </div>
        </div>
    );
};