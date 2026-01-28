
$ forge script script/SetupCopyTrading.s.sol:SetupCopyTrading --broadcast --rpc-url http://127.0.0.1:8545


== Logs ==
  Deploying from: 0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266
  Token A: 0x9fE46736679d2D9a65F0992F2272dE9f3c7fa6e0
  Token B: 0xCf7Ed3AccA5a467e9e704C703E8D87F634fB0Fc9
  Factory: 0xDc64a140Aa3E981100a9becA4E685f962f0cF6C9
  Router: 0x5FC8d32690cc91D4c39d9d3abcBD16989F875707
  Liquidity Added (1 A = 2 B)
  Vault: 0xB7f8BC63BbcaD18155201308C8f3540b07f84F5e
  Whitelisted Tokens A & B
  Whale Set: 0xd5F5175D014F28c85F7D67A111C2c9335D7CD771
  Whale Key: 1193046
  User Set: 0xe170e41B3839b821aA39cB2bfcA804b14826D5de
  User Key: 7901202

=== .env Information ===
  RPC_URL=http://127.0.0.1:8545
  PRIVATE_KEY= 77814517325470205911140941194401928579557062014761831930645393041380819009408
  VAULT_ADDRESS= 0xB7f8BC63BbcaD18155201308C8f3540b07f84F5e
  ROUTER_ADDRESS= 0x5FC8d32690cc91D4c39d9d3abcBD16989F875707
  # Whitelist
  TOKEN_A= 0x9fE46736679d2D9a65F0992F2272dE9f3c7fa6e0
  TOKEN_B= 0xCf7Ed3AccA5a467e9e704C703E8D87F634fB0Fc9
  # Test Accounts keys (add to wallet to test)
  WHALE_KEY= 1193046
  USER_KEY= 7901202
  WHALE_ADDRESS= 0xd5F5175D014F28c85F7D67A111C2c9335D7CD771
  USER_ADDRESS= 0xe170e41B3839b821aA39cB2bfcA804b14826D5de

## Setting up 1 EVM.

==========================

Chain 31337

Estimated gas price: 2.000000001 gwei

Estimated total gas used for script: 11854087

Estimated amount required: 0.023708174011854087 ETH

==========================

##### anvil-hardhat
✅  [Success] Hash: 0x91a61acb197a3597b04f420142179127bfd94f7534dd9f18300e45ba85f9dcfc    
Block: 5
Paid: 0.000033401675860915 ETH (51031 gas * 0.654536965 gwei)

                                                                                          
##### anvil-hardhat                                                                       
✅  [Success] Hash: 0xdbad412a511c2afbbcae108f64913621afcfffaa4318920172786e3057db6917    
Contract Address: 0x5FC8d32690cc91D4c39d9d3abcBD16989F875707                              
Block: 3                                                                                  
Paid: 0.000807370264226512 ETH (1016848 gas * 0.793993069 gwei)                           
                                                                                          

