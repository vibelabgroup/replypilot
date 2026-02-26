import React, { useState, useEffect, useRef } from 'react';
import { User, ArrowUp, PhoneMissed } from 'lucide-react';
import type { ChatMessage } from '../types';
import { generateAIResponse, initChatSession } from '../services/aiService';

export const BuilderLiveDemo: React.FC = () => {
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [inputValue, setInputValue] = useState('');
    const [isTyping, setIsTyping] = useState(false);
    const [hasActivated, setHasActivated] = useState(false);
    const [userMessageCount, setUserMessageCount] = useState(0);
    const [summaryReady, setSummaryReady] = useState(false);
    const [showingSummary, setShowingSummary] = useState(false);
    const [hasShownSummary, setHasShownSummary] = useState(false);
    const [isGeneratingSummary, setIsGeneratingSummary] = useState(false);
    const [lastActivityAt, setLastActivityAt] = useState<number>(() => Date.now());

    const initializedRef = useRef(false);
    const feedRef = useRef<HTMLDivElement>(null);

    // Initialize the demo once
    useEffect(() => {
        if (initializedRef.current) return;
        initializedRef.current = true;

        const startDemo = async () => {
            initChatSession();

            setMessages([
                { id: '1', type: 'event', text: 'I dag 09:41', delay: 0 },
                { id: '2', type: 'event', text: 'Ubesvaret opkald', delay: 0 },
            ]);

            // Simulate immediate auto-response from AI
            setTimeout(() => {
                const initialMsg: ChatMessage = {
                    id: '3',
                    type: 'system',
                    text: 'Hej! 👋 Jeg står lige på en byggeplads. Hvad kan jeg hjælpe dig med?',
                    delay: 0,
                };
                setMessages((prev) => [...prev, initialMsg]);
            }, 1500);
        };

        startDemo();
    }, []);

    // Auto-scroll to bottom on new messages
    useEffect(() => {
        if (feedRef.current) {
            feedRef.current.scrollTop = feedRef.current.scrollHeight;
        }
    }, [messages, isTyping]);

    // Enable summary CTA after 5 user messages
    useEffect(() => {
        if (!summaryReady && !hasShownSummary && !showingSummary && userMessageCount >= 5) {
            setSummaryReady(true);
        }
    }, [userMessageCount, summaryReady, hasShownSummary, showingSummary]);

    // Enable summary CTA after 20s inactivity (only after at least one user message)
    useEffect(() => {
        if (hasShownSummary || showingSummary) return;

        const intervalId = window.setInterval(() => {
            if (summaryReady || userMessageCount === 0) return;
            const now = Date.now();
            if (now - lastActivityAt >= 20000) {
                setSummaryReady(true);
            }
        }, 1000);

        return () => window.clearInterval(intervalId);
    }, [lastActivityAt, summaryReady, userMessageCount, hasShownSummary, showingSummary]);

    const buildHistoryForSummary = () => {
        return messages
            .filter((msg) => msg.type === 'user' || msg.type === 'system')
            .map((msg) => ({
                role: msg.type === 'user' ? ('user' as const) : ('model' as const),
                text: msg.text,
            }));
    };

    const handleSendMessage = async (e?: React.FormEvent) => {
        e?.preventDefault();
        if (!inputValue.trim() || showingSummary) return;

        const userMsgText = inputValue;
        setInputValue('');
        setHasActivated(true);
        setLastActivityAt(Date.now());
        setUserMessageCount((count) => count + 1);

        const userMsg: ChatMessage = {
            id: Date.now().toString(),
            type: 'user',
            text: userMsgText,
            delay: 0,
        };
        setMessages((prev) => [...prev, userMsg]);

        setIsTyping(true);
        const history = messages
            .filter((msg) => msg.type === 'user' || msg.type === 'system')
            .map((msg) => ({
                role: msg.type === 'user' ? ('user' as const) : ('model' as const),
                text: msg.text,
            }));

        const aiResponseText = await generateAIResponse(userMsgText, history);
        setIsTyping(false);

        const aiMsg: ChatMessage = {
            id: (Date.now() + 1).toString(),
            type: 'system',
            text: aiResponseText,
            delay: 0,
        };
        setMessages((prev) => [...prev, aiMsg]);
    };

    const handleShowSummary = async () => {
        if (showingSummary || hasShownSummary || isGeneratingSummary || userMessageCount === 0) {
            return;
        }
        setIsGeneratingSummary(true);
        setSummaryReady(false);

        try {
            const history = buildHistoryForSummary();
            const summaryPrompt =
                'Skriv en kort SMS-opsummering til håndværkeren, som du ville sende efter denne SMS-dialog med kunden. ' +
                'Opsummer hvem kunden er, hvilken opgave de ønsker hjælp til, hvor og hvornår det skal udføres og evt. budget. ' +
                'Maks 3 korte sætninger. Svar kun med selve SMS-beskeden på dansk.';

            const summaryText = await generateAIResponse(summaryPrompt, history);

            const headerMsg: ChatMessage = {
                id: 'summary-header',
                type: 'event',
                text: 'Sådan ser beskeden ud til dig',
                delay: 0,
            };

            const summaryMsg: ChatMessage = {
                id: 'summary',
                type: 'system',
                text: summaryText,
                delay: 0,
            };

            setMessages([headerMsg, summaryMsg]);
            setShowingSummary(true);
            setHasShownSummary(true);
            setInputValue('');
        } finally {
            setIsGeneratingSummary(false);
        }
    };

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setInputValue(e.target.value);
        setLastActivityAt(Date.now());
    };

    const showSummaryButton = summaryReady && !showingSummary && !hasShownSummary && userMessageCount > 0;

    return (
        <div className="relative bg-black rounded-[3rem] h-[660px] w-[340px] shadow-2xl flex flex-col select-none transform transition-transform duration-700 hover:scale-[1.02] border-[8px] border-black ring-1 ring-white/10">
            {/* Screen */}
            <div className="rounded-[2.5rem] overflow-hidden w-full h-full bg-white relative flex flex-col">
                {/* Dynamic Island / Notch Area */}
                <div className="h-11 bg-white flex justify-between items-center px-7 pt-2.5 z-10 shrink-0">
                    <span className="text-sm font-semibold text-black">09:41</span>
                    <div className="flex gap-1.5">
                        <div className="w-5 h-3 bg-black rounded-[2px]" />
                        <div className="w-1.5 h-1.5 bg-black rounded-full mt-0.5" />
                    </div>
                </div>

                {/* Chat Interface */}
                <div className="flex-1 flex flex-col relative overflow-hidden bg-white">
                    {/* Contact Header */}
                    <div className="flex flex-col items-center py-2.5 border-b border-slate-50 bg-white/80 backdrop-blur-md z-10 sticky top-0">
                        <div className="w-14 h-14 bg-slate-100 rounded-full flex items-center justify-center text-slate-400 mb-2">
                            <User className="w-7 h-7" />
                        </div>
                        <span className="text-xs font-medium text-slate-400">Kunde skriver til dig</span>
                    </div>

                    {/* Feed */}
                    <div ref={feedRef} className="flex-1 overflow-y-auto px-4 pt-3 pb-20 space-y-4 scrollbar-hide bg-white">
                        {messages.map((msg) => (
                            <div
                                key={msg.id}
                                className={`flex ${
                                    msg.type === 'user'
                                        ? 'justify-end'
                                        : msg.type === 'system'
                                        ? 'justify-start'
                                        : 'justify-center'
                                } message-enter`}
                            >
                                {msg.type === 'event' && (
                                    <div className="flex flex-col items-center gap-1 my-2">
                                        {msg.text === 'Ubesvaret opkald' && (
                                            <PhoneMissed className="w-4 h-4 text-red-500 mb-1" />
                                        )}
                                        <span
                                            className={`text-[10px] font-semibold uppercase tracking-wider ${
                                                msg.text === 'Ubesvaret opkald'
                                                    ? 'text-red-500'
                                                    : 'text-slate-400'
                                            }`}
                                        >
                                            {msg.text}
                                        </span>
                                    </div>
                                )}
                                {msg.type === 'user' && (
                                    <div className="bg-blue-600 text-white px-5 py-3 rounded-2xl rounded-br-none text-[15px] max-w-[85%] shadow-md leading-relaxed">
                                        {msg.text}
                                    </div>
                                )}
                                {msg.type === 'system' && (
                                    <div className="bg-slate-100 text-slate-900 px-5 py-3 rounded-2xl rounded-tl-none text-[15px] max-w-[85%] leading-relaxed font-medium relative">
                                        {msg.text}
                                        <div className="absolute top-0 left-[-8px] w-4 h-4 bg-slate-100 rounded-full -z-10" />
                                    </div>
                                )}
                            </div>
                        ))}
                        {isTyping && !showingSummary && (
                            <div className="flex justify-start message-enter mb-4">
                                <div className="bg-slate-100 text-slate-800 px-4 py-3 rounded-2xl rounded-tl-none flex items-center h-10">
                                    <div className="typing-indicator">
                                        <span />
                                        <span />
                                        <span />
                                    </div>
                                </div>
                            </div>
                        )}

                        {!hasActivated && messages.length > 2 && !showingSummary && (
                            <div className="text-center mt-2">
                                <span className="inline-block bg-blue-50 text-blue-600 text-[10px] font-bold px-3 py-1 rounded-full animate-pulse">
                                    Prøv at skrive herunder 👇
                                </span>
                            </div>
                        )}
                    </div>

                    {/* Summary CTA inside phone, above input */}
                    {showSummaryButton && (
                        <div className="absolute inset-x-0 bottom-14 px-4 pb-2">
                            <button
                                type="button"
                                onClick={handleShowSummary}
                                disabled={isGeneratingSummary}
                                className="w-full text-xs font-semibold tracking-wide uppercase bg-black text-white rounded-full py-2.5 shadow-lg hover:bg-slate-900 disabled:opacity-70 disabled:cursor-not-allowed transition-colors"
                            >
                                {isGeneratingSummary ? 'Genererer opsummering…' : 'Se hvad agenten sender dig'}
                            </button>
                        </div>
                    )}

                    {/* Input Bar */}
                    <div className="px-3 py-2 bg-white border-t border-slate-100 shrink-0 absolute bottom-0 w-full">
                        {showingSummary ? (
                            <div className="text-[11px] text-slate-400 text-center">
                                Demo afsluttet – ovenfor ser du eksemplet på den SMS, du ville modtage.
                            </div>
                        ) : (
                            <form onSubmit={handleSendMessage} className="flex items-center gap-2">
                                <input
                                    type="text"
                                    value={inputValue}
                                    onChange={handleInputChange}
                                    placeholder="Skriv som en kunde…"
                                    className="flex-1 h-10 rounded-full border border-slate-300 bg-white px-4 text-[15px] focus:outline-none focus:border-slate-400 placeholder:text-slate-400"
                                />
                                <button
                                    type="submit"
                                    disabled={!inputValue.trim()}
                                    className={`w-8 h-8 rounded-full flex items-center justify-center text-white shadow-sm transition-all ${
                                        inputValue.trim()
                                            ? 'bg-blue-600 hover:bg-blue-700'
                                            : 'bg-slate-300'
                                    }`}
                                >
                                    <ArrowUp className="w-4 h-4 font-bold" strokeWidth={3} />
                                </button>
                            </form>
                        )}
                    </div>
                </div>

                {/* Home Indicator */}
                <div className="absolute bottom-2 w-full flex justify-center pb-2 pointer-events-none">
                    <div className="w-32 h-1 bg-black rounded-full" />
                </div>
            </div>
        </div>
    );
};

