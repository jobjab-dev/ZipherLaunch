import { ethers } from "hardhat";
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";

// This script tests the complete auction bidding flow:
// 1. Get deployed addresses from env
// 2. Mint test USDC
// 3. Shield USDC -> cUSDC
// 4. Set auction as operator
// 5. Create auction (if needed)
// 6. Place bid with encrypted lots

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// Addresses from deployment (update these)
const ADDRESSES = {
    testUSDC: process.env.NEXT_PUBLIC_TEST_USDC_ADDRESS || "0x2F91C3EEBe28d8c702Cc748D5d7290E82f35b089",
    cUSDC: process.env.NEXT_PUBLIC_CUSDC_ADDRESS || "0x83d0c2d3BE86D50895Fd2E096C4F303a4fB0C1F4",
    auction: process.env.NEXT_PUBLIC_AUCTION_ADDRESS || "0x498f3755376eCD0c08b4dA3F222c5d952C57f162",
    sampleToken: process.env.NEXT_PUBLIC_SAMPLE_TOKEN_ADDRESS || "0xE91Df8D29eB4315f3EaB0BF4F3851d29DBB52057",
};

async function main() {
    const [deployer] = await ethers.getSigners();
    console.log("Testing with account:", deployer.address);
    console.log("Account balance:", ethers.formatEther(await ethers.provider.getBalance(deployer.address)), "ETH");

    // Get contract instances
    const testUSDC = await ethers.getContractAt("SimpleERC20", ADDRESSES.testUSDC);
    const cUSDC = await ethers.getContractAt("IERC7984", ADDRESSES.cUSDC);
    const auction = await ethers.getContractAt("SealedDutchAuction", ADDRESSES.auction);

    console.log("\n" + "=".repeat(50));
    console.log("STEP 1: Check current state");
    console.log("=".repeat(50));

    const usdcBalance = await testUSDC.balanceOf(deployer.address);
    console.log("USDC Balance:", ethers.formatUnits(usdcBalance, 6));

    // Check if auction contract uses the same cUSDC
    const auctionPaymentToken = await auction.paymentToken();
    console.log("Auction paymentToken:", auctionPaymentToken);
    console.log("Expected cUSDC:", ADDRESSES.cUSDC);
    console.log("Match:", auctionPaymentToken.toLowerCase() === ADDRESSES.cUSDC.toLowerCase() ? "✓ YES" : "✕ NO");

    // Check auctionCount
    const auctionCount = await auction.auctionCount();
    console.log("Auction count:", auctionCount.toString());

    console.log("\n" + "=".repeat(50));
    console.log("STEP 2: Mint USDC (if needed)");
    console.log("=".repeat(50));

    const mintAmount = ethers.parseUnits("1000", 6); // 1000 USDC
    if (usdcBalance < mintAmount) {
        console.log("Minting", ethers.formatUnits(mintAmount, 6), "USDC...");
        const mintTx = await testUSDC.mint(deployer.address, mintAmount);
        await mintTx.wait();
        console.log("Minted!");
    } else {
        console.log("Already have enough USDC");
    }

    console.log("\n" + "=".repeat(50));
    console.log("STEP 3: Shield USDC -> cUSDC");
    console.log("=".repeat(50));

    // Check if cUSDC wrapper exists and approve
    const wrapperAddress = ADDRESSES.cUSDC;
    const wrapper = await ethers.getContractAt("ERC7984ERC20Wrapper", wrapperAddress);

    const shieldAmount = ethers.parseUnits("100", 6); // 100 USDC to shield

    // Approve wrapper to spend USDC
    console.log("Approving wrapper to spend USDC...");
    const approveTx = await testUSDC.approve(wrapperAddress, shieldAmount);
    await approveTx.wait();
    console.log("Approved!");

    // Shield (wrap) USDC
    console.log("Shielding", ethers.formatUnits(shieldAmount, 6), "USDC...");
    try {
        const shieldTx = await wrapper.shield(shieldAmount);
        await shieldTx.wait();
        console.log("Shielded!");
    } catch (e: any) {
        console.log("Shield failed or already shielded:", e.message);
    }

    console.log("\n" + "=".repeat(50));
    console.log("STEP 4: Set auction as operator for cUSDC");
    console.log("=".repeat(50));

    // ERC7984 uses setOperator instead of approve
    const oneDay = 86400;
    const until = Math.floor(Date.now() / 1000) + oneDay;

    // Check if already operator
    const isOp = await cUSDC.isOperator(deployer.address, ADDRESSES.auction);
    console.log("Auction is operator:", isOp);

    if (!isOp) {
        console.log("Setting auction as operator until:", new Date(until * 1000).toISOString());
        const setOpTx = await cUSDC.setOperator(ADDRESSES.auction, until);
        await setOpTx.wait();
        console.log("Operator set!");
    }

    console.log("\n" + "=".repeat(50));
    console.log("STEP 5: Check auction");
    console.log("=".repeat(50));

    if (auctionCount > 0) {
        const auctionData = await auction.auctions(auctionCount - 1n);
        console.log("Latest auction ID:", (auctionCount - 1n).toString());
        console.log("  Seller:", auctionData[0]);
        console.log("  Token:", auctionData[1]);
        console.log("  Total Lots:", auctionData[2].toString());
        console.log("  Start Tick:", auctionData[3]);
        console.log("  End Tick:", auctionData[4]);
        console.log("  Tick Size:", auctionData[5]);
        console.log("  Start Time:", new Date(Number(auctionData[6]) * 1000).toISOString());
        console.log("  End Time:", new Date(Number(auctionData[7]) * 1000).toISOString());
        console.log("  Finalized:", auctionData[8]);

        const now = Math.floor(Date.now() / 1000);
        const isActive = now >= Number(auctionData[6]) && now <= Number(auctionData[7]);
        console.log("  Is Active:", isActive ? "✓ YES" : "✕ NO (current time: " + new Date(now * 1000).toISOString() + ")");
    }

    console.log("\n" + "=".repeat(50));
    console.log("STEP 6: Attempt to place bid (requires FHE)");
    console.log("=".repeat(50));

    console.log("⚠️  NOTE: Placing a bid requires FHE encryption which is done on frontend.");
    console.log("   The encrypted input must be generated using fhevmjs in the browser.");
    console.log("   This script verifies all setup is correct for bidding.");

    console.log("\n" + "=".repeat(50));
    console.log("SUMMARY - Bid Requirements");
    console.log("=".repeat(50));
    console.log("✓ USDC Balance: ", ethers.formatUnits(await testUSDC.balanceOf(deployer.address), 6));
    console.log("✓ cUSDC (wrapper): ", ADDRESSES.cUSDC);
    console.log("✓ Auction address: ", ADDRESSES.auction);
    console.log("✓ Payment token matches:", auctionPaymentToken.toLowerCase() === ADDRESSES.cUSDC.toLowerCase());
    console.log("✓ Operator set:", await cUSDC.isOperator(deployer.address, ADDRESSES.auction));
    console.log("");
    console.log("If all above are ✓, bidding should work from frontend.");
    console.log("If bid still fails, the issue is with FHE proof verification.");
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
