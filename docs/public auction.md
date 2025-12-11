Announcing the Zama Public Auction
December 1, 2025
—
Rand Hindi
One of the biggest challenges in launching a protocol is deciding how to distribute and price its token. Over the years, projects have tried everything—from fixed-price sales to airdrops to direct listing. After studying more than a hundred TGEs, we found that auctions offer the best balance of fair distribution, price discovery, and capital efficiency.

Today, we are excited to announce that @zama will sell 10% of the $ZAMA token supply through a sealed-bid Dutch auction, using Zama itself to keep participant bids confidential. This ensures that Zama users, developers, and operators can purchase tokens at a price they believe is fair, regardless of Zama’s previous funding rounds.

In a Dutch auction, the clearing price isn’t the highest bid—it’s the lowest price at which a bid gets filled. This makes Dutch auctions a powerful mechanism for token launches, with better distribution and more accurate price discovery. Dutch auctions have been used throughout history: by ancient Greeks to sell cattle; by eBay for second-hand electronics; by Google for its IPO; by the New York Federal Reserve for bond sales; and, of course, by the Dutch for everything from paintings to real estate to crops.

Confidentiality is a critical part of dutch auctions. When participants can see others’ bids, they can manipulate the outcome, and price discovery becomes distorted as people react to one another rather than bidding what they truly believe the item is worth. Here is a great video explaining why the “wisdom of the crowd” only works when predictions are independent and confidential. This makes Zama the perfect solution for launching tokens through auctions, but also for other use cases that require independent inputs, such as prediction markets, elections or polls.

The Zama auction will run from January 12th–15th, with claiming on January 20th. Tokens purchased in the auction will be fully unlocked and immediately usable in the Zama Protocol—whether for paying encryption and decryption fees, staking as an operator, or delegating to existing operators to help secure the network.

This makes the Zama auction one of the first “post-sale”, taking place after mainnet launch, not before. Mainnet is expected to launch by the end of the year, with the $ZAMA token minted and fully functional.

You can pre-register now at auction.zama.org. It’s a good idea to get in early and share with your friends!

The Zama Protocol
The Zama Protocol adds a layer of confidentiality to existing public blockchains. It uses Fully Homomorphic Encryption (FHE) to keep transaction data and onchain state encrypted while still allowing smart contracts to be executed on it.

Zama is not a new L1 or L2. It operates on top of existing chains, meaning any token or smart contract can be converted into a confidential version without bridging to a new network. If you hold stablecoins on Ethereum, for example, you can upgrade them to confidential stablecoins whose balances and transfer amounts remain encrypted, while still being on Ethereum. These confidential tokens can be confidentially transferred, swapped, or staked, just like regular tokens. Zama is essentially HTTPS for blockchain.

The $ZAMA utility token plays a central role in the protocol. It is used to pay for encryption and decryption, as well as reward operators and stakers for running and securing the network. All fees are burned, while rewards are minted following a yearly emission schedule.

You can read our litepaper to learn more about the protocol and token.

How the Zama auction works
The Zama auction is a single-price, sealed-bid dutch auction running on Ethereum mainnet, using Zama itself to keep bids confidential. The auction runs in four phases:

Phase 1 — Shield stablecoins

When: Anytime after mainnet launches

Participating in the Zama auction requires confidential stablecoins on Ethereum, which you get by shielding USDC, USDT, or DAI. You can shield tokens directly in the auction app or through wallets such as Bron.org.

Behind the scenes, shielding deposits your ERC-20 stablecoins into a wrapping contract and issues you the equivalent amount of ERC-7984 tokens, whose balances and transfer amounts are encrypted. While shielding is visible onchain, any transfer you make from that moment will be fully confidential. As such, we recommend shielding more tokens that you intend to bid with.

Importantly, shielding does not lock funds into the auction contract. Your confidential stablecoins remain in your Ethereum wallet and can be used just like regular stablecoins for payments and anything outside the auction.

Phase 2 — Place your bids

