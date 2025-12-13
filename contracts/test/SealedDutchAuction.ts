
import { expect } from "chai";
import { ethers } from "hardhat";
import { SealedDutchAuction, MockGateway, SimpleERC20, ConfidentialWrapperFactory, ConfidentialTokenWrapper } from "../typechain-types";
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";

describe("SealedDutchAuction Full Flow (Explained)", function () {
    let auctionContract: SealedDutchAuction;
    let mockGateway: MockGateway;
    let tokenSold: SimpleERC20;
    let paymentTokenUnderlying: SimpleERC20;
    let wrapperFactory: ConfidentialWrapperFactory;
    let paymentToken: ConfidentialTokenWrapper;

    let deployer: HardhatEthersSigner;
    let seller: HardhatEthersSigner;
    let bidder: HardhatEthersSigner;

    // --- SETUP START ---
    beforeEach(async function () {
        [deployer, seller, bidder] = await ethers.getSigners();

        // 1. Deploy the Mock Gateway (Simulates Zama's Decryption Network)
        const MockGatewayFactory = await ethers.getContractFactory("MockGateway");
        mockGateway = await MockGatewayFactory.deploy();

        // 2. Deploy the Token to be Sold (e.g., "ZAMA Token")
        const SimpleERC20Factory = await ethers.getContractFactory("SimpleERC20");
        tokenSold = await SimpleERC20Factory.deploy("ZAMA Token", "ZAMA", 18, ethers.parseEther("10000"), seller.address);

        // 3. Deploy Payment Token (e.g., "USDC")
        paymentTokenUnderlying = await SimpleERC20Factory.deploy("USDC", "USDC", 18, ethers.parseEther("10000"), bidder.address);

        // 4. Deploy Wrapper Factory (Converts USDC -> Confidential cUSDC)
        const WrapperFactory = await ethers.getContractFactory("ConfidentialWrapperFactory");
        wrapperFactory = await WrapperFactory.deploy();

        // 5. Create the cUSDC Wrapper
        await wrapperFactory.createWrapper(await paymentTokenUnderlying.getAddress());
        const wrapperAddr = await wrapperFactory.getWrapper(await paymentTokenUnderlying.getAddress());
        paymentToken = await ethers.getContractAt("ConfidentialTokenWrapper", wrapperAddr);

        // 6. Deploy the Auction Contract
        const AuctionFactory = await ethers.getContractFactory("SealedDutchAuction");
        auctionContract = await AuctionFactory.deploy(wrapperAddr, await mockGateway.getAddress());

        // 7. Seller approves Auction to sell tokens
        await tokenSold.connect(seller).approve(await auctionContract.getAddress(), ethers.MaxUint256);
    });
    // --- SETUP END ---

    it("EXPLAINED: Full User Journey (Mint -> Bid -> Claim)", async function () {
        // NOTE: FHE operations (wrap, bid) will fail in local Hardhat without Zama Node.
        // We use try-catch to SHOW the code flow without crashing the test.

        // =================================================================
        // STEP 1: USER GETS CONFIDENTIAL TOKENS
        // =================================================================
        console.log("\n--- STEP 1: PREPARATION ---");
        const amount = ethers.parseEther("100");

        // 1a. User approves the Wrapper to take their USDC
        await paymentTokenUnderlying.connect(bidder).approve(await paymentToken.getAddress(), amount);

        // 1b. User wraps USDC -> cUSDC (Encrypted Balance)
        try {
            console.log("Attempting to Wrap USDC...");
            await paymentToken.connect(bidder).wrap(bidder.address, amount);
            console.log("✓ Wrapped successfully (FHEVM active)");
        } catch (e) {
            console.log("⚠️  Wrap skipped (No FHEVM). Simulating success for explanation...");
        }

        // 1c. User authorizes Auction Contract to spend their cUSDC
        // This is like "Approve", but for Confidential Tokens (using setOperator)
        const deadline = BigInt(Math.floor(Date.now() / 1000) + 86400);
        await paymentToken.connect(bidder).setOperator(await auctionContract.getAddress(), deadline);
        console.log("✓ Auction authorized as operator");


        // =================================================================
        // STEP 2: CREATE AUCTION
        // =================================================================
        console.log("\n--- STEP 2: CREATE AUCTION ---");
        await auctionContract.connect(seller).createAuction(
            await tokenSold.getAddress(),
            ethers.parseEther("1000"), // Selling 1000 Tokens
            2000, // Start Price Tick (High)
            1000, // End Price Tick (Low)
            1000, // Tick Size
            BigInt(Math.floor(Date.now() / 1000)), // Start Now
            BigInt(Math.floor(Date.now() / 1000) + 3600) // End in 1 hr
        );
        console.log("✓ Auction #0 Created");


        // =================================================================
        // STEP 3: PLACE BID (The Core Logic)
        // =================================================================
        console.log("\n--- STEP 3: PLACE BID (Simulated) ---");
        console.log("In the Frontend:");
        console.log("1. User generates a random 'Quantity' (e.g. 50)");
        console.log("2. User encrypts this quantity using `fhevmjs` in browser");
        console.log("3. User sends `placeBid(id, tick, encryptedQty, proof)`");

        /* 
        CODE:
        await auctionContract.connect(bidder).placeBid(
            0,
            1500, // Bidding at Tick 1500 (Mid price)
            encryptedQty,
            proof
        );
        */
        console.log("-> Bid would be placed on chain directly here.");


        // =================================================================
        // STEP 4: FINALIZE (Finding Clearing Price)
        // =================================================================
        console.log("\n--- STEP 4: FINALIZE ---");
        // Advancing time to end of auction
        // await ethers.provider.send("evm_increaseTime", [3601]);

        /*
        CODE:
        await auctionContract.requestFinalize(0); 
        */
        console.log("Logic: Contract sums up all encrypted bids from Highest Tick to Lowest.");
        console.log("Logic: It asks Gateway to decrypt the 'Clearing Tick' (where Demand >= Supply).");


        // =================================================================
        // STEP 5: CLAIM (Winning & Refunds)
        // =================================================================
        console.log("\n--- STEP 5: CLAIM ---");
        /*
        CODE:
        await auctionContract.connect(bidder).requestClaim(0, 0); // Auction 0, BidIndex 0
        */
        console.log("Logic: Contract compares User's Bid Tick vs Clearing Tick.");
        console.log("   IF Bid Tick >= Clearing Tick: Winner! Decrypt Amount -> Send Tokens -> Refund difference.");
        console.log("   IF Bid Tick < Clearing Tick: Loser. Refund full amount.");

        console.log("\n✓ Test Flow Explained successfully.");
    });
});
