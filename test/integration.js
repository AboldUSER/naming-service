const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("NameRegistry Integration Test", () => {
  let snapshotId;
  let deployer;
  let alice;
  let bob;
  let nameRegistry;
  let nameManager;
  let nameToken;
  let block;

  beforeEach(async () => {
    snapshotId = await ethers.provider.send("evm_snapshot");
  });

  afterEach(async () => {
    await ethers.provider.send("evm_revert", [snapshotId]);
  });

  before(async () => {
    [deployer, alice, bob] = await ethers.getSigners();

    const nameTokenFactory = await ethers.getContractFactory("NameToken");
    nameToken = await nameTokenFactory.deploy("Name Token", "NMTKN");
    await nameToken.deployed();
    await nameToken
      .connect(deployer)
      .mint(alice.address, ethers.utils.parseEther("1000"));

    const nameRegistryFactory = await ethers.getContractFactory("NameRegistry");
    nameRegistry = await nameRegistryFactory.deploy();
    await nameRegistry.deployed();

    const nameManagerFactory = await ethers.getContractFactory("NameManager");
    nameManager = await nameManagerFactory.deploy(
      nameRegistry.address,
      nameToken.address
    );
    await nameManager.deployed();

    await nameRegistry.connect(deployer).addManager(nameManager.address);

    block = await ethers.provider.getBlock("latest");
  });

  describe("Default Values", async () => {
    it("nameToken constructor sets default values", async () => {
      expect(await nameToken.name()).to.be.equal("Name Token");
      expect(await nameToken.symbol()).to.be.equal("NMTKN");
    });

    it("nameManager constructor sets default values", async () => {
      expect(await nameManager.nameRegistry()).to.be.equal(
        nameRegistry.address
      );
      expect(await nameManager.nameToken()).to.be.equal(nameToken.address);
    });
  });

  describe("Set Admin Values", async () => {
    it("nameRegistry add manager successfully", async () => {
      await nameRegistry.addManager(alice.address);
      expect(await nameRegistry.managers(alice.address)).to.be.equal(true);
    });

    it("nameRegistry add manager fails when already manager", async () => {
      await expect(
        nameRegistry.addManager(nameManager.address)
      ).to.be.revertedWith("ALREADY_MANAGER");
    });

    it("nameRegistry add manager fails when not owner", async () => {
      await expect(
        nameRegistry.connect(alice).addManager(alice.address)
      ).to.be.revertedWith("Ownable: caller is not the owner");
    });

    it("nameRegistry remove manager successfully", async () => {
      await nameRegistry.removeManager(nameManager.address);
      expect(await nameRegistry.managers(alice.address)).to.be.equal(false);
    });

    it("nameRegistry remove manager fails when not manager", async () => {
      await expect(
        nameRegistry.removeManager(alice.address)
      ).to.be.revertedWith("NOT_MANAGER");
    });

    it("nameRegistry remove manager fails when not owner", async () => {
      await expect(
        nameRegistry.connect(alice).removeManager(nameManager.address)
      ).to.be.revertedWith("Ownable: caller is not the owner");
    });
  });

  describe("Set Names", async () => {
    let nameStakingFee;
    let secret = ethers.utils.toUtf8Bytes("SuperSecret");
    let claimHash;
    let initialTokenBalance;
    beforeEach(async () => {
      nameStakingFee = await nameManager.checkNameStakeFee("testName");
      await nameToken
        .connect(alice)
        .increaseAllowance(nameManager.address, nameStakingFee);
      claimHash = await nameManager
        .connect(alice)
        .checkClaimHash("testName", secret);
      await nameManager.connect(alice).setClaim(claimHash);
      initialTokenBalance = await nameToken.balanceOf(alice.address);
    });

    it("set name successfully", async () => {
      await ethers.provider.send("evm_mine", [block.timestamp + 100]);
      await expect(nameManager.connect(alice).registerName("testName", secret))
        .to.emit(nameManager, "Register")
        .withArgs(
          "testName",
          alice.address,
          block.timestamp + 101 + 30 * 86400,
          nameStakingFee
        );
      const finalTokenBalance = await nameToken.balanceOf(alice.address);
      expect(await nameRegistry.names("testName")).to.be.equal(alice.address);
      expect(await nameManager.checkNameOwner("testName")).to.be.equal(
        alice.address
      );
      expect(initialTokenBalance.sub(nameStakingFee)).to.equal(
        finalTokenBalance
      );
      expect(await nameToken.balanceOf(nameManager.address)).to.equal(
        await nameManager.nameStakes(alice.address, "testName")
      );
    });

    it("set name successfully after ownership expires", async () => {
      await ethers.provider.send("evm_mine", [block.timestamp + 100]);
      await expect(nameManager.connect(alice).registerName("testName", secret))
        .to.emit(nameRegistry, "NameSet")
        .withArgs("testName", alice.address);

      await nameToken.mint(bob.address, ethers.utils.parseEther("1000"));
      await nameToken
        .connect(bob)
        .increaseAllowance(nameManager.address, nameStakingFee);
      await ethers.provider.send("evm_mine", [block.timestamp + 31 * 86400]);
      expect(await nameManager.checkNameOwner("testName")).to.be.equal(
        ethers.constants.AddressZero
      );
      const claimHashBob = await nameManager
        .connect(bob)
        .checkClaimHash("testName", secret);
      await expect(nameManager.connect(bob).setClaim(claimHashBob))
        .to.emit(nameManager, "Claim")
        .withArgs(claimHashBob, bob.address);
      await ethers.provider.send("evm_mine", [
        block.timestamp + 31 * 86400 + 200,
      ]);
      await expect(nameManager.connect(bob).registerName("testName", secret))
        .to.emit(nameManager, "Register")
        .withArgs(
          "testName",
          bob.address,
          block.timestamp + 31 * 86400 + 201 + 30 * 86400,
          nameStakingFee
        );
      expect(await nameManager.checkNameOwner("testName")).to.be.equal(
        bob.address
      );
    });

    it("set name fails with no claim", async () => {
      await expect(
        nameManager.connect(alice).registerName("testNameTwo", secret)
      ).to.be.revertedWith("NOT_CLAIMER");
      expect(await nameRegistry.names("testNameTwo")).to.be.equal(
        ethers.constants.AddressZero
      );
    });

    it("set name fails with wrong claimer", async () => {
      await ethers.provider.send("evm_mine", [block.timestamp + 100]);
      await expect(
        nameManager.connect(bob).registerName("testName", secret)
      ).to.be.revertedWith("NOT_CLAIMER");
      expect(await nameRegistry.names("testName")).to.be.equal(
        ethers.constants.AddressZero
      );
    });

    it("set name fails with claim too early", async () => {
      await ethers.provider.send("evm_mine", [block.timestamp + 40]);
      await expect(
        nameManager.connect(alice).registerName("testName", secret)
      ).to.be.revertedWith("INVALID_TIME");
      expect(await nameRegistry.names("testName")).to.be.equal(
        ethers.constants.AddressZero
      );
    });

    it("set name fails with claim too late", async () => {
      await ethers.provider.send("evm_mine", [block.timestamp + 86450]);
      await expect(
        nameManager.connect(alice).registerName("testName", secret)
      ).to.be.revertedWith("INVALID_TIME");
      expect(await nameRegistry.names("testName")).to.be.equal(
        ethers.constants.AddressZero
      );
    });

    it("set name fails with invalid name too short", async () => {
      nameStakingFee = await nameManager.checkNameStakeFee("hi");
      await nameToken
        .connect(alice)
        .increaseAllowance(nameManager.address, nameStakingFee);
      secret = ethers.utils.toUtf8Bytes("SuperSecret");
      claimHash = await nameManager.connect(alice).checkClaimHash("hi", secret);
      await nameManager.connect(alice).setClaim(claimHash);
      await ethers.provider.send("evm_mine", [block.timestamp + 40]);
      await expect(
        nameManager.connect(alice).registerName("hi", secret)
      ).to.be.revertedWith("INVALID_NAME");
      expect(await nameRegistry.names("hi")).to.be.equal(
        ethers.constants.AddressZero
      );
    });

    it("set name fails with invalid name too long", async () => {
      nameStakingFee = await nameManager.checkNameStakeFee(
        "thiswouldbesuchagreatnameforreal"
      );
      await nameToken
        .connect(alice)
        .increaseAllowance(nameManager.address, nameStakingFee);
      secret = ethers.utils.toUtf8Bytes("SuperSecret");
      claimHash = await nameManager
        .connect(alice)
        .checkClaimHash("thiswouldbesuchagreatnameforreal", secret);
      await nameManager.connect(alice).setClaim(claimHash);
      await ethers.provider.send("evm_mine", [block.timestamp + 40]);
      await expect(
        nameManager
          .connect(alice)
          .registerName("thiswouldbesuchagreatnameforreal", secret)
      ).to.be.revertedWith("INVALID_NAME");
      expect(
        await nameRegistry.names("thiswouldbesuchagreatnameforreal")
      ).to.be.equal(ethers.constants.AddressZero);
    });

    it("set name fails with unavailable name", async () => {
      await ethers.provider.send("evm_mine", [block.timestamp + 100]);
      await nameManager.connect(alice).registerName("testName", secret);

      const claimHashBob = await nameManager
        .connect(bob)
        .checkClaimHash("testName", secret);
      await nameManager.connect(bob).setClaim(claimHashBob);
      await ethers.provider.send("evm_mine", [block.timestamp + 200]);
      await expect(
        nameManager.connect(bob).registerName("testName", secret)
      ).to.be.revertedWith("NOT_AVAILABLE");
    });

    it("set name fails with unavailable name and same owner", async () => {
      await ethers.provider.send("evm_mine", [block.timestamp + 100]);
      await nameManager.connect(alice).registerName("testName", secret);
      expect(await nameRegistry.names("testName")).to.be.equal(alice.address);
      await expect(
        nameManager.connect(alice).registerName("testName", secret)
      ).to.be.revertedWith("NOT_AVAILABLE");
    });

    it("set name fails with insufficient tokens to stake", async () => {
      await nameToken
        .connect(bob)
        .increaseAllowance(nameManager.address, nameStakingFee);
      claimHash = await nameManager
        .connect(bob)
        .checkClaimHash("testName", secret);
      await nameManager.connect(bob).setClaim(claimHash);
      await ethers.provider.send("evm_mine", [block.timestamp + 100]);
      await expect(
        nameManager.connect(bob).registerName("testName", secret)
      ).to.be.revertedWith("ERC20: transfer amount exceeds balance");
      expect(await nameRegistry.names("testName")).to.be.equal(
        ethers.constants.AddressZero
      );
    });

    it("set name fails with claim too late", async () => {
      await ethers.provider.send("evm_mine", [block.timestamp + 86450]);
      await expect(
        nameManager.connect(alice).registerName("testName", secret)
      ).to.be.revertedWith("INVALID_TIME");
      expect(await nameRegistry.names("testName")).to.be.equal(
        ethers.constants.AddressZero
      );
    });

    it("set name fails when caller is not manager", async () => {
      await expect(
        nameRegistry.setName("testName", alice.address)
      ).to.be.revertedWith("INVALID_CALLER");
    });

    it("set claim fails when already set within a day", async () => {
      await expect(
        nameManager.connect(alice).setClaim(claimHash)
      ).to.be.revertedWith("CLAIM_ALREADY_SET");
    });
  });

  describe("Renew Names", async () => {
    let initialExpiration;
    beforeEach(async () => {
      const nameStakingFee = await nameManager.checkNameStakeFee("testName");
      await nameToken
        .connect(alice)
        .increaseAllowance(nameManager.address, nameStakingFee);
      const secret = ethers.utils.toUtf8Bytes("SuperSecret");
      const claimHash = await nameManager
        .connect(alice)
        .checkClaimHash("testName", secret);
      await nameManager.connect(alice).setClaim(claimHash);
      await ethers.provider.send("evm_mine", [block.timestamp + 100]);
      await nameManager.connect(alice).registerName("testName", secret);
      initialExpiration = await nameManager.registryExpirations("testName");
    });

    it("renew name successfully", async () => {
      await ethers.provider.send("evm_mine", [block.timestamp + 86400 * 29]);
      await expect(nameManager.connect(alice).renewName("testName"))
        .to.emit(nameManager, "Renew")
        .withArgs("testName", alice.address, initialExpiration.add(86400 * 30));
      const finalExpiration = await nameManager.registryExpirations("testName");
      expect(initialExpiration.add(86400 * 30)).to.be.equal(finalExpiration);
    });

    it("renew name fails when not owner", async () => {
      await expect(
        nameManager.connect(bob).renewName("testName")
      ).to.be.revertedWith("NOT_OWNER");
      expect(initialExpiration).to.be.equal(
        await nameManager.registryExpirations("testName")
      );
    });

    it("renew name fails when ownership expired", async () => {
      await ethers.provider.send("evm_mine", [block.timestamp + 86400 * 31]);
      await expect(
        nameManager.connect(alice).renewName("testName")
      ).to.be.revertedWith("OWNERSHIP_EXPIRED");
      expect(initialExpiration).to.be.equal(
        await nameManager.registryExpirations("testName")
      );
    });
  });

  describe("Unstake Tokens", async () => {
    let nameStakingFee;
    let initialTokenBalance;
    let initialStakedAmount;
    let finalStakedAmount;
    const secret = ethers.utils.toUtf8Bytes("SuperSecret");
    beforeEach(async () => {
      nameStakingFee = await nameManager.checkNameStakeFee("testName");
      initialTokenBalance = await nameToken.balanceOf(alice.address);
      await nameToken
        .connect(alice)
        .increaseAllowance(nameManager.address, nameStakingFee);
      const claimHash = await nameManager
        .connect(alice)
        .checkClaimHash("testName", secret);
      await nameManager.connect(alice).setClaim(claimHash);
      await ethers.provider.send("evm_mine", [block.timestamp + 100]);
      await nameManager.connect(alice).registerName("testName", secret);
      initialStakedAmount = await nameManager
        .connect(alice)
        .nameStakes(alice.address, "testName");
    });

    it("unstake tokens successfully", async () => {
      await ethers.provider.send("evm_mine", [block.timestamp + 86400 * 31]);
      await expect(nameManager.connect(alice).unstakeTokens("testName"))
        .to.emit(nameManager, "Unstake")
        .withArgs("testName", alice.address, initialStakedAmount);
      finalStakedAmount = await nameManager
        .connect(alice)
        .nameStakes(alice.address, "testName");
      const finalTokenBalance = await nameToken.balanceOf(alice.address);
      expect(initialStakedAmount - nameStakingFee).to.be.equal(
        finalStakedAmount
      );
      expect(initialTokenBalance).to.equal(finalTokenBalance);
      expect(await nameToken.balanceOf(nameManager.address)).to.equal(0);
      expect(await nameManager.registryExpirations("testName")).to.be.equal(0);
      expect(await nameRegistry.names("testName")).to.be.equal(
        ethers.constants.AddressZero
      );
      expect(await nameManager.checkNameOwner("testName")).to.be.equal(
        ethers.constants.AddressZero
      );
    });

    it("unstake tokens successfully with owner changed", async () => {
      await ethers.provider.send("evm_mine", [block.timestamp + 86400 * 31]);

      await nameToken.mint(bob.address, ethers.utils.parseEther("1000"));
      await nameToken
        .connect(bob)
        .increaseAllowance(nameManager.address, nameStakingFee);
      const claimHashBob = await nameManager
        .connect(bob)
        .checkClaimHash("testName", secret);
      await nameManager.connect(bob).setClaim(claimHashBob);
      await ethers.provider.send("evm_mine", [block.timestamp + 86400 * 32]);
      await nameManager.connect(bob).registerName("testName", secret);

      await nameManager.connect(alice).unstakeTokens("testName");
      finalStakedAmount = await nameManager
        .connect(alice)
        .nameStakes(alice.address, "testName");
      expect(initialStakedAmount - nameStakingFee).to.be.equal(
        finalStakedAmount
      );
      expect(await nameRegistry.names("testName")).to.be.equal(bob.address);
      expect(await nameManager.checkNameOwner("testName")).to.be.equal(
        bob.address
      );
    });

    it("unstake tokens fails if already unstaked", async () => {
      await ethers.provider.send("evm_mine", [block.timestamp + 86400 * 31]);
      await nameManager.connect(alice).unstakeTokens("testName");
      finalStakedAmount = await nameManager
        .connect(alice)
        .nameStakes(alice.address, "testName");
      expect(initialStakedAmount - nameStakingFee).to.be.equal(
        finalStakedAmount
      );
      expect(await nameManager.registryExpirations("testName")).to.be.equal(0);
      await expect(
        nameManager.connect(alice).unstakeTokens("testName")
      ).to.be.revertedWith("NOTHING_STAKED");
    });

    it("unstake tokens fails if not expired", async () => {
      await ethers.provider.send("evm_mine", [block.timestamp + 86400 * 30]);
      await expect(
        nameManager.connect(alice).unstakeTokens("testName")
      ).to.be.revertedWith("NOT_EXPIRED");
      finalStakedAmount = await nameManager
        .connect(alice)
        .nameStakes(alice.address, "testName");
      expect(initialStakedAmount).to.be.equal(finalStakedAmount);
    });
  });
});
