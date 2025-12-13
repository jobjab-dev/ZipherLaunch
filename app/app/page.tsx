'use client';
import { ConnectButton } from '@rainbow-me/rainbowkit';
import Link from 'next/link';
import { useState, useEffect } from 'react';
import { useAccount, useWriteContract, useWaitForTransactionReceipt, useReadContract } from 'wagmi';
import { formatUnits, parseUnits } from 'viem';
import TypewriterText from './components/TypewriterText';
import ScrambleText from './components/ScrambleText';
import { useToast } from './components/Toast';

const ERC20_ABI = [
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

// Test USDC (standard ERC20 for bidding)
const TEST_USDC_ABI = [
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

const SAMPLE_TOKEN = process.env.NEXT_PUBLIC_SAMPLE_TOKEN_ADDRESS as `0x${string}`;
const TEST_USDC_ADDRESS = process.env.NEXT_PUBLIC_TEST_USDC_ADDRESS as `0x${string}`;
const AUCTION_ADDRESS = process.env.NEXT_PUBLIC_AUCTION_ADDRESS as `0x${string}`;

// Auction contract ABI (minimal for reading auctions)
const AUCTION_ABI = [
  {
    "inputs": [],
    "name": "auctionCount",
    "outputs": [{ "name": "", "type": "uint256" }],
    "stateMutability": "view",
    "type": "function"
  },
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

export default function Home() {
  const { address, isConnected } = useAccount();
  const { encrypt, decrypt, toast } = useToast();
  const [auctions, setAuctions] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [currentAction, setCurrentAction] = useState<'smpl' | 'cusdc' | null>(null);
  const [smplAmount, setSmplAmount] = useState('100000');
  const [cusdcAmount, setCusdcAmount] = useState('10000');
  const [encryptToastId, setEncryptToastId] = useState<string | null>(null);

  const { data: hash, isPending, writeContract, reset } = useWriteContract();
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash });

  // Token balances
  const { data: smplBalance, refetch: refetchSmpl } = useReadContract({
    address: SAMPLE_TOKEN,
    abi: ERC20_ABI,
    functionName: 'balanceOf',
    args: [address!],
    query: { enabled: !!address && !!SAMPLE_TOKEN }
  });

  const { data: usdcBalance, refetch: refetchUsdc } = useReadContract({
    address: TEST_USDC_ADDRESS,
    abi: TEST_USDC_ABI,
    functionName: 'balanceOf',
    args: [address!],
    query: { enabled: !!address && !!TEST_USDC_ADDRESS }
  });

  // Fetch auction count
  const { data: auctionCount } = useReadContract({
    address: AUCTION_ADDRESS,
    abi: AUCTION_ABI,
    functionName: 'auctionCount',
    query: { enabled: !!AUCTION_ADDRESS }
  });

  // Fetch auctions when count changes
  useEffect(() => {
    const fetchAuctions = async () => {
      if (!auctionCount || !AUCTION_ADDRESS) {
        setIsLoading(false);
        return;
      }

      const count = Number(auctionCount);
      if (count === 0) {
        setAuctions([]);
        setIsLoading(false);
        return;
      }

      try {
        // For now, we'll create placeholder data since useReadContract can't loop
        // In production, use multicall or a subgraph
        const auctionList = [];
        for (let i = 0; i < count; i++) {
          auctionList.push({ id: i });
        }
        setAuctions(auctionList);
      } catch (error) {
        console.error('Failed to fetch auctions:', error);
      }
      setIsLoading(false);
    };

    fetchAuctions();
  }, [auctionCount]);

  useEffect(() => {
    if (isPending && !encryptToastId && currentAction) {
      const text = currentAction === 'smpl' ? 'MINTING SMPL...' : 'MINTING USDC...';
      const id = encrypt(text, 'Waiting for wallet confirmation');
      setEncryptToastId(id);
    }
  }, [isPending, encryptToastId, currentAction, encrypt]);

  useEffect(() => {
    if (isConfirming && encryptToastId) {
      decrypt(encryptToastId, true, 'PROCESSING ON-CHAIN...', `TX: ${hash?.slice(0, 20)}...`);
      const id = encrypt('DECRYPTING RESULT...', 'Minting tokens...');
      setEncryptToastId(id);
    }
  }, [isConfirming]);

  useEffect(() => {
    if (isSuccess && encryptToastId && currentAction) {
      if (currentAction === 'smpl') {
        decrypt(encryptToastId, true, '✓ SMPL MINTED!', `${smplAmount} SMPL received`);
        toast({ type: 'success', title: 'SMPL Minted', message: `You received ${Number(smplAmount).toLocaleString()} SMPL for auctions`, duration: 6000 });
        refetchSmpl();
      } else {
        decrypt(encryptToastId, true, '✓ USDC MINTED!', `${cusdcAmount} USDC received`);
        toast({ type: 'success', title: 'USDC Minted', message: `You received ${Number(cusdcAmount).toLocaleString()} USDC for bidding`, duration: 6000 });
        refetchUsdc();
      }
      setEncryptToastId(null);
      setCurrentAction(null);
      reset();
    }
  }, [isSuccess]);

  const handleMintSmpl = () => {
    if (!address) return;
    setCurrentAction('smpl');
    writeContract({
      address: SAMPLE_TOKEN,
      abi: ERC20_ABI,
      functionName: 'mint',
      args: [address, parseUnits(smplAmount, 18)]
    });
  };

  const handleMintUsdc = () => {
    if (!address) return;
    setCurrentAction('cusdc');
    writeContract({
      address: TEST_USDC_ADDRESS,
      abi: TEST_USDC_ABI,
      functionName: 'mint',
      args: [address, parseUnits(cusdcAmount, 6)]  // USDC uses 6 decimals
    });
  };

  const isProcessing = isPending || isConfirming;

  return (
    <div style={{ minHeight: '100vh', overflow: 'hidden' }}>
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
          <Link href="/" style={{ display: 'flex', alignItems: 'center', gap: '12px', textDecoration: 'none' }}>
            <div style={{
              width: '40px',
              height: '40px',
              border: '2px solid var(--gold-primary)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 0 15px rgba(255, 215, 0, 0.3)'
            }}>
              <span style={{ fontSize: '20px' }}>⚡</span>
            </div>
            <span style={{ fontSize: '24px', fontWeight: 800, color: '#fff', letterSpacing: '2px' }}>
              CIPHER<span className="text-gold">LAUNCH</span>
            </span>
          </Link>
          <ConnectButton />
        </div>
      </nav>

      {/* Hero Section */}
      <section style={{
        textAlign: 'center',
        padding: '80px 20px 40px',
        maxWidth: '1000px',
        margin: '0 auto',
        position: 'relative',
        zIndex: 1
      }}>
        <div style={{
          display: 'inline-block',
          marginBottom: '24px',
          fontFamily: 'monospace',
          color: 'var(--gold-primary)',
          textShadow: '0 0 10px rgba(255, 215, 0, 0.5)',
          fontSize: '14px',
          border: '1px solid var(--gold-primary)',
          padding: '8px 16px',
          letterSpacing: '2px',
          minHeight: '40px',
          minWidth: '300px'
        }}>
          <TypewriterText texts={[":: SYSTEM SECURE ::", ":: GOLD PROTOCOL ACTIVATED ::", ":: PRIVACY ENABLED ::"]} typingSpeed={50} pauseTime={2000} />
        </div>

        <h1 className="glitch-hover" style={{
          fontSize: 'clamp(42px, 5vw, 80px)',
          fontWeight: 900,
          lineHeight: 1,
          marginBottom: '24px',
          textTransform: 'uppercase',
          letterSpacing: '-2px',
          cursor: 'default'
        }}>
          THE FUTURE OF <br />
          <span className="text-gold" style={{ textShadow: '0 0 40px rgba(255, 215, 0, 0.5)' }}>PRIVATE AUCTIONS</span>
        </h1>

        <p style={{
          fontSize: '18px',
          color: '#a0a0a0',
          maxWidth: '600px',
          margin: '0 auto 32px',
          lineHeight: 1.6
        }}>
          Experience true confidentiality with Fully Homomorphic Encryption.
          <br />
          Your bids remain <span className="text-gold" style={{ fontWeight: 'bold' }}>encrypted</span> until settlement.
        </p>

        <div style={{ display: 'flex', gap: '16px', justifyContent: 'center', flexWrap: 'wrap' }}>
          <Link href="/create" className="cyber-button" style={{
            padding: '16px 32px',
            fontSize: '16px',
            textDecoration: 'none'
          }}>
            CREATE AUCTION
          </Link>
          <Link href="/create-token" className="cyber-button" style={{
            padding: '16px 32px',
            fontSize: '16px',
            textDecoration: 'none'
          }}>
            CREATE TOKEN
          </Link>
          <Link href="/wrap" className="cyber-button" style={{
            padding: '16px 32px',
            fontSize: '16px',
            textDecoration: 'none'
          }}>
            SHIELD TOKEN
          </Link>
        </div>
      </section>

      {/* Shield Token Flow Section */}
      <section style={{ padding: '20px 24px 60px', maxWidth: '900px', margin: '0 auto' }}>
        <div style={{ textAlign: 'center', marginBottom: '24px' }}>
          <h2 style={{ fontSize: '20px', color: 'var(--gold-primary)', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '2px' }}>
            🪙 Get Test Tokens
          </h2>
          <p style={{ color: '#666', fontSize: '13px' }}>
            Mint tokens to use in auctions (testnet only)
          </p>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '20px' }}>
          {/* Mint SMPL Card */}
          <div className="neon-card" style={{ padding: '20px', borderRadius: '12px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '14px' }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                  <span style={{ fontSize: '12px', background: '#333', padding: '2px 8px', borderRadius: '4px', color: '#888' }}>STEP 1</span>
                </div>
                <h3 style={{ fontSize: '15px', color: 'var(--gold-primary)', marginBottom: '2px' }}>
                  🪙 Mint SMPL
                </h3>
                <p style={{ fontSize: '11px', color: '#666' }}>For selling in auctions</p>
              </div>
              {isConnected && smplBalance !== undefined && (
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: '10px', color: '#888' }}>Balance</div>
                  <div style={{ fontSize: '16px', fontWeight: 'bold', color: 'var(--gold-primary)' }}>
                    {Number(formatUnits(smplBalance as bigint, 18)).toLocaleString()}
                  </div>
                </div>
              )}
            </div>
            <div style={{ display: 'flex', gap: '10px' }}>
              <input
                type="number"
                value={smplAmount}
                onChange={e => setSmplAmount(e.target.value)}
                placeholder="Amount"
                className="cyber-input"
                style={{ flex: 1, padding: '12px', borderRadius: '8px', fontSize: '14px' }}
                disabled={isProcessing || !isConnected}
              />
              <button
                onClick={handleMintSmpl}
                disabled={!isConnected || isProcessing}
                className="cyber-button"
                style={{ padding: '12px 20px', fontSize: '13px' }}
              >
                {isPending && currentAction === 'smpl' ? (
                  <ScrambleText text="..." trigger={true} className="text-gold" />
                ) : 'MINT'}
              </button>
            </div>
          </div>

          {/* Mint cUSDC Card */}
          <div className="neon-card" style={{ padding: '20px', borderRadius: '12px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '14px' }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                  <span style={{ fontSize: '12px', background: '#333', padding: '2px 8px', borderRadius: '4px', color: '#888' }}>STEP 1</span>
                </div>
                <h3 style={{ fontSize: '15px', color: 'var(--gold-primary)', marginBottom: '2px' }}>
                  💵 Mint USDC
                </h3>
                <p style={{ fontSize: '11px', color: '#666' }}>Then shield → cUSDC for bidding</p>
              </div>
              {isConnected && usdcBalance !== undefined && (
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: '10px', color: '#888' }}>Balance</div>
                  <div style={{ fontSize: '16px', fontWeight: 'bold', color: 'var(--gold-primary)' }}>
                    {Number(formatUnits(usdcBalance as bigint, 6)).toLocaleString()}
                  </div>
                </div>
              )}
            </div>
            <div style={{ display: 'flex', gap: '10px' }}>
              <input
                type="number"
                value={cusdcAmount}
                onChange={e => setCusdcAmount(e.target.value)}
                placeholder="Amount"
                className="cyber-input"
                style={{ flex: 1, padding: '12px', borderRadius: '8px', fontSize: '14px' }}
                disabled={isProcessing || !isConnected}
              />
              <button
                onClick={handleMintUsdc}
                disabled={!isConnected || isProcessing}
                className="cyber-button"
                style={{ padding: '12px 20px', fontSize: '13px' }}
              >
                {isPending && currentAction === 'cusdc' ? (
                  <ScrambleText text="..." trigger={true} className="text-gold" />
                ) : 'MINT'}
              </button>
            </div>
          </div>


        </div>

        {!isConnected && (
          <p style={{ fontSize: '12px', color: '#666', marginTop: '16px', textAlign: 'center' }}>
            Connect wallet to mint tokens
          </p>
        )}
      </section>

      {/* Active Markets Section */}
      <section style={{ padding: '40px 24px 60px', maxWidth: '1400px', margin: '0 auto' }}>
        <div style={{
          borderLeft: '4px solid var(--gold-primary)',
          paddingLeft: '20px',
          marginBottom: '40px',
          display: 'flex',
          alignItems: 'end',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '12px'
        }}>
          <div>
            <h2 style={{ fontSize: '28px', fontWeight: 700, textTransform: 'uppercase', marginBottom: '8px' }}>Active Markets</h2>
            <p style={{ color: '#666', fontFamily: 'monospace', fontSize: '12px' }}>SECURE_CONNECTION_ESTABLISHED</p>
          </div>
          <div style={{ color: 'var(--gold-primary)', fontFamily: 'monospace', fontSize: '13px' }}>
            <TypewriterText texts={["SCANNING CHAIN...", "SYNCING NODES...", "LIVE"]} typingSpeed={100} pauseTime={3000} />
          </div>
        </div>

        {isLoading ? (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '24px' }}>
            {[1, 2, 3].map((i) => (
              <div key={i} className="neon-card" style={{ height: '260px', padding: '24px' }}>
                <Skeleton width="50px" height="50px" />
                <div style={{ marginTop: '16px' }}><Skeleton width="60%" height="24px" /></div>
                <div style={{ marginTop: '8px' }}><Skeleton width="40%" height="16px" /></div>
                <div style={{ marginTop: '32px' }}><Skeleton width="100%" height="50px" /></div>
              </div>
            ))}
          </div>
        ) : auctions.length === 0 ? (
          <div style={{
            textAlign: 'center',
            padding: '80px 20px',
            border: '1px dashed var(--glass-border)',
            background: 'var(--glass-bg)',
            borderRadius: '16px'
          }}>
            <div style={{ fontSize: '56px', marginBottom: '16px', color: '#333' }}>∅</div>
            <h3 style={{ fontSize: '22px', marginBottom: '12px', color: '#fff' }}>NO ACTIVE SIGNALS</h3>
            <p style={{ color: '#666', marginBottom: '24px', fontSize: '14px' }}>The network is quiet. Be the first to broadcast.</p>
            <Link href="/create" className="cyber-button" style={{
              padding: '14px 28px',
              textDecoration: 'none',
              display: 'inline-block',
              fontSize: '14px'
            }}>
              CREATE SIGNAL
            </Link>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '24px' }}>
            {auctions.map((auction) => (
              <Link
                key={auction.id}
                href={`/auction/${auction.id}`}
                style={{ textDecoration: 'none' }}
              >
                <div className="neon-card" style={{
                  padding: '24px',
                  cursor: 'pointer',
                  transition: 'all 0.3s ease',
                  height: '200px'
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: '16px' }}>
                    <div style={{
                      width: '50px',
                      height: '50px',
                      background: 'linear-gradient(135deg, var(--gold-primary), #FFA500)',
                      borderRadius: '12px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: '24px'
                    }}>🔐</div>
                    <span style={{
                      background: 'rgba(0, 255, 0, 0.1)',
                      color: '#00ff00',
                      padding: '4px 12px',
                      borderRadius: '20px',
                      fontSize: '11px',
                      fontWeight: 'bold'
                    }}>ACTIVE</span>
                  </div>
                  <h3 style={{ fontSize: '18px', color: '#fff', marginBottom: '8px' }}>Auction #{auction.id}</h3>
                  <p style={{ color: '#888', fontSize: '13px', marginBottom: '16px' }}>Sealed-bid Dutch auction</p>
                  <div style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    borderTop: '1px solid rgba(255, 215, 0, 0.1)',
                    paddingTop: '12px',
                    fontSize: '12px'
                  }}>
                    <span style={{ color: '#666' }}>Click to view details</span>
                    <span style={{ color: 'var(--gold-primary)' }}>→</span>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
