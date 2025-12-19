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