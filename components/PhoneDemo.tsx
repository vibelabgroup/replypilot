import React, { useState, useEffect, useRef } from 'react';
import { User, ArrowUp, PhoneMissed } from 'lucide-react';
import { ChatMessage } from '../types';
import { generateAIResponse, initChatSession } from '../services/aiService';

export const PhoneDemo: React.FC = () => {
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [inputValue, setInputValue] = useState('');
    const [isTyping, setIsTyping] = useState(false);
    const [hasActivated, setHasActivated] = useState(false);
    const feedRef = useRef<HTMLDivElement>(null);

    // Initialize the demo
    useEffect(() => {
        const startDemo = async () => {
            initChatSession();
            
            // Initial sequence
            setMessages([
                { id: '1', type: 'event', text: 'I dag 09:41', delay: 0 },
                { id: '2', type: 'event', text: 'Ubesvaret opkald', delay: 0 }
            ]);

            // Simulate the immediate auto-response from AI
            setTimeout(() => {
                const initialMsg: ChatMessage = {
                    id: '3', 
                    type: 'system', 
                    text: 'Hej! 👋 Jeg står lige på en stige. Hvad kan jeg hjælpe med?', 
                    delay: 0
                };
                setMessages(prev => [...prev, initialMsg]);
            }, 1500);
        };

        startDemo();
    }, []);

    // Auto-scroll to bottom
    useEffect(() => {
        if (feedRef.current) {
            feedRef.current.scrollTop = feedRef.current.scrollHeight;
        }
    }, [messages, isTyping]);

    const handleSendMessage = async (e?: React.FormEvent) => {
        e?.preventDefault();
        if (!inputValue.trim()) return;

        const userMsgText = inputValue;
        setInputValue('');
        setHasActivated(true);

        // Add User Message
        const userMsg: ChatMessage = {
            id: Date.now().toString(),
            type: 'user',
            text: userMsgText,
            delay: 0
        };
        setMessages(prev => [...prev, userMsg]);

        // Get AI Response
        setIsTyping(true);
        const aiResponseText = await generateAIResponse(userMsgText);
        setIsTyping(false);

        // Add AI Message
        const aiMsg: ChatMessage = {
            id: (Date.now() + 1).toString(),
            type: 'system',
            text: aiResponseText,
            delay: 0
        };
        setMessages(prev => [...prev, aiMsg]);
    };

    return (
        <div className="relative bg-black rounded-[3rem] h-[680px] w-[340px] shadow-2xl flex flex-col select-none transform transition-transform duration-700 hover:scale-[1.02] border-[8px] border-black ring-1 ring-white/10">
            {/* Screen */}
            <div className="rounded-[2.5rem] overflow-hidden w-full h-full bg-white relative flex flex-col">
                {/* Dynamic Island / Notch Area */}
                <div className="h-14 bg-white flex justify-between items-center px-8 pt-3 z-10 shrink-0">
                    <span className="text-sm font-semibold text-black">09:41</span>
                    <div className="flex gap-1.5">
                        <div className="w-5 h-3 bg-black rounded-[2px]"></div>
                        <div className="w-1.5 h-1.5 bg-black rounded-full mt-0.5"></div>
                    </div>
                </div>

                {/* Chat Interface */}
                <div className="flex-1 flex flex-col relative overflow-hidden bg-white">
                    {/* Contact Header */}
                    <div className="flex flex-col items-center py-4 border-b border-slate-50 bg-white/80 backdrop-blur-md z-10 sticky top-0">
                        <div className="w-14 h-14 bg-slate-100 rounded-full flex items-center justify-center text-slate-400 mb-2">
                            <User className="w-7 h-7" />
                        </div>
                        <span className="text-xs font-medium text-slate-400">Tømrer Hansen</span>
                    </div>

                    {/* Feed */}
                    <div ref={feedRef} className="flex-1 overflow-y-auto p-4 space-y-4 scrollbar-hide bg-white pb-20">
                        {messages.map((msg) => (
                            <div 
                                key={msg.id} 
                                className={`flex ${msg.type === 'user' ? 'justify-end' : (msg.type === 'system' ? 'justify-start' : 'justify-center')} message-enter`}
                            >
                                {msg.type === 'event' && (
                                    <div className="flex flex-col items-center gap-1 my-2">
                                        {msg.text === 'Ubesvaret opkald' && <PhoneMissed className="w-4 h-4 text-red-500 mb-1" />}
                                        <span className={`text-[10px] font-semibold uppercase tracking-wider ${msg.text === 'Ubesvaret opkald' ? 'text-red-500' : 'text-slate-400'}`}>
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
                                        <div className="absolute top-0 left-[-8px] w-4 h-4 bg-slate-100 rounded-full -z-10"></div>
                                    </div>
                                )}
                            </div>
                        ))}
                        {isTyping && (
                            <div className="flex justify-start message-enter mb-4">
                                <div className="bg-slate-100 text-slate-800 px-4 py-3 rounded-2xl rounded-tl-none flex items-center h-10">
                                    <div className="typing-indicator">
                                        <span></span><span></span><span></span>
                                    </div>
                                </div>
                            </div>
                        )}
                        
                        {!hasActivated && messages.length > 2 && (
                            <div className="text-center mt-4">
                                <span className="inline-block bg-blue-50 text-blue-600 text-[10px] font-bold px-3 py-1 rounded-full animate-pulse">
                                    Prøv at skrive herunder 👇
                                </span>
                            </div>
                        )}
                    </div>

                    {/* Input Bar */}
                    <div className="p-3 bg-white border-t border-slate-100 shrink-0 absolute bottom-0 w-full">
                        <form onSubmit={handleSendMessage} className="flex items-center gap-2">
                            <input
                                type="text"
                                value={inputValue}
                                onChange={(e) => setInputValue(e.target.value)}
                                placeholder="iMessage"
                                className="flex-1 h-10 rounded-full border border-slate-300 bg-white px-4 text-[15px] focus:outline-none focus:border-slate-400 placeholder:text-slate-400"
                            />
                            <button 
                                type="submit"
                                disabled={!inputValue.trim()}
                                className={`w-8 h-8 rounded-full flex items-center justify-center text-white shadow-sm transition-all ${inputValue.trim() ? 'bg-blue-600 hover:bg-blue-700' : 'bg-slate-300'}`}
                            >
                                <ArrowUp className="w-4 h-4 font-bold" strokeWidth={3} />
                            </button>
                        </form>
                    </div>
                </div>
                
                {/* Home Indicator */}
                <div className="absolute bottom-2 w-full flex justify-center pb-2 pointer-events-none">
                    <div className="w-32 h-1 bg-black rounded-full"></div>
                </div>
            </div>
        </div>
    );
};