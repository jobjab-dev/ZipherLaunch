import { ethers, run } from "hardhat";
import "dotenv/config";

async function main() {
    console.log("🔍 Verifying all deployed contracts on Etherscan...\n");

    const contracts = [
        {
            name: "TokenFactory",
            address: process.env.NEXT_PUBLIC_TOKEN_FACTORY_ADDRESS,
            args: []
        },
        {
            name: "ConfidentialWrapperFactory",
            address: process.env.NEXT_PUBLIC_WRAPPER_FACTORY_ADDRESS,
            args: []
        },
        {
            name: "MockGateway",
            address: process.env.NEXT_PUBLIC_GATEWAY_ADDRESS,
            args: []
        },
        {
            name: "ConfidentialERC20",
            address: process.env.NEXT_PUBLIC_CUSDC_ADDRESS,
            args: ["Confidential USDC", "cUSDC"]
        },
        {
            name: "SealedDutchAuction",
            address: process.env.NEXT_PUBLIC_AUCTION_ADDRESS,
            args: [
                process.env.NEXT_PUBLIC_CUSDC_ADDRESS,
                process.env.NEXT_PUBLIC_GATEWAY_ADDRESS
            ]
        }
    ];

    for (const contract of contracts) {
        if (!contract.address || contract.address === "0x...") {
            console.log(`⏭️  Skipping ${contract.name} - no address set`);
            continue;
        }

        console.log(`📝 Verifying ${contract.name} at ${contract.address}...`);

        try {
            await run("verify:verify", {
                address: contract.address,
                constructorArguments: contract.args,
            });
            console.log(`✅ ${contract.name} verified!\n`);
        } catch (error: any) {
            if (error.message.includes("Already Verified")) {
                console.log(`✓ ${contract.name} already verified\n`);
            } else {
                console.log(`❌ ${contract.name} failed: ${error.message}\n`);
            }
        }
    }

    console.log("🎉 Verification complete!");
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
