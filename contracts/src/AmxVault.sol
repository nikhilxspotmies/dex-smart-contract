// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.13;

import "./AmxVaultBase.sol";

/// @notice Production vault: holds native AMX on the Amero X chain and releases it via the
/// shared, guarded release() flow in AmxVaultBase. This is the contract intended to hold real
/// funds. For testnet exercises against an ERC20 mock token, use AmxVaultTestERC20 instead —
/// never point real AMX at that contract.
contract AmxVault is AmxVaultBase {
    event ToppedUp(address indexed from, uint256 amount);

    constructor(
        address admin,
        address pauser,
        address initialExecutor,
        uint256 maxReleasePerTx_,
        uint256 maxReleasePerDay_,
        address treasuryRecoveryAddress_
    )
        AmxVaultBase(admin, pauser, initialExecutor, maxReleasePerTx_, maxReleasePerDay_, treasuryRecoveryAddress_)
    {}

    receive() external payable {
        emit ToppedUp(msg.sender, msg.value);
    }

    function _availableBalance() internal view override returns (uint256) {
        return address(this).balance;
    }

    function _payOut(address to, uint256 amount) internal override {
        (bool ok, ) = to.call{value: amount}("");
        require(ok, "transfer failed");
    }
}
