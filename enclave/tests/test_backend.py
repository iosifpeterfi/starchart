"""
Tests for the StarChart enclave backend.

Tests all state mutations (create family, complete chores, add/remove tasks,
withdrawals, member management) with proper intent signing and validation.

Uses a MockEnclaveState that simulates the ESR in-memory, so no blockchain
or IPFS needed.
"""

import json
import os
import sys
import time
import unittest

# Add paths
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "..", "sdk-contrib"))
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src", "serverless"))

from eth_account import Account
from eth_account.messages import encode_defunct
from web3 import Web3


# ─────────────────────────────────────────────────────────────────────
#  Mock ESR (in-memory, no blockchain)
# ─────────────────────────────────────────────────────────────────────


class MockEnclaveState:
    """In-memory mock of EnclaveState for testing without blockchain/IPFS."""

    def __init__(self):
        self._store: dict[str, dict] = {}  # key_hex → data
        self._versions: dict[str, int] = {}  # key_hex → version

    def get(self, key: bytes):
        key_hex = key.hex()
        if key_hex not in self._store:
            self._versions[key_hex] = 0
            return None
        self._versions[key_hex] = self._versions.get(key_hex, 0)
        return json.loads(json.dumps(self._store[key_hex]))  # deep copy

    def put(self, key: bytes, data: dict) -> str:
        key_hex = key.hex()
        self._store[key_hex] = data
        self._versions[key_hex] = self._versions.get(key_hex, 0) + 1
        return f"Qm_mock_{key_hex[:8]}_{self._versions[key_hex]}"

    def apply(self, key: bytes, mutate_fn, max_retries=3) -> str:
        current = self.get(key)
        new_state = mutate_fn(current)
        return self.put(key, new_state)

    def get_version(self, key: bytes) -> int:
        return self._versions.get(key.hex(), 0)

    def exists(self, key: bytes) -> bool:
        return key.hex() in self._store


# ─────────────────────────────────────────────────────────────────────
#  Helpers
# ─────────────────────────────────────────────────────────────────────


def make_wallet():
    """Create a random test wallet."""
    return Account.create()


def sign_intent(private_key, intent: dict) -> dict:
    """Sign an intent dict, matching the backend's expected format."""
    message_text = json.dumps(intent, separators=(",", ":"), sort_keys=True)
    w3 = Web3()
    message = encode_defunct(text=message_text)
    signed = w3.eth.account.sign_message(message, private_key=private_key)
    intent["signature"] = signed.signature.hex()
    return intent


# ─────────────────────────────────────────────────────────────────────
#  Import backend functions with mocked ESR
# ─────────────────────────────────────────────────────────────────────

# We need to test the backend's mutation functions directly
from backend import (
    create_family,
    complete_chore,
    uncomplete_chore,
    add_task,
    remove_task,
    withdraw,
    invite_member,
    remove_member,
    recover_signer,
    validate_membership,
    validate_owner,
    DEFAULT_TASKS,
    ACTIONS,
)


class TestRecoverSigner(unittest.TestCase):
    """Test EIP-191 intent signing and recovery."""

    def test_recover_signer(self):
        """Signer is correctly recovered from a signed intent."""
        wallet = make_wallet()
        intent = sign_intent(wallet.key, {"action": "test", "data": "hello"})
        signer = recover_signer(intent)
        self.assertEqual(signer, wallet.address.lower())

    def test_different_wallets_different_signers(self):
        """Different wallets produce different recovered signers."""
        w1 = make_wallet()
        w2 = make_wallet()
        intent1 = sign_intent(w1.key, {"action": "test"})
        intent2 = sign_intent(w2.key, {"action": "test"})
        self.assertNotEqual(recover_signer(intent1), recover_signer(intent2))

    def test_tampered_intent_wrong_signer(self):
        """Modifying the intent after signing recovers a different signer."""
        wallet = make_wallet()
        intent = sign_intent(wallet.key, {"action": "test", "value": 1})
        # Tamper
        intent["value"] = 2
        recovered = recover_signer(intent)
        self.assertNotEqual(recovered, wallet.address.lower())


