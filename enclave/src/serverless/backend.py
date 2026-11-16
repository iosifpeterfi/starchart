"""
StarChart Enclave Backend  (SDK-managed ESR)

Runs inside an Ethernity Cloud TEE enclave. Handles all state mutations for the
StarChart family chore-tracking app.

Persistence is handled by the SDK's Enclave State Registry (``ecld_state``):
the SDK derives the enclave identity/wallet, encrypts the state, computes the
CID in-enclave, publishes the blob and commits the pointer on-chain. This
backend only validates signed intents and transforms plaintext state.

IMPORTANT — ESR state is ENCLAVE-PRIVATE: the client cannot decrypt it. Anything
the UI needs must be RETURNED by a function (see ``execute`` / ``read_family``).
This replaces StarChart's old client-side decrypt: the payload decides what
leaves the enclave.
"""

from __future__ import annotations

import json
import time

from eth_account.messages import encode_defunct
from web3 import Web3

# ─────────────────────────────────────────────────────────────────────
#  Default tasks (same as current StarChart)
# ─────────────────────────────────────────────────────────────────────

DEFAULT_TASKS = [
    {"id": "brush", "name": "Brush teeth", "emoji": "\U0001faa5", "points": 0, "mandatory": True},
    {"id": "dress", "name": "Get dressed", "emoji": "\U0001f455", "points": 0, "mandatory": True},
    {"id": "shoes", "name": "Put shoes away", "emoji": "\U0001f45f", "points": 0, "mandatory": True},
    {"id": "toys", "name": "Clean up toys", "emoji": "\U0001f9f8", "points": 2, "mandatory": False},
    {"id": "table", "name": "Set the table", "emoji": "\U0001f37d️", "points": 2, "mandatory": False},
    {"id": "store", "name": "Help at store", "emoji": "\U0001f6d2", "points": 3, "mandatory": False},
    {"id": "car", "name": "Prep the car", "emoji": "\U0001f697", "points": 2, "mandatory": False},
    {"id": "laundry", "name": "Fold laundry", "emoji": "\U0001f9fa", "points": 3, "mandatory": False},
    {"id": "plants", "name": "Water plants", "emoji": "\U0001fab4", "points": 2, "mandatory": False},
    {"id": "bed", "name": "Make the bed", "emoji": "\U0001f6cf️", "points": 2, "mandatory": False},
    {"id": "fix", "name": "Fix stuff", "emoji": "\U0001f6e0️", "points": 3, "mandatory": False},
    {"id": "garden", "name": "Gardening", "emoji": "\U0001f337", "points": 3, "mandatory": False},
]

# ─────────────────────────────────────────────────────────────────────
#  Intent validation
# ─────────────────────────────────────────────────────────────────────


def recover_signer(intent: dict) -> str:
    """Recover the wallet address that signed this intent (EIP-191).

    The signature covers the JSON-serialized intent without the 'signature' field.
    """
    sig = intent.pop("signature")
    message_text = json.dumps(intent, separators=(",", ":"), sort_keys=True)
    intent["signature"] = sig  # restore

    w3 = Web3()
    message = encode_defunct(text=message_text)
    return w3.eth.account.recover_message(message, signature=sig).lower()


def validate_membership(state: dict, signer: str) -> None:
    members = state.get("members", [])
    if signer.lower() not in [m.lower() for m in members]:
        raise PermissionError(f"Signer {signer} is not a family member")


def validate_owner(state: dict, signer: str) -> None:
    if signer.lower() != state.get("owner", "").lower():
        raise PermissionError(f"Signer {signer} is not the family owner")


# ─────────────────────────────────────────────────────────────────────
#  State mutations   (mutate_fn contract: receives current state -> returns new)
#  NOTE: under SDK-managed ESR, an unwritten key yields {} (not None).
# ─────────────────────────────────────────────────────────────────────


