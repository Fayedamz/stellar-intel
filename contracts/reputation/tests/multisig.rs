//! Tests for two-step admin transfer and multisig governance (#829).
//!
//! The contract stores a single `Address` as admin. That address may be a
//! Stellar multisig account; `require_auth()` delegates threshold checks to
//! the host. These tests verify the propose/accept/cancel handoff flow using
//! the Soroban test environment's mock-auth helpers.

use reputation::{ReputationContract, ReputationContractClient};
use soroban_sdk::{testutils::Address as _, Address, Env};

fn setup(env: &Env) -> (ReputationContractClient<'_>, Address) {
    let contract_id = env.register(ReputationContract, ());
    let client = ReputationContractClient::new(env, &contract_id);
    let admin = Address::generate(env);
    env.mock_all_auths();
    client.init(&admin);
    (client, admin)
}

// ─── propose_admin ────────────────────────────────────────────────────────────

#[test]
fn propose_admin_stores_pending_candidate() {
    let env = Env::default();
    let (client, admin) = setup(&env);
    let candidate = Address::generate(&env);

    env.mock_all_auths();
    client.propose_admin(&admin, &candidate);

    assert_eq!(client.pending_admin(), Some(candidate));
}

#[test]
fn propose_admin_requires_current_admin() {
    let env = Env::default();
    let (client, _admin) = setup(&env);
    let interloper = Address::generate(&env);
    let candidate = Address::generate(&env);

    env.mock_all_auths();
    let res = client.try_propose_admin(&interloper, &candidate);
    assert!(res.is_err());
}

#[test]
fn second_proposal_replaces_first_candidate() {
    let env = Env::default();
    let (client, admin) = setup(&env);
    let first = Address::generate(&env);
    let second = Address::generate(&env);

    env.mock_all_auths();
    client.propose_admin(&admin, &first);
    client.propose_admin(&admin, &second);

    assert_eq!(client.pending_admin(), Some(second));
}

// ─── accept_admin ─────────────────────────────────────────────────────────────

#[test]
fn accept_admin_transfers_authority() {
    let env = Env::default();
    let (client, admin) = setup(&env);
    let candidate = Address::generate(&env);

    env.mock_all_auths();
    client.propose_admin(&admin, &candidate);
    client.accept_admin(&candidate);

    assert_eq!(client.admin(), Some(candidate.clone()));
    assert_eq!(client.pending_admin(), None);

    // Old admin can no longer perform admin actions
    let anchor = soroban_sdk::String::from_str(&env, "test-anchor");
    let res = client.try_register_anchor(&admin, &anchor);
    assert!(res.is_err());

    // New admin can
    let res2 = client.try_register_anchor(&candidate, &anchor);
    assert!(res2.is_ok());
}

#[test]
fn accept_admin_requires_matching_candidate() {
    let env = Env::default();
    let (client, admin) = setup(&env);
    let candidate = Address::generate(&env);
    let wrong = Address::generate(&env);

    env.mock_all_auths();
    client.propose_admin(&admin, &candidate);

    let res = client.try_accept_admin(&wrong);
    assert!(res.is_err());
    // Admin unchanged
    assert_eq!(client.admin(), Some(admin));
}

#[test]
fn accept_admin_fails_with_no_proposal() {
    let env = Env::default();
    let (client, _admin) = setup(&env);
    let anyone = Address::generate(&env);

    env.mock_all_auths();
    let res = client.try_accept_admin(&anyone);
    assert!(res.is_err());
}

// ─── cancel_admin_proposal ────────────────────────────────────────────────────

#[test]
fn cancel_clears_pending_admin() {
    let env = Env::default();
    let (client, admin) = setup(&env);
    let candidate = Address::generate(&env);

    env.mock_all_auths();
    client.propose_admin(&admin, &candidate);
    assert!(client.pending_admin().is_some());

    client.cancel_admin_proposal(&admin);
    assert_eq!(client.pending_admin(), None);
}

#[test]
fn cancel_requires_current_admin() {
    let env = Env::default();
    let (client, admin) = setup(&env);
    let candidate = Address::generate(&env);
    let interloper = Address::generate(&env);

    env.mock_all_auths();
    client.propose_admin(&admin, &candidate);

    let res = client.try_cancel_admin_proposal(&interloper);
    assert!(res.is_err());
    // Proposal still live
    assert!(client.pending_admin().is_some());
}

#[test]
fn cancel_is_noop_with_no_pending_proposal() {
    let env = Env::default();
    let (client, admin) = setup(&env);

    env.mock_all_auths();
    // No proposal exists — should succeed without error
    let res = client.try_cancel_admin_proposal(&admin);
    assert!(res.is_ok());
    assert_eq!(client.pending_admin(), None);
}
