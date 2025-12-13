# 📖 User Flow Guide

This guide walks you through the complete lifecycle of using **ZipherLaunch**, from setting up your wallet to participating in a confidential auction.

---

## 🦊 1. Wallet Setup

Before interacting with the platform, you need a Web3 wallet.

1.  **Install MetaMask** (or any supported wallet).
2.  **Add Sepolia Network**:
    - Network Name: Sepolia Testnetwork
    - RPC URL: `https://sepolia.infura.io/v3/` (or any public Sepolia RPC)
    - Chain ID: `11155111`
    - Currency Symbol: `SepoliaETH`
3.  **Get Testnet ETH**:
    - Use a faucet like [alchemy.com/faucets/ethereum-sepolia](https://www.alchemy.com/faucets/ethereum-sepolia) or [sepoliafaucet.com](https://sepoliafaucet.com) to get free SepoliaETH.

---

## 🪙 2. Creating a Token (Optional)

If you want to be an **Auctioneer** (Seller), you first need a token to sell.

1.  Navigate to the **Create Token** page.
2.  Enter:
    - **Name**: e.g., "MyPrivateToken"
    - **Symbol**: e.g., "MPT"
    - **Initial Supply**: e.g., 1000000
3.  Click **"Create Token"**.
4.  Confirm the transaction in your wallet.
5.  *Result:* You now have a standard public ERC20 token.

---

## 🔒 3. Confidential Wrapping

To use tokens in our FHE system (for bidding or selling), they must be **Wrapped** into a Confidential ERC7984 token.

1.  Navigate to the **Wrap / Unwrap** page.
2.  **Select Token**: Choose the token you want to wrap (e.g., the one you just created, or USDC).
3.  **Enter Amount**: e.g., 100.
4.  Click **"Wrap to Confidential"**.
    - *Note:* This requires two transactions: `approve` (allow the wrapper to spend your tokens) and `deposit` (the actual wrapping).
5.  *Result:* Your public balance decreases, and your **Encrypted Balance** increases.

> 💡 **Privacy Note:** Once wrapped, your balance is encrypted. Only YOU can see it using your viewing key (signature).

---

## 🔨 4. Creating an Auction (Seller)

1.  Navigate to **Create Auction**.
2.  **Select Your Token**: The confidential token you want to sell.
3.  **Configure Auction**:
    - **Total Supply**: How many tokens to sell (e.g., 100).
    - **Start Price (Tick)**: The highest price.
    - **End Price (Tick)**: The lowest reserve price.
    - **Duration**: How long the auction lasts.
4.  Click **"Start Auction"**.
5.  *Result:* The auction is live!

---

## 🙋‍♂️ 5. Bidding (Buyer)

1.  Browse **Active Auctions** on the home page.
2.  Click an auction to view details.
3.  **Place Bid**:
    - **Price**: Choose a price tick you are willing to pay.
    - **Amount**: Enter the quantity you want to buy.
4.  Click **"Place Bid"**.
    - The system encrypts your bid amount (so no one sees "100 tokens").
    - It submits the encrypted bid to the blockchain.
5.  *Result:* Your bid is placed. The seller sees "New Bid" but doesn't know the amount.

---

## 🏆 6. Ending & Claiming

Once the auction time expires:

1.  **Stop Auction**: Any user can trigger this to calculate the **Clearing Price**.
2.  **Claim Tokens / Refunds**:
    - Go to the auction page.
    - Click **"Claim"**.
    - **If you won:** You receive the tokens. If you bid strictly higher than the clearing price, you also get a refund of the difference.
    - **If you lost:** You get a full refund of your bid amount.
    - *All transfers happen confidentially.*