When: January 12th–15th

Once the auction starts, you will have four days to place your bids. Each bid includes a price and a quantity of $ZAMA tokens you want to buy. The price is public, but the quantity is private—nobody can see whether you’re bidding for 1 or 1,000 tokens at that price. You can submit as many bids as you like, at any price, and cancel them at any time during the auction.

Prices are in increments of $0.005, corresponding to a $55M FDV (based on a total supply of 11B tokens). The auction floor is therefore $55M FDV. There are no caps on price or bid size however: as long as you have sufficient confidential stablecoins, you can bid for any amount.

Unlike public dutch auctions where the price drops over time, sealed-bid auctions let you place bids at any price throughout the bidding period. This eliminates the race conditions and gas wars that typically favors larger bidders. If gas is high, you can simply wait to submit your bids later.

Because bids are private and not time-dependent, bots cannot monitor the mempool, front-run bids, or attempt last-second sniping. Humans and AI are on equal footing.

Bids can be placed through the Zama app using any EVM wallet, or through one of our partner platforms. Bids placed though one of our partners will be included in exactly the same way as bids placed on the Zama app itself. This offers more options for retail participants, which in turns improves distribution. We will announce supported platforms in the coming weeks.

Phase 3 — Clearing price and allocation

When: January 16th–19th

After the auction closes, bids are filled from highest price to lowest. The lowest price at which a bid is filled becomes the clearing price. All participants who successfully bid above that price will thus end up paying the same clearing price. The entire calculation is performed using FHE.

There are three possible outcomes:

Bid above the clearing price: You receive your full allocation and a refund for any overpayment.
Bid at the clearing price: If quantity exceeds remaining supply at that exact price, you receive a pro-rata share of tokens and a refund for the remainder.
Bid below the clearing price: You receive no tokens and get a full refund.
This mechanism prioritizes distribution quality and price discovery rather than maximizing FDV or total sale amount. To ensure even broader distribution, 8% of the total supply will be sold through the auction, while the remaining 2% will be sold in a fixed-price sale immediately afterward at the same clearing price, but capped at $10k per participant.

We also have surprises for Zama OG NFT holders, some of which are auction related, some of which are not 😉.

Phase 4 — Claim your tokens

When: January 20th

Once allocations are finalized, participants can claim both their $ZAMA tokens and refund. $ZAMA will be distributed as standard ERC-20 tokens, and refunds can be claimed either as ERC-20 or as confidential ERC-7984.

All claimed tokens are fully unlocked and can be spent, transferred, staked or delegated to operators immediately.

Make sure to join our mailing list at auction.zama.org to be the first to know when registration and shielding opens!

Cheers,
Rand

Annex: Example auction
Imagine there are 1,000 $ZAMA tokens to be sold, and that you have three people bidding, Alice, Bob and Charlie.

Bidding phase

Alice bids 400 tokens at a price of $5 each. She pays $2,000 for it.
Bob bids 600 tokens at a price of $4 each. He pays $2,400 for it.
Charlie bids 300 tokens at a price of $3 each. He pays $900 for it.

Clearing price and allocation

At the end of the bidding period, the auction smart contract goes from the highest bid price to the lowest price to allocate tokens to each participant:

Alice is the highest bidder. She gets her 400 tokens. There are 600 tokens left to allocate.
Bob is the second highest bidder. He gets his 600 tokens. There are 0 tokens left to allocate. As such, the clearing price is what Bob bid at, i.e. $4 per token.
Charlie’s bid is under the clearing price, and thus he receives no allocation.

Claiming tokens and refunds

Now that the clearing price is defined, Alice, Bob and Charlie can claim their tokens and refund:

Alice receives 400 $ZAMA token and a refund for $400 USD, corresponding to the difference between what she paid at $5 per token and the clearing price of $4 per token.
Bob receives 600 $ZAMA tokens and no refund, as he paid exactly the clearing price.
Charlie gets no $ZAMA tokens and a full refund of $900 USD.