class TestCreateFamily(unittest.TestCase):
    """Test family creation."""

    def test_create_new_family(self):
        wallet = make_wallet()
        signer = wallet.address.lower()
        state = create_family(None, {}, signer)

        self.assertEqual(state["owner"], signer)
        self.assertIn(signer, state["members"])
        self.assertEqual(len(state["tasks"]), len(DEFAULT_TASKS))
        self.assertEqual(state["days"], {})
        self.assertEqual(state["withdrawals"], [])
        self.assertIn("created_at", state)

    def test_create_family_already_exists(self):
        wallet = make_wallet()
        signer = wallet.address.lower()
        existing = {"owner": signer, "members": [signer]}

        with self.assertRaises(ValueError) as ctx:
            create_family(existing, {}, signer)
        self.assertIn("already exists", str(ctx.exception))


class TestCompleteChore(unittest.TestCase):
    """Test chore completion."""

    def setUp(self):
        self.wallet = make_wallet()
        self.signer = self.wallet.address.lower()
        self.state = create_family(None, {}, self.signer)

    def test_complete_chore(self):
        result = complete_chore(self.state, {"chore_id": "brush", "date": "2026-05-30"}, self.signer)
        self.assertTrue(result["days"]["2026-05-30"]["brush"])

    def test_complete_multiple_chores_same_day(self):
        state = complete_chore(self.state, {"chore_id": "brush", "date": "2026-05-30"}, self.signer)
        state = complete_chore(state, {"chore_id": "toys", "date": "2026-05-30"}, self.signer)
        self.assertTrue(state["days"]["2026-05-30"]["brush"])
        self.assertTrue(state["days"]["2026-05-30"]["toys"])

    def test_complete_chore_different_days(self):
        state = complete_chore(self.state, {"chore_id": "brush", "date": "2026-05-30"}, self.signer)
        state = complete_chore(state, {"chore_id": "brush", "date": "2026-05-31"}, self.signer)
        self.assertTrue(state["days"]["2026-05-30"]["brush"])
        self.assertTrue(state["days"]["2026-05-31"]["brush"])

    def test_complete_unknown_chore_fails(self):
        with self.assertRaises(ValueError) as ctx:
            complete_chore(self.state, {"chore_id": "nonexistent", "date": "2026-05-30"}, self.signer)
        self.assertIn("Unknown chore", str(ctx.exception))

    def test_complete_chore_non_member_fails(self):
        stranger = make_wallet().address.lower()
        with self.assertRaises(PermissionError):
            complete_chore(self.state, {"chore_id": "brush", "date": "2026-05-30"}, stranger)


class TestUncompleteChore(unittest.TestCase):
    """Test chore un-completion."""

    def setUp(self):
        self.wallet = make_wallet()
        self.signer = self.wallet.address.lower()
        self.state = create_family(None, {}, self.signer)
        self.state = complete_chore(self.state, {"chore_id": "brush", "date": "2026-05-30"}, self.signer)

    def test_uncomplete_chore(self):
        result = uncomplete_chore(self.state, {"chore_id": "brush", "date": "2026-05-30"}, self.signer)
        self.assertFalse(result["days"]["2026-05-30"]["brush"])

    def test_uncomplete_nonexistent_day_no_error(self):
        result = uncomplete_chore(self.state, {"chore_id": "brush", "date": "2099-01-01"}, self.signer)
        # Should not crash, just no-op
        self.assertNotIn("2099-01-01", result.get("days", {}))

    def test_uncomplete_non_member_fails(self):
        stranger = make_wallet().address.lower()
        with self.assertRaises(PermissionError):
            uncomplete_chore(self.state, {"chore_id": "brush", "date": "2026-05-30"}, stranger)


