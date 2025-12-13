'use client';
import { ConnectButton } from '@rainbow-me/rainbowkit';
import Link from 'next/link';
import { useState, useEffect } from 'react';
import { useAccount, useWriteContract, useWaitForTransactionReceipt, useReadContract } from 'wagmi';
import { formatUnits, parseUnits } from 'viem';
import ScrambleText from '../components/ScrambleText';
import { useToast } from '../components/Toast';

const AUCTION_ABI = [
    {
        "inputs": [
            { "name": "_tokenSold", "type": "address" },
            { "name": "_totalLots", "type": "uint256" },
            { "name": "_startTick", "type": "uint32" },
            { "name": "_endTick", "type": "uint32" },
            { "name": "_tickSize", "type": "uint32" },
            { "name": "_startTime", "type": "uint256" },
            { "name": "_endTime", "type": "uint256" }
        ],
        "name": "createAuction",
        "outputs": [],
        "stateMutability": "nonpayable",
        "type": "function"
    }
] as const;

const ERC20_ABI = [
    {
        "inputs": [{ "name": "spender", "type": "address" }, { "name": "value", "type": "uint256" }],
        "name": "approve",
        "outputs": [{ "name": "", "type": "bool" }],
        "stateMutability": "nonpayable",
        "type": "function"
    },
    {
        "inputs": [{ "name": "to", "type": "address" }, { "name": "amount", "type": "uint256" }],
        "name": "mint",
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

const AUCTION_ADDRESS = process.env.NEXT_PUBLIC_AUCTION_ADDRESS as `0x${string}`;
const SAMPLE_TOKEN = process.env.NEXT_PUBLIC_SAMPLE_TOKEN_ADDRESS as `0x${string}`;

// Zama-style defaults
const DEFAULT_START_TICK = 1000;  // Max price tick ($5.00 with tickSize 5000)
const DEFAULT_END_TICK = 10;      // Min price tick / floor ($0.05 with tickSize 5000)
const DEFAULT_TICK_SIZE = 5000;   // TickSize = $0.005 per tick (5000 / 1,000,000)
const DEFAULT_DURATION_DAYS = 4;

export default function CreateAuction() {
    const { address, isConnected } = useAccount();
    const { encrypt, decrypt, toast } = useToast();

    const [currentAction, setCurrentAction] = useState<'mint' | 'approve' | 'create' | null>(null);
    const [encryptToastId, setEncryptToastId] = useState<string | null>(null);
    const [createdAuctionId, setCreatedAuctionId] = useState<string | null>(null);
    const [approvalDone, setApprovalDone] = useState(false);
    const [mintAmount, setMintAmount] = useState('1000000');

    const getDefaultStartTime = () => {
        const d = new Date();
        d.setHours(d.getHours() + 1);
        return d.toISOString().slice(0, 16);
    };
    const getDefaultEndTime = () => {
        const d = new Date();
        d.setDate(d.getDate() + DEFAULT_DURATION_DAYS);
        return d.toISOString().slice(0, 16);
    };

    const [formData, setFormData] = useState({
        tokenAddress: SAMPLE_TOKEN || '',
        totalLots: '1000000',
        startTick: String(DEFAULT_START_TICK),
        endTick: String(DEFAULT_END_TICK),
        tickSize: String(DEFAULT_TICK_SIZE),
        startTime: getDefaultStartTime(),
        endTime: getDefaultEndTime()
    });

    const { data: hash, isPending, writeContract, reset } = useWriteContract();
    const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash });

    // Get Sample Token balance
    const { data: tokenBalance, refetch: refetchBalance } = useReadContract({
        address: SAMPLE_TOKEN,
        abi: ERC20_ABI,
        functionName: 'balanceOf',
        args: [address!],
        query: { enabled: !!address && !!SAMPLE_TOKEN }
    });

    useEffect(() => {
        if (isPending && !encryptToastId && currentAction) {
            const actionText = currentAction === 'mint' ? 'MINTING TOKENS...'
                : currentAction === 'approve' ? 'APPROVING TOKEN...'
                    : 'CREATING AUCTION...';
            const id = encrypt(actionText, 'Waiting for wallet confirmation');
            setEncryptToastId(id);
        }
    }, [isPending, encryptToastId, currentAction, encrypt]);

    useEffect(() => {
        if (isConfirming && encryptToastId) {
            decrypt(encryptToastId, true, 'PROCESSING ON-CHAIN...', `TX: ${hash?.slice(0, 20)}...`);
            const id = encrypt('DECRYPTING RESULT...', 'Initializing...');
            setEncryptToastId(id);
        }
    }, [isConfirming]);

    useEffect(() => {
        if (isSuccess && encryptToastId && currentAction) {
            if (currentAction === 'mint') {
                decrypt(encryptToastId, true, '✓ TOKENS MINTED!', `${mintAmount} SMPL received`);
                toast({ type: 'success', title: 'Tokens Minted', message: `You received ${Number(mintAmount).toLocaleString()} SMPL`, duration: 6000 });
                refetchBalance();
            } else if (currentAction === 'approve') {
                decrypt(encryptToastId, true, '✓ TOKEN APPROVED!', 'Ready to create auction');
                setApprovalDone(true);
                toast({ type: 'success', title: 'Token Approved', message: 'You can now create the auction', duration: 6000 });
            } else if (currentAction === 'create') {
                decrypt(encryptToastId, true, '✓ AUCTION CREATED!', `TX: ${hash}`);
                toast({ type: 'success', title: 'Auction Created!', message: 'Your sealed-bid Dutch auction is now live', duration: 8000 });
                setCreatedAuctionId('1');
            }
            setEncryptToastId(null);
            setCurrentAction(null);
            reset();
        }
    }, [isSuccess]);

    const handleMint = () => {
        if (!address || !mintAmount) return;
        setCurrentAction('mint');
        writeContract({
            address: SAMPLE_TOKEN,
            abi: ERC20_ABI,
            functionName: 'mint',
            args: [address, parseUnits(mintAmount, 18)]
        });
    };

    const handleApprove = () => {
        if (!formData.tokenAddress) return;
        setCurrentAction('approve');
        writeContract({
            address: formData.tokenAddress as `0x${string}`,
            abi: ERC20_ABI,
            functionName: 'approve',
            args: [AUCTION_ADDRESS, parseUnits(formData.totalLots, 18)]
        });
    };

    const handleCreate = () => {
        if (!formData.tokenAddress || !formData.totalLots) {
            toast({ type: 'error', title: 'Missing Fields', message: 'Please fill all required fields' });
            return;
        }

        setCurrentAction('create');
        const startTimestamp = Math.floor(new Date(formData.startTime).getTime() / 1000);
        const endTimestamp = Math.floor(new Date(formData.endTime).getTime() / 1000);

        writeContract({
            address: AUCTION_ADDRESS,
            abi: AUCTION_ABI,
            functionName: 'createAuction',
            args: [
                formData.tokenAddress as `0x${string}`,
                parseUnits(formData.totalLots, 18),
                Number(formData.startTick),
                Number(formData.endTick),
                Number(formData.tickSize),
                BigInt(startTimestamp),
                BigInt(endTimestamp)
            ]
        });
    };

    const handleReset = () => {
        setFormData({
            tokenAddress: SAMPLE_TOKEN || '',
            totalLots: '1000000',
            startTick: String(DEFAULT_START_TICK),
            endTick: String(DEFAULT_END_TICK),
            tickSize: String(DEFAULT_TICK_SIZE),
            startTime: getDefaultStartTime(),
            endTime: getDefaultEndTime()
        });
        setCreatedAuctionId(null);
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
                    <Link href="/" style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#a0a0a0', textDecoration: 'none', fontSize: '14px' }}>
                        <span className="cyber-button" style={{ padding: '4px 12px', fontSize: '16px' }}>&lt; BACK</span>
                    </Link>
                    <ConnectButton />
                </div>
            </nav>

            <div style={{ maxWidth: '700px', margin: '0 auto', padding: '40px 24px' }}>
                <div style={{ textAlign: 'center', marginBottom: '32px' }}>
                    <h1 className="glitch-hover" style={{
                        fontSize: 'clamp(28px, 5vw, 42px)',
                        fontWeight: 800,
                        marginBottom: '12px',
                        color: '#fff',
                        textTransform: 'uppercase',
                        letterSpacing: '-1px'
                    }}>
                        Create <span className="text-gold">Sealed-Bid</span> Auction
                    </h1>
                    <p style={{ color: '#666', fontSize: '14px', fontFamily: 'monospace', maxWidth: '500px', margin: '0 auto' }}>
                        Single-price Dutch auction with encrypted bids. Price is public, quantity is private.
                    </p>
                </div>

                {/* Mint Sample Token Card */}
                <div className="neon-card" style={{ padding: '24px', borderRadius: '12px', marginBottom: '24px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', gap: '12px' }}>
                        <div>
                            <h3 style={{ fontSize: '14px', color: 'var(--gold-primary)', marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '1px' }}>
                                🪙 Get Test Tokens
                            </h3>
                            <p style={{ fontSize: '12px', color: '#666' }}>Mint SMPL tokens to create your auction</p>
                        </div>
                        {isConnected && tokenBalance !== undefined && (
                            <div style={{ textAlign: 'right' }}>
                                <div style={{ fontSize: '11px', color: '#888' }}>Your SMPL Balance</div>
                                <div style={{ fontSize: '18px', fontWeight: 'bold', color: 'var(--gold-primary)' }}>
                                    {Number(formatUnits(tokenBalance as bigint, 18)).toLocaleString()}
                                </div>
                            </div>
                        )}
                    </div>
                    <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                        <input
                            type="number"
                            value={mintAmount}
                            onChange={e => setMintAmount(e.target.value)}
                            placeholder="Amount"
                            className="cyber-input"
                            style={{ flex: 1, minWidth: '120px', padding: '12px', borderRadius: '8px' }}
                            disabled={isProcessing || !isConnected}
                        />
                        <button
                            onClick={handleMint}
                            disabled={!isConnected || isProcessing}
                            className="cyber-button"
                            style={{ padding: '12px 24px', whiteSpace: 'nowrap' }}
                        >
                            {isPending && currentAction === 'mint' ? (
                                <ScrambleText text="MINTING..." trigger={true} className="text-gold" />
                            ) : (
                                'MINT SMPL'
                            )}
                        </button>
                    </div>
                </div>

                {!createdAuctionId ? (
                    <div className="neon-card" style={{ padding: '24px', borderRadius: '16px' }}>
                        <div style={{
                            padding: '16px',
                            background: 'rgba(255, 215, 0, 0.05)',
                            border: '1px solid rgba(255, 215, 0, 0.2)',
                            borderRadius: '8px',
                            marginBottom: '24px',
                            fontSize: '13px',
                            color: '#888'
                        }}>
                            <strong style={{ color: 'var(--gold-primary)' }}>How it works:</strong>
                            <ul style={{ marginTop: '8px', paddingLeft: '16px', lineHeight: '1.6' }}>
                                <li>Bidders pay with <strong>cUSDC</strong> (confidential USDC)</li>
                                <li>Bid <strong>price is public</strong>, quantity is <strong>encrypted</strong></li>
                                <li>All winners pay the same <strong>clearing price</strong></li>
                            </ul>
                        </div>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                            <div>
                                <label style={{ display: 'block', fontSize: '12px', color: 'var(--gold-primary)', marginBottom: '8px', letterSpacing: '1px', fontWeight: 'bold' }}>
                                    TOKEN TO SELL *
                                </label>
                                <input
                                    type="text"
                                    value={formData.tokenAddress}
                                    onChange={e => setFormData({ ...formData, tokenAddress: e.target.value })}
                                    placeholder="0x..."
                                    className="cyber-input"
                                    style={{ width: '100%', padding: '14px', borderRadius: '8px', fontSize: '14px', fontFamily: 'monospace' }}
                                    disabled={isProcessing}
                                />
                                <p style={{ fontSize: '11px', color: '#555', marginTop: '6px' }}>
                                    Default: Sample Token (SMPL)
                                </p>
                            </div>

                            <div>
                                <label style={{ display: 'block', fontSize: '12px', color: '#888', marginBottom: '8px', letterSpacing: '1px' }}>
                                    SUPPLY TO SELL
                                </label>
                                <input
                                    type="number"
                                    value={formData.totalLots}
                                    onChange={e => setFormData({ ...formData, totalLots: e.target.value })}
                                    placeholder="1000000"
                                    className="cyber-input"
                                    style={{ width: '100%', padding: '14px', borderRadius: '8px' }}
                                    disabled={isProcessing}
                                />
                            </div>

                            <div style={{ border: '1px solid #333', padding: '16px', borderRadius: '12px', background: 'rgba(0,0,0,0.2)' }}>
                                <h3 style={{ fontSize: '12px', color: 'var(--gold-primary)', marginBottom: '12px', textTransform: 'uppercase', letterSpacing: '1px' }}>
                                    Price Configuration
                                </h3>
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(100px, 1fr))', gap: '12px' }}>
                                    <div>
                                        <label style={{ display: 'block', fontSize: '10px', color: '#888', marginBottom: '4px' }}>
                                            START TICK {formData.startTick && formData.tickSize && (
                                                <span style={{ color: 'var(--gold-primary)' }}>
                                                    (${(Number(formData.startTick) * Number(formData.tickSize) / 1000000).toFixed(6)})
                                                </span>
                                            )}
                                        </label>
                                        <input
                                            type="number"
                                            value={formData.startTick}
                                            onChange={e => setFormData({ ...formData, startTick: e.target.value })}
                                            className="cyber-input"
                                            style={{ width: '100%', padding: '10px', borderRadius: '6px' }}
                                            disabled={isProcessing}
                                        />
                                    </div>
                                    <div>
                                        <label style={{ display: 'block', fontSize: '10px', color: '#888', marginBottom: '4px' }}>
                                            END TICK {formData.endTick && formData.tickSize && (
                                                <span style={{ color: 'var(--gold-primary)' }}>
                                                    (${(Number(formData.endTick) * Number(formData.tickSize) / 1000000).toFixed(6)})
                                                </span>
                                            )}
                                        </label>
                                        <input
                                            type="number"
                                            value={formData.endTick}
                                            onChange={e => setFormData({ ...formData, endTick: e.target.value })}
                                            className="cyber-input"
                                            style={{ width: '100%', padding: '10px', borderRadius: '6px' }}
                                            disabled={isProcessing}
                                        />
                                    </div>
                                    <div>
                                        <label style={{ display: 'block', fontSize: '10px', color: '#888', marginBottom: '4px' }}>
                                            TICK SIZE {formData.tickSize && (
                                                <span style={{ color: '#666' }}>
                                                    (${(Number(formData.tickSize) / 1000000).toFixed(6)}/tick)
                                                </span>
                                            )}
                                        </label>
                                        <input
                                            type="number"
                                            value={formData.tickSize}
                                            onChange={e => setFormData({ ...formData, tickSize: e.target.value })}
                                            className="cyber-input"
                                            style={{ width: '100%', padding: '10px', borderRadius: '6px' }}
                                            disabled={isProcessing}
                                        />
                                    </div>
                                </div>
                                <p style={{ fontSize: '10px', color: '#555', marginTop: '8px' }}>
                                    Price = Tick × Tick Size / 1,000,000 (USDC Decimals)
                                </p>
                            </div>

                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '12px' }}>
                                <div>
                                    <label style={{ display: 'block', fontSize: '11px', color: '#888', marginBottom: '6px' }}>
                                        BIDDING STARTS
                                    </label>
                                    <input
                                        type="datetime-local"
                                        value={formData.startTime}
                                        onChange={e => setFormData({ ...formData, startTime: e.target.value })}
                                        className="cyber-input"
                                        style={{ width: '100%', padding: '10px', borderRadius: '8px', fontSize: '12px' }}
                                        disabled={isProcessing}
                                    />
                                </div>
                                <div>
                                    <label style={{ display: 'block', fontSize: '11px', color: '#888', marginBottom: '6px' }}>
                                        BIDDING ENDS
                                    </label>
                                    <input
                                        type="datetime-local"
                                        value={formData.endTime}
                                        onChange={e => setFormData({ ...formData, endTime: e.target.value })}
                                        className="cyber-input"
                                        style={{ width: '100%', padding: '10px', borderRadius: '8px', fontSize: '12px' }}
                                        disabled={isProcessing}
                                    />
                                </div>
                            </div>

                            <div style={{ display: 'flex', gap: '12px', marginTop: '8px', flexWrap: 'wrap' }}>
                                <button
                                    onClick={handleApprove}
                                    disabled={!isConnected || isProcessing || approvalDone || !formData.tokenAddress}
                                    className="cyber-button"
                                    style={{
                                        flex: 1,
                                        minWidth: '140px',
                                        padding: '14px',
                                        opacity: approvalDone ? 0.5 : 1,
                                        background: approvalDone ? '#00FF64' : undefined,
                                        color: approvalDone ? '#000' : undefined
                                    }}
                                >
                                    {approvalDone ? (
                                        '✓ APPROVED'
                                    ) : isPending && currentAction === 'approve' ? (
                                        <ScrambleText text="..." trigger={true} className="text-gold" />
                                    ) : (
                                        '1. APPROVE'
                                    )}
                                </button>
                                <button
                                    onClick={handleCreate}
                                    disabled={!isConnected || isProcessing || !approvalDone}
                                    className="cyber-button"
                                    style={{
                                        flex: 1,
                                        minWidth: '140px',
                                        padding: '14px',
                                        opacity: !approvalDone ? 0.5 : 1
                                    }}
                                >
                                    {isPending && currentAction === 'create' ? (
                                        <ScrambleText text="..." trigger={true} className="text-gold" />
                                    ) : (
                                        '2. CREATE'
                                    )}
                                </button>
                            </div>

                            {!isConnected && (
                                <div style={{ textAlign: 'center', color: '#666', fontSize: '14px' }}>
                                    Connect wallet to create auction
                                </div>
                            )}
                        </div>
                    </div>
                ) : (
                    <div className="neon-card" style={{ padding: '40px 24px', borderRadius: '16px', textAlign: 'center' }}>
                        <div style={{ fontSize: '48px', marginBottom: '20px' }}>🔐</div>
                        <h2 style={{ color: '#00FF64', fontSize: '24px', marginBottom: '12px' }}>
                            AUCTION CREATED!
                        </h2>
                        <p style={{ color: '#888', marginBottom: '20px', fontSize: '14px' }}>
                            Your sealed-bid auction is now live
                        </p>
                        <div style={{
                            padding: '12px',
                            background: 'rgba(0,0,0,0.3)',
                            borderRadius: '8px',
                            fontFamily: 'monospace',
                            fontSize: '11px',
                            color: '#666',
                            marginBottom: '20px',
                            wordBreak: 'break-all'
                        }}>
                            {AUCTION_ADDRESS}
                        </div>
                        <div style={{ display: 'flex', gap: '12px', justifyContent: 'center', flexWrap: 'wrap' }}>
                            <Link href="/" className="cyber-button" style={{ padding: '12px 24px' }}>
                                VIEW AUCTIONS
                            </Link>
                            <button onClick={handleReset} className="cyber-button" style={{ padding: '12px 24px' }}>
                                CREATE ANOTHER
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </div >
    );
}
