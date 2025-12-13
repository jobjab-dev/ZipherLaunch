# Auction Logic Explanation

This document explains the core mechanics of the **Sealed-Bid Dutch Auction** used in CipherLaunch.

## 1. The Dutch Auction Component
In a traditional Dutch Auction, the price starts high and drops over time. The first person to bid wins.
In our **Sealed-Bid** version, the "Price" is determined by the **Tick** (a price level).

- **Start Tick (High Price):** e.g., 2000
- **End Tick (Low Price):** e.g., 1000
- **Tick Size:** $0.005 per tick.

The auction runs for a set time (e.g., 1 hour).
- Users can place bids at *any* tick between Start and End.
- Users can bid *any* quantity (Encrypted).

## 2. The "Sealed-Bid" Component (Privacy)
All bid quantities are **encrypted**.
- **Seller** looks at the auction: They see "X bids have been placed", but they **do not know the total quantity** or who bid what.
- **Bidders**: Only know their own bid.

## 3. Clearing Price (The Uniform Price)
When the auction ends, we must find the **Clearing Price**.
This is the lowest price at which we can sell all the tokens (Total Lots).

**Algorithm:**
1.  We start checking from the **Highest Price** (Start Tick).
2.  We sum up the demand at that tick.
3.  If `Demand < Supply`, we move to the next lower tick.
4.  We keep doing this until `Cumulative Demand >= Supply`.
5.  **That Tick** becomes the **Clearing Price**.

**Example:**
- Supply: 100 Tokens
- Bid A: 50 Tokens @ $5.00
- Bid B: 60 Tokens @ $4.00

**Result:**
- @ $5.00: Demand = 50. (50 < 100). Not cleared.
- @ $4.00: Demand = 50 + 60 = 110. (110 >= 100). **CLEARED!**
- **Clearing Price = $4.00**.

## 4. Claim Logic (Who wins?)
Everyone pays the **Clearing Price** ($4.00), even if they bid higher ($5.00).

- **Bidder A:**
  - Bid $5.00.
  - Clearing Price $4.00.
  - **Outcome:** WON.
  - **Refund:** Gets back ($5.00 - $4.00) = $1.00 per token.
  - **Tokens:** Gets 50 Tokens.

- **Bidder B:**
  - Bid $4.00.
  - Clearing Price $4.00.
  - **Outcome:** WON.
  - **Refund:** $0 (Bid Price == Clearing Price).
  - **Tokens:** Gets 60 Tokens.

- **Bidder C (Bid $3.00):**
  - **Outcome:** LOST.
  - **Refund:** Gets back full $3.00.
  - **Tokens:** 0.

## 5. Why Tests fail locally?
To perform the **Encryption** (Step 2) and **Decryption** (Step 3 & 4), the smart contract calls a special precompiled contract (0x5d...).
- In a real network (Sepolia Zama), this works.
- In a local "Hardhat" node, this precompile **does not exist** unless you run the specific Zama Docker image.
- Therefore, `wrap()` and `placeBid()` fail with "Unexpected amount of data" (because the call returns nothing or fails).
