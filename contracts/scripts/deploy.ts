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

    // 3. Deploy MockGateway (for testing)
    console.log("\n3. Deploying MockGateway...");
    const MockGateway = await ethers.getContractFactory("MockGateway");
    const gateway = await MockGateway.deploy();
    await gateway.waitForDeployment();
    const gatewayAddress = await gateway.getAddress();
    console.log("MockGateway deployed to:", gatewayAddress);

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

    // 5. Deploy ConfidentialERC20
    console.log("\n5. Deploying ConfidentialERC20 (cUSDC)...");
    const ConfidentialERC20 = await ethers.getContractFactory("ConfidentialERC20");
    const cUSDC = await ConfidentialERC20.deploy("Confidential USDC", "cUSDC");
    await cUSDC.waitForDeployment();
    const cUSDCAddress = await cUSDC.getAddress();
    console.log("ConfidentialERC20 (cUSDC) deployed to:", cUSDCAddress);

    await delay(DELAY_MS);

    // 6. Deploy SealedDutchAuction
    console.log("\n6. Deploying SealedDutchAuction...");
    const SealedDutchAuction = await ethers.getContractFactory("SealedDutchAuction");
    const auction = await SealedDutchAuction.deploy(cUSDCAddress, gatewayAddress);
    await auction.waitForDeployment();
    const auctionAddress = await auction.getAddress();
    console.log("SealedDutchAuction deployed to:", auctionAddress);

    // Summary
    console.log("\n" + "=".repeat(50));
    console.log("DEPLOYMENT SUMMARY");
    console.log("=".repeat(50));
    console.log(`NEXT_PUBLIC_TOKEN_FACTORY_ADDRESS=${tokenFactoryAddress}`);
    console.log(`NEXT_PUBLIC_WRAPPER_FACTORY_ADDRESS=${wrapperFactoryAddress}`);
    console.log(`NEXT_PUBLIC_GATEWAY_ADDRESS=${gatewayAddress}`);
    console.log(`NEXT_PUBLIC_SAMPLE_TOKEN_ADDRESS=${sampleTokenAddress}`);
    console.log(`NEXT_PUBLIC_CUSDC_ADDRESS=${cUSDCAddress}`);
    console.log(`NEXT_PUBLIC_AUCTION_ADDRESS=${auctionAddress}`);
    console.log("=".repeat(50));
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});

