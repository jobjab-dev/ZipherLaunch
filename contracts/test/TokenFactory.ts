import { expect } from "chai";
import { ethers } from "hardhat";
import { TokenFactory, SimpleERC20 } from "../typechain-types";
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";

describe("TokenFactory", function () {
    let tokenFactory: TokenFactory;
    let deployer: HardhatEthersSigner;
    let alice: HardhatEthersSigner;

    beforeEach(async function () {
        [deployer, alice] = await ethers.getSigners();

        const TokenFactoryFactory = await ethers.getContractFactory("TokenFactory");
        tokenFactory = await TokenFactoryFactory.deploy();
        await tokenFactory.waitForDeployment();
    });

    describe("createToken", function () {
        it("should create a new ERC20 token", async function () {
            const name = "Test Token";
            const symbol = "TEST";
            const decimals = 18;
            const initialSupply = ethers.parseEther("1000000");

            const tx = await tokenFactory.createToken(name, symbol, decimals, initialSupply);
            const receipt = await tx.wait();

            // Check event
            const event = receipt?.logs.find((log: any) => {
                try {
                    return tokenFactory.interface.parseLog(log)?.name === "TokenCreated";
                } catch {
                    return false;
                }
            });
            expect(event).to.not.be.undefined;

            // Get token address
            const tokens = await tokenFactory.getAllTokens();
            expect(tokens.length).to.equal(1);

            // Check token details
            const token = await ethers.getContractAt("SimpleERC20", tokens[0]) as SimpleERC20;
            expect(await token.name()).to.equal(name);
            expect(await token.symbol()).to.equal(symbol);
            expect(await token.decimals()).to.equal(decimals);
            expect(await token.balanceOf(deployer.address)).to.equal(initialSupply);
        });

        it("should track tokens by creator", async function () {
            // Deployer creates 2 tokens
            await tokenFactory.createToken("Token1", "TK1", 18, ethers.parseEther("100"));
            await tokenFactory.createToken("Token2", "TK2", 18, ethers.parseEther("200"));

            // Alice creates 1 token
            await tokenFactory.connect(alice).createToken("AliceToken", "ATK", 18, ethers.parseEther("50"));

            expect(await tokenFactory.getTokenCount()).to.equal(3);
            expect((await tokenFactory.getTokensByCreator(deployer.address)).length).to.equal(2);
            expect((await tokenFactory.getTokensByCreator(alice.address)).length).to.equal(1);
        });
    });
});

describe("SimpleERC20", function () {
    let token: SimpleERC20;
    let deployer: HardhatEthersSigner;
    let alice: HardhatEthersSigner;

    beforeEach(async function () {
        [deployer, alice] = await ethers.getSigners();

        const SimpleERC20Factory = await ethers.getContractFactory("SimpleERC20");
        token = await SimpleERC20Factory.deploy(
            "Test Token",
            "TEST",
            18,
            ethers.parseEther("1000000"),
            deployer.address
        );
        await token.waitForDeployment();
    });

    it("should have correct initial values", async function () {
        expect(await token.name()).to.equal("Test Token");
        expect(await token.symbol()).to.equal("TEST");
        expect(await token.decimals()).to.equal(18);
        expect(await token.totalSupply()).to.equal(ethers.parseEther("1000000"));
    });

    it("should allow minting", async function () {
        const mintAmount = ethers.parseEther("500");
        await token.mint(alice.address, mintAmount);
        expect(await token.balanceOf(alice.address)).to.equal(mintAmount);
    });

    it("should allow transfers", async function () {
        const transferAmount = ethers.parseEther("100");
        await token.transfer(alice.address, transferAmount);
        expect(await token.balanceOf(alice.address)).to.equal(transferAmount);
    });
});
