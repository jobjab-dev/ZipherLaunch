'use client';
import { createContext, useContext, useState, useCallback, ReactNode } from 'react';
import { createPortal } from 'react-dom';

interface Toast {
    id: string;
    type: 'info' | 'success' | 'error' | 'encrypting';
    title: string;
    message?: string;
    duration?: number;
}

interface ToastContextType {
    toast: (toast: Omit<Toast, 'id'>) => void;
    encrypt: (title: string, message?: string) => string;
    decrypt: (id: string, success: boolean, title: string, message?: string) => void;
}

const ToastContext = createContext<ToastContextType | undefined>(undefined);

export function useToast() {
    const context = useContext(ToastContext);
    if (!context) throw new Error('useToast must be used within ToastProvider');
    return context;
}

// Scramble effect for encryption
function ScrambleEffect({ text }: { text: string }) {
    const chars = '!@#$%^&*()_+{}[]|;:,.<>?/~`0123456789ABCDEF';
    const [display, setDisplay] = useState(text);

    useState(() => {
        let frame = 0;
        const maxFrames = 20;
        const interval = setInterval(() => {
            if (frame >= maxFrames) {
                setDisplay(text);
                clearInterval(interval);
                return;
            }
            setDisplay(text.split('').map((char, i) => {
                if (i < frame) return text[i];
                return chars[Math.floor(Math.random() * chars.length)];
            }).join(''));
            frame++;
        }, 50);
        return () => clearInterval(interval);
    });

    return <span style={{ fontFamily: 'monospace' }}>{display}</span>;
}

function ToastItem({ toast, onRemove }: { toast: Toast; onRemove: () => void }) {
    const [isRemoving, setIsRemoving] = useState(false);

    useState(() => {
        if (toast.type !== 'encrypting' && toast.duration !== 0) {
            const timer = setTimeout(() => {
                setIsRemoving(true);
                setTimeout(onRemove, 300);
            }, toast.duration || 5000);
            return () => clearTimeout(timer);
        }
    });

    const colors = {
        info: { bg: 'rgba(59, 130, 246, 0.15)', border: '#3B82F6', icon: '🔷' },
        success: { bg: 'rgba(0, 255, 100, 0.15)', border: '#00FF64', icon: '✓' },
        error: { bg: 'rgba(239, 68, 68, 0.15)', border: '#EF4444', icon: '✕' },
        encrypting: { bg: 'rgba(255, 215, 0, 0.15)', border: '#FFD700', icon: '🔐' }
    };

    const style = colors[toast.type];

    return (
        <div
            style={{
                display: 'flex',
                gap: '12px',
                padding: '16px 20px',
                background: style.bg,
                border: `1px solid ${style.border}`,
                borderRadius: '12px',
                backdropFilter: 'blur(10px)',
                minWidth: '320px',
                maxWidth: '420px',
                animation: isRemoving ? 'slideOut 0.3s ease-out' : 'slideIn 0.3s ease-out',
                boxShadow: `0 0 20px ${style.border}40`
            }}
        >
            <div style={{
                fontSize: '20px',
                animation: toast.type === 'encrypting' ? 'pulse 1s infinite' : 'none'
            }}>
                {style.icon}
            </div>
            <div style={{ flex: 1 }}>
                <div style={{
                    fontWeight: 'bold',
                    color: style.border,
                    marginBottom: toast.message ? '4px' : 0,
                    fontSize: '14px'
                }}>
                    {toast.type === 'encrypting' ? (
                        <ScrambleEffect text={toast.title} />
                    ) : toast.title}
                </div>
                {toast.message && (
                    <div style={{
                        fontSize: '12px',
                        color: '#888',
                        wordBreak: 'break-all'
                    }}>
                        {toast.message}
                    </div>
                )}
            </div>
            {toast.type !== 'encrypting' && (
                <button
                    onClick={() => { setIsRemoving(true); setTimeout(onRemove, 300); }}
                    style={{
                        background: 'none',
                        border: 'none',
                        color: '#666',
                        cursor: 'pointer',
                        padding: '0',
                        fontSize: '16px'
                    }}
                >
                    ×
                </button>
            )}
        </div>
    );
}

export function ToastProvider({ children }: { children: ReactNode }) {
    const [toasts, setToasts] = useState<Toast[]>([]);
    const [mounted, setMounted] = useState(false);

    useState(() => {
        setMounted(true);
    });

    const toast = useCallback((t: Omit<Toast, 'id'>) => {
        const id = Math.random().toString(36).substr(2, 9);
        setToasts(prev => [...prev, { ...t, id }]);
    }, []);

    const encrypt = useCallback((title: string, message?: string) => {
        const id = Math.random().toString(36).substr(2, 9);
        setToasts(prev => [...prev, { id, type: 'encrypting', title, message, duration: 0 }]);
        return id;
    }, []);

    const decrypt = useCallback((id: string, success: boolean, title: string, message?: string) => {
        setToasts(prev => prev.map(t =>
            t.id === id ? { ...t, type: success ? 'success' : 'error', title, message, duration: 6000 } : t
        ));
    }, []);

    const removeToast = useCallback((id: string) => {
        setToasts(prev => prev.filter(t => t.id !== id));
    }, []);

    return (
        <ToastContext.Provider value={{ toast, encrypt, decrypt }}>
            {children}
            {mounted && typeof window !== 'undefined' && createPortal(
                <>
                    <style>{`
                        @keyframes slideIn {
                            from { transform: translateX(-100%); opacity: 0; }
                            to { transform: translateX(0); opacity: 1; }
                        }
                        @keyframes slideOut {
                            from { transform: translateX(0); opacity: 1; }
                            to { transform: translateX(-100%); opacity: 0; }
                        }
                        @keyframes pulse {
                            0%, 100% { opacity: 1; }
                            50% { opacity: 0.5; }
                        }
                    `}</style>
                    <div style={{
                        position: 'fixed',
                        bottom: '24px',
                        left: '24px',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '12px',
                        zIndex: 9999
                    }}>
                        {toasts.map(t => (
                            <ToastItem key={t.id} toast={t} onRemove={() => removeToast(t.id)} />
                        ))}
                    </div>
                </>,
                document.body
            )}
        </ToastContext.Provider>
    );
}
