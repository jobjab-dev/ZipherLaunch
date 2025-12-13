'use client';
import { useState, useEffect } from 'react';
import Link from 'next/link';
import { ConnectButton } from '@rainbow-me/rainbowkit';
import { useAccount, useWriteContract, useWaitForTransactionReceipt, usePublicClient } from 'wagmi';
import { decodeEventLog } from 'viem';
import ScrambleText from '../components/ScrambleText';
import { useToast } from '../components/Toast';

// TokenFactory ABI (simplified)
const TOKEN_FACTORY_ABI = [
    {
        "inputs": [
            { "name": "name", "type": "string" },
            { "name": "symbol", "type": "string" },
            { "name": "decimals", "type": "uint8" },
            { "name": "initialSupply", "type": "uint256" }
        ],
        "name": "createToken",
        "outputs": [{ "name": "tokenAddress", "type": "address" }],
        "stateMutability": "nonpayable",
        "type": "function"
    },
    {
        "anonymous": false,
        "inputs": [
            { "indexed": true, "name": "token", "type": "address" },
            { "indexed": true, "name": "creator", "type": "address" },
            { "indexed": false, "name": "name", "type": "string" },
            { "indexed": false, "name": "symbol", "type": "string" },
            { "indexed": false, "name": "decimals", "type": "uint8" },
            { "indexed": false, "name": "initialSupply", "type": "uint256" }
        ],
        "name": "TokenCreated",
        "type": "event"
    }
] as const;

const TOKEN_FACTORY_ADDRESS = process.env.NEXT_PUBLIC_TOKEN_FACTORY_ADDRESS as `0x${string}`;

