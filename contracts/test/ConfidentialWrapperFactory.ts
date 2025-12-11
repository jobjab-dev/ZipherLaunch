import { expect } from "chai";
import { ethers } from "hardhat";
import { ConfidentialWrapperFactory, SimpleERC20 } from "../typechain-types";
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";

describe("ConfidentialWrapperFactory", function () {
    let wrapperFactory: ConfidentialWrapperFactory;
    let mockToken: SimpleERC20;
    let deployer: HardhatEthersSigner;

    beforeEach(async function () {
        [deployer] = await ethers.getSigners();

        // Deploy mock token
        const SimpleERC20Factory = await ethers.getContractFactory("SimpleERC20");
        mockToken = await SimpleERC20Factory.deploy(
            "Mock Token",
            "MCK",
            18,
            ethers.parseEther("1000000"),
            deployer.address
        );
        await mockToken.waitForDeployment();

        // Deploy wrapper factory
        const WrapperFactoryFactory = await ethers.getContractFactory("ConfidentialWrapperFactory");
        wrapperFactory = await WrapperFactoryFactory.deploy();
        await wrapperFactory.waitForDeployment();
    });

    describe("createWrapper", function () {
        it("should create a new wrapper for an ERC20 token", async function () {
            const mockTokenAddress = await mockToken.getAddress();

            const tx = await wrapperFactory.createWrapper(mockTokenAddress);
            const receipt = await tx.wait();

            // Check event
            const event = receipt?.logs.find((log: any) => {
                try {
                    return wrapperFactory.interface.parseLog(log)?.name === "WrapperCreated";
                } catch {
                    return false;
                }
            });
            expect(event).to.not.be.undefined;

            // Check wrapper exists
            const wrapperAddress = await wrapperFactory.getWrapper(mockTokenAddress);
            expect(wrapperAddress).to.not.equal(ethers.ZeroAddress);

            // Check wrapper count
            expect(await wrapperFactory.getWrapperCount()).to.equal(1);
        });

        it("should not allow creating duplicate wrappers", async function () {
            const mockTokenAddress = await mockToken.getAddress();

            await wrapperFactory.createWrapper(mockTokenAddress);

            await expect(
                wrapperFactory.createWrapper(mockTokenAddress)
            ).to.be.revertedWith("Wrapper already exists");
        });

        it("should track all wrappers", async function () {
            // Create first token and wrapper
            const token1Address = await mockToken.getAddress();
            await wrapperFactory.createWrapper(token1Address);

            // Create second token and wrapper
            const SimpleERC20Factory = await ethers.getContractFactory("SimpleERC20");
            const token2 = await SimpleERC20Factory.deploy("Token2", "TK2", 18, ethers.parseEther("100"), deployer.address);
            await token2.waitForDeployment();
            const token2Address = await token2.getAddress();
            await wrapperFactory.createWrapper(token2Address);

            const allWrappers = await wrapperFactory.getAllWrappers();
            expect(allWrappers.length).to.equal(2);
        });
    });
});
