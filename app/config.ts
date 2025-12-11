import { getDefaultConfig } from '@rainbow-me/rainbowkit';
import { http } from 'wagmi';
import { sepolia, hardhat } from 'viem/chains';

export const config = getDefaultConfig({
    appName: 'Bind Auction',
    projectId: 'YOUR_PROJECT_ID', // Replace with your WalletConnect project ID
    chains: [sepolia, hardhat],
    transports: {
        [sepolia.id]: http(),
        [hardhat.id]: http(),
    },
    ssr: true,
});