export default function CreateTokenPage() {
    const { isConnected } = useAccount();
    const { encrypt, decrypt, dismiss, toast } = useToast();
    const publicClient = usePublicClient();

    const [name, setName] = useState('');
    const [symbol, setSymbol] = useState('');
    const [decimals, setDecimals] = useState('18');
    const [supply, setSupply] = useState('1000000');
    const [createdToken, setCreatedToken] = useState<string | null>(null);
    const [encryptToastId, setEncryptToastId] = useState<string | null>(null);

    const { data: hash, isPending, writeContract, writeContractAsync, reset } = useWriteContract();
    const { isLoading: isConfirming, isSuccess, data: receipt } = useWaitForTransactionReceipt({ hash });

    // Handle encryption animation


    // Handle confirmation
    useEffect(() => {
        if (isConfirming && encryptToastId) {
            decrypt(encryptToastId, true, 'PROCESSING ON-CHAIN...', `TX: ${hash?.slice(0, 20)}...`);
            const newId = encrypt('DECRYPTING RESULT...', 'Waiting for confirmation');
            setEncryptToastId(newId);
        }
    }, [isConfirming, encryptToastId, decrypt, hash, encrypt]);

    // Handle success - get token address from logs
    useEffect(() => {
        if (isSuccess && receipt && encryptToastId) {
            try {
                const tokenCreatedLog = receipt.logs.find(log => {
                    try {
                        const decoded = decodeEventLog({
                            abi: TOKEN_FACTORY_ABI,
                            data: log.data,
                            topics: log.topics
                        });
                        return decoded.eventName === 'TokenCreated';
                    } catch { return false; }
                });

                if (tokenCreatedLog) {
                    const decoded = decodeEventLog({
                        abi: TOKEN_FACTORY_ABI,
                        data: tokenCreatedLog.data,
                        topics: tokenCreatedLog.topics
                    });
                    const tokenAddress = (decoded.args as any).token as string;
                    setCreatedToken(tokenAddress);
                    decrypt(encryptToastId, true, '✓ TOKEN DEPLOYED!', tokenAddress);
                    toast({
                        type: 'success',
                        title: `${symbol} Token Created`,
                        message: `Address: ${tokenAddress}`,
                        duration: 10000
                    });
                } else {
                    decrypt(encryptToastId, true, '✓ TOKEN DEPLOYED!', 'Check Etherscan for address');
                }
            } catch (e) {
                decrypt(encryptToastId, true, '✓ TOKEN DEPLOYED!', `TX: ${hash}`);
            }
            setEncryptToastId(null);
        }
    }, [isSuccess, receipt, encryptToastId, decrypt, toast, symbol, hash]);

    const handleCreate = async () => {
        if (!name || !symbol || !supply) {
            toast({ type: 'error', title: 'Missing Fields', message: 'Please fill all required fields' });
            return;
        }

        const toastId = encrypt('ENCRYPTING TRANSACTION...', 'Waiting for wallet confirmation');
        setEncryptToastId(toastId);

        setCreatedToken(null);
        const dec = parseInt(decimals);
        const supplyWei = BigInt(supply) * BigInt(10 ** dec);

        try {
            await writeContractAsync({
                address: TOKEN_FACTORY_ADDRESS,
                abi: TOKEN_FACTORY_ABI,
                functionName: 'createToken',
                args: [name, symbol, dec, supplyWei]
            });
        } catch (err: any) {
            console.error("Create token error:", err);
            toast({ type: 'error', title: 'Create Failed', message: err.shortMessage || err.message || 'Transaction rejected' });
            dismiss(toastId);
            setEncryptToastId(null);
        }
    };

    const handleReset = () => {
        setName('');
        setSymbol('');
        setDecimals('18');
        setSupply('1000000');
        setCreatedToken(null);
        setEncryptToastId(null);
        reset();
    };

    return (
        <div style={{ minHeight: '100vh' }}>
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
                    <Link href="/" style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#a0a0a0', textDecoration: 'none' }}>
                        <span className="cyber-button" style={{ padding: '4px 12px', fontSize: '16px' }}>&lt; BACK</span>
                    </Link>
                    <div className="nav-connect-wrapper">
                        <ConnectButton />
                    </div>
                </div>
            </nav>

            {/* Main Content */}
            <div style={{ maxWidth: '600px', margin: '0 auto', padding: '60px 24px' }}>
                <div className="neon-card" style={{ padding: '40px', borderRadius: '16px' }}>
                    <h1 className="glitch-hover" style={{
                        fontSize: '36px',
                        fontWeight: 800,
                        marginBottom: '8px',
                        textTransform: 'uppercase'
                    }}>
                        <span className="text-gold">Create</span> Token
                    </h1>
                    <p style={{ color: '#666', marginBottom: '32px' }}>
                        Deploy your own ERC20 token
                    </p>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
                        {/* Token Name */}
                        <div>
                            <label style={{ display: 'block', fontSize: '12px', color: '#666', marginBottom: '8px', letterSpacing: '1px' }}>
                                TOKEN NAME
                            </label>
                            <input
                                type="text"
                                value={name}
                                onChange={e => setName(e.target.value)}
                                placeholder="My Token"
                                className="cyber-input"
                                style={{ width: '100%', padding: '16px', borderRadius: '8px', fontSize: '16px' }}
                                disabled={isPending || isConfirming}
                            />
                        </div>

                        {/* Symbol */}
                        <div>
                            <label style={{ display: 'block', fontSize: '12px', color: '#666', marginBottom: '8px', letterSpacing: '1px' }}>
                                SYMBOL
                            </label>
                            <input
                                type="text"
                                value={symbol}
                                onChange={e => setSymbol(e.target.value.toUpperCase())}
                                placeholder="MTK"
                                maxLength={5}
                                className="cyber-input"
                                style={{ width: '100%', padding: '16px', borderRadius: '8px', fontSize: '16px' }}
                                disabled={isPending || isConfirming}
                            />
                        </div>

                        {/* Decimals */}
                        <div>
                            <label style={{ display: 'block', fontSize: '12px', color: '#666', marginBottom: '8px', letterSpacing: '1px' }}>
                                DECIMALS
                            </label>
                            <input
                                type="number"
                                value={decimals}
                                onChange={e => setDecimals(e.target.value)}
                                min={0}
                                max={18}
                                className="cyber-input"
                                style={{ width: '100%', padding: '16px', borderRadius: '8px', fontSize: '16px' }}
                                disabled={isPending || isConfirming}
                            />
                        </div>

                        {/* Initial Supply */}
                        <div>
                            <label style={{ display: 'block', fontSize: '12px', color: '#666', marginBottom: '8px', letterSpacing: '1px' }}>
                                INITIAL SUPPLY
                            </label>
                            <input
                                type="number"
                                value={supply}
                                onChange={e => setSupply(e.target.value)}
                                placeholder="1000000"
                                className="cyber-input"
                                style={{ width: '100%', padding: '16px', borderRadius: '8px', fontSize: '16px' }}
                                disabled={isPending || isConfirming}
                            />
                        </div>

                        {/* Create Button */}
                        {!createdToken ? (
                            <button
                                onClick={handleCreate}
                                disabled={!isConnected || isPending || isConfirming}
                                className="cyber-button"
                                style={{
                                    width: '100%',
                                    padding: '20px',
                                    fontSize: '16px',
                                    marginTop: '16px',
                                    cursor: isPending || isConfirming ? 'wait' : 'pointer'
                                }}
                            >
                                {isPending ? (
                                    <ScrambleText text="ENCRYPTING..." trigger={true} className="text-gold" />
                                ) : isConfirming ? (
                                    <ScrambleText text="DECRYPTING..." trigger={true} className="text-gold" />
                                ) : (
                                    'DEPLOY TOKEN'
                                )}
                            </button>
                        ) : (
                            <button
                                onClick={handleReset}
                                className="cyber-button"
                                style={{
                                    width: '100%',
                                    padding: '20px',
                                    fontSize: '16px',
                                    marginTop: '16px'
                                }}
                            >
                                CREATE ANOTHER
                            </button>
                        )}

                        {/* Success Message with Token Address */}
                        {createdToken && (
                            <div style={{
                                padding: '20px',
                                background: 'rgba(0, 255, 100, 0.1)',
                                border: '1px solid #00FF64',
                                borderRadius: '8px'
                            }}>
                                <div style={{ color: '#00FF64', fontWeight: 'bold', marginBottom: '12px', fontSize: '16px' }}>
                                    ✓ {symbol} TOKEN DEPLOYED
                                </div>
                                <div style={{ fontSize: '12px', color: '#888', marginBottom: '8px' }}>
                                    Contract Address:
                                </div>
                                <div style={{
                                    fontSize: '13px',
                                    color: '#FFD700',
                                    fontFamily: 'monospace',
                                    wordBreak: 'break-all',
                                    padding: '10px',
                                    background: 'rgba(0,0,0,0.3)',
                                    borderRadius: '6px'
                                }}>
                                    {createdToken}
                                </div>
                                <a
                                    href={`https://sepolia.etherscan.io/address/${createdToken}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    style={{
                                        display: 'block',
                                        marginTop: '12px',
                                        color: '#3B82F6',
                                        fontSize: '12px',
                                        textDecoration: 'underline'
                                    }}
                                >
                                    View on Etherscan →
                                </a>
                            </div>
                        )}

                        {!isConnected && (
                            <div style={{ textAlign: 'center', color: '#666', fontSize: '14px' }}>
                                Connect wallet to create token
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}

