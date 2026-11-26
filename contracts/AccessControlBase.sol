// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/*
  file: AccessControlBase.sol
  description: this is the base contract inherited by all three main contracts
  (EscrowCore, MilestoneManager, DisputeResolver). it defines the three user roles
  (CLIENT, FREELANCER, ARBITER) using openzeppelin's accesscontrol standard.
  it also adds a pause mechanism so the admin can freeze the system in an emergency.
  
  inheritance: EscrowCore, MilestoneManager, DisputeResolver all inherit this contract.
  this is meaningful inheritance — shared role logic lives here once, not repeated 3 times.
*/

import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";

abstract contract AccessControlBase is AccessControl, Pausable {

    // role identifiers: keccak256 hash of role name used as role ID
    bytes32 public constant CLIENT_ROLE     = keccak256("CLIENT_ROLE");
    bytes32 public constant FREELANCER_ROLE = keccak256("FREELANCER_ROLE");
    bytes32 public constant ARBITER_ROLE    = keccak256("ARBITER_ROLE");

    // sets deployer as admin and default arbiter when any child contract is deployed
    constructor() {
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _grantRole(ARBITER_ROLE, msg.sender);
    }

    // allows any wallet to self-register as a client (no kyc needed for demo)
    function registerAsClient() external whenNotPaused {
        _grantRole(CLIENT_ROLE, msg.sender);
    }

    // allows any wallet to self-register as a freelancer
    function registerAsFreelancer() external whenNotPaused {
        _grantRole(FREELANCER_ROLE, msg.sender);
    }

    // allows admin to grant arbiter role to a trusted address
    function grantArbiterRole(address account) external onlyRole(DEFAULT_ADMIN_ROLE) {
        _grantRole(ARBITER_ROLE, account);
    }

    // pauses all contract operations — emergency stop — only admin can call
    function pause() external onlyRole(DEFAULT_ADMIN_ROLE) {
        _pause();
    }

    // unpauses contract operations — only admin can call
    function unpause() external onlyRole(DEFAULT_ADMIN_ROLE) {
        _unpause();
    }

    // returns true if the given address has the client role
    function isClient(address account) public view returns (bool) {
        return hasRole(CLIENT_ROLE, account);
    }

    // returns true if the given address has the freelancer role
    function isFreelancer(address account) public view returns (bool) {
        return hasRole(FREELANCER_ROLE, account);
    }

    // returns true if the given address has the arbiter role
    function isArbiter(address account) public view returns (bool) {
        return hasRole(ARBITER_ROLE, account);
    }
}
