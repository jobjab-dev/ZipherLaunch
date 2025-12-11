'use client';
import { useState, useEffect } from 'react';
import Link from 'next/link';
import { ConnectButton } from '@rainbow-me/rainbowkit';
import { useAccount, useWriteContract, useWaitForTransactionReceipt, useReadContract } from 'wagmi';
import { parseUnits, formatUnits } from 'viem';
import ScrambleText from '../components/ScrambleText';
import { useToast } from '../components/Toast';

const ERC20_ABI = [
    {
        "inputs": [{ "name": "spender", "type": "address" }, { "name": "value", "type": "uint256" }],
        "name": "approve",
        "outputs": [{ "name": "", "type": "bool" }],
        "stateMutability": "nonpayable",
        "type": "function"
    },
    {
        "inputs": [{ "name": "account", "type": "address" }],
        "name": "balanceOf",
        "outputs": [{ "name": "", "type": "uint256" }],
        "stateMutability": "view",
        "type": "function"
    },
    {
        "inputs": [],
        "name": "decimals",
        "outputs": [{ "name": "", "type": "uint8" }],
        "stateMutability": "view",
        "type": "function"
    },
    {
        "inputs": [],
        "name": "symbol",
        "outputs": [{ "name": "", "type": "string" }],
        "stateMutability": "view",
        "type": "function"
    },
    {
        "inputs": [],
        "name": "name",
        "outputs": [{ "name": "", "type": "string" }],
        "stateMutability": "view",
        "type": "function"
    }
] as const;

const WRAPPER_FACTORY_ABI = [
    {
        "inputs": [{ "name": "underlyingToken", "type": "address" }],
        "name": "createWrapper",
        "outputs": [{ "name": "wrapperAddress", "type": "address" }],
        "stateMutability": "nonpayable",
        "type": "function"
    },
    {
        "inputs": [{ "name": "underlyingToken", "type": "address" }],
        "name": "getWrapper",
        "outputs": [{ "name": "", "type": "address" }],
        "stateMutability": "view",
        "type": "function"
    }
] as const;

const WRAPPER_ABI = [
    {
        "inputs": [{ "name": "to", "type": "address" }, { "name": "amount", "type": "uint256" }],
        "name": "wrap",
        "outputs": [],
        "stateMutability": "nonpayable",
        "type": "function"
    },
    {
        "inputs": [{ "name": "to", "type": "address" }, { "name": "amount", "type": "uint256" }],
        "name": "withdrawTo",
        "outputs": [],
        "stateMutability": "nonpayable",
        "type": "function"
    },
    {
        "inputs": [{ "name": "account", "type": "address" }],
        "name": "balanceOf",
        "outputs": [{ "name": "", "type": "uint256" }],
        "stateMutability": "view",
        "type": "function"
    }
] as const;

const WRAPPER_FACTORY_ADDRESS = process.env.NEXT_PUBLIC_WRAPPER_FACTORY_ADDRESS as `0x${string}`;
const SAMPLE_TOKEN = process.env.NEXT_PUBLIC_SAMPLE_TOKEN_ADDRESS as `0x${string}`;