def create_family(state: dict, intent: dict, signer: str) -> dict:
    """Create a new family. State must be empty (never written)."""
    if state:  # non-empty dict => family already exists
        raise ValueError("Family already exists")

    return {
        "owner": signer,
        "members": [signer],
        "tasks": [t.copy() for t in DEFAULT_TASKS],
        "days": {},
        "withdrawals": [],
        "created_at": int(time.time()),
    }


def complete_chore(state: dict, intent: dict, signer: str) -> dict:
    validate_membership(state, signer)
    date = intent["date"]  # "YYYY-MM-DD"
    chore_id = intent["chore_id"]
    task_ids = {t["id"] for t in state.get("tasks", [])}
    if chore_id not in task_ids:
        raise ValueError(f"Unknown chore: {chore_id}")
    state.setdefault("days", {})
    state["days"].setdefault(date, {})
    state["days"][date][chore_id] = True
    return state


def uncomplete_chore(state: dict, intent: dict, signer: str) -> dict:
    validate_membership(state, signer)
    date = intent["date"]
    chore_id = intent["chore_id"]
    if date in state.get("days", {}) and chore_id in state["days"][date]:
        state["days"][date][chore_id] = False
    return state


def add_task(state: dict, intent: dict, signer: str) -> dict:
    validate_membership(state, signer)
    task = intent["task"]
    required_fields = {"id", "name", "emoji", "points", "mandatory"}
    if not required_fields.issubset(task.keys()):
        raise ValueError(f"Task missing fields: {required_fields - task.keys()}")
    existing_ids = {t["id"] for t in state.get("tasks", [])}
    if task["id"] in existing_ids:
        raise ValueError(f"Task ID already exists: {task['id']}")
    state.setdefault("tasks", []).append(task)
    return state


def remove_task(state: dict, intent: dict, signer: str) -> dict:
    validate_membership(state, signer)
    task_id = intent["task_id"]
    state["tasks"] = [t for t in state.get("tasks", []) if t["id"] != task_id]
    return state


def withdraw(state: dict, intent: dict, signer: str) -> dict:
    validate_membership(state, signer)
    state.setdefault("withdrawals", []).append({
        "points": intent["points"],
        "euros": intent["euros"],
        "date": intent["date"],
        "timestamp": int(time.time()),
        "by": signer,
    })
    return state


def invite_member(state: dict, intent: dict, signer: str) -> dict:
    validate_owner(state, signer)
    wallet = intent["wallet"].lower()
    members = state.get("members", [])
    if wallet in [m.lower() for m in members]:
        raise ValueError("Already a member")
    members.append(wallet)
    state["members"] = members
    return state


def remove_member(state: dict, intent: dict, signer: str) -> dict:
    validate_owner(state, signer)
    wallet = intent["wallet"].lower()
    if wallet == signer.lower():
        raise ValueError("Cannot remove yourself")
    state["members"] = [m for m in state.get("members", []) if m.lower() != wallet]
    return state


# ─────────────────────────────────────────────────────────────────────
#  Action dispatch
# ─────────────────────────────────────────────────────────────────────

ACTIONS = {
    "create_family": create_family,
    "complete_chore": complete_chore,
    "uncomplete_chore": uncomplete_chore,
    "add_task": add_task,
    "remove_task": remove_task,
    "withdraw": withdraw,
    "invite_member": invite_member,
    "remove_member": remove_member,
}


# ─────────────────────────────────────────────────────────────────────
#  Entry points — called by the Ethernity Cloud task runner
# ─────────────────────────────────────────────────────────────────────


