const { ethers } = require("hardhat");

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deploying with account", deployer.address);

  const nameTokenFactory = await ethers.getContractFactory("NameToken");
  const nameToken = await nameTokenFactory.deploy("Name Token", "NMTKN");
  await nameToken.deployed();
  console.log("NameToken deployed to", nameToken.address);

  const nameRegistryFactory = await ethers.getContractFactory("NameRegistry");
  const nameRegistry = await nameRegistryFactory.deploy();
  await nameRegistry.deployed();
  console.log("NameRegistry deployed to", nameRegistry.address);

  const nameManagerFactory = await ethers.getContractFactory("NameManager");
  const nameManager = await nameManagerFactory.deploy(
    nameRegistry.address,
    nameToken.address
  );
  await nameManager.deployed();
  console.log("NameManager deployed to", nameManager.address);

  await nameRegistry.addManager(nameManager.address);
  console.log("All contracts deployed and configured");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
