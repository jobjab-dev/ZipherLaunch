'use client';
import { useState, useEffect, useMemo, useCallback } from 'react';
import Link from 'next/link';
import { ConnectButton } from '@rainbow-me/rainbowkit';
import { useAccount, useWriteContract, useWaitForTransactionReceipt, useReadContract, useWalletClient, usePublicClient } from 'wagmi';
import { parseUnits, formatUnits, decodeEventLog } from 'viem';
import { useFhevm } from '../components/FhevmProvider';
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
        // unwrap with encrypted input and input proof (ERC7984ERC20Wrapper)
        "inputs": [
            { "name": "from", "type": "address" },
            { "name": "to", "type": "address" },
            { "name": "encryptedAmount", "type": "bytes32" },
            { "name": "inputProof", "type": "bytes" }
        ],
        "name": "unwrap",
        "outputs": [],
        "stateMutability": "nonpayable",
        "type": "function"
    },
    {
        // finalizeUnwrap to complete the unwrap process with decryption proof
        "inputs": [
            { "name": "burntAmount", "type": "bytes32" },
            { "name": "burntAmountCleartext", "type": "uint64" },
            { "name": "decryptionProof", "type": "bytes" }
        ],
        "name": "finalizeUnwrap",
        "outputs": [],
        "stateMutability": "nonpayable",
        "type": "function"
    },
    {
        "inputs": [{ "name": "account", "type": "address" }],
        "name": "confidentialBalanceOf",
        "outputs": [{ "name": "", "type": "bytes32" }],
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
        // UnwrapRequested event emitted when unwrap is called
        "anonymous": false,
        "inputs": [
            { "indexed": true, "name": "receiver", "type": "address" },
            { "indexed": false, "name": "amount", "type": "bytes32" }
        ],
        "name": "UnwrapRequested",
        "type": "event"
    }
] as const;

const WRAPPER_FACTORY_ADDRESS = process.env.NEXT_PUBLIC_WRAPPER_FACTORY_ADDRESS as `0x${string}`;
const SAMPLE_TOKEN = process.env.NEXT_PUBLIC_SAMPLE_TOKEN_ADDRESS as `0x${string}`;
const TEST_USDC_ADDRESS = process.env.NEXT_PUBLIC_TEST_USDC_ADDRESS as `0x${string}`;

// Predefined tokens for easy selection
const PREDEFINED_TOKENS = [
    { name: 'USDC', symbol: 'USDC', address: TEST_USDC_ADDRESS },
    { name: 'Sample Token', symbol: 'SMPL', address: SAMPLE_TOKEN },
] as const;