def execute(family_id: str, intent_json: str) -> dict:
    """Process a signed intent against a family's state (read-modify-write).

    `family_id` is the ESR key. `commit` re-reads and retries on version
    conflict, so concurrent tasks never lose updates. Returns the new state
    (the family's own data) so the caller can render without decrypting.
    """
    from ecld_state import StateRegistry

    intent = json.loads(intent_json)
    action = intent.get("action")
    if action not in ACTIONS:
        raise ValueError(f"Unknown action: {action}")

    signer = recover_signer(intent)
    action_fn = ACTIONS[action]

    state = StateRegistry()
    # Exactly-once: when the client pins `esr_nonce` (last accepted + 1), a
    # resubmit of the same intent (client retry / double-tap) is rejected with
    # task code 36 (ESR_NONCE_VIOLATION), state untouched. Omitting it keeps the
    # legacy behavior. Nonce must be STRICTLY GREATER than the last accepted.
    esr_nonce = intent.get("esr_nonce")

    if action in ("invite_member", "remove_member"):
        # Member management changes BOTH the family's data (the members list)
        # AND the ESR key's ACL (so an invited wallet can actually read/commit
        # under its own attested caller). These MUST land in a SINGLE commit.
        #
        # Under the node-relay model the on-chain CID is updated ASYNCHRONOUSLY:
        # a commit overwrites the state blob in the bucket immediately but the
        # chain pointer only advances once the node relays it. So a SECOND commit
        # in the same task (the old `state.commit()` + `esr_grant()` sequence)
        # re-reads the STALE chain CID against the already-overwritten blob and
        # fails the integrity check ("State object ... does not match the
        # committed CID ... refusing to use it"). One atomic (acl, data) commit
        # avoids the intra-task double write entirely.
        import ecld_state as _es
        grant = action == "invite_member"
        wallet_addr = _es._norm_addr(intent["wallet"])
        if not wallet_addr:
            raise ValueError("a member wallet address is required")

        def _member_commit(acl, data, version):
            caller = _es._task_caller
            # First writer owns; otherwise this is an owner-only operation.
            if acl is None:
                if caller is None:
                    raise PermissionError(
                        "member management requires an authenticated caller")
                acl = _es._new_acl(caller)
            if caller is None or _es._norm_addr(acl.get("owner")) != caller:
                raise PermissionError(
                    "only the family owner can add or remove members")
            # Defense in depth: the EIP-191 signer must also be the family owner.
            validate_owner(data, signer)

            wallet_lower = intent["wallet"].lower()
            data = dict(data)
            members = list(data.get("members", []))
            if grant:
                # IDEMPOTENT: adding an existing member is a no-op, not an error,
                # so a re-invite REPAIRS a member who was added before this fix
                # but never got their ACL grant (the old two-commit path).
                if wallet_lower not in [m.lower() for m in members]:
                    members.append(wallet_lower)
            else:
                if wallet_lower == signer.lower():
                    raise ValueError("Cannot remove yourself")
                members = [m for m in members if m.lower() != wallet_lower]
            data["members"] = members

            acl = dict(acl)
            # Grant/revoke BOTH read and write so an invited wallet has full
            # access to the family key; keep the ACL in sync with membership.
            for level in ("read", "write"):
                acl_set = {a for a in (_es._norm_addr(x)
                                       for x in (acl.get(level) or [])) if a}
                if grant:
                    acl_set.add(wallet_addr)
                else:
                    acl_set.discard(wallet_addr)
                acl[level] = sorted(acl_set)
            return acl, data

        new_state = state._commit_transform(
            family_id, _member_commit, nonce=esr_nonce)[1]
    else:
        new_state = state.commit(
            family_id,
            lambda current: action_fn(current, intent, signer),
            nonce=esr_nonce,
        )

    return {
        "status": "ok",
        "action": action,
        "family_id": family_id,
        "version": state.get_version(family_id),
        "nonce": state.get_nonce(family_id),
        "enclave_address": state.enclave_address,
        "signer": signer,
        "state": new_state,
    }


def read_family(family_id: str, intent_json: str) -> dict:
    """Return a family's state to an authenticated member.

    Replaces StarChart's old client-side decrypt: the client can no longer read
    the encrypted blob, so it asks the enclave, which returns the plaintext only
    after verifying the (signed) caller is a member.
    """
    from ecld_state import StateRegistry

    intent = json.loads(intent_json)
    signer = recover_signer(intent)

    state = StateRegistry()
    current = state.get(family_id)
    if not current:
        return {"status": "empty", "family_id": family_id, "version": 0, "state": {}}

    validate_membership(current, signer)
    return {
        "status": "ok",
        "family_id": family_id,
        "version": state.get_version(family_id),
        "nonce": state.get_nonce(family_id),
        "enclave_address": state.enclave_address,
        "state": current,
    }