##### anvil-hardhat
✅  [Success] Hash: 0x539282afe1471241f52ba662f4351faa40e8fcf4f953833e401d18301bb423d5    
Block: 4
Paid: 0.00003430214412996 ETH (47591 gas * 0.72076956 gwei)

                                                                                          
##### anvil-hardhat                                                                       
✅  [Success] Hash: 0x2231aa706828fd1ffe04a460f39e338a54a920fc73453702ac98d461e5b0134b    
Contract Address: 0xDc64a140Aa3E981100a9becA4E685f962f0cF6C9                              
Block: 3                                                                                  
Paid: 0.001565946478390698 ETH (1972242 gas * 0.793993069 gwei)                           
                                                                                          
                                                                                          
##### anvil-hardhat                                                                       
✅  [Success] Hash: 0xf5a37a3e138094cab244effb6c2d2377f9421f9aafd8255b9b73ce2178ce700f    
Contract Address: 0xB7f8BC63BbcaD18155201308C8f3540b07f84F5e                              
Block: 4                                                                                  
Paid: 0.00096575769190488 ETH (1339898 gas * 0.72076956 gwei)                             
                                                                                          
                                                                                          
##### anvil-hardhat                                                                       
✅  [Success] Hash: 0xcb3785afaae6a67ea7506b4862e84d3e9d5ad4cc311154e7ab99976db0319972    
Contract Address: 0x9fE46736679d2D9a65F0992F2272dE9f3c7fa6e0                              
Block: 2                                                                                  
Paid: 0.00078870380737281 ETH (876426 gas * 0.899909185 gwei)                             
                                                                                          
                                                                                          
##### anvil-hardhat                                                                       
✅  [Success] Hash: 0xc1720879a1a5cf4971a64af3ced65bd5a3c8038e4febb86647ab36c39fd2dac7    
Block: 4                                                                                  
Paid: 0.00003317558130768 ETH (46028 gas * 0.72076956 gwei)                               
                                                                                          
                                                                                          
##### anvil-hardhat                                                                       
✅  [Success] Hash: 0x94ce1c5c363a7047c38013523b8f2560b9e8a7b816456d00c81febc4245b233f    
Block: 3                                                                                  
Paid: 0.000026940978824239 ETH (33931 gas * 0.793993069 gwei)                             

                                                                                          
##### anvil-hardhat                                                                       
✅  [Success] Hash: 0x85a1dad55090f2cba0646ee87306128b64d372f9bbceb2ab928bcf6ea6df9290    
Contract Address: 0xCf7Ed3AccA5a467e9e704C703E8D87F634fB0Fc9                              
Block: 3
Paid: 0.000695876169491394 ETH (876426 gas * 0.793993069 gwei)

                                                                                          
##### anvil-hardhat                                                                       
✅  [Success] Hash: 0xabefd82f1088571c19291ec285ec0641c03bc8cf204c75e738c034255911cc71    
Block: 3
Paid: 0.000026940978824239 ETH (33931 gas * 0.793993069 gwei)


##### anvil-hardhat
✅  [Success] Hash: 0xbfcb8cfe71ae244a1652b7859b9705ed274c3763b9bdaf825d8dfe69ed02678b    
Block: 4
Paid: 0.00176291873449104 ETH (2445884 gas * 0.72076956 gwei)

                                                                                          
##### anvil-hardhat                                                                       
✅  [Success] Hash: 0x9d5fe835e44944b1e8b5fd1536508fad9a70f96000c109e451e36ae645082f2c    
Block: 4
Paid: 0.00003430214412996 ETH (47591 gas * 0.72076956 gwei)

                                                                                          
##### anvil-hardhat                                                                       
✅  [Success] Hash: 0x8180a56e1f94508f4fab6ec51fc63be7c935ba5de7b47520f7d9c19caa15a3f6    
Block: 5
Paid: 0.000033401675860915 ETH (51031 gas * 0.654536965 gwei)

                                                                                          
##### anvil-hardhat                                                                       
✅  [Success] Hash: 0x3c7b66ff300504d8e337ebc888a77b9e0cb9ac3484fd5d922e746407ec79e61e    
Block: 4
Paid: 0.00003317558130768 ETH (46028 gas * 0.72076956 gwei)

                                                                                          
##### anvil-hardhat                                                                       
✅  [Success] Hash: 0x5b65520364f19984c01591b1cb7f2271a59bfc26491f052abbed0f2ca56c8e72    
Block: 5
Paid: 0.000033401675860915 ETH (51031 gas * 0.654536965 gwei)

✅ Sequence #1 on anvil-hardhat | Total Paid: 0.006875615581983837 ETH (8935917 gas * avg 0.743873519 gwei)                                                                         
                                                                                          
                                                                                          
==========================

ONCHAIN EXECUTION COMPLETE & SUCCESSFUL.

Transactions saved to: D:/clone_git/new dex-backend/dex-smart-contract/contracts/broadcast\SetupCopyTrading.s.sol\31337\run-latest.json

Sensitive values saved to: D:/clone_git/new dex-backend/dex-smart-contract/contracts/cache\SetupCopyTrading.s.sol\31337\run-latest.json


HP@LAPTOP-FMS57AES MINGW64 /d/clone_git/new dex-backend/dex-smart-contract/contracts (main)
$




