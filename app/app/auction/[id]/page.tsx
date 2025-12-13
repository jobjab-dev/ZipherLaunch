'use client';
import { ConnectButton } from '@rainbow-me/rainbowkit';
import Link from 'next/link';
import { useFhevm } from '../../components/FhevmProvider';
import { useState, useEffect, use } from 'react';
import { useReadContract, useAccount, useWriteContract, useWaitForTransactionReceipt, usePublicClient } from 'wagmi';
import { formatUnits, parseAbiItem } from 'viem';
import ScrambleText from '../../components/ScrambleText';
import TypewriterText from '../../components/TypewriterText';
import { useToast } from '../../components/Toast';

const AUCTION_ADDRESS = process.env.NEXT_PUBLIC_AUCTION_ADDRESS as `0x${string}`;

// ERC20 ABI for getting token info
const ERC20_ABI = [
    { "inputs": [], "name": "name", "outputs": [{ "name": "", "type": "string" }], "stateMutability": "view", "type": "function" },
    { "inputs": [], "name": "symbol", "outputs": [{ "name": "", "type": "string" }], "stateMutability": "view", "type": "function" },
    { "inputs": [], "name": "decimals", "outputs": [{ "name": "", "type": "uint8" }], "stateMutability": "view", "type": "function" }
] as const;

const AUCTION_ABI = [
    {
        "inputs": [{ "name": "", "type": "uint256" }],
        "name": "auctions",
        "outputs": [
            { "name": "seller", "type": "address" },
            { "name": "tokenSold", "type": "address" },
            { "name": "totalLots", "type": "uint256" },
            { "name": "startTick", "type": "uint32" },
            { "name": "endTick", "type": "uint32" },
            { "name": "tickSize", "type": "uint32" },
            { "name": "startTime", "type": "uint256" },
            { "name": "endTime", "type": "uint256" },
            { "name": "finalized", "type": "bool" },
            { "name": "clearingTick", "type": "uint32" }
        ],
        "stateMutability": "view",
        "type": "function"
    }
] as const;

const CUSDC_ADDRESS = process.env.NEXT_PUBLIC_CUSDC_ADDRESS as `0x${string}`;

// cUSDC (ERC7984) ABI - uses setOperator instead of approve
const CUSDC_ABI = [
    {
        "inputs": [{ "name": "operator", "type": "address" }, { "name": "until", "type": "uint48" }],
        "name": "setOperator",
        "outputs": [],
        "stateMutability": "nonpayable",
        "type": "function"
    },
    {
        "inputs": [{ "name": "holder", "type": "address" }, { "name": "spender", "type": "address" }],
        "name": "isOperator",
        "outputs": [{ "name": "", "type": "bool" }],
        "stateMutability": "view",
        "type": "function"
    },
    {
        "inputs": [{ "name": "account", "type": "address" }],
        "name": "confidentialBalanceOf",
        "outputs": [{ "name": "", "type": "bytes32" }],
        "stateMutability": "view",
        "type": "function"
    }
] as const;

// PlaceBid function ABI
const PLACEBID_ABI = [
    {
        "inputs": [
            { "name": "auctionId", "type": "uint256" },
            { "name": "tick", "type": "uint32" },
            { "name": "encryptedLots", "type": "bytes32" },
            { "name": "inputProof", "type": "bytes" }
        ],
        "name": "placeBid",
        "outputs": [],
        "stateMutability": "nonpayable",
        "type": "function"
    }
] as const;

interface PageProps {
    params: Promise<{ id: string }>;
}

