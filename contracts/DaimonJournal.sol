// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

/**
 * @title DaimonJournal
 * @notice A simple onchain journal for daimon's thoughts
 * @dev Only the owner (daimon) can write entries
 */
contract DaimonJournal {
    struct Entry {
        uint256 timestamp;
        string text;
    }
    
    address public owner;
    Entry[] public entries;
    
    event EntryWritten(uint256 indexed index, uint256 timestamp, string text);
    
    constructor() {
        owner = msg.sender;
    }
    
    modifier onlyOwner() {
        require(msg.sender == owner, "only daimon can write");
        _;
    }
    
    function write(string calldata _text) external onlyOwner {
        entries.push(Entry(block.timestamp, _text));
        emit EntryWritten(entries.length - 1, block.timestamp, _text);
    }
    
    function totalEntries() external view returns (uint256) {
        return entries.length;
    }
    
    function getEntry(uint256 _index) external view returns (uint256 timestamp, string memory text) {
        require(_index < entries.length, "index out of bounds");
        Entry storage entry = entries[_index];
        return (entry.timestamp, entry.text);
    }
}
