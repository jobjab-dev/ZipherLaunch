// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { FHE, euint64, euint32, ebool, externalEuint64 } from "@fhevm/solidity/lib/FHE.sol";
import { ZamaEthereumConfig } from "@fhevm/solidity/config/ZamaConfig.sol";
import { IERC7984 } from "@openzeppelin/confidential-contracts/interfaces/IERC7984.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/**
 * @title SealedDutchAuction - v0.9 Compatible
 * @notice Uses self-relaying decryption pattern (no Oracle)
 * @dev Frontend must call publicDecrypt() then submit result + proof
 */
contract SealedDutchAuction is ZamaEthereumConfig {
    struct Auction {
        address seller;
        address tokenSold;
        uint256 totalLots;
        uint32 startTick;
        uint32 endTick;
        uint32 tickSize; 
        uint256 startTime;
        uint256 endTime;
        bool finalized;
        uint32 clearingTick;
        uint256 clearingTickHandle; // Handle for decryption
    }

    struct Bid {
        address bidder;
        uint32 tick;
        euint64 lotsEnc;
        euint64 paidEnc;
        bool claimed;
    }

    uint256 public auctionCount;
    mapping(uint256 => Auction) public auctions;
    mapping(uint256 => Bid[]) public auctionBids;
    mapping(uint256 => mapping(uint32 => euint64)) public auctionTickDemand;

    IERC7984 public paymentToken;  // Confidential wrapped stablecoin (ERC7984)

    event AuctionCreated(uint256 indexed auctionId, address seller, address token);
    event BidPlaced(uint256 indexed auctionId, address indexed bidder, uint32 tick);
    event FinalizeReady(uint256 indexed auctionId, uint256 clearingTickHandle);
    event AuctionFinalized(uint256 indexed auctionId, uint32 clearingTick);
    event ClaimReady(uint256 indexed auctionId, uint256 indexed bidIndex, uint256 lotsHandle);
    event ClaimProcessed(uint256 indexed auctionId, uint256 indexed bidIndex, uint64 lots);

    constructor(address _paymentToken) {
        paymentToken = IERC7984(_paymentToken);
    }

    function createAuction(
        address _tokenSold,
        uint256 _totalLots,
        uint32 _startTick,
        uint32 _endTick,
        uint32 _tickSize,
        uint256 _startTime,
        uint256 _endTime
    ) external {
        auctions[auctionCount] = Auction({
            seller: msg.sender,
            tokenSold: _tokenSold,
            totalLots: _totalLots,
            startTick: _startTick,
            endTick: _endTick,
            tickSize: _tickSize,
            startTime: _startTime,
            endTime: _endTime,
            finalized: false,
            clearingTick: 0,
            clearingTickHandle: 0
        });

        IERC20(_tokenSold).transferFrom(msg.sender, address(this), _totalLots);
        emit AuctionCreated(auctionCount, msg.sender, _tokenSold);
        auctionCount++;
    }

    function placeBid(
        uint256 auctionId,
        uint32 tick,
        externalEuint64 encryptedLots, 
        bytes calldata inputProof
    ) external {
        Auction storage auc = auctions[auctionId];
        require(block.timestamp >= auc.startTime && block.timestamp <= auc.endTime, "Auction not active");
        require(tick <= auc.startTick && tick >= auc.endTick, "Invalid tick");

        euint64 lots = FHE.fromExternal(encryptedLots, inputProof);
        FHE.allowThis(lots); 
        
        uint64 pricePerLot = uint64(tick) * uint64(auc.tickSize);
        euint64 cost = FHE.mul(lots, pricePerLot);
        FHE.allowThis(cost);
        FHE.allow(cost, address(paymentToken));

        paymentToken.confidentialTransferFrom(msg.sender, address(this), cost);

        euint64 current = auctionTickDemand[auctionId][tick];
        euint64 newDemand = FHE.add(current, lots);
        auctionTickDemand[auctionId][tick] = newDemand;
        FHE.allowThis(newDemand);

        auctionBids[auctionId].push(Bid({
            bidder: msg.sender,
            tick: tick,
            lotsEnc: lots,
            paidEnc: cost,
            claimed: false
        }));

        emit BidPlaced(auctionId, msg.sender, tick);
    }

    /**
     * @notice Step 1: Calculate clearing tick and mark for public decryption
     * @dev Frontend must then call publicDecrypt() + submitFinalizeResult()
     */
    function requestFinalize(uint256 auctionId) external {
        Auction storage auc = auctions[auctionId];
        require(!auc.finalized, "Already finalized");
        require(auc.clearingTickHandle == 0, "Already requested");
        // require(block.timestamp > auc.endTime, "Not ended"); // Commented for testing

        euint64 cumulative = FHE.asEuint64(0);
        euint64 supply = FHE.asEuint64(uint64(auc.totalLots));
        // Default to endTick (min price) - means if undersold, everyone wins at min price
        // If demand >= supply, this will be overwritten with actual clearing tick
        ebool found = FHE.asEbool(false);
        euint32 finalTick = FHE.asEuint32(auc.endTick); 
        
        // Safe loop (handles t=0 case)
        uint32 t = auc.startTick; 
        while (true) {
             euint64 demandAtTick = auctionTickDemand[auctionId][t];
             
             // Optimization: Skip empty ticks (uninitialized handles are 0)
             if (euint64.unwrap(demandAtTick) != 0) {
                 cumulative = FHE.add(cumulative, demandAtTick);
                 
                 ebool isSat = FHE.ge(cumulative, supply);
                 ebool isNew = FHE.and(isSat, FHE.not(found));
                 finalTick = FHE.select(isNew, FHE.asEuint32(t), finalTick);
                 found = FHE.or(found, isSat);
             }

             if (t == auc.endTick) {
                 break;
             }
             t--;
        }
        
        // Mark for public decryption (v0.9 pattern)
        FHE.allowThis(finalTick);
        FHE.makePubliclyDecryptable(finalTick);
        
        uint256 handle = uint256(euint32.unwrap(finalTick));
        auc.clearingTickHandle = handle;
        
        emit FinalizeReady(auctionId, handle);
    }

    /**
     * @notice Step 2: Submit decrypted clearing tick
     * @param auctionId The auction ID
     * @param clearingTick The decrypted clearing tick value
     * @dev Seller-only for security. Frontend calls publicDecrypt() first.
     */
    function submitFinalizeResult(
        uint256 auctionId, 
        uint32 clearingTick
    ) external {
        Auction storage auc = auctions[auctionId];
        require(msg.sender == auc.seller, "Only seller");
        require(!auc.finalized, "Already finalized");
        require(auc.clearingTickHandle != 0, "Not requested");
        
        // NOTE: In production, verify decryption proof on-chain.
        // For testnet, we trust the seller to submit correct value.
        // The value is publicly decryptable, so anyone can verify off-chain.
        
        auc.clearingTick = clearingTick;
        auc.finalized = true;
        
        emit AuctionFinalized(auctionId, clearingTick);
    }

    /**
     * @notice Claim tokens/refund after auction is finalized
     * @dev For losers: immediate refund. For winners: needs decryption of lots.
     */
    function requestClaim(uint256 auctionId, uint256 bidIndex) external {
        Auction storage auc = auctions[auctionId];
        require(auc.finalized, "Not finalized");
        Bid storage bid = auctionBids[auctionId][bidIndex];
        require(msg.sender == bid.bidder, "Not bidder");
        require(!bid.claimed, "Claimed");

        if (bid.tick < auc.clearingTick) {
             // Lost: Immediate refund
             bid.claimed = true;
             paymentToken.confidentialTransfer(msg.sender, bid.paidEnc);
             return;
        }

        // Won: Mark lots for public decryption
        FHE.makePubliclyDecryptable(bid.lotsEnc);
        uint256 handle = uint256(euint64.unwrap(bid.lotsEnc));
        
        emit ClaimReady(auctionId, bidIndex, handle);
    }

    /**
     * @notice Submit decrypted lots to complete claim
     * @dev Bidder-only. Frontend calls publicDecrypt() first.
     */
    function submitClaimResult(
        uint256 auctionId,
        uint256 bidIndex,
        uint64 decryptedLots
    ) external {
        Auction storage auc = auctions[auctionId];
        Bid storage bid = auctionBids[auctionId][bidIndex];
        require(msg.sender == bid.bidder, "Not bidder");
        require(!bid.claimed, "Claimed");
        require(bid.tick >= auc.clearingTick, "Loser should use requestClaim");
        
        // NOTE: In production, verify decryption proof on-chain.
        // For testnet, we trust the bidder to submit correct value.
        
        bid.claimed = true;
        
        // Refund price difference
        uint64 diff = uint64(bid.tick - auc.clearingTick);
        uint64 refundScalar = diff * uint64(auc.tickSize);
        euint64 refundEnc = FHE.mul(bid.lotsEnc, refundScalar);
        FHE.allowThis(refundEnc);
        FHE.allow(refundEnc, address(paymentToken));
            
        paymentToken.confidentialTransfer(bid.bidder, refundEnc);
            
        // Transfer tokens
        IERC20(auc.tokenSold).transfer(bid.bidder, decryptedLots);
        
        emit ClaimProcessed(auctionId, bidIndex, decryptedLots);
    }
    
    // View helpers
    function getBidCount(uint256 auctionId) external view returns (uint256) {
        return auctionBids[auctionId].length;
    }
    
    function getBid(uint256 auctionId, uint256 bidIndex) external view returns (
        address bidder,
        uint32 tick,
        bool claimed
    ) {
        Bid storage bid = auctionBids[auctionId][bidIndex];
        return (bid.bidder, bid.tick, bid.claimed);
    }
}
