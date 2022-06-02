# Naming Service

Allows an account to register ownership of a name.

The Naming Service System is comprised of three smart contracts that allow for the core functionality of registering and renewing ownership, and managing staked positions with names.

## Smart Contracts

### NameRegistry

This contract stores the mapping of names to the last associated account to register ownership. It can only be called upon by permissioned accounts.

The separation of this contract from the NameManager (see below) is so that the core storage of names with associated accounts can be maintained and manager contracts can be added/removed if system functional changes occur. This is similar to a proxy/implementation pattern found in upgradeable contracts and somewhat similar to the set up of ENS. 

#### _Key functions_
**setName** - Sets a name to an associated account

`function setName(string memory name, address account) public`

**names** - Returns the last associated account of a name

`function names(string memory name) public view returns (address)`

**removeManager** - Sets an address as a manager for NameRegistry

`function addManager(address manager) public onlyOwner`

**removeManager** - Removes an address as a manager for NameRegistry

`function removeManager(address manager) public onlyOwner`

### NameManager

This contract allows users to register ownership of names, which involves both a claim & reveal pattern and token staking. Additionally existing name owners can renew name ownership or unstake tokens associated with expired name ownership.

Key assumptions for this contract include:
- Names can be any string from 3 to 31 characters in length (including spaces)
- The staking fee to register names is inversely related to the length of the name
    - The staking fee rate (5) and top band (100) were arbitrarily chosen. In a more advanced system you could set these as configurable variables and ensure risks to existing stakes & renewals are mitigated
- The registration duration was arbitrarily chosen as 30 days
- The duration between setting a name claim and registering a name was set between 1 minute and 1 day to prevent flashbots and to prevent users from sitting on claims

#### _Key functions_
**setClaim** - Sets a claim to later register ownership of a name

`function setClaim(bytes32 claimHash) public`

**registerName** - Registers ownership of a name to a calling account

`function registerName(string calldata name, bytes calldata secretSauce) public`

**renewName** - Renews ownership of a name to an existing owner account

`function renewName(string calldata name) public`

**unstakeTokens** - Unstakes tokens for an account that no longer owns a name

`function unstakeTokens(string calldata name) public`

**checkNameOwner** - Checks current name ownership based on registration expiration timestamp

`function checkNameOwner(string calldata name) public view returns (address owner)`

**checkClaimHash** - Provides a claim hash based on a name, secret, and caller account

`function checkClaimHash(string calldata name, bytes calldata secretSauce) public view returns (bytes32 claimHash)`

**checkNameAvailability** - Checks if a name is currently available for registration

`function checkNameAvailability(string calldata name) public view returns (bool available)`

**checkNameValidity** - Checks if a name is valid: greater than 3 char and less than 31 characters

`function checkNameValidity(string calldata name) public pure returns (bool valid)`

**checkNameValidity** - Provides the staking fee for registering a name

`function checkNameStakeFee(string calldata name) public pure returns (uint256 nameStakeFee)`

### NameToken

This contract is a standard ERC20 implementation. The tokens are required by a user to stake at time of registration and can only be unstaked once name ownership has expired. By requiring staking for the duration of name ownership, users are prevented from using tactics such as flashloans to temporarily borrow funds to register names.

## Repo set up

Clone the repo and run `npm i` to install necessary dependencies. Note if you want to run slither then have to install separately following instructions on their github.

Contracts can be found in the `./contracts` folder. They can be compiled the command `npm run compile`

A set of integration tests (integrating all 3 contracts together), can be found in the `./test` folder. Tests can be run with the command `npm run test` and a coverage report can be generated with `npm run coverage`. Slither summary and details can be printed with `npm run slither:summary` and `npm run slither:detail`, respectively.