export default function WrapPage() {
    const { address, isConnected } = useAccount();
    const { encrypt, decrypt, toast } = useToast();

    const [mode, setMode] = useState<'wrap' | 'unwrap'>('wrap');
    const [tokenAddress, setTokenAddress] = useState(SAMPLE_TOKEN || '');
    const [amount, setAmount] = useState('');
    const [approvalDone, setApprovalDone] = useState(false);
    const [currentAction, setCurrentAction] = useState<'create' | 'approve' | 'wrap' | 'unwrap' | null>(null);
    const [encryptToastId, setEncryptToastId] = useState<string | null>(null);
    const [successState, setSuccessState] = useState(false);

    const { data: hash, isPending, writeContract, reset } = useWriteContract();
    const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash });

    // Check if wrapper exists
    const { data: wrapperAddress, refetch: refetchWrapper } = useReadContract({
        address: WRAPPER_FACTORY_ADDRESS,
        abi: WRAPPER_FACTORY_ABI,
        functionName: 'getWrapper',
        args: [tokenAddress as `0x${string}`],
        query: { enabled: !!tokenAddress && tokenAddress.length === 42 }
    });

    // Get public token info
    const { data: balance, refetch: refetchBalance } = useReadContract({
        address: tokenAddress as `0x${string}`,
        abi: ERC20_ABI,
        functionName: 'balanceOf',
        args: [address!],
        query: { enabled: !!address && !!tokenAddress && tokenAddress.length === 42 }
    });

    const { data: decimals } = useReadContract({
        address: tokenAddress as `0x${string}`,
        abi: ERC20_ABI,
        functionName: 'decimals',
        query: { enabled: !!tokenAddress && tokenAddress.length === 42 }
    });

    const { data: symbol } = useReadContract({
        address: tokenAddress as `0x${string}`,
        abi: ERC20_ABI,
        functionName: 'symbol',
        query: { enabled: !!tokenAddress && tokenAddress.length === 42 }
    });

    // Get wrapped token balance
    const { data: wrappedBalance, refetch: refetchWrappedBalance } = useReadContract({
        address: wrapperAddress as `0x${string}`,
        abi: WRAPPER_ABI,
        functionName: 'balanceOf',
        args: [address!],
        query: { enabled: !!address && !!wrapperAddress && wrapperAddress !== '0x0000000000000000000000000000000000000000' }
    });

    const hasWrapper = wrapperAddress && wrapperAddress !== '0x0000000000000000000000000000000000000000';

    // Handle encryption animation
    useEffect(() => {
        if (isPending && !encryptToastId && currentAction) {
            const actionText = currentAction === 'create' ? 'CREATING WRAPPER...'
                : currentAction === 'approve' ? 'APPROVING...'
                    : currentAction === 'wrap' ? 'WRAPPING...'
                        : 'UNWRAPPING...';
            const id = encrypt(actionText, 'Waiting for wallet confirmation');
            setEncryptToastId(id);
        }
    }, [isPending, encryptToastId, currentAction, encrypt]);

    useEffect(() => {
        if (isConfirming && encryptToastId) {
            decrypt(encryptToastId, true, 'PROCESSING ON-CHAIN...', `TX: ${hash?.slice(0, 20)}...`);
            const id = encrypt('DECRYPTING RESULT...', 'Waiting for confirmation');
            setEncryptToastId(id);
        }
    }, [isConfirming]);

    useEffect(() => {
        if (isSuccess && encryptToastId && currentAction) {
            if (currentAction === 'create') {
                decrypt(encryptToastId, true, '✓ WRAPPER CREATED!', 'Now approve tokens');
                refetchWrapper();
                toast({ type: 'success', title: 'Wrapper Created', message: 'Proceed to approve tokens', duration: 6000 });
            } else if (currentAction === 'approve') {
                decrypt(encryptToastId, true, '✓ APPROVAL SUCCESS!', 'Now wrap tokens');
                setApprovalDone(true);
                toast({ type: 'success', title: 'Approval Confirmed', message: 'You can now wrap tokens', duration: 6000 });
            } else if (currentAction === 'wrap') {
                decrypt(encryptToastId, true, '✓ TOKENS WRAPPED!', 'Confidential balance updated');
                setSuccessState(true);
                refetchBalance();
                refetchWrappedBalance();
                toast({ type: 'success', title: 'Wrapped!', message: `${amount} ${String(symbol)} → c${String(symbol)}`, duration: 8000 });
            } else if (currentAction === 'unwrap') {
                decrypt(encryptToastId, true, '✓ TOKENS UNWRAPPED!', 'Public balance updated');
                setSuccessState(true);
                refetchBalance();
                refetchWrappedBalance();
                toast({ type: 'success', title: 'Unwrapped!', message: `${amount} c${String(symbol)} → ${String(symbol)}`, duration: 8000 });
            }
            setEncryptToastId(null);
            setCurrentAction(null);
            reset();
        }
    }, [isSuccess]);

    const handleCreateWrapper = () => {
        setCurrentAction('create');
        writeContract({
            address: WRAPPER_FACTORY_ADDRESS,
            abi: WRAPPER_FACTORY_ABI,
            functionName: 'createWrapper',
            args: [tokenAddress as `0x${string}`]
        });
    };

    const handleApprove = () => {
        if (!wrapperAddress || !decimals || !amount) return;
        setCurrentAction('approve');
        const amountWei = parseUnits(amount, Number(decimals));
        writeContract({
            address: tokenAddress as `0x${string}`,
            abi: ERC20_ABI,
            functionName: 'approve',
            args: [wrapperAddress, amountWei]
        });
    };

    const handleWrap = () => {
        if (!wrapperAddress || !decimals || !amount) return;
        setCurrentAction('wrap');
        const amountWei = parseUnits(amount, Number(decimals));
        writeContract({
            address: wrapperAddress as `0x${string}`,
            abi: WRAPPER_ABI,
            functionName: 'wrap',
            args: [address!, amountWei]
        });
    };

    const handleUnwrap = () => {
        if (!wrapperAddress || !decimals || !amount) return;
        setCurrentAction('unwrap');
        const amountWei = parseUnits(amount, Number(decimals));
        writeContract({
            address: wrapperAddress as `0x${string}`,
            abi: WRAPPER_ABI,
            functionName: 'withdrawTo',
            args: [address!, amountWei]
        });
    };

    const handleReset = () => {
        setAmount('');
        setSuccessState(false);
        setApprovalDone(false);
        reset();
    };

    const isProcessing = isPending || isConfirming;

    return (
        <div style={{ minHeight: '100vh' }}>
            <div className="scanlines"></div>

            <nav style={{
                position: 'sticky',
                top: 0,
                zIndex: 50,
                backgroundColor: 'rgba(5, 5, 5, 0.8)',
                backdropFilter: 'blur(20px)',
                borderBottom: '1px solid rgba(255, 215, 0, 0.1)'
            }}>
                <div style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    height: '80px',
                    maxWidth: '1400px',
                    margin: '0 auto',
                    padding: '0 24px'
                }}>
                    <Link href="/" style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#a0a0a0', textDecoration: 'none' }}>
                        <span className="cyber-button" style={{ padding: '4px 12px', fontSize: '16px' }}>&lt; BACK</span>
                    </Link>
                    <ConnectButton />
                </div>
            </nav>

            <div style={{ maxWidth: '600px', margin: '0 auto', padding: '40px 24px' }}>
                <div className="neon-card" style={{ padding: '24px', borderRadius: '16px' }}>
                    {/* Mode Toggle */}
                    <div style={{ display: 'flex', marginBottom: '24px', borderRadius: '8px', overflow: 'hidden', border: '1px solid #333' }}>
                        <button
                            onClick={() => { setMode('wrap'); handleReset(); }}
                            style={{
                                flex: 1,
                                padding: '14px',
                                background: mode === 'wrap' ? 'var(--gold-primary)' : 'transparent',
                                color: mode === 'wrap' ? '#000' : '#888',
                                border: 'none',
                                cursor: 'pointer',
                                fontWeight: 'bold',
                                fontSize: '14px'
                            }}
                        >
                            🔒 WRAP
                        </button>
                        <button
                            onClick={() => { setMode('unwrap'); handleReset(); }}
                            style={{
                                flex: 1,
                                padding: '14px',
                                background: mode === 'unwrap' ? 'var(--gold-primary)' : 'transparent',
                                color: mode === 'unwrap' ? '#000' : '#888',
                                border: 'none',
                                cursor: 'pointer',
                                fontWeight: 'bold',
                                fontSize: '14px'
                            }}
                        >
                            🔓 UNWRAP
                        </button>
                    </div>

                    <h1 className="glitch-hover" style={{
                        fontSize: 'clamp(24px, 5vw, 32px)',
                        fontWeight: 800,
                        marginBottom: '8px',
                        textTransform: 'uppercase'
                    }}>
                        <span className="text-gold">{mode === 'wrap' ? 'Wrap' : 'Unwrap'}</span> Token
                    </h1>
                    <p style={{ color: '#666', marginBottom: '24px', fontSize: '13px' }}>
                        {mode === 'wrap'
                            ? 'Convert public ERC20 → Confidential ERC7984'
                            : 'Convert Confidential ERC7984 → Public ERC20'}
                    </p>

                    {!successState ? (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                            {/* Token Address */}
                            <div>
                                <label style={{ display: 'block', fontSize: '11px', color: '#888', marginBottom: '6px' }}>
                                    TOKEN ADDRESS
                                </label>
                                <input
                                    type="text"
                                    value={tokenAddress}
                                    onChange={e => { setTokenAddress(e.target.value); setApprovalDone(false); }}
                                    placeholder="0x..."
                                    className="cyber-input"
                                    style={{ width: '100%', padding: '12px', borderRadius: '8px', fontSize: '13px', fontFamily: 'monospace' }}
                                    disabled={isProcessing}
                                />
                                <p style={{ fontSize: '10px', color: '#555', marginTop: '4px' }}>
                                    Default: Sample Token (SMPL)
                                </p>
                            </div>

                            {/* Balances */}
                            {symbol && hasWrapper && (
                                <div style={{
                                    display: 'grid',
                                    gridTemplateColumns: '1fr 1fr',
                                    gap: '12px',
                                    padding: '12px',
                                    background: 'rgba(255, 215, 0, 0.03)',
                                    borderRadius: '8px',
                                    border: '1px solid rgba(255, 215, 0, 0.1)'
                                }}>
                                    <div>
                                        <div style={{ fontSize: '10px', color: '#888' }}>{String(symbol)} (Public)</div>
                                        <div style={{ fontSize: '16px', fontWeight: 'bold', color: mode === 'wrap' ? 'var(--gold-primary)' : '#888' }}>
                                            {balance !== undefined && decimals ? Number(formatUnits(balance as bigint, Number(decimals))).toLocaleString() : '0'}
                                        </div>
                                    </div>
                                    <div>
                                        <div style={{ fontSize: '10px', color: '#888' }}>c{String(symbol)} (Private)</div>
                                        <div style={{ fontSize: '16px', fontWeight: 'bold', color: mode === 'unwrap' ? 'var(--gold-primary)' : '#888' }}>
                                            {wrappedBalance !== undefined && decimals ? Number(formatUnits(wrappedBalance as bigint, Number(decimals))).toLocaleString() : '0'}
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* Wrapper Status */}
                            {symbol && !hasWrapper && (
                                <div style={{
                                    padding: '16px',
                                    background: 'rgba(255, 100, 0, 0.05)',
                                    border: '1px solid rgba(255, 100, 0, 0.2)',
                                    borderRadius: '8px'
                                }}>
                                    <div style={{ color: '#FF6400', fontWeight: 'bold', marginBottom: '8px', fontSize: '13px' }}>
                                        ⚠️ No Wrapper Found
                                    </div>
                                    <p style={{ fontSize: '12px', color: '#888', marginBottom: '12px' }}>
                                        Create a wrapper for {String(symbol)} first.
                                    </p>
                                    <button
                                        onClick={handleCreateWrapper}
                                        disabled={isProcessing}
                                        className="cyber-button"
                                        style={{ width: '100%', padding: '12px', fontSize: '13px' }}
                                    >
                                        {isPending && currentAction === 'create' ? (
                                            <ScrambleText text="CREATING..." trigger={true} className="text-gold" />
                                        ) : (
                                            '🔐 CREATE WRAPPER'
                                        )}
                                    </button>
                                </div>
                            )}

                            {hasWrapper && (
                                <div style={{
                                    padding: '10px 12px',
                                    background: 'rgba(0, 255, 100, 0.05)',
                                    border: '1px solid rgba(0, 255, 100, 0.2)',
                                    borderRadius: '8px',
                                    fontSize: '11px'
                                }}>
                                    <span style={{ color: '#00FF64' }}>✓ Wrapper:</span>
                                    <span style={{ color: '#888', fontFamily: 'monospace', marginLeft: '8px' }}>
                                        c{String(symbol)}
                                    </span>
                                </div>
                            )}

                            {/* Amount Input */}
                            {hasWrapper && (
                                <div>
                                    <label style={{ display: 'block', fontSize: '11px', color: '#888', marginBottom: '6px' }}>
                                        AMOUNT TO {mode.toUpperCase()}
                                    </label>
                                    <input
                                        type="number"
                                        value={amount}
                                        onChange={e => setAmount(e.target.value)}
                                        placeholder="0.0"
                                        className="cyber-input"
                                        style={{ width: '100%', padding: '14px', borderRadius: '8px', fontSize: '18px' }}
                                        disabled={isProcessing}
                                    />
                                </div>
                            )}

                            {/* Action Buttons */}
                            {hasWrapper && amount && (
                                <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                                    {mode === 'wrap' ? (
                                        <>
                                            <button
                                                onClick={handleApprove}
                                                disabled={!amount || isProcessing || approvalDone}
                                                className="cyber-button"
                                                style={{
                                                    flex: 1,
                                                    minWidth: '120px',
                                                    padding: '14px',
                                                    opacity: approvalDone ? 0.5 : 1,
                                                    background: approvalDone ? '#00FF64' : undefined,
                                                    color: approvalDone ? '#000' : undefined
                                                }}
                                            >
                                                {approvalDone ? '✓ APPROVED' : isPending && currentAction === 'approve' ? (
                                                    <ScrambleText text="..." trigger={true} className="text-gold" />
                                                ) : '1. APPROVE'}
                                            </button>
                                            <button
                                                onClick={handleWrap}
                                                disabled={!amount || isProcessing || !approvalDone}
                                                className="cyber-button"
                                                style={{
                                                    flex: 1,
                                                    minWidth: '120px',
                                                    padding: '14px',
                                                    opacity: !approvalDone ? 0.5 : 1
                                                }}
                                            >
                                                {isPending && currentAction === 'wrap' ? (
                                                    <ScrambleText text="..." trigger={true} className="text-gold" />
                                                ) : '2. WRAP'}
                                            </button>
                                        </>
                                    ) : (
                                        <button
                                            onClick={handleUnwrap}
                                            disabled={!amount || isProcessing}
                                            className="cyber-button"
                                            style={{ width: '100%', padding: '16px' }}
                                        >
                                            {isPending && currentAction === 'unwrap' ? (
                                                <ScrambleText text="UNWRAPPING..." trigger={true} className="text-gold" />
                                            ) : '🔓 UNWRAP'}
                                        </button>
                                    )}
                                </div>
                            )}

                            {!isConnected && (
                                <div style={{ textAlign: 'center', color: '#666', fontSize: '13px', padding: '16px' }}>
                                    Connect wallet to {mode} tokens
                                </div>
                            )}
                        </div>
                    ) : (
                        /* Success State */
                        <div style={{
                            padding: '24px',
                            background: 'rgba(0, 255, 100, 0.08)',
                            border: '1px solid #00FF64',
                            borderRadius: '8px',
                            textAlign: 'center'
                        }}>
                            <div style={{ fontSize: '40px', marginBottom: '12px' }}>
                                {mode === 'wrap' ? '🔒' : '🔓'}
                            </div>
                            <div style={{ color: '#00FF64', fontWeight: 'bold', fontSize: '16px', marginBottom: '8px' }}>
                                {mode === 'wrap' ? 'TOKENS WRAPPED!' : 'TOKENS UNWRAPPED!'}
                            </div>
                            <div style={{ color: '#888', marginBottom: '16px', fontSize: '13px' }}>
                                {mode === 'wrap'
                                    ? `${amount} ${String(symbol)} → ${amount} c${String(symbol)}`
                                    : `${amount} c${String(symbol)} → ${amount} ${String(symbol)}`}
                            </div>
                            <button
                                onClick={handleReset}
                                className="cyber-button"
                                style={{ padding: '12px 24px' }}
                            >
                                {mode === 'wrap' ? 'WRAP MORE' : 'UNWRAP MORE'}
                            </button>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