class TestAddTask(unittest.TestCase):
    """Test adding custom tasks."""

    def setUp(self):
        self.wallet = make_wallet()
        self.signer = self.wallet.address.lower()
        self.state = create_family(None, {}, self.signer)

    def test_add_task(self):
        task = {"id": "custom_1", "name": "Feed cat", "emoji": "\U0001f431", "points": 3, "mandatory": False}
        result = add_task(self.state, {"task": task}, self.signer)
        task_ids = {t["id"] for t in result["tasks"]}
        self.assertIn("custom_1", task_ids)
        self.assertEqual(len(result["tasks"]), len(DEFAULT_TASKS) + 1)

    def test_add_duplicate_task_fails(self):
        task = {"id": "brush", "name": "Duplicate", "emoji": "X", "points": 0, "mandatory": True}
        with self.assertRaises(ValueError) as ctx:
            add_task(self.state, {"task": task}, self.signer)
        self.assertIn("already exists", str(ctx.exception))

    def test_add_task_missing_fields_fails(self):
        task = {"id": "incomplete", "name": "Missing stuff"}
        with self.assertRaises(ValueError) as ctx:
            add_task(self.state, {"task": task}, self.signer)
        self.assertIn("missing fields", str(ctx.exception).lower())

    def test_add_task_non_member_fails(self):
        stranger = make_wallet().address.lower()
        task = {"id": "x", "name": "X", "emoji": "X", "points": 1, "mandatory": False}
        with self.assertRaises(PermissionError):
            add_task(self.state, {"task": task}, stranger)


class TestRemoveTask(unittest.TestCase):
    """Test removing tasks."""

    def setUp(self):
        self.wallet = make_wallet()
        self.signer = self.wallet.address.lower()
        self.state = create_family(None, {}, self.signer)

    def test_remove_task(self):
        result = remove_task(self.state, {"task_id": "brush"}, self.signer)
        task_ids = {t["id"] for t in result["tasks"]}
        self.assertNotIn("brush", task_ids)
        self.assertEqual(len(result["tasks"]), len(DEFAULT_TASKS) - 1)

    def test_remove_nonexistent_task_no_error(self):
        initial_count = len(self.state["tasks"])
        result = remove_task(self.state, {"task_id": "nonexistent"}, self.signer)
        self.assertEqual(len(result["tasks"]), initial_count)

    def test_remove_task_non_member_fails(self):
        stranger = make_wallet().address.lower()
        with self.assertRaises(PermissionError):
            remove_task(self.state, {"task_id": "brush"}, stranger)


class TestWithdraw(unittest.TestCase):
    """Test star withdrawals."""

    def setUp(self):
        self.wallet = make_wallet()
        self.signer = self.wallet.address.lower()
        self.state = create_family(None, {}, self.signer)

    def _earn_points(self, state, points_needed):
        """Complete enough optional chores across multiple days to earn at least points_needed."""
        chores = [("store", 3), ("laundry", 3), ("toys", 2), ("bed", 2),
                  ("table", 2), ("car", 2), ("plants", 2), ("fix", 3), ("garden", 3)]
        earned = 0
        day = 1
        while earned < points_needed:
            for chore_id, pts in chores:
                if earned >= points_needed:
                    break
                date = f"2026-06-{day:02d}"
                state = complete_chore(state, {"chore_id": chore_id, "date": date}, self.signer)
                earned += pts
            day += 1
        return state

    def test_withdraw(self):
        state = self._earn_points(self.state, 10)
        result = withdraw(
            state,
            {"points": 10, "euros": 1.0, "date": "2026-05-30"},
            self.signer,
        )
        self.assertEqual(len(result["withdrawals"]), 1)
        w = result["withdrawals"][0]
        self.assertEqual(w["points"], 10)
        self.assertEqual(w["euros"], 1.0)
        self.assertEqual(w["by"], self.signer)
        self.assertIn("timestamp", w)

    def test_multiple_withdrawals(self):
        state = self._earn_points(self.state, 30)
        state = withdraw(state, {"points": 10, "euros": 1.0, "date": "2026-05-30"}, self.signer)
        state = withdraw(state, {"points": 20, "euros": 2.0, "date": "2026-05-31"}, self.signer)
        self.assertEqual(len(state["withdrawals"]), 2)

    def test_withdraw_insufficient_balance(self):
        with self.assertRaises(ValueError) as ctx:
            withdraw(self.state, {"points": 10, "euros": 1.0, "date": "2026-05-30"}, self.signer)
        self.assertIn("Insufficient balance", str(ctx.exception))

    def test_withdraw_non_member_fails(self):
        stranger = make_wallet().address.lower()
        with self.assertRaises(PermissionError):
            withdraw(self.state, {"points": 10, "euros": 1.0, "date": "2026-05-30"}, stranger)


