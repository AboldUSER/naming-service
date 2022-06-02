//SPDX-License-Identifier: Unlicense
pragma solidity 0.8.14;

abstract contract INameRegistry {
    event NameSet(string indexed name, address indexed account);

    function names(string memory name) external view virtual returns (address);

    function setName(string memory name, address account) external virtual;
}
