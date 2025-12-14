import { ethers } from "hardhat";

// Helper function to add delay between deployments
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
const DELAY_MS = 3000; // 3 seconds between deployments

async function main() {
    const [deployer] = await ethers.getSigners();
    console.log("Deploying contracts with the account:", deployer.address);

    // 1. Deploy TokenFactory
    console.log("\n1. Deploying TokenFactory...");
    const TokenFactory = await ethers.getContractFactory("TokenFactory");
    const tokenFactory = await TokenFactory.deploy();
    await tokenFactory.waitForDeployment();
    const tokenFactoryAddress = await tokenFactory.getAddress();
    console.log("TokenFactory deployed to:", tokenFactoryAddress);

    await delay(DELAY_MS);

    // 2. Deploy ConfidentialWrapperFactory
    console.log("\n2. Deploying ConfidentialWrapperFactory...");
    const WrapperFactory = await ethers.getContractFactory("ConfidentialWrapperFactory");
    const wrapperFactory = await WrapperFactory.deploy();
    await wrapperFactory.waitForDeployment();
    const wrapperFactoryAddress = await wrapperFactory.getAddress();
    console.log("ConfidentialWrapperFactory deployed to:", wrapperFactoryAddress);

    await delay(DELAY_MS);

    await delay(DELAY_MS);

    // 4. Create a sample ERC20 token via factory
    console.log("\n4. Creating sample token via TokenFactory...");
    const createTx = await tokenFactory.createToken(
        "Sample Token",
        "SMPL",
        18,
        ethers.parseEther("1000000") // 1 million tokens
    );
    await createTx.wait();

    const sampleTokenAddress = (await tokenFactory.getAllTokens())[0];
    console.log("Sample Token (SMPL) deployed to:", sampleTokenAddress);

    await delay(DELAY_MS);

    // 5. Create wrapper for SMPL (cSMPL) - for confidential auctions
    console.log("\n5. Creating cSMPL wrapper via WrapperFactory...");
    const createSmplWrapperTx = await wrapperFactory.createWrapper(sampleTokenAddress);
    await createSmplWrapperTx.wait();

    const cSMPLAddress = await wrapperFactory.getWrapper(sampleTokenAddress);
    console.log("cSMPL (wrapped SMPL) deployed to:", cSMPLAddress);

    await delay(DELAY_MS);

    // 6. Deploy Test USDC (regular ERC20 - underlying for cUSDC)
    console.log("\n6. Deploying Test USDC (underlying for confidential wrapper)...");
    const SimpleERC20 = await ethers.getContractFactory("SimpleERC20");
    const testUSDC = await SimpleERC20.deploy(
        "Test USDC",
        "USDC",
        6, // 6 decimals like real USDC
        0, // No initial supply - users will mint
        deployer.address
    );
    await testUSDC.waitForDeployment();
    const testUSDCAddress = await testUSDC.getAddress();
    console.log("Test USDC deployed to:", testUSDCAddress);

    await delay(DELAY_MS);

    // 7. Create wrapped USDC (cUSDC) via WrapperFactory
    console.log("\n7. Creating cUSDC wrapper via WrapperFactory...");
    const createWrapperTx = await wrapperFactory.createWrapper(testUSDCAddress);
    await createWrapperTx.wait();

    const cUSDCAddress = await wrapperFactory.getWrapper(testUSDCAddress);
    console.log("cUSDC (wrapped USDC) deployed to:", cUSDCAddress);

    await delay(DELAY_MS);

    // 8. Deploy SealedDutchAuction with cUSDC as payment token (v0.9 - no gateway needed)
    console.log("\n8. Deploying SealedDutchAuction...");
    const SealedDutchAuction = await ethers.getContractFactory("SealedDutchAuction");
    const auction = await SealedDutchAuction.deploy(cUSDCAddress);
    await auction.waitForDeployment();
    const auctionAddress = await auction.getAddress();
    console.log("SealedDutchAuction deployed to:", auctionAddress);

    // Summary
    console.log("\n" + "=".repeat(50));
    console.log("DEPLOYMENT SUMMARY");
    console.log("=".repeat(50));
    console.log(`NEXT_PUBLIC_TOKEN_FACTORY_ADDRESS=${tokenFactoryAddress}`);
    console.log(`NEXT_PUBLIC_WRAPPER_FACTORY_ADDRESS=${wrapperFactoryAddress}`);
    console.log(`NEXT_PUBLIC_SAMPLE_TOKEN_ADDRESS=${sampleTokenAddress}`);
    console.log(`NEXT_PUBLIC_CSMPL_ADDRESS=${cSMPLAddress}`);
    console.log(`NEXT_PUBLIC_TEST_USDC_ADDRESS=${testUSDCAddress}`);
    console.log(`NEXT_PUBLIC_CUSDC_ADDRESS=${cUSDCAddress}`);
    console.log(`NEXT_PUBLIC_AUCTION_ADDRESS=${auctionAddress}`);
    console.log("=".repeat(50));
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});

