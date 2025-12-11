import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";
import "dotenv/config";

// Only use private key if it's a valid 64-char hex string
const getAccounts = () => {
    const pk = process.env.PRIVATE_KEY;
    if (pk && pk.length === 64) {
        return [pk];
    }
    if (pk && pk.startsWith("0x") && pk.length === 66) {
        return [pk];
    }
    return []; // Empty = use default Hardhat accounts for local
};

const config: HardhatUserConfig = {
    solidity: {
        compilers: [
            { version: "0.8.27" },
            { version: "0.8.24" }
        ]
    },
    networks: {
        sepolia: {
            url: process.env.SEPOLIA_RPC_URL || "https://rpc.sepolia.org",
            accounts: getAccounts(),
            chainId: 11155111,
        },
        local: {
            url: "http://127.0.0.1:8545",
            chainId: 31337,
            // Local node uses its own test accounts
        },
    },
    etherscan: {
        apiKey: process.env.ETHERSCAN_API_KEY || "",
    },
};

export default config;
