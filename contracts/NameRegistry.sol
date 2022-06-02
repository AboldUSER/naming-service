//SPDX-License-Identifier: Unlicense
pragma solidity 0.8.14;

import "./INameRegistry.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract NameRegistry is INameRegistry, Ownable {
    /**
     * @notice Maps a name to last associated account
     */
    mapping(string => address) public override names;

    /**
     * @notice Maps accounts to manager-indicating boolean
     */
    mapping(address => bool) public managers;

    /**
     * @notice Sets a name to an associated account
     * @param name the string that will be set
     * @param account the account that will be associated with the name
     */
    function setName(string memory name, address account) external override {
        require(managers[msg.sender], "INVALID_CALLER");
        names[name] = account;
        emit NameSet(name, account);
    }

    /**
     * @notice Sets an address that manages the NameRegistry
     * @param manager the account to manage the NameRegistry
     */
    function addManager(address manager) public onlyOwner {
        require(!managers[manager], "ALREADY_MANAGER");
        managers[manager] = true;
    }

    /**
     * @notice Removes an address from managing the NameRegistry
     * @param manager the account that manages the NameRegistry
     */
    function removeManager(address manager) public onlyOwner {
        require(managers[manager], "NOT_MANAGER");
        delete managers[manager];
    }
}
