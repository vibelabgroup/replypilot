import React, { useState } from 'react';
import { X, Loader2, Lock, CreditCard, CheckCircle2 } from 'lucide-react';
import { processPayment } from '../../services/paymentService';

interface ModalProps {
    isOpen: boolean;
    onClose: () => void;
    onPaymentComplete: () => void;
}

export const Modal: React.FC<ModalProps> = ({ isOpen, onClose, onPaymentComplete }) => {
    const [isLoading, setIsLoading] = useState(false);
    const [isSuccess, setIsSuccess] = useState(false);
    const [step, setStep] = useState<'details' | 'payment'>('details');
    
    // Pre-filled for better demo experience
    const [formData, setFormData] = useState({
        name: 'Mester Hansen',
        email: 'mester@hansen-byg.dk',
        phone: '20304050',
        cardNumber: '4571 1234 5678 9000',
        expiry: '12/26',
        cvc: '123'
    });

    if (!isOpen) return null;

    const handleNext = (e: React.FormEvent) => {
        e.preventDefault();
        setStep('payment');
    };

    const handlePayment = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsLoading(true);
        try {
            await processPayment({
                name: formData.name,
                email: formData.email,
                cardNumber: formData.cardNumber,
                expiry: formData.expiry,
                cvc: formData.cvc
            });
            
            // Show success state
            setIsSuccess(true);
            
            // Wait 2 seconds then trigger onboarding
            setTimeout(() => {
                onClose();
                onPaymentComplete();
            }, 2000);

        } catch (error) {
            console.error(error);
            alert("Betalingen blev afvist. Prøv venligst igen.");
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
                        <h3 className="text-2xl font-bold text-slate-900 mb-2">Betaling Godkendt</h3>
                        <p className="text-slate-500">Klargør din AI receptionist...</p>
                        <div className="mt-8 flex justify-center">
                            <Loader2 className="w-6 h-6 text-slate-300 animate-spin" />
                        </div>
                    </div>
                ) : (
                    <>
                        <div className="mb-8">
                            <h3 className="text-2xl font-bold text-slate-900 mb-2">
                                {step === 'details' ? 'Opret din konto' : 'Sikker betaling'}
                            </h3>
                            <p className="text-slate-500 text-sm">
                                {step === 'details' ? 'Start med dine kontaktoplysninger.' : '14 dages fuld tilfredshedsgaranti.'}
                            </p>
                        </div>

                        {step === 'details' ? (
                            <form onSubmit={handleNext} className="space-y-4">
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

                                <button 
                                    type="submit" 
                                    className="w-full h-14 mt-4 bg-black text-white font-bold rounded-xl hover:bg-slate-800 transition-colors flex items-center justify-center gap-2 shadow-lg"
                                >
                                    Fortsæt
                                </button>
                            </form>
                        ) : (
                            <form onSubmit={handlePayment} className="space-y-4">
                                <div className="bg-slate-50 p-4 rounded-xl border border-slate-100 mb-6">
                                    <div className="flex justify-between items-center mb-2">
                                        <span className="text-sm font-medium text-slate-900">Pro Abonnement</span>
                                        <span className="text-sm font-bold text-slate-900">1.995 kr.</span>
                                    </div>
                                    <div className="flex justify-between items-center text-xs text-slate-500">
                                        <span>Moms (25%)</span>
                                        <span>498,75 kr.</span>
                                    </div>
                                    <div className="border-t border-slate-200 my-2"></div>
                                    <div className="flex justify-between items-center font-bold text-slate-900">
                                        <span>Total</span>
                                        <span>2.493,75 kr.</span>
                                    </div>
                                </div>

                                <div>
                                    <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wide mb-2">Kortnummer</label>
                                    <div className="relative">
                                        <input 
                                            type="text" 
                                            required
                                            className="w-full h-12 pl-12 pr-4 rounded-xl bg-white border border-slate-200 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 outline-none transition-all"
                                            placeholder="0000 0000 0000 0000"
                                            value={formData.cardNumber}
                                            onChange={e => setFormData({...formData, cardNumber: e.target.value})}
                                        />
                                        <CreditCard className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 w-5 h-5" />
                                    </div>
                                </div>

                                <div className="flex gap-4">
                                    <div className="w-1/2">
                                        <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wide mb-2">Udløb</label>
                                        <input 
                                            type="text" 
                                            required
                                            className="w-full h-12 px-4 rounded-xl bg-white border border-slate-200 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 outline-none transition-all"
                                            placeholder="MM/ÅÅ"
                                            value={formData.expiry}
                                            onChange={e => setFormData({...formData, expiry: e.target.value})}
                                        />
                                    </div>
                                    <div className="w-1/2">
                                        <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wide mb-2">CVC</label>
                                        <div className="relative">
                                            <input 
                                                type="text" 
                                                required
                                                className="w-full h-12 pl-10 pr-4 rounded-xl bg-white border border-slate-200 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 outline-none transition-all"
                                                placeholder="123"
                                                value={formData.cvc}
                                                onChange={e => setFormData({...formData, cvc: e.target.value})}
                                            />
                                            <Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 w-4 h-4" />
                                        </div>
                                    </div>
                                </div>

                                <button 
                                    type="submit" 
                                    disabled={isLoading}
                                    className="w-full h-14 mt-4 bg-black text-white font-bold rounded-xl hover:bg-slate-800 transition-colors flex items-center justify-center gap-2 shadow-lg disabled:opacity-70 disabled:cursor-not-allowed"
                                >
                                    {isLoading ? <Loader2 className="animate-spin w-5 h-5" /> : 'Betal & Start'}
                                </button>
                                
                                <p className="text-[10px] text-center text-slate-400 mt-2">
                                    Ved betaling accepterer du vores handelsbetingelser.
                                </p>
                            </form>
                        )}
                    </>
                )}
            </div>
        </div>
    );
};