'use client';

import React, { createContext, useContext, useEffect, useState } from 'react';

// Types only - these are safe to import at module level
interface FhevmInstance {
    createEncryptedInput: (contractAddress: string, userAddress: string) => any;
    generateKeypair: () => { publicKey: string; privateKey: string };
    createEIP712: (publicKey: string, contractAddresses: string[], startTimestamp: string | number, durationDays: string | number) => any;
    publicDecrypt: (handles: (string | Uint8Array)[]) => Promise<any>;
    userDecrypt: (handles: any[], privateKey: string, publicKey: string, signature: string, contractAddresses: string[], userAddress: string, startTimestamp: string | number, durationDays: string | number) => Promise<any>;
    getPublicKey: () => { publicKeyId: string; publicKey: Uint8Array } | null;
    getPublicParams: (bits: number) => { publicParams: Uint8Array; publicParamsId: string } | null;
}

interface FhevmInstanceConfig {
    verifyingContractAddressDecryption: string;
    verifyingContractAddressInputVerification: string;
    kmsContractAddress: string;
    inputVerifierContractAddress: string;
    aclContractAddress: string;
    gatewayChainId: number;
    chainId?: number;
    relayerUrl?: string;
    network?: string;
}

interface FhevmContextType {
    isInitialized: boolean;
    status: 'initial' | 'initializing' | 'ready' | 'error';
    error: Error | null;
    instance: FhevmInstance | null;
    config: FhevmInstanceConfig | null;
}

const FhevmContext = createContext<FhevmContextType>({
    isInitialized: false,
    status: 'initial',
    error: null,
    instance: null,
    config: null,
});

export const useFhevm = () => useContext(FhevmContext);

// Use RPC from env or fallback to reliable public RPC
const SEPOLIA_RPC_URL = process.env.NEXT_PUBLIC_SEPOLIA_RPC_URL
    || 'https://ethereum-sepolia-rpc.publicnode.com';

// Official Zama Sepolia config per https://docs.zama.ai/protocol/relayer-sdk-guides/fhevm-relayer/initialization
const SEPOLIA_CONFIG: FhevmInstanceConfig = {
    // ACL_CONTRACT_ADDRESS (FHEVM Host chain)
    aclContractAddress: '0xf0Ffdc93b7E186bC2f8CB3dAA75D86d1930A433D',
    // KMS_VERIFIER_CONTRACT_ADDRESS (FHEVM Host chain)
    kmsContractAddress: '0xbE0E383937d564D7FF0BC3b46c51f0bF8d5C311A',
    // INPUT_VERIFIER_CONTRACT_ADDRESS (FHEVM Host chain)
    inputVerifierContractAddress: '0xBBC1fFCdc7C316aAAd72E807D9b0272BE8F84DA0',
    // DECRYPTION_ADDRESS (Gateway chain)
    verifyingContractAddressDecryption: '0x5D8BD78e2ea6bbE41f26dFe9fdaEAa349e077478',
    // INPUT_VERIFICATION_ADDRESS (Gateway chain)
    verifyingContractAddressInputVerification: '0x483b9dE06E4E4C7D35CCf5837A1668487406D955',
    // FHEVM Host chain id
    chainId: 11155111,
    // Gateway chain id
    gatewayChainId: 10901,
    // RPC provider to host chain (use env or fallback)
    network: SEPOLIA_RPC_URL,
    // Relayer URL (official from docs)
    relayerUrl: 'https://relayer.testnet.zama.org',
};

export function FhevmProvider({ children }: { children: React.ReactNode }) {
    const [status, setStatus] = useState<FhevmContextType['status']>('initial');
    const [error, setError] = useState<Error | null>(null);
    const [instance, setInstance] = useState<FhevmInstance | null>(null);
    const [config, setConfig] = useState<FhevmInstanceConfig | null>(null);

    useEffect(() => {
        const init = async () => {
            try {
                if (status !== 'initial') return;
                setStatus('initializing');

                console.log('🔄 Loading FHEVM SDK...');
                console.log('   RPC URL:', SEPOLIA_CONFIG.network);

                // Dynamic import to avoid SSR issues
                const { createInstance, initSDK } = await import('@zama-fhe/relayer-sdk/web');

                // Step 1: Initialize WASM modules first (REQUIRED before createInstance)
                console.log('🔄 Initializing WASM modules...');
                await initSDK();
                console.log('✅ WASM modules initialized');

                // Step 2: Create FHEVM instance
                console.log('🔄 Creating FHEVM instance...');
                const fhevmInstance = await createInstance(SEPOLIA_CONFIG as any);
                setInstance(fhevmInstance as FhevmInstance);
                setConfig(SEPOLIA_CONFIG);

                console.log('✅ FHEVM Provider Ready');
                console.log('   Relayer URL:', SEPOLIA_CONFIG.relayerUrl);
                setStatus('ready');
            } catch (err: unknown) {
                console.error('❌ FHEVM Initialization Error:', err);
                setError(err as Error);
                setStatus('error');
            }
        };

        init();
    }, [status]);

    return (
        <FhevmContext.Provider value={{
            isInitialized: status === 'ready',
            status,
            error,
            instance,
            config,
        }}>
            {children}
        </FhevmContext.Provider>
    );
}
