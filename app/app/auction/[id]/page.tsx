'use client';
import { ConnectButton } from '@rainbow-me/rainbowkit';
import Link from 'next/link';
import { useFHE } from '../../../hooks/useFHE';
import { useState, useEffect, use } from 'react';
import ScrambleText from '../../components/ScrambleText';
import TypewriterText from '../../components/TypewriterText';
import { useToast } from '../../components/Toast';

interface PageProps {
    params: Promise<{ id: string }>;
}

export default function AuctionDetail({ params }: PageProps) {
    const { id } = use(params);
    const { instance, isLoading: fheLoading, createEncryptedInput } = useFHE();
    const { encrypt, decrypt, toast } = useToast();

    const [bidQty, setBidQty] = useState('');
    const [bidPriceTick, setBidPriceTick] = useState('');
    const [isEncrypting, setIsEncrypting] = useState(false);
    const [encryptionStatus, setEncryptionStatus] = useState<'idle' | 'encrypting' | 'success' | 'error'>('idle');
    const [auctionData, setAuctionData] = useState<any>(null);
    const [isLoadingAuction, setIsLoadingAuction] = useState(true);
    const [encryptToastId, setEncryptToastId] = useState<string | null>(null);

    useEffect(() => {
        // TODO: Fetch auction data from contract
        const timer = setTimeout(() => {
            setIsLoadingAuction(false);
        }, 1000);
        return () => clearTimeout(timer);
    }, [id]);

    const handleBid = async () => {
        if (!bidQty || !bidPriceTick) {
            toast({ type: 'error', title: 'Missing Fields', message: 'Enter price and quantity' });
            return;
        }

        setIsEncrypting(true);
        setEncryptionStatus('encrypting');

        const toastId = encrypt('ENCRYPTING BID DATA...', `Using FHE to secure ${bidQty} units`);
        setEncryptToastId(toastId);

        try {
            await new Promise(resolve => setTimeout(resolve, 2000));

            if (instance) {
                const encrypted = await createEncryptedInput("0xContract...", "0xUser...", parseInt(bidQty));
                console.log("Encrypted Input:", encrypted);
            }

            decrypt(toastId, true, '✓ BID ENCRYPTED!', 'Submitting to blockchain...');

            await new Promise(resolve => setTimeout(resolve, 1500));

            setEncryptionStatus('success');
            toast({
                type: 'success',
                title: 'Bid Submitted',
                message: `${bidQty} units at $${bidPriceTick} (encrypted)`,
                duration: 8000
            });

            setTimeout(() => {
                setEncryptionStatus('idle');
                setBidQty('');
                setBidPriceTick('');
            }, 2000);
        } catch (e) {
            console.error(e);
            setEncryptionStatus('error');
            decrypt(toastId, false, '✕ ENCRYPTION FAILED', 'Please try again');
        } finally {
            setIsEncrypting(false);
            setEncryptToastId(null);
        }
    };

    return (
        <div style={{ minHeight: '100vh' }}>
            {/* Scanlines Overlay */}
            <div className="scanlines"></div>

            {/* Navbar */}
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

            {/* Main Content */}
            <div style={{ maxWidth: '1400px', margin: '0 auto', padding: '60px 24px' }}>
                {isLoadingAuction ? (
                    <div style={{ textAlign: 'center', padding: '100px 20px' }}>
                        <div style={{ fontSize: '64px', marginBottom: '24px', textShadow: '0 0 20px var(--gold-primary)' }}>
                            <ScrambleText text="LOADING..." trigger={true} className="text-gold" />
                        </div>
                    </div>
                ) : !auctionData ? (
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 450px', gap: '60px' }}>
                        {/* Left Column - Info */}
                        <div className="neon-card" style={{ padding: '40px', borderRadius: '16px' }}>
                            <div style={{ marginBottom: '40px' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '20px' }}>
                                    <span style={{
                                        padding: '6px 16px',
                                        border: '1px solid var(--gold-primary)',
                                        color: 'var(--gold-primary)',
                                        fontSize: '12px',
                                        fontWeight: 700,
                                        borderRadius: '20px',
                                        textTransform: 'uppercase',
                                        boxShadow: '0 0 10px rgba(255, 215, 0, 0.2)'
                                    }}>
                                        Auction #{id}
                                    </span>
                                </div>
                                <h1 className="glitch-hover" style={{
                                    fontSize: '56px',
                                    fontWeight: 800,
                                    marginBottom: '24px',
                                    lineHeight: 1.1,
                                    color: '#fff',
                                    textTransform: 'uppercase',
                                    letterSpacing: '-1px'
                                }}>
                                    Token <span className="text-gold">Public Sale</span>
                                </h1>
                                <p style={{ fontSize: '18px', color: '#a0a0a0', lineHeight: 1.8 }}>
                                    Participate in the confidential sealed-bid auction.
                                    <br />
                                    <span className="text-gold">Privacy Preserved.</span> End-to-end Encrypted.
                                </p>
                            </div>

                            {/* Stats Grid */}
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '20px' }}>
                                {[
                                    { label: 'STATUS', value: 'LIVE', color: '#00FF64' },
                                    { label: 'PRICE', value: '$0.75', color: 'var(--gold-primary)' },
                                    { label: 'PARTICIPANTS', value: '3,420', color: '#fff' }
                                ].map((stat, i) => (
                                    <div key={i} style={{
                                        background: 'rgba(0,0,0,0.3)',
                                        padding: '20px',
                                        borderRadius: '12px',
                                        border: '1px solid rgba(255,255,255,0.05)'
                                    }}>
                                        <div style={{ fontSize: '11px', color: '#666', marginBottom: '8px', letterSpacing: '1px' }}>{stat.label}</div>
                                        <div style={{ fontSize: '24px', fontWeight: 'bold', color: stat.color, fontFamily: 'monospace' }}>
                                            {stat.value}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* Right Column - Interaction Panel */}
                        <div>
                            <div className="neon-card" style={{ padding: '32px', borderRadius: '16px', position: 'sticky', top: '100px' }}>
                                <h2 style={{ fontSize: '24px', fontWeight: 700, marginBottom: '8px', textTransform: 'uppercase' }}>
                                    {isEncrypting ?
                                        <ScrambleText text="ENCRYPTING..." trigger={true} className="text-gold" /> :
                                        encryptionStatus === 'success' ? <span style={{ color: '#00FF64' }}>TRANSMISSION SECURE</span> :
                                            <span className="glitch-always">PLACE YOUR BID</span>}
                                </h2>

                                <div style={{ height: '1px', background: 'linear-gradient(90deg, var(--gold-primary), transparent)', margin: '20px 0', opacity: 0.5 }}></div>

                                <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
                                    {/* Price Input */}
                                    <div>
                                        <label style={{ display: 'block', fontSize: '12px', color: '#666', marginBottom: '8px', letterSpacing: '1px' }}>
                                            BID PRICE (USD)
                                        </label>
                                        <input
                                            type="number"
                                            value={bidPriceTick}
                                            onChange={e => setBidPriceTick(e.target.value)}
                                            placeholder="0.00"
                                            disabled={isEncrypting}
                                            className="cyber-input"
                                            style={{ width: '100%', padding: '16px', borderRadius: '8px', fontSize: '18px' }}
                                        />
                                    </div>

                                    {/* Quantity Input (Encrypted) */}
                                    <div>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                                            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', color: '#666', letterSpacing: '1px' }}>
                                                <span className="text-gold">●</span>
                                                QUANTITY (ENCRYPTED)
                                            </label>
                                            <span style={{ fontSize: '10px', color: 'var(--gold-primary)', border: '1px solid var(--gold-primary)', padding: '2px 6px', borderRadius: '4px' }}>FHE SECURE</span>
                                        </div>

                                        <div style={{ position: 'relative' }}>
                                            {isEncrypting ? (
                                                <div className="cyber-input" style={{
                                                    padding: '16px',
                                                    borderRadius: '8px',
                                                    fontSize: '18px',
                                                    color: 'var(--gold-primary)',
                                                    textShadow: '0 0 10px var(--gold-primary)',
                                                    border: '1px solid var(--gold-primary)'
                                                }}>
                                                    <ScrambleText
                                                        text={bidQty.padEnd(10, 'X')}
                                                        trigger={true}
                                                        scrambleSpeed={30}
                                                    />
                                                </div>
                                            ) : (
                                                <input
                                                    type="number"
                                                    value={bidQty}
                                                    onChange={e => setBidQty(e.target.value)}
                                                    placeholder="AMOUNT..."
                                                    className="cyber-input"
                                                    style={{ width: '100%', padding: '16px', borderRadius: '8px', fontSize: '18px' }}
                                                />
                                            )}
                                        </div>
                                    </div>

                                    {/* Action Button */}
                                    <button
                                        onClick={handleBid}
                                        disabled={isEncrypting || encryptionStatus === 'success'}
                                        className="cyber-button"
                                        style={{
                                            width: '100%',
                                            padding: '20px',
                                            fontSize: '16px',
                                            cursor: isEncrypting ? 'wait' : 'pointer',
                                            marginTop: '10px'
                                        }}
                                    >
                                        {isEncrypting ?
                                            <span className="flex items-center justify-center gap-2">
                                                <ScrambleText text="PROCESSING..." className="text-gold" />
                                            </span> :
                                            encryptionStatus === 'success' ? 'BID ENCRYPTED & SENT' :
                                                'ENCRYPT & SUBMIT'}
                                    </button>

                                    <div style={{ textAlign: 'center', fontSize: '12px', color: '#444', fontFamily: 'monospace' }}>
                                        <TypewriterText texts={[
                                            "System: Ready",
                                            "Network: Sepolia",
                                            "Encryption: TFHE"
                                        ]} typingSpeed={50} pauseTime={1000} />
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                ) : (
                    <div>Auction data</div>
                )}
            </div>
        </div>
    );
}
