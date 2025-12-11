import * as fs from "fs";
import * as path from "path";

const ARTIFACTS_DIR = path.join(__dirname, "../artifacts/contracts");
const OUTPUT_DIR = path.join(__dirname, "../../app/abis");

const CONTRACTS_TO_EXPORT = [
    "SealedDutchAuction.sol/SealedDutchAuction.json",
    "SealedDutchAuction.sol/MockGateway.json",
    "ConfidentialERC20.sol/ConfidentialERC20.json",
    "TokenFactory.sol/TokenFactory.json",
    "SimpleERC20.sol/SimpleERC20.json",
    "ConfidentialWrapperFactory.sol/ConfidentialWrapperFactory.json",
    "ConfidentialWrapperFactory.sol/ConfidentialTokenWrapper.json"
];

async function main() {
    console.log("🔧 Exporting ABIs to frontend...");

    // Create output directory if it doesn't exist
    if (!fs.existsSync(OUTPUT_DIR)) {
        fs.mkdirSync(OUTPUT_DIR, { recursive: true });
        console.log(`📁 Created directory: ${OUTPUT_DIR}`);
    }

    for (const contractPath of CONTRACTS_TO_EXPORT) {
        const fullPath = path.join(ARTIFACTS_DIR, contractPath);
        const contractName = path.basename(contractPath, ".json");

        if (!fs.existsSync(fullPath)) {
            console.warn(`⚠️  Artifact not found: ${contractPath}`);
            continue;
        }

        // Read the full artifact
        const artifact = JSON.parse(fs.readFileSync(fullPath, "utf-8"));

        // Extract only the ABI
        const abiOutput = {
            contractName: artifact.contractName,
            abi: artifact.abi
        };

        // Write to output
        const outputPath = path.join(OUTPUT_DIR, `${contractName}.json`);
        fs.writeFileSync(outputPath, JSON.stringify(abiOutput, null, 2));
        console.log(`✅ Exported: ${contractName}.json`);
    }

    console.log("\n🎉 ABI export complete!");
    console.log(`📂 ABIs saved to: ${OUTPUT_DIR}`);
}

main().catch((error) => {
    console.error("❌ Export failed:", error);
    process.exit(1);
});
