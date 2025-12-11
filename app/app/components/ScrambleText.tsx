'use client';
import { useEffect, useState, useRef } from 'react';

interface ScrambleTextProps {
    text: string;
    className?: string;
    scrambleSpeed?: number;
    revealSpeed?: number;
    trigger?: boolean;
    onComplete?: () => void;
}

const CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789@#$%&';

export default function ScrambleText({
    text,
    className = '',
    scrambleSpeed = 30,
    trigger = true,
    onComplete
}: ScrambleTextProps) {
    const [displayText, setDisplayText] = useState(text);
    const intervalRef = useRef<NodeJS.Timeout | null>(null);

    useEffect(() => {
        if (!trigger) {
            setDisplayText(text);
            return;
        }

        let iteration = 0;

        if (intervalRef.current) clearInterval(intervalRef.current);

        intervalRef.current = setInterval(() => {
            setDisplayText(prev =>
                text
                    .split('')
                    .map((char, index) => {
                        if (index < iteration) {
                            return text[index];
                        }
                        return CHARS[Math.floor(Math.random() * CHARS.length)];
                    })
                    .join('')
            );

            if (iteration >= text.length) {
                if (intervalRef.current) clearInterval(intervalRef.current);
                if (onComplete) onComplete();
            }

            iteration += 1 / 3;
        }, scrambleSpeed);

        return () => {
            if (intervalRef.current) clearInterval(intervalRef.current);
        };
    }, [text, trigger, scrambleSpeed, onComplete]);

    return (
        <span className={className}>
            {displayText}
        </span>
    );
}