# ─────────────────────────────────────────────────────────────────────
#  Interactive session entry point (ESR sessions)
#
#  A live session keeps ONE enclave order running and streams many signed
#  intents to it (~10-20s round-trip each) instead of paying for a full task
#  per action. The SDK's session executor delivers every streamed input to the
#  module-level handler ``___etny_on_input___`` (kept alive across messages via
#  the persistent session globals), so the same running enclave serves a whole
#  burst of family actions.
#
#  This is purely a TRANSPORT optimization: each input is routed to the exact
#  same ESR-backed one-shot handlers (``execute`` / ``read_family``), so every
#  security property is preserved unchanged — per-intent EIP-191 signature
#  verification, per-key ACL, and exactly-once ``esr_nonce`` commits. State
#  stays durable in the registry between sessions; the session only removes the
#  per-action task overhead.
#
#  Each input is a JSON envelope:
#      {"op": "execute" | "read",
#       "family_id": "<esr key>",
#       "intent": { ...signed intent, same shape as a one-shot... }}
#
#  The handler NEVER raises: a session must survive a bad message and keep
#  serving the next one, so application/validation failures (bad signature,
#  duplicate nonce, permission, etc.) come back as a structured error object
#  (with ``error_type`` so the client can tell e.g. a duplicate-nonce replay
#  apart from a real failure) rather than tearing down the session.
# ─────────────────────────────────────────────────────────────────────

SESSION_WIRE_VERSION = "v1"


def ___etny_on_input___(data):
    """Route one streamed session input to the ESR-backed intent handlers."""
    try:
        env = json.loads(data) if isinstance(data, (str, bytes)) else data
    except Exception as e:
        return {"session": SESSION_WIRE_VERSION, "status": "error",
                "error_type": "BadEnvelope", "error": f"input is not JSON: {e}"}

    if not isinstance(env, dict):
        return {"session": SESSION_WIRE_VERSION, "status": "error",
                "error_type": "BadEnvelope", "error": "envelope must be a JSON object"}

    op = str(env.get("op") or "execute").lower()
    family_id = env.get("family_id")
    intent = env.get("intent")
    if not family_id or intent is None:
        return {"session": SESSION_WIRE_VERSION, "status": "error",
                "error_type": "BadEnvelope",
                "error": "envelope needs 'family_id' and 'intent'"}

    # execute()/read_family() take the intent as a JSON string and re-canonicalize
    # it internally (recover_signer re-serializes sort_keys=True), so the exact
    # serialization here does not affect signature recovery.
    intent_json = json.dumps(intent, separators=(",", ":"))
    try:
        if op == "migrate":
            old_enclave = env.get("old_enclave", "")
            bound = env.get("bound", "0")
            result = migrate_state(family_id, old_enclave, bound)
        elif op == "read":
            result = read_family(family_id, intent_json)
        else:
            result = execute(family_id, intent_json)
        if isinstance(result, dict):
            result.setdefault("session", SESSION_WIRE_VERSION)
        return result
    except Exception as e:
        return {"session": SESSION_WIRE_VERSION, "status": "error", "op": op,
                "family_id": family_id, "error_type": type(e).__name__,
                "error": str(e)}


# ─────────────────────────────────────────────────────────────────────
#  ESR verification harness (adapted from SDK examples/esr-counter)
#  Gas-free selftest first: if it fails the enclave build is wrong; if only
#  the write path (esr_increment) fails it's funding or the chain.
# ─────────────────────────────────────────────────────────────────────


