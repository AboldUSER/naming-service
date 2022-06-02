//SPDX-License-Identifier: Unlicense
pragma solidity 0.8.14;

import "./INameRegistry.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";

contract NameManager is Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    struct ClaimObject {
        address claimer;
        uint64 claimableTimestamp;
    }

    uint256 public constant NAME_STAKE_FEE_RATE = 5 ether;

    INameRegistry public immutable nameRegistry;

    IERC20 public immutable nameToken;

    /**
     * @notice Maps a claim hash to a claim object
     */
    mapping(bytes32 => ClaimObject) public claims;

    /**
     * @notice Maps a name to an expiration timestamp
     */
    mapping(string => uint256) public registryExpirations;

    /**
     * @notice Maps an account to a mapping of names to stake amounts
     */
    mapping(address => mapping(string => uint256)) public nameStakes;

    event Claim(bytes32 indexed claimHash, address indexed claimer);

    event Register(
        string indexed name,
        address indexed owner,
        uint256 indexed expiration,
        uint256 stakeAmount
    );

    event Renew(
        string indexed name,
        address indexed owner,
        uint256 indexed expiration
    );

    event Unstake(
        string indexed name,
        address indexed owner,
        uint256 unstakeAmount
    );

    /**
     * @notice Sets the state varaible addresses for the registry and token contracts
     * @param _nameRegistry address of the NameRegistry contract
     * @param _nameToken address of the NameToken contract
     */
    constructor(address _nameRegistry, address _nameToken) {
        nameRegistry = INameRegistry(_nameRegistry);
        nameToken = IERC20(_nameToken);
    }

    /**
     * @notice Sets a claim to later register ownership of a name
     * @param claimHash the keccak256 hash of the name, calling account, and a secret
     */
    function setClaim(bytes32 claimHash) public {
        require(
            claims[claimHash].claimableTimestamp == 0 ||
                claims[claimHash].claimableTimestamp + 1 days < block.timestamp,
            "CLAIM_ALREADY_SET"
        );
        claims[claimHash] = ClaimObject({
            claimer: msg.sender,
            claimableTimestamp: uint64(block.timestamp)
        });
        emit Claim(claimHash, msg.sender);
    }

    /**
     * @notice Registers ownership of a name to a calling account
     * @dev Allowance of the NameToken should be set prior to calling this
     * @param name the string that will be registered
     * @param secretSauce a set of bytes used in building the claim hash
     */
    function registerName(string calldata name, bytes calldata secretSauce)
        public
        nonReentrant
    {
        require(checkNameValidity(name), "INVALID_NAME");
        require(checkNameAvailability(name), "NOT_AVAILABLE");
        bytes32 internalClaimHash = checkClaimHash(name, secretSauce);
        ClaimObject storage claimObject = claims[internalClaimHash];
        require(claimObject.claimer == msg.sender, "NOT_CLAIMER");
        require(
            claimObject.claimableTimestamp + 1 minutes < block.timestamp &&
                claimObject.claimableTimestamp + 1 days > block.timestamp,
            "INVALID_TIME"
        );
        uint256 expiration = block.timestamp + 30 days;
        registryExpirations[name] = expiration;
        uint256 stakeAmount = checkNameStakeFee(name);
        nameStakes[msg.sender][name] = stakeAmount;
        nameToken.safeTransferFrom(msg.sender, address(this), stakeAmount);
        nameRegistry.setName(name, msg.sender);
        emit Register(name, msg.sender, expiration, stakeAmount);
    }

    /**
     * @notice Renews ownership of a name to an existing owner account
     * @param name the string that will be renewed
     */
    function renewName(string calldata name) public nonReentrant {
        require(nameRegistry.names(name) == msg.sender, "NOT_OWNER");
        require(!checkNameAvailability(name), "OWNERSHIP_EXPIRED");
        uint256 expiration = registryExpirations[name] + 30 days;
        registryExpirations[name] = expiration;
        emit Renew(name, msg.sender, expiration);
    }

    /**
     * @notice Unstakes tokens for an account that no longer owns a name
     * @param name the string that has tokens to be unstaked
     */
    function unstakeTokens(string calldata name) public nonReentrant {
        uint256 unstakeAmount = nameStakes[msg.sender][name];
        require(unstakeAmount > 0, "NOTHING_STAKED");
        delete nameStakes[msg.sender][name];
        if (nameRegistry.names(name) == msg.sender) {
            require(registryExpirations[name] < block.timestamp, "NOT_EXPIRED");
            delete registryExpirations[name];
            nameRegistry.setName(name, address(0x0));
        }
        nameToken.safeTransfer(msg.sender, unstakeAmount);
        emit Unstake(name, msg.sender, unstakeAmount);
    }

    /**
     * @notice Checks current name ownership
     * @param name the string to check current account owner
     * @return owner the account that currently owns the name
     */
    function checkNameOwner(string calldata name)
        public
        view
        returns (address owner)
    {
        registryExpirations[name] > block.timestamp
            ? owner = nameRegistry.names(name)
            : owner = address(0x0);
    }

    /**
     * @notice Provides a claim hash based on a name, secret, and caller account
     * @param name the string used in building the claim hash
     * @param secretSauce a set of bytes used in building the claim hash
     * @return claimHash the keccak256 hash of name, calling account, and secret
     */
    function checkClaimHash(string calldata name, bytes calldata secretSauce)
        public
        view
        returns (bytes32 claimHash)
    {
        claimHash = keccak256(abi.encodePacked(name, msg.sender, secretSauce));
    }

    /**
     * @notice Checks if a name is currently available for registration
     * @param name the string to check for availability
     * @return available boolean indicating availability
     */
    function checkNameAvailability(string calldata name)
        public
        view
        returns (bool available)
    {
        if (registryExpirations[name] < block.timestamp) {
            available = true;
        }
    }

    /**
     * @notice Checks if a name is valid - greater than 3 char and less than 31 characters
     * @param name the string to check for validity
     * @return valid boolean indicating validity
     */
    function checkNameValidity(string calldata name)
        public
        pure
        returns (bool valid)
    {
        if (bytes(name).length > 2 && bytes(name).length < 32) {
            valid = true;
        }
    }

    /**
     * @notice Provides the staking fee for registering a name
     * @dev Call will fail with string length over 100
     * @param name the string to check for staking fee
     * @return nameStakeFee the name's associated staking fee
     */
    function checkNameStakeFee(string calldata name)
        public
        pure
        returns (uint256 nameStakeFee)
    {
        uint256 nameLength = bytes(name).length;
        nameStakeFee = NAME_STAKE_FEE_RATE * (100 - nameLength);
    }
}