export default function WrapPage() {
    const { address, isConnected } = useAccount();
    const { data: walletClient } = useWalletClient();
    const publicClient = usePublicClient();
    const { isInitialized: isFhevmReady, status: fhevmStatus, instance } = useFhevm();
    const { encrypt, decrypt, toast } = useToast();

    const [mode, setMode] = useState<'wrap' | 'unwrap'>('wrap');
    const [tokenAddress, setTokenAddress] = useState<`0x${string}`>(TEST_USDC_ADDRESS || SAMPLE_TOKEN || '0x');
    const [amount, setAmount] = useState('');
    const [approvalDone, setApprovalDone] = useState(false);
    const [currentAction, setCurrentAction] = useState<'create' | 'approve' | 'wrap' | 'unwrap' | null>(null);
    const [encryptToastId, setEncryptToastId] = useState<string | null>(null);
    const [successState, setSuccessState] = useState(false);

    // Unwrap progress state (for multi-step flow)
    const [unwrapStep, setUnwrapStep] = useState<'idle' | 'encrypting' | 'unwrapping' | 'decrypting' | 'finalizing' | 'done'>('idle');

    // Decryption state
    const [decryptedBalance, setDecryptedBalance] = useState<string | null>(null);
    const [isDecryptingBalance, setIsDecryptingBalance] = useState(false);
    const [decryptError, setDecryptError] = useState<string | null>(null);

    const { data: hash, isPending, writeContract, writeContractAsync, reset } = useWriteContract();
    const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash });

    // Check if wrapper exists
    const { data: wrapperAddress, refetch: refetchWrapper } = useReadContract({
        address: WRAPPER_FACTORY_ADDRESS,
        abi: WRAPPER_FACTORY_ABI,
        functionName: 'getWrapper',
        args: [tokenAddress],
        query: { enabled: !!tokenAddress && tokenAddress.length === 42 }
    });

    // Get public token balance
    const { data: balance, refetch: refetchBalance } = useReadContract({
        address: tokenAddress,
        abi: ERC20_ABI,
        functionName: 'balanceOf',
        args: [address!],
        query: { enabled: !!address && !!tokenAddress && tokenAddress.length === 42 }
    });

    const { data: decimals } = useReadContract({
        address: tokenAddress,
        abi: ERC20_ABI,
        functionName: 'decimals',
        query: { enabled: !!tokenAddress && tokenAddress.length === 42 }
    });

    const { data: symbol } = useReadContract({
        address: tokenAddress,
        abi: ERC20_ABI,
        functionName: 'symbol',
        query: { enabled: !!tokenAddress && tokenAddress.length === 42 }
    });

    // Get encrypted balance handle
    const { data: encryptedBalanceHandle, refetch: refetchEncrypted } = useReadContract({
        address: wrapperAddress as `0x${string}`,
        abi: WRAPPER_ABI,
        functionName: 'confidentialBalanceOf',
        args: [address!],
        query: { enabled: !!address && !!wrapperAddress && wrapperAddress !== '0x0000000000000000000000000000000000000000' }
    });

    const hasWrapper = wrapperAddress && wrapperAddress !== '0x0000000000000000000000000000000000000000';
    const hasEncryptedBalance = encryptedBalanceHandle && encryptedBalanceHandle !== '0x0000000000000000000000000000000000000000000000000000000000000000';

    // Debug logging
    useEffect(() => {
        console.log('🔍 Debug balance info:');
        console.log('   wrapperAddress:', wrapperAddress);
        console.log('   hasWrapper:', hasWrapper);
        console.log('   encryptedBalanceHandle:', encryptedBalanceHandle);
        console.log('   hasEncryptedBalance:', hasEncryptedBalance);
        console.log('   address:', address);
    }, [wrapperAddress, encryptedBalanceHandle, address, hasWrapper, hasEncryptedBalance]);

    // Adapter: wagmi walletClient -> ethers-like signer
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

    // Decrypt balance function using @zama-fhe/relayer-sdk
    const handleDecryptBalance = useCallback(async () => {
        if (!isFhevmReady || !hasEncryptedBalance || !signer || !wrapperAddress || !instance) {
            toast({ type: 'error', title: 'Not Ready', message: `FHEVM Status: ${fhevmStatus}` });
            return;
        }

        setIsDecryptingBalance(true);
        setDecryptError(null);

        try {
            // Step 1: Generate keypair using SDK instance
            const keypair = instance.generateKeypair();

            // Step 2: Create EIP-712 message (following fhevm-example-hub pattern)
            const startTimestamp = Math.floor(Date.now() / 1000);
            const durationDays = 365;

            const eip712 = instance.createEIP712(
                keypair.publicKey,
                [wrapperAddress as `0x${string}`],
                startTimestamp,
                durationDays
            );

            // Step 3: Sign with wallet
            toast({ type: 'info', title: 'Sign Required', message: 'Please sign the decryption request in your wallet' });

            const signatureString = await signer.signTypedData(
                eip712.domain,
                { UserDecryptRequestVerification: eip712.types.UserDecryptRequestVerification },
                eip712.message
            );
            const userAddress = await signer.getAddress();

            // Step 4: Request decryption using relayer-sdk instance.userDecrypt
            toast({ type: 'info', title: 'Decrypting...', message: 'Requesting decryption from KMS...' });

            const requests = [{
                handle: encryptedBalanceHandle as string,
                contractAddress: wrapperAddress as `0x${string}`
            }];

            const result = await instance.userDecrypt(
                requests,
                keypair.privateKey,
                keypair.publicKey,
                signatureString,
                [wrapperAddress as `0x${string}`],
                userAddress,
                startTimestamp,
                durationDays
            );

            // Step 5: Format result
            console.log('🔍 Decryption result:', result);
            console.log('🔍 Handle key:', encryptedBalanceHandle);
            console.log('🔍 Result keys:', Object.keys(result));

            const value = (result as Record<string, bigint | boolean | `0x${string}` | undefined>)[encryptedBalanceHandle as string];
            console.log('🔍 Value for handle:', value, 'type:', typeof value);

            if (value !== undefined) {
                // ERC7984 uses 6 decimals (not the underlying ERC20's decimals!)
                const ERC7984_DECIMALS = 6;
                const formatted = Number(formatUnits(BigInt(String(value)), ERC7984_DECIMALS)).toLocaleString();
                console.log('🔍 Formatted value:', formatted);
                setDecryptedBalance(formatted);
                toast({ type: 'success', title: 'Balance Decrypted!', message: `Your c${String(symbol)} balance: ${formatted}` });
            } else {
                setDecryptedBalance('0');
            }
        } catch (error: unknown) {
            console.error('Decrypt error:', error);
            const errorMessage = error instanceof Error ? error.message : 'Decryption failed';
            setDecryptError(errorMessage);
            toast({ type: 'error', title: 'Decrypt Failed', message: errorMessage });
        } finally {
            setIsDecryptingBalance(false);
        }
    }, [isFhevmReady, hasEncryptedBalance, signer, wrapperAddress, encryptedBalanceHandle, decimals, symbol, toast, fhevmStatus, instance]);


    // Handle transaction states
    useEffect(() => {
        if (isPending && !encryptToastId && currentAction) {
            const actionText = currentAction === 'create' ? 'CREATING WRAPPER...'
                : currentAction === 'approve' ? 'APPROVING...'
                    : currentAction === 'wrap' ? 'SHIELDING...'
                        : 'UNSHIELDING...';
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
                decrypt(encryptToastId, true, '✓ APPROVAL SUCCESS!', 'Now shield tokens');
                setApprovalDone(true);
                toast({ type: 'success', title: 'Approval Confirmed', message: 'You can now shield tokens', duration: 6000 });
            } else if (currentAction === 'wrap') {
                decrypt(encryptToastId, true, '✓ TOKENS SHIELDED!', 'Confidential balance updated');
                setSuccessState(true);
                setDecryptedBalance(null); // Reset to trigger re-decrypt
                refetchBalance();
                refetchEncrypted();
                toast({ type: 'success', title: 'Shielded!', message: `${amount} ${String(symbol)} → c${String(symbol)}`, duration: 8000 });
            } else if (currentAction === 'unwrap') {
                decrypt(encryptToastId, true, '✓ TOKENS UNSHIELDED!', 'Public balance updated');
                setSuccessState(true);
                setDecryptedBalance(null);
                refetchBalance();
                refetchEncrypted();
                toast({ type: 'success', title: 'Unshielded!', message: `${amount} c${String(symbol)} → ${String(symbol)}`, duration: 8000 });
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
            args: [tokenAddress]
        });
    };

    const handleApprove = () => {
        if (!wrapperAddress || !decimals || !amount) return;
        setCurrentAction('approve');
        const amountWei = parseUnits(amount, Number(decimals));
        writeContract({
            address: tokenAddress,
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

    const handleUnwrap = async () => {
        if (!wrapperAddress || !amount || !instance || !address || !publicClient) {
            toast({ type: 'error', title: 'Not Ready', message: 'Please connect wallet and ensure FHEVM is ready' });
            return;
        }

        setCurrentAction('unwrap');
        setUnwrapStep('encrypting');

        try {
            // Helper function to convert Uint8Array to hex string
            const toHex = (arr: Uint8Array): `0x${string}` => {
                return `0x${Array.from(arr).map(b => b.toString(16).padStart(2, '0')).join('')}` as `0x${string}`;
            };

            // ============ STEP 1: Create encrypted input ============
            const ERC7984_DECIMALS = 6;
            const amountNumber = parseFloat(amount);
            const amountRaw = BigInt(Math.floor(amountNumber * (10 ** ERC7984_DECIMALS)));

            console.log('🔄 Step 1: Creating encrypted input...');
            toast({ type: 'info', title: 'Step 1/4', message: 'Encrypting amount...' });

            const encryptedInput = instance.createEncryptedInput(
                wrapperAddress as `0x${string}`,
                address
            );
            encryptedInput.add64(amountRaw);
            const { handles, inputProof } = await encryptedInput.encrypt();

            const encryptedAmountHex = toHex(handles[0]);
            const inputProofHex = toHex(inputProof);

            console.log('✅ Step 1 complete: Encrypted amount created');

            // ============ STEP 2: Call unwrap() ============
            setUnwrapStep('unwrapping');
            console.log('🔄 Step 2: Calling unwrap()...');
            toast({ type: 'info', title: 'Step 2/4', message: 'Please confirm unwrap transaction...' });

            const unwrapHash = await writeContractAsync({
                address: wrapperAddress as `0x${string}`,
                abi: WRAPPER_ABI,
                functionName: 'unwrap',
                args: [address, address, encryptedAmountHex, inputProofHex]
            });

            console.log('   Unwrap tx hash:', unwrapHash);

            // Wait for transaction to be confirmed
            const unwrapReceipt = await publicClient.waitForTransactionReceipt({ hash: unwrapHash });
            console.log('✅ Step 2 complete: Unwrap confirmed');

            // ============ STEP 3: Parse UnwrapRequested event & call publicDecrypt ============
            setUnwrapStep('decrypting');
            console.log('🔄 Step 3: Getting decryption proof...');
            toast({ type: 'info', title: 'Step 3/4', message: 'Fetching decryption proof from Gateway...' });

            // Find UnwrapRequested event to get burnt amount handle
            const unwrapRequestedEvent = unwrapReceipt.logs.find(log => {
                try {
                    const decoded = decodeEventLog({
                        abi: WRAPPER_ABI,
                        data: log.data,
                        topics: log.topics as [signature: `0x${string}`, ...args: `0x${string}`[]]
                    });
                    return decoded.eventName === 'UnwrapRequested';
                } catch {
                    return false;
                }
            });

            if (!unwrapRequestedEvent) {
                throw new Error('UnwrapRequested event not found in transaction receipt');
            }

            const decoded = decodeEventLog({
                abi: WRAPPER_ABI,
                data: unwrapRequestedEvent.data,
                topics: unwrapRequestedEvent.topics as [signature: `0x${string}`, ...args: `0x${string}`[]]
            });

            const burntAmountHandle = (decoded.args as { amount: `0x${string}` }).amount;
            console.log('   Burnt amount handle:', burntAmountHandle);

            // Call publicDecrypt to get the decryption proof
            const decryptResult = await instance.publicDecrypt([burntAmountHandle]);
            console.log('   Decrypt result:', decryptResult);

            const cleartextAmount = decryptResult.clearValues[burntAmountHandle];
            const decryptionProof = decryptResult.decryptionProof;

            if (cleartextAmount === undefined) {
                throw new Error('Failed to decrypt burnt amount');
            }

            console.log('✅ Step 3 complete: Got cleartext and proof');
            console.log('   Cleartext amount:', cleartextAmount);

            // ============ STEP 4: Call finalizeUnwrap() ============
            setUnwrapStep('finalizing');
            console.log('🔄 Step 4: Calling finalizeUnwrap()...');
            toast({ type: 'info', title: 'Step 4/4', message: 'Please confirm finalize transaction...' });

            const finalizeHash = await writeContractAsync({
                address: wrapperAddress as `0x${string}`,
                abi: WRAPPER_ABI,
                functionName: 'finalizeUnwrap',
                args: [burntAmountHandle, BigInt(String(cleartextAmount)), decryptionProof as `0x${string}`]
            });

            console.log('   Finalize tx hash:', finalizeHash);

            // Wait for finalize to be confirmed
            await publicClient.waitForTransactionReceipt({ hash: finalizeHash });
            console.log('✅ Step 4 complete: Unwrap finalized!');

            setUnwrapStep('done');
            setSuccessState(true);
            toast({ type: 'success', title: 'Unshield Complete!', message: `${amount} tokens successfully unshielded` });

            // Refresh balances
            refetchBalance();
            refetchEncrypted();
            setDecryptedBalance(null);

        } catch (error) {
            console.error('Unwrap error:', error);
            toast({ type: 'error', title: 'Unwrap Failed', message: error instanceof Error ? error.message : 'Unknown error' });
            setUnwrapStep('idle');
            setCurrentAction(null);
        }
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
                            🔒 SHIELD
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
                            🔓 UNSHIELD
                        </button>
                    </div>

                    <h1 className="glitch-hover" style={{
                        fontSize: 'clamp(24px, 5vw, 32px)',
                        fontWeight: 800,
                        marginBottom: '8px',
                        textTransform: 'uppercase'
                    }}>
                        <span className="text-gold">{mode === 'wrap' ? 'Shield' : 'Unshield'}</span> Token
                    </h1>
                    <p style={{ color: '#666', marginBottom: '24px', fontSize: '13px' }}>
                        {mode === 'wrap'
                            ? 'Convert public ERC20 → Confidential ERC7984'
                            : 'Convert Confidential ERC7984 → Public ERC20'}
                    </p>

                    {/* FHEVM Status */}
                    {!isFhevmReady && (
                        <div style={{
                            padding: '8px 12px',
                            background: 'rgba(255, 165, 0, 0.1)',
                            border: '1px solid rgba(255, 165, 0, 0.3)',
                            borderRadius: '6px',
                            marginBottom: '16px',
                            fontSize: '11px',
                            color: '#FFA500'
                        }}>
                            🔄 FHEVM SDK: {fhevmStatus}...
                        </div>
                    )}

                    {!successState ? (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                            {/* Quick Token Selector */}
                            <div>
                                <label style={{ display: 'block', fontSize: '11px', color: '#888', marginBottom: '6px' }}>
                                    SELECT TOKEN
                                </label>
                                <div style={{ display: 'flex', gap: '8px' }}>
                                    {PREDEFINED_TOKENS.map((token) => (
                                        <button
                                            key={token.symbol}
                                            onClick={() => { setTokenAddress(token.address); setApprovalDone(false); setDecryptedBalance(null); }}
                                            disabled={isProcessing}
                                            style={{
                                                flex: 1,
                                                padding: '10px 16px',
                                                background: tokenAddress === token.address ? 'var(--gold-primary)' : 'transparent',
                                                color: tokenAddress === token.address ? '#000' : 'var(--gold-primary)',
                                                border: '1px solid var(--gold-primary)',
                                                borderRadius: '8px',
                                                cursor: isProcessing ? 'not-allowed' : 'pointer',
                                                fontWeight: 'bold',
                                                fontSize: '13px',
                                                transition: 'all 0.2s ease'
                                            }}
                                        >
                                            {token.symbol}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {/* Token Address */}
                            <div>
                                <label style={{ display: 'block', fontSize: '11px', color: '#888', marginBottom: '6px' }}>
                                    TOKEN ADDRESS
                                </label>
                                <input
                                    type="text"
                                    value={tokenAddress}
                                    onChange={e => { setTokenAddress(e.target.value as `0x${string}`); setApprovalDone(false); setDecryptedBalance(null); }}
                                    placeholder="0x..."
                                    className="cyber-input"
                                    style={{ width: '100%', padding: '12px', borderRadius: '8px', fontSize: '13px', fontFamily: 'monospace' }}
                                    disabled={isProcessing}
                                />
                                <p style={{ fontSize: '10px', color: '#555', marginTop: '4px' }}>
                                    Or enter any ERC20 token address
                                </p>
                            </div>

                            {/* Balances Display */}
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
                                        {decryptedBalance !== null ? (
                                            <div style={{ fontSize: '16px', fontWeight: 'bold', color: mode === 'unwrap' ? 'var(--gold-primary)' : '#888' }}>
                                                {decryptedBalance}
                                            </div>
                                        ) : hasEncryptedBalance ? (
                                            <button
                                                onClick={handleDecryptBalance}
                                                disabled={isDecryptingBalance || !isFhevmReady || !signer}
                                                style={{
                                                    background: 'transparent',
                                                    border: '1px solid var(--gold-primary)',
                                                    color: 'var(--gold-primary)',
                                                    padding: '4px 10px',
                                                    borderRadius: '4px',
                                                    fontSize: '12px',
                                                    cursor: isDecryptingBalance ? 'wait' : 'pointer',
                                                    opacity: isDecryptingBalance ? 0.6 : 1
                                                }}
                                            >
                                                {isDecryptingBalance ? '🔓 Decrypting...' : '🔓 Decrypt'}
                                            </button>
                                        ) : (
                                            <div style={{ fontSize: '14px', color: '#666' }}>0</div>
                                        )}
                                        {decryptError && (
                                            <div style={{ fontSize: '10px', color: '#f44', marginTop: '4px' }}>
                                                {decryptError}
                                            </div>
                                        )}
                                    </div>
                                </div>
                            )}

                            {/* No Wrapper Warning */}
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
                                        ) : '🔐 CREATE WRAPPER'}
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
                                        AMOUNT TO {mode === 'wrap' ? 'SHIELD' : 'UNSHIELD'}
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
                                                ) : '2. SHIELD'}
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
                                                <ScrambleText text="UNSHIELDING..." trigger={true} className="text-gold" />
                                            ) : '🔓 UNSHIELD'}
                                        </button>
                                    )}
                                </div>
                            )}

                            {!isConnected && (
                                <div style={{ textAlign: 'center', color: '#666', fontSize: '13px', padding: '16px' }}>
                                    Connect wallet to {mode === 'wrap' ? 'shield' : 'unshield'} tokens
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
                                {mode === 'wrap' ? 'TOKENS SHIELDED!' : 'TOKENS UNSHIELDED!'}
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
                                {mode === 'wrap' ? 'SHIELD MORE' : 'UNSHIELD MORE'}
                            </button>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
