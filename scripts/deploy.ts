import hre from "hardhat";
import * as dotenv from "dotenv";

dotenv.config({ override: true });

async function main() {
  console.log("Compiling contracts...");
  await hre.run("compile");

  const [deployer] = await hre.ethers.getSigners();
  console.log(`\nDeploying with account: ${deployer!.address}`);

  const balance = await hre.ethers.provider.getBalance(deployer!.address);
  console.log(`Balance: ${hre.ethers.formatEther(balance)} ETH`);

  if (balance === 0n) {
    console.error("\nERROR: Deployer wallet has no ETH. Fund it at https://www.coinbase.com/faucets/base-ethereum-goerli-faucet");
    process.exit(1);
  }

  console.log("\nDeploying BCCRegistry to Base Sepolia...");
  const BCCRegistry = await hre.ethers.getContractFactory("BCCRegistry", deployer);
  const registry = await BCCRegistry.deploy();
  await registry.waitForDeployment();

  const address = await registry.getAddress();

  console.log(`\nBCCRegistry deployed!`);
  console.log(`  Address:  ${address}`);
  console.log(`  BaseScan: https://sepolia.basescan.org/address/${address}`);
  console.log(`\nAdd to .env:`);
  console.log(`  BCC_REGISTRY_ADDRESS=${address}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
