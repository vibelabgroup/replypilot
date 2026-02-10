import React from 'react';
import { Loader2 } from 'lucide-react';

interface ToastProps {
    message: string;
    isVisible: boolean;
}

export const Toast: React.FC<ToastProps> = ({ message, isVisible }) => {
    return (
        <div 
            id="toast" 
            className={isVisible ? 'show' : ''}
            style={{
                visibility: isVisible ? 'visible' : 'hidden',
                minWidth: '300px',
                backgroundColor: '#0f172a',
                color: '#fff',
                textAlign: 'center',
                borderRadius: '100px',
                padding: '14px 28px',
                position: 'fixed',
                zIndex: 100,
                bottom: '40px',
                left: '50%',
                transform: isVisible ? 'translateX(-50%) translateY(0) scale(1)' : 'translateX(-50%) translateY(20px) scale(0.95)',
                boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.1)',
                opacity: isVisible ? 1 : 0,
                transition: 'all 0.5s cubic-bezier(0.16, 1, 0.3, 1)',
                fontSize: '15px',
                fontWeight: 500,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '12px'
            }}
        >
            <Loader2 className="animate-spin w-4 h-4 text-blue-400" />
            <span>{message}</span>
        </div>
    );
};