class TestInviteMember(unittest.TestCase):
    """Test member invitation (owner only)."""

    def setUp(self):
        self.owner = make_wallet()
        self.owner_addr = self.owner.address.lower()
        self.state = create_family(None, {}, self.owner_addr)

    def test_invite_member(self):
        new_member = make_wallet().address.lower()
        result = invite_member(self.state, {"wallet": new_member}, self.owner_addr)
        self.assertIn(new_member, result["members"])
        self.assertEqual(len(result["members"]), 2)

    def test_invite_duplicate_fails(self):
        with self.assertRaises(ValueError) as ctx:
            invite_member(self.state, {"wallet": self.owner_addr}, self.owner_addr)
        self.assertIn("Already a member", str(ctx.exception))

    def test_invite_by_non_owner_fails(self):
        member = make_wallet()
        member_addr = member.address.lower()
        # Add member first
        state = invite_member(self.state, {"wallet": member_addr}, self.owner_addr)
        # Member tries to invite — should fail
        new_member = make_wallet().address.lower()
        with self.assertRaises(PermissionError):
            invite_member(state, {"wallet": new_member}, member_addr)

    def test_invite_case_insensitive(self):
        new_member = make_wallet().address  # mixed case checksum
        result = invite_member(self.state, {"wallet": new_member}, self.owner_addr)
        self.assertIn(new_member.lower(), result["members"])


class TestRemoveMember(unittest.TestCase):
    """Test member removal (owner only)."""

    def setUp(self):
        self.owner = make_wallet()
        self.owner_addr = self.owner.address.lower()
        self.member = make_wallet()
        self.member_addr = self.member.address.lower()
        self.state = create_family(None, {}, self.owner_addr)
        self.state = invite_member(self.state, {"wallet": self.member_addr}, self.owner_addr)

    def test_remove_member(self):
        result = remove_member(self.state, {"wallet": self.member_addr}, self.owner_addr)
        self.assertNotIn(self.member_addr, result["members"])
        self.assertEqual(len(result["members"]), 1)

    def test_remove_self_fails(self):
        with self.assertRaises(ValueError) as ctx:
            remove_member(self.state, {"wallet": self.owner_addr}, self.owner_addr)
        self.assertIn("Cannot remove yourself", str(ctx.exception))

    def test_remove_by_non_owner_fails(self):
        another = make_wallet().address.lower()
        state = invite_member(self.state, {"wallet": another}, self.owner_addr)
        with self.assertRaises(PermissionError):
            remove_member(state, {"wallet": another}, self.member_addr)


