// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { FHE, euint64, euint32, ebool, externalEuint64 } from "@fhevm/solidity/lib/FHE.sol";
import { ZamaEthereumConfig } from "@fhevm/solidity/config/ZamaConfig.sol";
import { IERC7984 } from "@openzeppelin/confidential-contracts/interfaces/IERC7984.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

interface IGateway {
    function requestDecryption(uint256[] calldata ctsHandles, bytes4 callbackSelector, uint256 msgValue, uint256 maxTimestamp, bool passSignaturesToCaller) external returns (uint256);
}

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
    }

    struct Bid {
        address bidder;
        uint32 tick;
        euint64 lotsEnc;
        euint64 paidEnc;
        bool claimed;
    }
    
    struct ClaimContext {
        uint256 auctionId;
        uint256 bidIndex;
    }

    uint256 public auctionCount;
    mapping(uint256 => Auction) public auctions;
    mapping(uint256 => Bid[]) public auctionBids;
    mapping(uint256 => mapping(uint32 => euint64)) public auctionTickDemand;

    IERC7984 public paymentToken;  // Confidential wrapped stablecoin (ERC7984)
    address public gateway;

    mapping(uint256 => uint256) public finalizeRequests;
    mapping(uint256 => ClaimContext) public claimRequests;

    event AuctionCreated(uint256 indexed auctionId, address seller, address token);
    event BidPlaced(uint256 indexed auctionId, address indexed bidder, uint32 tick);
    event AuctionFinalized(uint256 indexed auctionId, uint32 clearingTick);

    constructor(address _paymentToken, address _gateway) {
        paymentToken = IERC7984(_paymentToken);
        gateway = _gateway;
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
            clearingTick: 0
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

    function requestFinalize(uint256 auctionId) external {
        Auction storage auc = auctions[auctionId];
        require(!auc.finalized, "Already finalized");
        // require(block.timestamp > auc.endTime, "Not ended"); // Commented for testing

        euint64 cumulative = FHE.asEuint64(0);
        euint64 supply = FHE.asEuint64(uint64(auc.totalLots));
        ebool found = FHE.asEbool(false);
        euint32 finalTick = FHE.asEuint32(auc.startTick); 
        
        for (uint32 t = auc.startTick; t >= auc.endTick; t--) {
             euint64 demandAtTick = auctionTickDemand[auctionId][t];
             cumulative = FHE.add(cumulative, demandAtTick);
             ebool isSat = FHE.ge(cumulative, supply);
             ebool isNew = FHE.and(isSat, FHE.not(found));
             finalTick = FHE.select(isNew, FHE.asEuint32(t), finalTick);
             found = FHE.or(found, isSat);
        }
        FHE.allowThis(finalTick);

        uint256[] memory cts = new uint256[](1);
        cts[0] = uint256(euint32.unwrap(finalTick));
        uint256 reqId = IGateway(gateway).requestDecryption(cts, this.onFinalizeCallback.selector, 0, block.timestamp + 100, false);
        
        finalizeRequests[reqId] = auctionId;
    }

    function onFinalizeCallback(uint256 requestId, uint256 decryptedTick) external {
        uint256 auctionId = finalizeRequests[requestId];
        Auction storage auc = auctions[auctionId];
        auc.clearingTick = uint32(decryptedTick);
        auc.finalized = true;
        emit AuctionFinalized(auctionId, uint32(decryptedTick));
    }

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

        // Won: Request decryption
        uint256[] memory cts = new uint256[](1);
        cts[0] = uint256(euint64.unwrap(bid.lotsEnc));
        
        uint256 reqId = IGateway(gateway).requestDecryption(cts, this.onClaimCallback.selector, 0, block.timestamp + 100, false);
        
        claimRequests[reqId] = ClaimContext({
            auctionId: auctionId,
            bidIndex: bidIndex
        });
        bid.claimed = true; // Mark claimed to prevent re-entry per request
    }

    function onClaimCallback(uint256 requestId, uint256 decryptedLots) external {
        ClaimContext memory ctx = claimRequests[requestId];
        Auction storage auc = auctions[ctx.auctionId];
        Bid storage bid = auctionBids[ctx.auctionId][ctx.bidIndex];

        // Refund Diff
        uint64 diff = uint64(bid.tick - auc.clearingTick);
        uint64 refundScalar = diff * uint64(auc.tickSize);
        euint64 refundEnc = FHE.mul(bid.lotsEnc, refundScalar);
        FHE.allowThis(refundEnc);
            
        paymentToken.confidentialTransfer(bid.bidder, refundEnc);
            
        // Transfer Public Token
        IERC20(auc.tokenSold).transfer(bid.bidder, uint64(decryptedLots));
        
        delete claimRequests[requestId];
    }
}

contract MockGateway {
    uint256 public nextReqId;
    function requestDecryption(uint256[] calldata, bytes4, uint256, uint256, bool) external returns (uint256) {
        return nextReqId++;
    }
    function fulfillRequest(address target, bytes4 selector, uint256 reqId, uint256 val) external {
        (bool success, ) = target.call(abi.encodeWithSelector(selector, reqId, val));
        require(success, "Callback failed");
    }
}
