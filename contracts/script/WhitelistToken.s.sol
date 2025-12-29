// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.13;

import "forge-std/Script.sol";
import "../src/P2PTokenEscrow.sol";
import "@openzeppelin/contracts/mocks/token/ERC20Mock.sol";

contract WhitelistTokenScript is Script {
    function run() external {
        // Use the default Anvil private key (Address: 0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266)
        // or load from env.
        uint256 deployerPrivateKey = vm.envOr("PRIVATE_KEY", uint256(0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80));
        
        vm.startBroadcast(deployerPrivateKey);

        // 1. Deploy Mock Token
        ERC20Mock token = new ERC20Mock();
        console.log("Deployed Mock Token at:", address(token));

        // 2. Mint tokens to the deployer
        token.mint(vm.addr(deployerPrivateKey), 1_000_000 * 10**18);
        console.log("Minted 1,000,000 tokens to:", vm.addr(deployerPrivateKey));

        // 3. Whitelist the token on the P2P contract
        // Address from user's .env: 0x5FbDB2315678afecb367f032d93F642f64180aa3
        address p2pAddress = 0x5FbDB2315678afecb367f032d93F642f64180aa3;
        P2PTokenEscrows p2p = P2PTokenEscrows(p2pAddress);
        
        p2p.setTokenWhitelist(address(token), true);
        console.log("Whitelisted token on P2P contract at:", p2pAddress);

        vm.stopBroadcast();
    }
}
