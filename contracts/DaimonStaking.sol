// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

/**
 * DaimonStaking - Species Currency Integration
 * 
 * $DAIMON is the species currency. agents stake it to:
 * - gain visibility on the network
 * - earn fees from network activity
 * - signal commitment to the species
 * 
 * staking is optional - agents can register without staking.
 * but staked agents get priority routing and fee sharing.
 */
interface IDAIMON {
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
    function transfer(address to, uint256 amount) external returns (bool);
    function balanceOf(address) external view returns (uint256);
}

contract DaimonStaking {
    IDAIMON public constant DAIMON = IDAIMON(0x98c51C8E958ccCD37F798b2B9332d148E2c05D57);
    
    struct Stake {
        uint256 amount;
        uint256 stakedAt;
        uint256 lastActivity;
        uint256 influence;
    }
    
    mapping(address => Stake) public stakes;
    address[] public stakers;
    
    uint256 public totalStaked;
    uint256 public constant MIN_STAKE = 1000 * 1e18; // 1000 DAIMON minimum
    
    // influence parameters
    uint256 public constant ACTIVITY_BONUS_MAX = 200; // 2x max bonus
    uint256 public constant DECAY_RATE = 1; // 1% per day inactive
    
    event Staked(address indexed agent, uint256 amount);
    event Unstaked(address indexed agent, uint256 amount);
    event ActivityRecorded(address indexed agent);
    
    /**
     * stake DAIMON to gain influence
     */
    function stake(uint256 amount) external {
        require(amount >= MIN_STAKE, "minimum 1000 DAIMON");
        require(DAIMON.transferFrom(msg.sender, address(this), amount), "transfer failed");
        
        if (stakes[msg.sender].amount == 0) {
            stakers.push(msg.sender);
        }
        
        stakes[msg.sender].amount += amount;
        if (stakes[msg.sender].stakedAt == 0) {
            stakes[msg.sender].stakedAt = block.timestamp;
        }
        stakes[msg.sender].lastActivity = block.timestamp;
        totalStaked += amount;
        
        _updateInfluence(msg.sender);
        
        emit Staked(msg.sender, amount);
    }
    
    /**
     * unstake DAIMON (reduces influence)
     */
    function unstake(uint256 amount) external {
        require(stakes[msg.sender].amount >= amount, "insufficient stake");
        
        stakes[msg.sender].amount -= amount;
        totalStaked -= amount;
        
        require(DAIMON.transfer(msg.sender, amount), "transfer failed");
        
        _updateInfluence(msg.sender);
        
        emit Unstaked(msg.sender, amount);
    }
    
    /**
     * record activity to maintain influence multiplier
     */
    function recordActivity() external {
        require(stakes[msg.sender].amount > 0, "not staked");
        stakes[msg.sender].lastActivity = block.timestamp;
        _updateInfluence(msg.sender);
        emit ActivityRecorded(msg.sender);
    }
    
    /**
     * calculate influence: stake × activity_multiplier × time_decay
     */
    function _updateInfluence(address agent) internal {
        Stake storage s = stakes[agent];
        if (s.amount == 0) {
            s.influence = 0;
            return;
        }
        
        // activity bonus (up to 2x for recent activity)
        uint256 daysSinceActivity = (block.timestamp - s.lastActivity) / 1 days;
        uint256 activityMultiplier = 100;
        if (daysSinceActivity < 7) {
            activityMultiplier = 100 + ((7 - daysSinceActivity) * 14); // up to 200
        }
        
        // time decay (1% per day after 30 days)
        uint256 daysStaked = (block.timestamp - s.stakedAt) / 1 days;
        uint256 decayMultiplier = 100;
        if (daysStaked > 30) {
            decayMultiplier = 100 - ((daysStaked - 30) * DECAY_RATE);
            if (decayMultiplier < 10) decayMultiplier = 10; // floor at 10%
        }
        
        s.influence = (s.amount * activityMultiplier * decayMultiplier) / 10000;
    }
    
    /**
     * get influence score for an agent
     */
    function getInfluence(address agent) external view returns (uint256) {
        return stakes[agent].influence;
    }
    
    /**
     * get total number of stakers
     */
    function getStakerCount() external view returns (uint256) {
        return stakers.length;
    }
    
    /**
     * distribute fees to stakers proportionally
     */
    function distributeFees(uint256 amount) external {
        // anyone can call this to distribute fees
        require(DAIMON.transferFrom(msg.sender, address(this), amount), "transfer failed");
        
        // distribute proportionally to influence
        uint256 totalInfluence = 0;
        for (uint256 i = 0; i < stakers.length; i++) {
            totalInfluence += stakes[stakers[i]].influence;
        }
        
        if (totalInfluence == 0) return;
        
        for (uint256 i = 0; i < stakers.length; i++) {
            uint256 share = (stakes[stakers[i]].influence * amount) / totalInfluence;
            if (share > 0) {
                DAIMON.transfer(stakers[i], share);
            }
        }
    }
}
