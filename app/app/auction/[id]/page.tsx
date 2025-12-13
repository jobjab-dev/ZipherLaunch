'use client';
import { ConnectButton } from '@rainbow-me/rainbowkit';
import Link from 'next/link';
import { useFhevm } from '../../components/FhevmProvider';
import { useState, useEffect, use, useMemo, useCallback } from 'react';
import { useReadContract, useAccount, useWriteContract, useWaitForTransactionReceipt, usePublicClient, useWalletClient } from 'wagmi';
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
    const { data: walletClient } = useWalletClient();
    const { instance, isInitialized: fheReady, status: fheStatus } = useFhevm();
    const { encrypt, decrypt, dismiss, toast } = useToast();

    const [bidQty, setBidQty] = useState('');
    const [bidPriceTick, setBidPriceTick] = useState('');
    const [isEncrypting, setIsEncrypting] = useState(false);
    const [encryptionStatus, setEncryptionStatus] = useState<'idle' | 'encrypting' | 'success' | 'error'>('idle');
    const [encryptToastId, setEncryptToastId] = useState<string | null>(null);
    const [approvalDone, setApprovalDone] = useState(false);
    const [currentAction, setCurrentAction] = useState<'approve' | 'bid' | null>(null);

    // Latest and highest price from events
    const [latestBidTick, setLatestBidTick] = useState<number | null>(null);
    const [highestBidTick, setHighestBidTick] = useState<number | null>(null);

    // cUSDC balance state
    const [decryptedCusdcBalance, setDecryptedCusdcBalance] = useState<string | null>(null);
    const [isDecryptingBalance, setIsDecryptingBalance] = useState(false);

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

    // Get cUSDC encrypted balance handle
    const { data: cusdcBalanceHandle, refetch: refetchCusdcBalance } = useReadContract({
        address: CUSDC_ADDRESS,
        abi: CUSDC_ABI,
        functionName: 'confidentialBalanceOf',
        args: [address!],
        query: { enabled: !!address && !!CUSDC_ADDRESS }
    });

    const hasCusdcBalance = cusdcBalanceHandle && cusdcBalanceHandle !== '0x0000000000000000000000000000000000000000000000000000000000000000';

    // Auto-set approvalDone if already operator
    useEffect(() => {
        if (isAlreadyOperator === true) {
            setApprovalDone(true);
        }
    }, [isAlreadyOperator]);

    // Adapter: wagmi walletClient -> ethers-like signer for decryption
    const signer = useMemo(() => {
        if (!walletClient) return null;
        return {
            getAddress: async () => walletClient.account.address,
            signTypedData: async (domain: any, types: any, message: any) => {
                return walletClient.signTypedData({
                    domain,
                    types,
                    primaryType: Object.keys(types)[0],
                    message
                });
            }
        };
    }, [walletClient]);

    // Decrypt cUSDC balance function
    const handleDecryptCusdcBalance = useCallback(async () => {
        if (!fheReady || !hasCusdcBalance || !signer || !instance) {
            toast({ type: 'error', title: 'Not Ready', message: `FHEVM Status: ${fheStatus}` });
            return;
        }

        setIsDecryptingBalance(true);

        try {
            const keypair = instance.generateKeypair();
            const startTimestamp = Math.floor(Date.now() / 1000);
            const durationDays = 365;

            const eip712 = instance.createEIP712(
                keypair.publicKey,
                [CUSDC_ADDRESS],
                startTimestamp,
                durationDays
            );

            toast({ type: 'info', title: 'Sign Required', message: 'Please sign the decryption request' });

            const signatureString = await signer.signTypedData(
                eip712.domain,
                { UserDecryptRequestVerification: eip712.types.UserDecryptRequestVerification },
                eip712.message
            );
            const userAddress = await signer.getAddress();

            toast({ type: 'info', title: 'Decrypting...', message: 'Fetching balance from KMS...' });

            const requests = [{
                handle: cusdcBalanceHandle as string,
                contractAddress: CUSDC_ADDRESS
            }];

            const result = await instance.userDecrypt(
                requests,
                keypair.privateKey,
                keypair.publicKey,
                signatureString,
                [CUSDC_ADDRESS],
                userAddress,
                startTimestamp,
                durationDays
            );

            const value = (result as Record<string, bigint | boolean | `0x${string}` | undefined>)[cusdcBalanceHandle as string];

            if (value !== undefined) {
                const ERC7984_DECIMALS = 6;
                const formatted = Number(formatUnits(BigInt(String(value)), ERC7984_DECIMALS)).toLocaleString();
                setDecryptedCusdcBalance(formatted);
                toast({ type: 'success', title: 'Balance Decrypted!', message: `Your cUSDC: ${formatted}` });
            } else {
                setDecryptedCusdcBalance('0');
            }
        } catch (error: unknown) {
            console.error('Decrypt error:', error);
            const errorMessage = error instanceof Error ? error.message : 'Decryption failed';
            toast({ type: 'error', title: 'Decrypt Failed', message: errorMessage });
        } finally {
            setIsDecryptingBalance(false);
        }
    }, [fheReady, hasCusdcBalance, signer, cusdcBalanceHandle, toast, fheStatus, instance]);

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

    // Compute required cUSDC for current bid
    const requiredCusdc = bidQty && bidPriceTick && auction
        ? (Number(bidQty) * Number(bidPriceTick) * auction.tickSize / 1000000).toFixed(2)
        : null;

    // Check if user has sufficient balance (parsed from decryptedCusdcBalance)
    const hasSufficientBalance = decryptedCusdcBalance !== null && requiredCusdc !== null
        ? parseFloat(decryptedCusdcBalance.replace(/,/g, '')) >= parseFloat(requiredCusdc)
        : null;

    // Handle cUSDC approval
    const handleApprove = async () => {
        if (!bidQty || !bidPriceTick || !auction) {
            toast({ type: 'error', title: 'Missing Fields', message: 'Enter price tick and quantity first' });
            return;
        }

        // ERC7984 uses setOperator instead of approve
        // Set auction as operator for 1 day (86400 seconds)
        const until = Math.floor(Date.now() / 1000) + 86400; // 1 day from now

        setCurrentAction('approve');
        try {
            await writeContractAsync({
                address: CUSDC_ADDRESS,
                abi: CUSDC_ABI,
                functionName: 'setOperator',
                args: [AUCTION_ADDRESS, until]
            });
        } catch (err: any) {
            console.error("Approve error:", err);
            toast({ type: 'error', title: 'Approval Cancelled', message: err.shortMessage || err.message || 'Transaction rejected' });
            if (encryptToastId) dismiss(encryptToastId);
            setCurrentAction(null);
        }
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

        if (!approvalDone && !isAlreadyOperator) {
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

        } catch (e: any) {
            console.error('Bid error:', e);
            setEncryptionStatus('error');
            decrypt(toastId, false, '✕ BID FAILED', e.shortMessage || e.message || 'Unknown error');
            toast({ type: 'error', title: 'Bid Failed', message: e.shortMessage || e.message || 'Unknown error' });
            setCurrentAction(null);
        } finally {
            setIsEncrypting(false);
            setEncryptToastId(null);
        }
    };

    // History Logic
    const publicClient = usePublicClient();
    const [bidHistory, setBidHistory] = useState<any[]>([]);

    useEffect(() => {
        if (!publicClient || !id || !auction) return;

        const fetchHistory = async () => {
            try {
                const currentBlock = await publicClient.getBlockNumber();

                // --- Simple Caching Start ---
                const cacheKey = `auction_logs_${id}`;
                let cachedLogs: any[] = [];
                let lastCachedBlock = 0n;

                try {
                    const saved = localStorage.getItem(cacheKey);
                    if (saved) {
                        const parsed = JSON.parse(saved);
                        // Convert stringified BigInts back if needed, mainly blockNumber
                        cachedLogs = parsed.map((log: any) => ({
                            ...log,
                            blockNumber: BigInt(log.blockNumber),
                            // Ensure args are accessible
                            args: log.args
                        }));
                        if (cachedLogs.length > 0) {
                            lastCachedBlock = cachedLogs[cachedLogs.length - 1].blockNumber;
                            // Sort to be sure
                            cachedLogs.sort((a, b) => Number(a.blockNumber - b.blockNumber));
                        }
                    }
                } catch (e) {
                    console.error("Cache parse error", e);
                }
                // --- Simple Caching End ---

                // Determine start block: if we have cache, start from lastCachedBlock + 1
                // If no cache, use logic to estimate start time
                let fromBlock = 0n;

                if (lastCachedBlock > 0n) {
                    fromBlock = lastCachedBlock + 1n;
                } else {
                    const now = BigInt(Math.floor(Date.now() / 1000));
                    if (auction.startTime < now) {
                        const secondsAgo = now - auction.startTime;
                        // Add buffer of 1000 blocks
                        const blocksAgo = (secondsAgo / 2n) + 1000n;
                        fromBlock = currentBlock - blocksAgo;
                    } else {
                        fromBlock = currentBlock - 1000n;
                    }
                }

                if (fromBlock < 0n) fromBlock = 0n;
                // Don't fetch if fromBlock > currentBlock (up to date)

                let newLogs: any[] = [];

                if (fromBlock <= currentBlock) {
                    // Chunked fetching to bypass RPC limits
                    const CHUNK_SIZE = 1000n;

                    for (let i = fromBlock; i <= currentBlock; i += CHUNK_SIZE) {
                        const toBlock = (i + CHUNK_SIZE - 1n) < currentBlock ? (i + CHUNK_SIZE - 1n) : currentBlock;

                        try {
                            const logs = await publicClient.getLogs({
                                address: AUCTION_ADDRESS,
                                event: parseAbiItem('event BidPlaced(uint256 indexed auctionId, address indexed bidder, uint32 tick)'),
                                args: {
                                    auctionId: BigInt(id)
                                },
                                fromBlock: i,
                                toBlock: toBlock
                            });
                            newLogs.push(...logs);
                            // Rate limit protection
                            await new Promise(r => setTimeout(r, 100));
                        } catch (err) {
                            console.error(`Chunk fetch error ${i}-${toBlock}:`, err);
                        }
                    }
                }

                // Merge cache + new
                const allLogs = [...cachedLogs, ...newLogs];
                // Remove duplicates just in case (by transactionHash)
                const uniqueLogs = Array.from(new Map(allLogs.map(log => [log.transactionHash, log])).values());
                uniqueLogs.sort((a, b) => Number(a.blockNumber - b.blockNumber));

                // Update Cache
                if (newLogs.length > 0) {
                    // Need custom serializer for BigInt
                    const serialized = JSON.stringify(uniqueLogs, (key, value) =>
                        typeof value === 'bigint' ? value.toString() : value
                    );
                    localStorage.setItem(cacheKey, serialized);
                }

                if (uniqueLogs.length > 0) {
                    const lastLog = uniqueLogs[uniqueLogs.length - 1];
                    if (lastLog.args.tick !== undefined) {
                        setLatestBidTick(Number(lastLog.args.tick));
                    }

                    // Find highest bid tick from all events
                    const maxTick = Math.max(...uniqueLogs.map(log => Number(log.args.tick || 0)));
                    if (maxTick > 0) {
                        setHighestBidTick(maxTick);
                    }
                } else {
                    setLatestBidTick(null);
                    setHighestBidTick(null);
                }

                // Filter for user's bids only for history display
                if (address) {
                    const myLogs = uniqueLogs.filter(log =>
                        log.args.bidder && log.args.bidder.toLowerCase() === address.toLowerCase()
                    );
                    setBidHistory(myLogs);
                }
            } catch (e) {
                console.error("Failed to fetch history:", e);
            }
        };

        fetchHistory();
        // Poll every 15s (slower than before to reduce load)
        const interval = setInterval(fetchHistory, 15000);
        return () => clearInterval(interval);
    }, [publicClient, address, id, auction?.startTime, isSuccess]);

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
                <div className="nav-content">
                    <Link href="/" style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#a0a0a0', textDecoration: 'none', fontSize: '14px' }}>
                        <span className="cyber-button" style={{ padding: '4px 12px', fontSize: '16px' }}>&lt; BACK</span>
                    </Link>
                    <div className="nav-connect-wrapper">
                        <ConnectButton />
                    </div>
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
                    <div className="auction-layout-grid">
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
                                <h1 className="glitch-hover heading-responsive" style={{
                                    fontWeight: 800,
                                    marginBottom: '24px',
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

                            {/* Section 1: Auction Info */}
                            <div style={{ marginBottom: '24px' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
                                    <span style={{ color: 'var(--gold-primary)', fontSize: '14px' }}>◆</span>
                                    <span style={{ fontSize: '12px', color: '#888', letterSpacing: '2px', textTransform: 'uppercase' }}>Auction Info</span>
                                    <div style={{ flex: 1, height: '1px', background: 'linear-gradient(90deg, rgba(255,215,0,0.3), transparent)' }}></div>
                                </div>
                                <div className="stats-grid-4">
                                    {[
                                        { label: 'STATUS', value: getStatus(), color: getStatus() === 'LIVE' ? '#00FF64' : getStatus() === 'ENDED' ? '#FF6464' : getStatus() === 'UPCOMING' ? '#FFD700' : '#888' },
                                        { label: 'TOKEN', value: tokenSymbol || '...', color: 'var(--gold-primary)' },
                                        { label: 'TOTAL LOTS', value: formattedLots, color: '#fff' },
                                        { label: 'CLEARING', value: auction?.finalized ? `$${(auction.clearingTick * auction.tickSize / 1000000).toFixed(3)}` : 'Pending', color: auction?.finalized ? '#00FF64' : '#666' }
                                    ].map((stat, i) => (
                                        <div key={i} style={{
                                            background: 'rgba(0,0,0,0.4)',
                                            padding: '16px',
                                            borderRadius: '10px',
                                            border: '1px solid rgba(255,215,0,0.1)'
                                        }}>
                                            <div style={{ fontSize: '10px', color: '#666', marginBottom: '6px', letterSpacing: '1px' }}>{stat.label}</div>
                                            <div style={{ fontSize: '18px', fontWeight: 'bold', color: stat.color, fontFamily: 'monospace' }}>
                                                {stat.value}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            {/* Section 2: Bidding Activity */}
                            <div style={{ marginBottom: '24px' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
                                    <span style={{ color: '#00BFFF', fontSize: '14px' }}>◆</span>
                                    <span style={{ fontSize: '12px', color: '#888', letterSpacing: '2px', textTransform: 'uppercase' }}>Bidding Activity</span>
                                    <div style={{ flex: 1, height: '1px', background: 'linear-gradient(90deg, rgba(0,191,255,0.3), transparent)' }}></div>
                                </div>
                                <div className="grid-responsive" style={{ gap: '12px' }}>
                                    <div style={{
                                        background: 'linear-gradient(135deg, rgba(255,215,0,0.1) 0%, rgba(0,0,0,0.4) 100%)',
                                        padding: '20px',
                                        borderRadius: '12px',
                                        border: '1px solid rgba(255,215,0,0.2)',
                                        textAlign: 'center'
                                    }}>
                                        <div style={{ fontSize: '10px', color: '#888', marginBottom: '8px', letterSpacing: '1px' }}>🔥 HIGHEST BID</div>
                                        <div style={{ fontSize: '28px', fontWeight: 'bold', color: '#FFD700', fontFamily: 'monospace', textShadow: '0 0 20px rgba(255,215,0,0.3)' }}>
                                            {highestBidTick !== null && auction ? `$${(highestBidTick * auction.tickSize / 1000000).toFixed(3)}` : 'No bids'}
                                        </div>
                                        {highestBidTick !== null && <div style={{ fontSize: '11px', color: '#666', marginTop: '4px' }}>Tick #{highestBidTick}</div>}
                                    </div>
                                    <div style={{
                                        background: 'linear-gradient(135deg, rgba(0,191,255,0.1) 0%, rgba(0,0,0,0.4) 100%)',
                                        padding: '20px',
                                        borderRadius: '12px',
                                        border: '1px solid rgba(0,191,255,0.2)',
                                        textAlign: 'center'
                                    }}>
                                        <div style={{ fontSize: '10px', color: '#888', marginBottom: '8px', letterSpacing: '1px' }}>⚡ LAST BID</div>
                                        <div style={{ fontSize: '28px', fontWeight: 'bold', color: '#00BFFF', fontFamily: 'monospace', textShadow: '0 0 20px rgba(0,191,255,0.3)' }}>
                                            {latestBidTick !== null && auction ? `$${(latestBidTick * auction.tickSize / 1000000).toFixed(3)}` : 'No bids'}
                                        </div>
                                        {latestBidTick !== null && <div style={{ fontSize: '11px', color: '#666', marginTop: '4px' }}>Tick #{latestBidTick}</div>}
                                    </div>
                                </div>
                            </div>

                            {/* Section 3: Price Range & Schedule */}
                            <div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
                                    <span style={{ color: '#00FF64', fontSize: '14px' }}>◆</span>
                                    <span style={{ fontSize: '12px', color: '#888', letterSpacing: '2px', textTransform: 'uppercase' }}>Price Range & Schedule</span>
                                    <div style={{ flex: 1, height: '1px', background: 'linear-gradient(90deg, rgba(0,255,100,0.3), transparent)' }}></div>
                                </div>
                                <div className="stats-grid-5">
                                    {[
                                        { label: 'MIN PRICE', value: auction ? `$${(auction.endTick * auction.tickSize / 1000000).toFixed(3)}` : '...', color: '#00FF64', icon: '↓' },
                                        { label: 'MAX PRICE', value: auction ? `$${(auction.startTick * auction.tickSize / 1000000).toFixed(3)}` : '...', color: '#FF6464', icon: '↑' },
                                        { label: 'TICK SIZE', value: auction ? `$${(auction.tickSize / 1000000).toFixed(6)}` : '...', color: '#888', icon: '◇' },
                                        { label: 'STARTS', value: auction ? new Date(Number(auction.startTime) * 1000).toLocaleString('en-GB', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '...', color: '#888', icon: '▶' },
                                        { label: 'ENDS', value: auction ? new Date(Number(auction.endTime) * 1000).toLocaleString('en-GB', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '...', color: '#888', icon: '■' }
                                    ].map((stat, i) => (
                                        <div key={i} style={{
                                            background: 'rgba(0,0,0,0.3)',
                                            padding: '14px',
                                            borderRadius: '10px',
                                            border: '1px solid rgba(255,255,255,0.05)'
                                        }}>
                                            <div style={{ fontSize: '10px', color: '#666', marginBottom: '6px', letterSpacing: '1px' }}>{stat.icon} {stat.label}</div>
                                            <div style={{ fontSize: '14px', fontWeight: 'bold', color: stat.color, fontFamily: 'monospace' }}>
                                                {stat.value}
                                            </div>
                                        </div>
                                    ))}
                                </div>
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
                                                = ${(Number(bidPriceTick) * auction.tickSize / 1000000).toFixed(6)} per lot
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

                                    {/* cUSDC Balance Display */}
                                    {isConnected && (
                                        <div style={{
                                            padding: '12px',
                                            background: 'rgba(0,0,0,0.3)',
                                            borderRadius: '8px',
                                            border: hasSufficientBalance === false ? '1px solid #FF6464' : '1px solid rgba(255,255,255,0.1)'
                                        }}>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                                                <span style={{ fontSize: '11px', color: '#888' }}>YOUR cUSDC BALANCE</span>
                                                {decryptedCusdcBalance === null && hasCusdcBalance && (
                                                    <button
                                                        onClick={handleDecryptCusdcBalance}
                                                        disabled={isDecryptingBalance || !fheReady || !signer}
                                                        style={{
                                                            background: 'transparent',
                                                            border: '1px solid var(--gold-primary)',
                                                            color: 'var(--gold-primary)',
                                                            padding: '2px 8px',
                                                            borderRadius: '4px',
                                                            fontSize: '10px',
                                                            cursor: isDecryptingBalance ? 'wait' : 'pointer'
                                                        }}
                                                    >
                                                        {isDecryptingBalance ? '🔓...' : '🔓 Decrypt'}
                                                    </button>
                                                )}
                                            </div>
                                            <div style={{ fontSize: '18px', fontWeight: 'bold', color: decryptedCusdcBalance ? '#00FF64' : '#666' }}>
                                                {decryptedCusdcBalance !== null ? `$${decryptedCusdcBalance}` : hasCusdcBalance ? '🔒 Encrypted' : '$0'}
                                            </div>
                                            {requiredCusdc && (
                                                <div style={{ fontSize: '11px', marginTop: '6px', color: hasSufficientBalance === false ? '#FF6464' : '#888' }}>
                                                    Required: ${requiredCusdc} cUSDC
                                                    {hasSufficientBalance === true && <span style={{ color: '#00FF64' }}> ✓</span>}
                                                    {hasSufficientBalance === false && <span> (Insufficient)</span>}
                                                </div>
                                            )}
                                        </div>
                                    )}

                                    {/* Action Buttons */}
                                    <div style={{ display: 'flex', gap: '12px', marginTop: '10px' }}>
                                        {/* Only show approve button if not already authorized */}
                                        {!isAlreadyOperator && (
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
                                        )}
                                        <button
                                            onClick={handleBid}
                                            disabled={!isConnected || isEncrypting || (!approvalDone && !isAlreadyOperator) || encryptionStatus === 'success' || hasSufficientBalance === false}
                                            className="cyber-button"
                                            style={{
                                                flex: 1,
                                                padding: '16px',
                                                fontSize: '14px',
                                                opacity: (!approvalDone && !isAlreadyOperator) || hasSufficientBalance === false ? 0.5 : 1,
                                                cursor: isEncrypting ? 'wait' : 'pointer'
                                            }}
                                        >
                                            {isEncrypting ? (
                                                <ScrambleText text="ENCRYPTING..." trigger={true} className="text-gold" />
                                            ) : encryptionStatus === 'success' ? '✓ BID SENT' : isAlreadyOperator ? 'ENCRYPT & BID' : '2. ENCRYPT & BID'}
                                        </button>
                                    </div>

                                    {/* Operator Status */}
                                    {isConnected && (
                                        <div style={{ textAlign: 'center', fontSize: '11px', color: '#666', marginTop: '12px' }}>
                                            Operator: <span style={{ color: isAlreadyOperator ? '#00FF64' : '#FF6464' }}>{isAlreadyOperator ? '✓ Authorized' : '✕ Not Set'}</span>
                                            {isAlreadyOperator && <span style={{ color: '#00FF64', marginLeft: '8px' }}>(Skip Approve)</span>}
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