class TestMembershipValidation(unittest.TestCase):
    """Test membership and ownership validation."""

    def test_validate_membership_passes(self):
        signer = "0xabc"
        state = {"members": ["0xabc", "0xdef"]}
        validate_membership(state, signer)  # should not raise

    def test_validate_membership_fails(self):
        state = {"members": ["0xabc"]}
        with self.assertRaises(PermissionError):
            validate_membership(state, "0x999")

    def test_validate_membership_case_insensitive(self):
        state = {"members": ["0xAbC"]}
        validate_membership(state, "0xabc")  # should not raise

    def test_validate_owner_passes(self):
        state = {"owner": "0xabc"}
        validate_owner(state, "0xabc")  # should not raise

    def test_validate_owner_fails(self):
        state = {"owner": "0xabc"}
        with self.assertRaises(PermissionError):
            validate_owner(state, "0xdef")


class TestActionDispatch(unittest.TestCase):
    """Test that all expected actions are registered."""

    def test_all_actions_registered(self):
        expected = {
            "create_family",
            "complete_chore",
            "uncomplete_chore",
            "add_task",
            "remove_task",
            "withdraw",
            "invite_member",
            "remove_member",
        }
        self.assertEqual(set(ACTIONS.keys()), expected)

    def test_all_actions_are_callable(self):
        for name, fn in ACTIONS.items():
            self.assertTrue(callable(fn), f"{name} is not callable")


class TestEndToEnd(unittest.TestCase):
    """End-to-end test simulating a full family lifecycle."""

    def test_full_lifecycle(self):
        """Create family → add member → complete chores → withdraw → remove member."""
        owner = make_wallet()
        child = make_wallet()
        owner_addr = owner.address.lower()
        child_addr = child.address.lower()

        # 1. Create family
        state = create_family(None, {}, owner_addr)
        self.assertEqual(len(state["members"]), 1)

        # 2. Invite child
        state = invite_member(state, {"wallet": child_addr}, owner_addr)
        self.assertEqual(len(state["members"]), 2)

        # 3. Child completes mandatory chores
        for chore_id in ["brush", "dress", "shoes"]:
            state = complete_chore(state, {"chore_id": chore_id, "date": "2026-05-30"}, child_addr)

        # 4. Child completes optional chores (earns stars)
        state = complete_chore(state, {"chore_id": "toys", "date": "2026-05-30"}, child_addr)
        state = complete_chore(state, {"chore_id": "bed", "date": "2026-05-30"}, child_addr)

        # Verify day data
        day = state["days"]["2026-05-30"]
        self.assertTrue(day["brush"])
        self.assertTrue(day["toys"])
        self.assertTrue(day["bed"])

        # 5. Add a custom task
        custom = {"id": "homework", "name": "Do homework", "emoji": "\U0001f4da", "points": 5, "mandatory": False}
        state = add_task(state, {"task": custom}, owner_addr)
        self.assertEqual(len(state["tasks"]), len(DEFAULT_TASKS) + 1)

        # 6. Child completes custom task
        state = complete_chore(state, {"chore_id": "homework", "date": "2026-05-30"}, child_addr)
        self.assertTrue(state["days"]["2026-05-30"]["homework"])

        # 7. Withdraw stars (earned: toys=2 + bed=2 + homework=5 = 9)
        state = withdraw(state, {"points": 9, "euros": 0.9, "date": "2026-05-30"}, owner_addr)
        self.assertEqual(len(state["withdrawals"]), 1)

        # 8. Uncomplete a chore (mistake)
        state = uncomplete_chore(state, {"chore_id": "bed", "date": "2026-05-30"}, child_addr)
        self.assertFalse(state["days"]["2026-05-30"]["bed"])

        # 9. Remove custom task
        state = remove_task(state, {"task_id": "homework"}, owner_addr)
        self.assertEqual(len(state["tasks"]), len(DEFAULT_TASKS))

        # 10. Remove child
        state = remove_member(state, {"wallet": child_addr}, owner_addr)
        self.assertEqual(len(state["members"]), 1)
        self.assertNotIn(child_addr, state["members"])

        # 11. Verify child can no longer act
        with self.assertRaises(PermissionError):
            complete_chore(state, {"chore_id": "brush", "date": "2026-05-31"}, child_addr)

    def test_multi_day_history(self):
        """Simulate a week of chore tracking."""
        owner = make_wallet()
        owner_addr = owner.address.lower()
        state = create_family(None, {}, owner_addr)

        dates = [f"2026-05-{d:02d}" for d in range(24, 31)]
        chores = ["brush", "dress", "toys"]

        for date in dates:
            for chore in chores:
                state = complete_chore(state, {"chore_id": chore, "date": date}, owner_addr)

        # Verify all days recorded
        self.assertEqual(len(state["days"]), 7)
        for date in dates:
            for chore in chores:
                self.assertTrue(state["days"][date][chore])

    def test_concurrent_members_different_chores(self):
        """Two members completing different chores on the same day."""
        owner = make_wallet()
        member = make_wallet()
        owner_addr = owner.address.lower()
        member_addr = member.address.lower()

        state = create_family(None, {}, owner_addr)
        state = invite_member(state, {"wallet": member_addr}, owner_addr)

        # Owner completes some chores
        state = complete_chore(state, {"chore_id": "brush", "date": "2026-05-30"}, owner_addr)
        state = complete_chore(state, {"chore_id": "toys", "date": "2026-05-30"}, owner_addr)

        # Member completes different chores
        state = complete_chore(state, {"chore_id": "dress", "date": "2026-05-30"}, member_addr)
        state = complete_chore(state, {"chore_id": "bed", "date": "2026-05-30"}, member_addr)

        # All chores recorded
        day = state["days"]["2026-05-30"]
        self.assertTrue(day["brush"])
        self.assertTrue(day["toys"])
        self.assertTrue(day["dress"])
        self.assertTrue(day["bed"])


