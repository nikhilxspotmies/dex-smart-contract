# dex-smart-contract

forge create src/P2PTokenEscrow.sol:P2PTokenEscrows --rpc-url http://127.0.0.1:8545 --private-key 0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80 --broadcast

Deployer: 0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266
Deployed to: 0x5FbDB2315678afecb367f032d93F642f64180aa3
Transaction hash: 0xe5e218142c6139b2f99d6299a89215652f679aeba8ed08919beaf42f035ce7b6

$ forge script script/WhitelistToken.s.sol --rpc-url http://127.0.0.1:8545 --broadcast

== Logs ==
  Deployed Mock Token at: 0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512
  Minted 1,000,000 tokens to: 0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266
  Whitelisted token on P2P contract at: 0x5FbDB2315678afecb367f032d93F642f64180aa3

0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512


+==== DEX ====+

forge script script/DeployDex.s.sol --rpc-url http://127.0.0.1:8545 --broadcast

forge script script/DeployTokens.s.sol --rpc-url http://127.0.0.1:8545 --broadcast

== Logs ==
  Factory deployed at: 0x5FbDB2315678afecb367f032d93F642f64180aa3
  Router deployed at: 0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512

== Logs ==
  Token A deployed at: 0x9fE46736679d2D9a65F0992F2272dE9f3c7fa6e0
  Token B deployed at: 0xCf7Ed3AccA5a467e9e704C703E8D87F634fB0Fc9


=====new setup ===

forge create src/P2PTokenEscrow.sol:P2PTokenEscrows --rpc-url http://127.0.0.1:8545 --private-key 0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80 --broadcast

forge script script/DeployP2PTokenEscrow.s.sol:DeployP2PTokenEscrow --rpc-url http://127.0.0.1:8545 --private-key 0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80 --broadcast

Deployer: 0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266
Deployed to: 0x5FbDB2315678afecb367f032d93F642f64180aa3
Transaction hash: 0xe5e218142c6139b2f99d6299a89215652f679aeba8ed08919beaf42f035ce7b6


$ forge script script/DeployDex.s.sol --rpc-url http://127.0.0.1:8545 --broadcast


== Logs ==
  Factory deployed at: 0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512
  Router deployed at: 0x9fE46736679d2D9a65F0992F2272dE9f3c7fa6e0


$ forge script script/WhitelistToken.s.sol --rpc-url http://127.0.0.1:8545 --broadcast


== Logs ==
  Deployed Mock Token at: 0xCf7Ed3AccA5a467e9e704C703E8D87F634fB0Fc9
  Minted 1,000,000 tokens to: 0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266
  Whitelisted token on P2P contract at: 0x5FbDB2315678afecb367f032d93F642f64180aa3


$ forge script script/DeployTokens.s.sol --rpc-url http://127.0.0.1:8545 --broadcast


== Logs ==
  Token A deployed at: 0x0165878A594ca255338adfa4d48449f69242Eb8F
  Token B deployed at: 0xa513E6E4b8f2a923D98304ec87F64353C4D5C853

$ forge script script/DeployLimitOrder.s.sol --rpc-url http://localhost:8545 --broadcast

== Logs ==
  LimitOrderProtocol deployed at: 0x2279B7A0a67DB372996a5FaB50D91eAA73d2eBe6

forge script script/DeployPerpetualAll.s.sol:DeployPerpetualAll --rpc-url http://localhost:8545 --broadcast

== Logs ==

=== Step 1: Deploying MockOracle ===
  MockOracle deployed at: 0x8A791620dd6260079BF849Dc5567aDC3F2FdC318
  Owner: 0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266

=== Step 2: Using existing IndexToken ===
  IndexToken address: 0x0165878A594ca255338adfa4d48449f69242Eb8F

=== Step 3: Setting initial price in oracle ===
  Price set for token: 0x0165878A594ca255338adfa4d48449f69242Eb8F
  Price: 2000 USD
  Verified price from oracle: 2000000000000000000000

=== Step 4: Deploying Perpetual ===
  Perpetual deployed at: 0xB7f8BC63BbcaD18155201308C8f3540b07f84F5e

=== Deployment Summary ===
  MockOracle: 0x8A791620dd6260079BF849Dc5567aDC3F2FdC318
  USDC (mock token): 0xCf7Ed3AccA5a467e9e704C703E8D87F634fB0Fc9
  IndexToken: 0x0165878A594ca255338adfa4d48449f69242Eb8F
  Perpetual: 0xB7f8BC63BbcaD18155201308C8f3540b07f84F5e
  Operator: 0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266
  Initial Price: 2000 USD

