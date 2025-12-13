'use client';

import Link from 'next/link';
import { useReadContract, usePublicClient } from 'wagmi';
import { formatUnits, parseAbiItem } from 'viem';
import { useState, useEffect } from 'react';

const AUCTION_ADDRESS = process.env.NEXT_PUBLIC_AUCTION_ADDRESS as `0x${string}`;

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

const ERC20_ABI = [
    { "inputs": [], "name": "symbol", "outputs": [{ "name": "", "type": "string" }], "stateMutability": "view", "type": "function" },
    { "inputs": [], "name": "decimals", "outputs": [{ "name": "", "type": "uint8" }], "stateMutability": "view", "type": "function" }
] as const;

function Skeleton({ width = '100%', height = '20px' }: { width?: string; height?: string }) {
    return (
        <div style={{
            width,
            height,
            backgroundColor: 'rgba(255, 215, 0, 0.05)',
            borderRadius: '4px',
            animation: 'pulse-gold 1.5s infinite alternate',
            border: '1px solid rgba(255, 215, 0, 0.1)'
        }}>
            <style jsx>{`
        @keyframes pulse-gold {
          0% { opacity: 0.3; box-shadow: 0 0 5px rgba(255, 215, 0, 0.1); }
          100% { opacity: 0.8; box-shadow: 0 0 15px rgba(255, 215, 0, 0.3); }
        }
      `}</style>
        </div>
    );
}