class TestMockESR(unittest.TestCase):
    """Test the MockEnclaveState itself to ensure test infrastructure works."""

    def test_get_nonexistent_returns_none(self):
        esr = MockEnclaveState()
        self.assertIsNone(esr.get(b"nothing"))

    def test_put_and_get_roundtrip(self):
        esr = MockEnclaveState()
        data = {"hello": "world"}
        esr.put(b"key1", data)
        result = esr.get(b"key1")
        self.assertEqual(result, data)

    def test_version_increments(self):
        esr = MockEnclaveState()
        esr.get(b"key1")  # initialize
        self.assertEqual(esr.get_version(b"key1"), 0)
        esr.put(b"key1", {"v": 1})
        self.assertEqual(esr.get_version(b"key1"), 1)
        esr.put(b"key1", {"v": 2})
        self.assertEqual(esr.get_version(b"key1"), 2)

    def test_exists(self):
        esr = MockEnclaveState()
        self.assertFalse(esr.exists(b"key1"))
        esr.put(b"key1", {})
        self.assertTrue(esr.exists(b"key1"))

    def test_apply(self):
        esr = MockEnclaveState()

        def init_or_increment(state):
            state = state or {"count": 0}
            state["count"] += 1
            return state

        esr.apply(b"counter", init_or_increment)
        esr.apply(b"counter", init_or_increment)
        esr.apply(b"counter", init_or_increment)

        result = esr.get(b"counter")
        self.assertEqual(result["count"], 3)

    def test_isolated_keys(self):
        esr = MockEnclaveState()
        esr.put(b"family-a", {"name": "A"})
        esr.put(b"family-b", {"name": "B"})
        self.assertEqual(esr.get(b"family-a")["name"], "A")
        self.assertEqual(esr.get(b"family-b")["name"], "B")

    def test_get_returns_deep_copy(self):
        esr = MockEnclaveState()
        esr.put(b"key1", {"list": [1, 2, 3]})
        result = esr.get(b"key1")
        result["list"].append(4)
        # Original should not be modified
        self.assertEqual(len(esr.get(b"key1")["list"]), 3)


if __name__ == "__main__":
    unittest.main()
