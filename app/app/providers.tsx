'use client';

import * as React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { WagmiProvider } from 'wagmi';
import { RainbowKitProvider, darkTheme } from '@rainbow-me/rainbowkit';
import { config } from '../config';
import { ToastProvider } from './components/Toast';
import { FhevmProvider } from './components/FhevmProvider';

const queryClient = new QueryClient();

const appTheme = darkTheme({
  accentColor: '#FFD700',
  accentColorForeground: 'black',
  borderRadius: 'small',
  fontStack: 'system',
});

appTheme.colors.actionButtonSecondaryBackground = '#1a1a1a';
appTheme.colors.connectButtonBackground = '#1a1a1a';
appTheme.colors.modalBackground = '#000000';

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>
        <RainbowKitProvider theme={appTheme} coolMode>
          <FhevmProvider>
            <ToastProvider>
              {children}
            </ToastProvider>
          </FhevmProvider>
        </RainbowKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}