=== Next Steps ===
  1. Update your backend .env with:
     PERPETUAL_CONTRACT_ADDRESS= 0xB7f8BC63BbcaD18155201308C8f3540b07f84F5e
     MOCK_ORACLE_ADDRESS= 0x8A791620dd6260079BF849Dc5567aDC3F2FdC318
     INDEX_TOKEN_ADDRESS= 0x0165878A594ca255338adfa4d48449f69242Eb8F
     USDC_ADDRESS= 0xCf7Ed3AccA5a467e9e704C703E8D87F634fB0Fc9

2. Update your frontend .env with:
     VITE_PERPETUAL_CONTRACT_ADDRESS= 0xB7f8BC63BbcaD18155201308C8f3540b07f84F5e
     VITE_USDC_ADDRESS= 0xCf7Ed3AccA5a467e9e704C703E8D87F634fB0Fc9
     VITE_INDEX_TOKEN_ADDRESS= 0x0165878A594ca255338adfa4d48449f69242Eb8F

forge script script/SetOraclePrice.s.sol:SetOraclePrice --rpc-url http://localhost:8545 --broadcast

=== sepolia setup ===

forge create src/P2PTokenEscrow.sol:P2PTokenEscrows --rpc-url https://eth-sepolia.g.alchemy.com/v2/vNiyuieL-QhxDchV_hvLz --private-key b1947c8f155be8012cb65ce74f550959ab9e7fdf9c61867448f2dc970bacb35c --broadcast


Deployer: 0xE639Ae6b4A4479b23E9C2CF87CF224D387bE45a0
Deployed to: 0x27380cE046BB2c1e79E05247aF4E0BEF7aA19be0
Transaction hash: 0xb3abb1a394dfcd5809b1a5dc4ac4d820d9869bdaaeea943e5d7883621e2ab738

$ forge script script/DeployDex.s.sol --rpc-url https://eth-sepolia.g.alchemy.com/v2/vNiyuieL-QhxDchV_hvLz --private-key b1947c8f155be8012cb65ce74f550959ab9e7fdf9c61867448f2dc970bacb35c --broadcast

== Logs ==
  Factory deployed at: 0xA996BD21712870894Ecd412960e14dc1D8796a0f
  Router deployed at: 0xc151622E537699BC33218E60940e0e9070B9b31a


$ forge script script/WhitelistToken.s.sol --rpc-url https://eth-sepolia.g.alchemy.com/v2/vNiyuieL-QhxDchV_hvLz --private-key b1947c8f155be8012cb65ce74f550959ab9e7fdf9c61867448f2dc970bacb35c --broadcast

== Logs ==
  Deployed Mock Token at: 0xEF470c0dC18ae7Ae29C3082f93A3afcA7f8e2e50
  Minted 1,000,000 tokens to: 0xE639Ae6b4A4479b23E9C2CF87CF224D387bE45a0
  Whitelisted token on P2P contract at: 0x27380cE046BB2c1e79E05247aF4E0BEF7aA19be0


$ forge script script/DeployTokens.s.sol --rpc-url https://eth-sepolia.g.alchemy.com/v2/vNiyuieL-QhxDchV_hvLz --private-key b1947c8f155be8012cb65ce74f550959ab9e7fdf9c61867448f2dc970bacb35c --broadcast

== Logs ==
  Token A deployed at: 0xFE19EBa12e134F8334d2A4025DaF9FEB56f1A356
  Token B deployed at: 0x6966Da4F23f1D750636642F45DB594EA3B20930e


$ forge script script/DeployLimitOrder.s.sol --rpc-url https://eth-sepolia.g.alchemy.com/v2/vNiyuieL-QhxDchV_hvLz --private-key b1947c8f155be8012cb65ce74f550959ab9e7fdf9c61867448f2dc970bacb35c --broadcast




------->deploy-perps-new<---------
forge script script/DeployNewPerp.s.sol:DeployNewPerp \
  --rpc-url http://localhost:8545 \
  --broadcast \
  -vvvv

export VAULT_ADDRESS=0x9bd03768a7DCc129555dE410FF8E85528A4F88b5
export USDC_ADDRESS=0x5FbDB2315678afecb367f032d93F642f64180aa3
export SEED_AMOUNT=100000000000  # 100k USDC (6 decimals)

# Run the script 
forge script script/SeedVault.s.sol:SeedVault \
  --rpc-url http://localhost:8545 \
  --broadcast