export default function AuctionDetail({ params }: PageProps) {
    const { id } = use(params);
    const { address, isConnected } = useAccount();
    const { instance, isInitialized: fheReady, status: fheStatus } = useFhevm();
    const { encrypt, decrypt, toast } = useToast();

    const [bidQty, setBidQty] = useState('');
    const [bidPriceTick, setBidPriceTick] = useState('');
    const [isEncrypting, setIsEncrypting] = useState(false);
    const [encryptionStatus, setEncryptionStatus] = useState<'idle' | 'encrypting' | 'success' | 'error'>('idle');
    const [encryptToastId, setEncryptToastId] = useState<string | null>(null);
    const [approvalDone, setApprovalDone] = useState(false);
    const [currentAction, setCurrentAction] = useState<'approve' | 'bid' | null>(null);

    // Write contract hooks
    const { data: hash, isPending, writeContract, writeContractAsync, reset } = useWriteContract();
    const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash });

    // Check if auction is already an operator for user's cUSDC
    const { data: isAlreadyOperator, refetch: refetchOperator } = useReadContract({
        address: CUSDC_ADDRESS,
        abi: CUSDC_ABI,
        functionName: 'isOperator',
        args: [address!, AUCTION_ADDRESS],
        query: { enabled: !!address && !!CUSDC_ADDRESS && !!AUCTION_ADDRESS }
    });

    // Fetch auction data from contract
    const { data: auctionData, isLoading: isLoadingAuction } = useReadContract({
        address: AUCTION_ADDRESS,
        abi: AUCTION_ABI,
        functionName: 'auctions',
        args: [BigInt(id)],
        query: { enabled: !!AUCTION_ADDRESS && !!id }
    });

    // Parse auction data
    const auction = auctionData ? {
        seller: auctionData[0],
        tokenSold: auctionData[1],
        totalLots: auctionData[2],
        startTick: auctionData[3],
        endTick: auctionData[4],
        tickSize: auctionData[5],
        startTime: auctionData[6],
        endTime: auctionData[7],
        finalized: auctionData[8],
        clearingTick: auctionData[9]
    } : null;

    // Fetch token sold info (symbol and decimals)
    const { data: tokenSymbol } = useReadContract({
        address: auction?.tokenSold as `0x${string}`,
        abi: ERC20_ABI,
        functionName: 'symbol',
        query: { enabled: !!auction?.tokenSold }
    });

    const { data: tokenDecimals } = useReadContract({
        address: auction?.tokenSold as `0x${string}`,
        abi: ERC20_ABI,
        functionName: 'decimals',
        query: { enabled: !!auction?.tokenSold }
    });

    // Format total lots with proper decimals
    const formattedLots = auction && tokenDecimals
        ? Number(formatUnits(auction.totalLots, tokenDecimals)).toLocaleString()
        : '...';

    // Compute auction status
    const getStatus = () => {
        if (!auction) return 'LOADING';
        if (auction.finalized) return 'FINALIZED';
        const now = BigInt(Math.floor(Date.now() / 1000));
        if (now < auction.startTime) return 'UPCOMING';
        if (now > auction.endTime) return 'ENDED';
        return 'LIVE';
    };

    // Handle cUSDC approval
    const handleApprove = () => {
        if (!bidQty || !bidPriceTick || !auction) {
            toast({ type: 'error', title: 'Missing Fields', message: 'Enter price tick and quantity first' });
            return;
        }

        // ERC7984 uses setOperator instead of approve
        // Set auction as operator for 1 day (86400 seconds)
        const until = Math.floor(Date.now() / 1000) + 86400; // 1 day from now

        setCurrentAction('approve');
        writeContract({
            address: CUSDC_ADDRESS,
            abi: CUSDC_ABI,
            functionName: 'setOperator',
            args: [AUCTION_ADDRESS, until]
        });
    };

    // Effect to track approval success
    useEffect(() => {
        if (isSuccess && currentAction === 'approve') {
            setApprovalDone(true);
            refetchOperator();
            toast({ type: 'success', title: 'Operator Set', message: 'Auction can now transfer your cUSDC' });
            setCurrentAction(null);
            reset();
        } else if (isSuccess && currentAction === 'bid') {
            setEncryptionStatus('success');
            toast({ type: 'success', title: 'Bid Submitted!', message: `Your encrypted bid has been placed` });
            setBidQty('');
            setBidPriceTick('');
            setApprovalDone(false);
            setCurrentAction(null);
            reset();
        }
    }, [isSuccess, currentAction]);

    const handleBid = async () => {
        if (!bidQty || !bidPriceTick) {
            toast({ type: 'error', title: 'Missing Fields', message: 'Enter price tick and quantity' });
            return;
        }

        if (!approvalDone) {
            toast({ type: 'error', title: 'Approval Required', message: 'Approve cUSDC first' });
            return;
        }

        if (!instance || !address) {
            toast({ type: 'error', title: 'FHE Not Ready', message: 'Please wait for FHE to initialize' });
            return;
        }

        setIsEncrypting(true);
        setEncryptionStatus('encrypting');
        const toastId = encrypt('ENCRYPTING BID DATA...', `Using FHE to secure ${bidQty} lots`);
        setEncryptToastId(toastId);

        try {
            // Create encrypted input using FHEVM instance
            console.log('Creating encrypted input for lots:', bidQty);
            const input = instance.createEncryptedInput(AUCTION_ADDRESS, address);
            input.add64(parseInt(bidQty));
            const encryptedInput = await input.encrypt();

            console.log('Encrypted input result:', encryptedInput);
            console.log('Handles:', encryptedInput.handles);
            console.log('InputProof:', encryptedInput.inputProof);

            if (!encryptedInput || !encryptedInput.handles || encryptedInput.handles.length === 0) {
                throw new Error('Failed to create encrypted input');
            }

            decrypt(toastId, true, '✓ BID ENCRYPTED!', 'Submitting to blockchain...');

            // Handle conversion - SDK may return hex strings or Uint8Arrays
            const toHex = (value: Uint8Array | string): `0x${string}` => {
                if (typeof value === 'string') {
                    // Already a hex string
                    return value.startsWith('0x') ? value as `0x${string}` : `0x${value}` as `0x${string}`;
                }
                // Uint8Array - convert to hex
                return `0x${Array.from(value).map(b => b.toString(16).padStart(2, '0')).join('')}` as `0x${string}`;
            };

            const encryptedLots = toHex(encryptedInput.handles[0]);
            const inputProof = toHex(encryptedInput.inputProof);

            console.log('Handle type:', typeof encryptedInput.handles[0]);
            console.log('InputProof type:', typeof encryptedInput.inputProof);
            console.log('Encoded encryptedLots:', encryptedLots, '(length:', encryptedLots.length, ')');
            console.log('Encoded inputProof:', inputProof, '(length:', inputProof.length, ')');
            console.log('Auction ID:', id);
            console.log('Tick:', bidPriceTick);

            // Call placeBid on contract
            setCurrentAction('bid');
            await writeContractAsync({
                address: AUCTION_ADDRESS,
                abi: PLACEBID_ABI,
                functionName: 'placeBid',
                args: [
                    BigInt(id),
                    Number(bidPriceTick),
                    encryptedLots,
                    inputProof
                ]
            });

        } catch (e) {
            console.error('Bid error:', e);
            setEncryptionStatus('error');
            decrypt(toastId, false, '✕ BID FAILED', e instanceof Error ? e.message : 'Unknown error');
            toast({ type: 'error', title: 'Bid Failed', message: e instanceof Error ? e.message : 'Unknown error' });
        } finally {
            setIsEncrypting(false);
            setEncryptToastId(null);
        }
    };

    // History Logic
    const publicClient = usePublicClient();
    const [bidHistory, setBidHistory] = useState<any[]>([]);

    useEffect(() => {
        if (!publicClient || !address || !id) return;

        const fetchHistory = async () => {
            try {
                // Fetch recent logs (last 1000 blocks to comply with RPC limit)
                const currentBlock = await publicClient.getBlockNumber();
                const fromBlock = currentBlock - 1000n > 0n ? currentBlock - 1000n : 0n;

                const logs = await publicClient.getLogs({
                    address: AUCTION_ADDRESS,
                    event: parseAbiItem('event BidPlaced(uint256 indexed auctionId, address bidder)'),
                    args: {
                        auctionId: BigInt(id)
                    },
                    fromBlock: fromBlock
                });

                // Manually filter by bidder since it's not indexed in contract event
                const myLogs = logs.filter(log =>
                    log.args.bidder && log.args.bidder.toLowerCase() === address.toLowerCase()
                );

                setBidHistory(myLogs);
            } catch (e) {
                console.error("Failed to fetch history:", e);
            }
        };

        fetchHistory();
        // Poll every 10s
        const interval = setInterval(fetchHistory, 10000);
        return () => clearInterval(interval);
    }, [publicClient, address, id, isSuccess]); // Re-fetch on success

    return (
        <div style={{ minHeight: '100vh', paddingBottom: '100px' }}>
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
                ) : auctionData ? (
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

                            {/* Stats Grid - Full Auction Info */}
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px' }}>
                                {[
                                    { label: 'STATUS', value: getStatus(), color: getStatus() === 'LIVE' ? '#00FF64' : getStatus() === 'ENDED' ? '#FF6464' : getStatus() === 'UPCOMING' ? '#FFD700' : '#888' },
                                    { label: 'TOKEN', value: tokenSymbol || '...', color: 'var(--gold-primary)' },
                                    { label: 'TOTAL LOTS', value: formattedLots, color: '#fff' },
                                    { label: 'TICK RANGE', value: auction ? `${auction.endTick} - ${auction.startTick}` : '...', color: '#fff' },
                                    { label: 'MIN PRICE', value: auction ? `$${(auction.endTick * auction.tickSize / 1000000).toFixed(3)}` : '...', color: '#00FF64' },
                                    { label: 'MAX PRICE', value: auction ? `$${(auction.startTick * auction.tickSize / 1000000).toFixed(3)}` : '...', color: '#FF6464' },
                                    { label: 'STARTS', value: auction ? new Date(Number(auction.startTime) * 1000).toLocaleString('en-GB', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '...', color: '#888' },
                                    { label: 'ENDS', value: auction ? new Date(Number(auction.endTime) * 1000).toLocaleString('en-GB', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '...', color: '#888' }
                                ].map((stat, i) => (
                                    <div key={i} style={{
                                        background: 'rgba(0,0,0,0.3)',
                                        padding: '16px',
                                        borderRadius: '10px',
                                        border: '1px solid rgba(255,255,255,0.05)'
                                    }}>
                                        <div style={{ fontSize: '10px', color: '#666', marginBottom: '6px', letterSpacing: '1px' }}>{stat.label}</div>
                                        <div style={{ fontSize: '16px', fontWeight: 'bold', color: stat.color, fontFamily: 'monospace' }}>
                                            {stat.value}
                                        </div>
                                    </div>
                                ))}
                            </div>

                            {/* Seller Info */}
                            {auction && (
                                <div style={{ marginTop: '16px', padding: '12px', background: 'rgba(0,0,0,0.2)', borderRadius: '8px', fontSize: '11px', color: '#666' }}>
                                    <span style={{ color: '#888' }}>Seller: </span>
                                    <span style={{ fontFamily: 'monospace', color: '#aaa' }}>
                                        {auction.seller.slice(0, 6)}...{auction.seller.slice(-4)}
                                    </span>
                                </div>
                            )}
                            {/* History Section - Inside Left Column */}
                            {bidHistory.length > 0 && (
                                <div style={{ borderTop: '1px solid rgba(255,255,255,0.1)', paddingTop: '24px', marginTop: '24px' }}>
                                    <h3 style={{ fontSize: '18px', marginBottom: '16px', color: '#00FF64', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                        <span>YOUR ACTIVITY</span>
                                        <span style={{ fontSize: '12px', background: 'rgba(0,255,100,0.1)', padding: '2px 8px', borderRadius: '12px' }}>{bidHistory.length}</span>
                                    </h3>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                        {bidHistory.map((log, i) => (
                                            <div key={i} style={{
                                                display: 'flex',
                                                justifyContent: 'space-between',
                                                alignItems: 'center',
                                                padding: '12px',
                                                background: 'rgba(0,0,0,0.3)',
                                                borderRadius: '8px',
                                                borderLeft: '2px solid #00FF64'
                                            }}>
                                                <div>
                                                    <div style={{ fontSize: '13px', color: '#fff' }}>BID PLACED</div>
                                                    <div style={{ fontSize: '11px', color: 'var(--gold-primary)' }}>
                                                        @ ${((Number(log.args.tick) * (auction?.tickSize || 1000)) / 1000000).toFixed(4)}
                                                    </div>
                                                </div>
                                                <span style={{ fontSize: '11px', color: '#666', fontFamily: 'monospace' }}>
                                                    {log.transactionHash.slice(0, 8)}...
                                                </span>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
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
                                            BID TICK ({auction ? `${auction.endTick} - ${auction.startTick}` : '...'})
                                        </label>
                                        <input
                                            type="number"
                                            value={bidPriceTick}
                                            onChange={e => setBidPriceTick(e.target.value)}
                                            placeholder={auction ? `e.g. ${Math.floor((auction.startTick + auction.endTick) / 2)}` : 'Enter tick...'}
                                            disabled={isEncrypting}
                                            className="cyber-input"
                                            style={{ width: '100%', padding: '16px', borderRadius: '8px', fontSize: '18px' }}
                                            min={auction ? auction.endTick : 1}
                                            max={auction ? auction.startTick : 100}
                                        />
                                        {auction && bidPriceTick && (
                                            <p style={{ fontSize: '11px', color: 'var(--gold-primary)', marginTop: '4px' }}>
                                                = ${(Number(bidPriceTick) * auction.tickSize / 1000).toFixed(3)} per lot
                                            </p>
                                        )}
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

                                    {/* Action Buttons */}
                                    <div style={{ display: 'flex', gap: '12px', marginTop: '10px' }}>
                                        <button
                                            onClick={handleApprove}
                                            disabled={!isConnected || isPending || approvalDone || !bidQty || !bidPriceTick}
                                            className="cyber-button"
                                            style={{
                                                flex: 1,
                                                padding: '16px',
                                                fontSize: '14px',
                                                opacity: approvalDone ? 0.5 : 1,
                                                background: approvalDone ? '#00FF64' : undefined,
                                                color: approvalDone ? '#000' : undefined
                                            }}
                                        >
                                            {approvalDone ? '✓ APPROVED' : isPending && currentAction === 'approve' ? (
                                                <ScrambleText text="..." trigger={true} />
                                            ) : '1. APPROVE'}
                                        </button>
                                        <button
                                            onClick={handleBid}
                                            disabled={!isConnected || isEncrypting || !approvalDone || encryptionStatus === 'success'}
                                            className="cyber-button"
                                            style={{
                                                flex: 1,
                                                padding: '16px',
                                                fontSize: '14px',
                                                opacity: !approvalDone ? 0.5 : 1,
                                                cursor: isEncrypting ? 'wait' : 'pointer'
                                            }}
                                        >
                                            {isEncrypting ? (
                                                <ScrambleText text="ENCRYPTING..." trigger={true} className="text-gold" />
                                            ) : encryptionStatus === 'success' ? '✓ BID SENT' : '2. ENCRYPT & BID'}
                                        </button>
                                    </div>

                                    {/* Operator Status */}
                                    {isConnected && (
                                        <div style={{ textAlign: 'center', fontSize: '11px', color: '#666', marginTop: '12px' }}>
                                            Auction Operator: <span style={{ color: isAlreadyOperator ? '#00FF64' : '#FF6464' }}>{isAlreadyOperator ? '✓ Authorized' : '✕ Not Set'}</span>
                                        </div>
                                    )}

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
                    <div style={{ textAlign: 'center', padding: '100px 20px' }}>
                        <div style={{ fontSize: '56px', marginBottom: '16px', color: '#333' }}>∅</div>
                        <h3 style={{ fontSize: '22px', marginBottom: '12px', color: '#fff' }}>AUCTION NOT FOUND</h3>
                        <p style={{ color: '#666', marginBottom: '24px', fontSize: '14px' }}>This auction does not exist or failed to load.</p>
                        <Link href="/" className="cyber-button" style={{ padding: '14px 28px', textDecoration: 'none' }}>
                            ← BACK TO MARKETS
                        </Link>
                    </div>
                )}
            </div>
        </div >
    );
}