export default function AuctionCard({ id }: { id: number }) {
    const publicClient = usePublicClient();
    const [highestBidTick, setHighestBidTick] = useState<number | null>(null);

    // 1. Fetch Auction Data
    const { data: auctionData, isLoading: isLoadingAuction } = useReadContract({
        address: AUCTION_ADDRESS,
        abi: AUCTION_ABI,
        functionName: 'auctions',
        args: [BigInt(id)],
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

    // 2. Fetch Token Info
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

    // 3. Fetch Highest Bid using Logs
    useEffect(() => {
        if (!publicClient || !AUCTION_ADDRESS) return;

        const fetchHighestBid = async () => {
            try {
                const currentBlock = await publicClient.getBlockNumber();
                const fromBlock = currentBlock - BigInt(1000) > BigInt(0) ? currentBlock - BigInt(1000) : BigInt(0);

                const logs = await publicClient.getLogs({
                    address: AUCTION_ADDRESS,
                    event: parseAbiItem('event BidPlaced(uint256 indexed auctionId, address indexed bidder, uint32 tick)'),
                    args: { auctionId: BigInt(id) },
                    fromBlock: fromBlock
                });

                if (logs.length > 0) {
                    const maxTick = Math.max(...logs.map(log => Number(log.args.tick || 0)));
                    if (maxTick > 0) {
                        setHighestBidTick(maxTick);
                    }
                }
            } catch (e) {
                console.error("Failed to fetch bid logs:", e);
            }
        };

        fetchHighestBid();
        // Poll infrequently for listing
        const interval = setInterval(fetchHighestBid, 15000);
        return () => clearInterval(interval);
    }, [publicClient, id]);

    // 4. Computed Values
    const getStatus = () => {
        if (!auction) return 'LOADING';
        if (auction.finalized) return 'FINALIZED';
        const now = BigInt(Math.floor(Date.now() / 1000));
        if (now < auction.startTime) return 'UPCOMING';
        if (now > auction.endTime) return 'ENDED';
        return 'LIVE';
    };

    const status = getStatus();
    const statusColor = status === 'LIVE' ? '#00FF64' : status === 'ENDED' ? '#FF6464' : status === 'UPCOMING' ? '#FFD700' : '#888';

    const formattedLots = auction && tokenDecimals
        ? Number(formatUnits(auction.totalLots, tokenDecimals)).toLocaleString()
        : '...';

    const minPrice = auction ? (auction.endTick * auction.tickSize / 1000000).toFixed(3) : '...';
    const maxPrice = auction ? (auction.startTick * auction.tickSize / 1000000).toFixed(3) : '...';
    const highestBidPrice = highestBidTick && auction ? (highestBidTick * auction.tickSize / 1000000).toFixed(3) : null;

    const endDate = auction ? new Date(Number(auction.endTime) * 1000).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : '...';

    if (isLoadingAuction) {
        return (
            <div className="neon-card" style={{ height: '220px', padding: '24px' }}>
                <div style={{ marginBottom: '16px' }}><Skeleton width="40%" height="24px" /></div>
                <div style={{ marginTop: '16px' }}><Skeleton width="60%" height="24px" /></div>
                <div style={{ marginTop: '32px' }}><Skeleton width="100%" height="40px" /></div>
            </div>
        );
    }

    return (
        <Link href={`/auction/${id}`} style={{ textDecoration: 'none' }}>
            <div className="neon-card" style={{
                padding: '24px',
                cursor: 'pointer',
                transition: 'all 0.3s ease',
                height: '100%',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
                position: 'relative',
                overflow: 'hidden'
            }}>
                {/* Status Badge Top Right */}
                <div style={{
                    position: 'absolute',
                    top: '20px',
                    right: '20px',
                    background: `${statusColor}15`,
                    color: statusColor,
                    padding: '4px 12px',
                    borderRadius: '20px',
                    fontSize: '10px',
                    fontWeight: 'bold',
                    border: `1px solid ${statusColor}30`,
                    textTransform: 'uppercase',
                    letterSpacing: '1px'
                }}>
                    {status === 'LIVE' && '● '}
                    {status}
                </div>

                <div>
                    <h3 style={{ fontSize: '20px', color: '#fff', marginBottom: '4px', paddingRight: '80px' }}>
                        {tokenSymbol || `Auction #${id}`}
                    </h3>
                    <p style={{ color: '#888', fontSize: '11px', marginBottom: '24px', fontFamily: 'monospace' }}>
                        #{id.toString().padStart(4, '0')} • Sealed-Bid
                    </p>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '20px' }}>
                        {/* Supply Box */}
                        <div style={{ background: 'rgba(255,255,255,0.03)', padding: '12px', borderRadius: '8px' }}>
                            <div style={{ fontSize: '9px', color: '#666', marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Total Supply</div>
                            <div style={{ fontSize: '14px', color: '#fff', fontWeight: 'bold' }}>{formattedLots}</div>
                        </div>

                        {/* Highest Bid Box (or Range if no bids) */}
                        <div style={{
                            background: highestBidPrice ? 'linear-gradient(135deg, rgba(255, 215, 0, 0.1), rgba(0,0,0,0.2))' : 'rgba(255,255,255,0.03)',
                            padding: '12px',
                            borderRadius: '8px',
                            border: highestBidPrice ? '1px solid rgba(255, 215, 0, 0.2)' : 'none'
                        }}>
                            <div style={{ fontSize: '9px', color: highestBidPrice ? 'var(--gold-primary)' : '#666', marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                                {highestBidPrice ? '🔥 Highest Bid' : 'Starting Price'}
                            </div>
                            <div style={{ fontSize: '14px', color: highestBidPrice ? 'var(--gold-primary)' : '#fff', fontWeight: 'bold' }}>
                                {highestBidPrice ? `$${highestBidPrice}` : `$${maxPrice}`}
                            </div>
                        </div>
                    </div>
                </div>

                <div style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    borderTop: '1px solid rgba(255, 255, 255, 0.05)',
                    paddingTop: '16px',
                    fontSize: '11px'
                }}>
                    <span style={{ color: '#666' }}>Ends {endDate}</span>
                    <span style={{ color: 'var(--gold-primary)', display: 'flex', alignItems: 'center', gap: '4px', opacity: 0.8 }}>
                        DETAILS →
                    </span>
                </div>
            </div>
        </Link>
    );
}
