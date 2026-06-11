'use client';

import { useEffect, useState } from 'react';

export function AppSplash() {
    const [hidden, setHidden] = useState(false);
    const [removed, setRemoved] = useState(false);

    useEffect(() => {
        // Runs once hydration completes -> app is interactive, content is ready.
        const fade = setTimeout(() => setHidden(true), 150);
        const remove = setTimeout(() => setRemoved(true), 650);
        return () => {
            clearTimeout(fade);
            clearTimeout(remove);
        };
    }, []);

    if (removed) return null;

    return (
        <div
            aria-hidden={hidden}
            style={{
                position: 'fixed',
                inset: 0,
                zIndex: 9999,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 28,
                background: '#FFFFFF',
                opacity: hidden ? 0 : 1,
                pointerEvents: hidden ? 'none' : 'auto',
                transition: 'opacity 0.45s ease',
            }}
        >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
                src="/autoversa_temp_logo.jpeg"
                alt="AutoVersa"
                width={180}
                draggable={false}
                style={{ height: 'auto', userSelect: 'none' }}
            />
            <span
                style={{
                    width: 34,
                    height: 34,
                    border: '3px solid #0074BD',
                    borderTopColor: 'transparent',
                    borderRadius: '50%',
                    animation: 'av-splash-spin 0.7s linear infinite',
                }}
            />
            <style>{`@keyframes av-splash-spin { to { transform: rotate(360deg); } }`}</style>
        </div>
    );
}