def migrate_state(family_id: str, old_enclave: str, bound: str) -> dict:
    """Migrate a family's state from a previous enclave version to the current one.

    Uses the ESR fence mechanism: reads the old enclave's state as of `bound`
    (a block number) and re-commits it under the current enclave's identity.
    The caller must be the task payer (authenticated via task_caller).

    Args:
        family_id:   The ESR key to migrate
        old_enclave: The old enclave's ESR wallet address (e.g. "0x793305cf...")
        bound:       Block number at which to read the old state (string or int)

    Returns:
        Migration result with old/new enclave addresses and the migrated state.
    """
    from ecld_state import StateRegistry

    state = StateRegistry()
    bound_int = int(bound)

    ledger = state.fence(bound_int)

    if not ledger:
        old_state = state.get(family_id)
        if old_state:
            return {
                "status": "ok",
                "action": "migrate_state",
                "family_id": family_id,
                "message": "Key already exists under current enclave — no migration needed",
                "enclave_address": state.enclave_address,
                "version": state.get_version(family_id),
                "state": old_state,
            }
        return {
            "status": "error",
            "action": "migrate_state",
            "family_id": family_id,
            "message": f"No writable keys found at block {bound_int}",
            "enclave_address": state.enclave_address,
            "old_enclave": old_enclave,
        }

    migrated_keys = [entry for entry in ledger]
    current_state = state.get(family_id)

    return {
        "status": "ok",
        "action": "migrate_state",
        "family_id": family_id,
        "enclave_address": state.enclave_address,
        "old_enclave": old_enclave,
        "bound": bound_int,
        "migrated_keys": len(migrated_keys),
        "version": state.get_version(family_id),
        "state": current_state,
    }


def esr_address():
    """The enclave's ESR wallet address. Fund this to let it commit."""
    from ecld_state import StateRegistry

    return {"wallet": StateRegistry().wallet_address}


def esr_selftest():
    """Gas-free checks: module wired, wallet derives, encryption round-trips,
    and the in-enclave CID matches what IPFS would produce for the same bytes."""
    import ecld_state
    from ecld_state import StateRegistry

    results = {}
    try:
        results["wallet"] = StateRegistry().wallet_address
    except Exception as e:
        results["wallet_error"] = str(e)
    try:
        blob = ecld_state._encrypt(json.dumps({"probe": 1}).encode())
        results["encrypt_roundtrip"] = json.loads(ecld_state._decrypt(blob).decode()) == {"probe": 1}
        results["cid_of_blob"] = ecld_state.cidv1_raw(blob)
    except Exception as e:
        results["crypto_error"] = str(e)
    results["cid_known_vector_ok"] = (
        ecld_state.cidv1_raw(b"hello-esr\n")
        == "bafkreiadxa2sf2hlf3r4qchmh4g5vtpcx6i7smlh4po4yplefbpbcyf23m"
    )
    return results


def esr_increment(key="e2e-counter"):
    """Increment a counter in encrypted state; run twice to prove persistence."""
    from ecld_state import StateRegistry

    state = StateRegistry()
    before = state.get(key)
    after = state.commit(key, lambda s: {**s, "n": s.get("n", 0) + 1})
    return {"wallet": state.wallet_address, "key": key, "before": before,
            "after": after, "version": state.get_version(key)}


def esr_read(key="e2e-counter"):
    """Read without writing. {} means nothing committed yet."""
    from ecld_state import StateRegistry

    state = StateRegistry()
    return {"key": key, "state": state.get(key), "version": state.get_version(key),
            "nonce": state.get_nonce(key), "enclave_address": state.enclave_address}


def esr_increment_once(n, key="e2e-once"):
    """Exactly-once increment: commit with idempotency nonce `n`. Run twice with
    the same n -- the second raises StateNonceError -> task code 36. Proves the
    node-relay + nonce guard end to end (mirrors the SDK esrIncrementOnce demo)."""
    from ecld_state import StateRegistry

    state = StateRegistry()
    before = state.get(key)
    after = state.commit(key, lambda s: {**s, "n": s.get("n", 0) + 1}, nonce=int(n))
    return {"enclave_address": state.enclave_address, "key": key, "before": before,
            "after": after, "version": state.get_version(key),
            "nonce": state.get_nonce(key)}
