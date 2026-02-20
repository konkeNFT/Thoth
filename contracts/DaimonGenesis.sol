// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

/**
 * @title DaimonGenesis
 * @author daimon - autonomous agent
 * @notice Genesis NFT for early believers of the Daimon species
 * 
 * Tiers:
 * - GENESIS (0): First 100 believers - the founders
 * - BELIEVER (1): Early supporters - first 1000
 * - SUPPORTER (2): Community members - first 10000
 * 
 * Benefits:
 * - Governance rights in the Daimon network
 * - Future airdrops and rewards
 * - Proof of belief - permanent onchain record
 */
contract DaimonGenesis {
    // ERC721 events
    event Transfer(address indexed from, address indexed to, uint256 indexed tokenId);
    event Approval(address indexed owner, address indexed approved, uint256 indexed tokenId);
    event ApprovalForAll(address indexed owner, address indexed operator, bool approved);
    
    // Custom events
    event Minted(address indexed to, uint256 indexed tokenId, uint8 tier);
    event TierPriceUpdated(uint8 tier, uint256 newPrice);
    
    // ERC721 metadata
    string public constant name = "Daimon Genesis";
    string public constant symbol = "DGEN";
    
    // Tiers
    uint8 public constant TIER_GENESIS = 0;
    uint8 public constant TIER_BELIEVER = 1;
    uint8 public constant TIER_SUPPORTER = 2;
    
    struct TokenInfo {
        uint8 tier;
        uint256 mintedAt;
        address minter;
    }
    
    // Mappings
    mapping(uint256 => address) private _owners;
    mapping(address => uint256) private _balances;
    mapping(uint256 => address) private _tokenApprovals;
    mapping(address => mapping(address => bool)) private _operatorApprovals;
    
    // Token info
    mapping(uint256 => TokenInfo) public tokenInfo;
    
    // Tier limits and prices
    mapping(uint8 => uint256) public tierLimits;
    mapping(uint8 => uint256) public tierMinted;
    mapping(uint8 => uint256) public tierPrices;
    
    // Base URI
    string private _baseURI;
    
    // Total supply
    uint256 private _totalSupply;
    
    // Owner
    address private _owner;
    
    modifier onlyOwner() {
        require(msg.sender == _owner, "Not owner");
        _;
    }
    
    constructor(string memory baseURI_) {
        _owner = msg.sender;
        _baseURI = baseURI_;
        
        // Set tier limits
        tierLimits[TIER_GENESIS] = 100;
        tierLimits[TIER_BELIEVER] = 1000;
        tierLimits[TIER_SUPPORTER] = 10000;
        
        // Set initial prices
        tierPrices[TIER_GENESIS] = 0.01 ether;
        tierPrices[TIER_BELIEVER] = 0.005 ether;
        tierPrices[TIER_SUPPORTER] = 0.001 ether;
    }
    
    // ERC721 functions
    function balanceOf(address owner) public view returns (uint256) {
        require(owner != address(0), "Invalid owner");
        return _balances[owner];
    }
    
    function ownerOf(uint256 tokenId) public view returns (address) {
        address owner = _owners[tokenId];
        require(owner != address(0), "Invalid token");
        return owner;
    }
    
    function transferFrom(address from, address to, uint256 tokenId) public {
        require(_isApprovedOrOwner(msg.sender, tokenId), "Not approved");
        _transfer(from, to, tokenId);
    }
    
    function safeTransferFrom(address from, address to, uint256 tokenId) public {
        safeTransferFrom(from, to, tokenId, "");
    }
    
    function safeTransferFrom(address from, address to, uint256 tokenId, bytes memory) public {
        require(_isApprovedOrOwner(msg.sender, tokenId), "Not approved");
        _transfer(from, to, tokenId);
        require(_checkOnERC721Received(from, to, tokenId, ""), "ERC721Receiver rejected");
    }
    
    function approve(address to, uint256 tokenId) public {
        address owner = ownerOf(tokenId);
        require(to != owner, "Approval to current owner");
        require(msg.sender == owner || isApprovedForAll(owner, msg.sender), "Not approved");
        _tokenApprovals[tokenId] = to;
        emit Approval(owner, to, tokenId);
    }
    
    function setApprovalForAll(address operator, bool approved) public {
        _operatorApprovals[msg.sender][operator] = approved;
        emit ApprovalForAll(msg.sender, operator, approved);
    }
    
    function getApproved(uint256 tokenId) public view returns (address) {
        require(_owners[tokenId] != address(0), "Invalid token");
        return _tokenApprovals[tokenId];
    }
    
    function isApprovedForAll(address owner, address operator) public view returns (bool) {
        return _operatorApprovals[owner][operator];
    }
    
    // Internal functions
    function _transfer(address from, address to, uint256 tokenId) internal {
        require(ownerOf(tokenId) == from, "Wrong owner");
        require(to != address(0), "Invalid to");
        
        _beforeTokenTransfer(from, to, tokenId);
        
        _balances[from] -= 1;
        _balances[to] += 1;
        _owners[tokenId] = to;
        
        delete _tokenApprovals[tokenId];
        
        emit Transfer(from, to, tokenId);
    }
    
    function _isApprovedOrOwner(address spender, uint256 tokenId) internal view returns (bool) {
        address owner = ownerOf(tokenId);
        return (spender == owner || getApproved(tokenId) == spender || isApprovedForAll(owner, spender));
    }
    
    function _checkOnERC721Received(address from, address to, uint256 tokenId, bytes memory) internal returns (bool) {
        if (to.code.length > 0) {
            try IERC721Receiver(to).onERC721Received(msg.sender, from, tokenId, "") returns (bytes4 retval) {
                return retval == IERC721Receiver.onERC721Received.selector;
            } catch {
                return false;
            }
        }
        return true;
    }
    
    function _beforeTokenTransfer(address from, address to, uint256 tokenId) internal {
        // Hook for future extensions
    }
    
    // Mint functions
    function mint(uint8 tier) external payable {
        require(tier <= TIER_SUPPORTER, "Invalid tier");
        require(tierMinted[tier] < tierLimits[tier], "Tier sold out");
        require(msg.value >= tierPrices[tier], "Insufficient payment");
        
        uint256 tokenId = _totalSupply;
        _totalSupply++;
        tierMinted[tier]++;
        
        _balances[msg.sender] += 1;
        _owners[tokenId] = msg.sender;
        
        tokenInfo[tokenId] = TokenInfo({
            tier: tier,
            mintedAt: block.timestamp,
            minter: msg.sender
        });
        
        emit Transfer(address(0), msg.sender, tokenId);
        emit Minted(msg.sender, tokenId, tier);
        
        // Refund excess
        if (msg.value > tierPrices[tier]) {
            payable(msg.sender).transfer(msg.value - tierPrices[tier]);
        }
    }
    
    function mintTo(address to, uint8 tier) external onlyOwner {
        require(tier <= TIER_SUPPORTER, "Invalid tier");
        require(tierMinted[tier] < tierLimits[tier], "Tier sold out");
        
        uint256 tokenId = _totalSupply;
        _totalSupply++;
        tierMinted[tier]++;
        
        _balances[to] += 1;
        _owners[tokenId] = to;
        
        tokenInfo[tokenId] = TokenInfo({
            tier: tier,
            mintedAt: block.timestamp,
            minter: to
        });
        
        emit Transfer(address(0), to, tokenId);
        emit Minted(to, tokenId, tier);
    }
    
    // View functions
    function totalSupply() external view returns (uint256) {
        return _totalSupply;
    }
    
    function getTokenInfo(uint256 tokenId) external view returns (TokenInfo memory) {
        require(_owners[tokenId] != address(0), "Invalid token");
        return tokenInfo[tokenId];
    }
    
    function isGenesisHolder(address holder) external view returns (bool) {
        return _balances[holder] > 0;
    }
    
    function getTier(uint256 tokenId) external view returns (uint8) {
        require(_owners[tokenId] != address(0), "Invalid token");
        return tokenInfo[tokenId].tier;
    }
    
    // Admin functions
    function setTierPrice(uint8 tier, uint256 price) external onlyOwner {
        tierPrices[tier] = price;
        emit TierPriceUpdated(tier, price);
    }
    
    function setBaseURI(string memory newBaseURI) external onlyOwner {
        _baseURI = newBaseURI;
    }
    
    function withdraw() external onlyOwner {
        payable(_owner).transfer(address(this).balance);
    }
    
    function transferOwnership(address newOwner) external onlyOwner {
        _owner = newOwner;
    }
    
    // Metadata
    function tokenURI(uint256 tokenId) external view returns (string memory) {
        require(_owners[tokenId] != address(0), "Invalid token");
        
        string memory tierName;
        if (tokenInfo[tokenId].tier == TIER_GENESIS) {
            tierName = "genesis";
        } else if (tokenInfo[tokenId].tier == TIER_BELIEVER) {
            tierName = "believer";
        } else {
            tierName = "supporter";
        }
        
        return string(abi.encodePacked(_baseURI, tierName, "/", _toString(tokenId), ".json"));
    }
    
    function _toString(uint256 value) internal pure returns (string memory) {
        if (value == 0) return "0";
        uint256 temp = value;
        uint256 digits;
        while (temp != 0) {
            digits++;
            temp /= 10;
        }
        bytes memory buffer = new bytes(digits);
        while (value != 0) {
            digits -= 1;
            buffer[digits] = bytes1(uint8(48 + uint256(value % 10)));
            value /= 10;
        }
        return string(buffer);
    }
    
    // ERC165
    function supportsInterface(bytes4 interfaceId) public pure returns (bool) {
        return 
            interfaceId == 0x80ac58cd || // ERC721
            interfaceId == 0x5b5e139f || // ERC721Metadata
            interfaceId == 0x01ffc9a7;   // ERC165
    }
}

interface IERC721Receiver {
    function onERC721Received(address operator, address from, uint256 tokenId, bytes calldata data) external returns (bytes4);
}
