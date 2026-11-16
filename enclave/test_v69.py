#!/usr/bin/env python3
"""
Quick task test for StarChart v69 on PoX 1.2 (bloxberg testnet).
Submits a create_family intent and verifies the enclave executes.
"""
import os, sys, json, time
from eth_account import Account
from eth_account.messages import encode_defunct
from web3 import Web3
from ethernity_cloud_runner_py.runner import EthernityCloudRunner

KEY = os.environ["EC_RUNNER_KEY"]
ENCL = "starchart_enclave"
VER = "69"
TZ = "etny-pynithy-testnet"
FAM = f"test-v69-{int(time.time())}"

acct = Account.from_key(KEY)
w3 = Web3()
print(f"[v69-test] payer {acct.address}  enclave {ENCL} v{VER}  family {FAM}", flush=True)

# Sign a create_family intent
intent = {"action": "create_family"}
msg_text = json.dumps(intent, separators=(",", ":"), sort_keys=True)
sig = w3.eth.account.sign_message(encode_defunct(text=msg_text), private_key=KEY)
intent["signature"] = sig.signature.hex()
intent_json = json.dumps(intent, separators=(",", ":"), sort_keys=True)

code = f'execute("{FAM}", \'{intent_json}\')'
print(f"[v69-test] code: {code[:80]}...", flush=True)

runner = EthernityCloudRunner("bloxberg", "testnet")
runner.set_log_level("INFO")
runner.set_private_key(KEY)
runner.set_public_intake()
runner.connect()

resources = {
    "taskPrice": 3,
    "cpu": 1,
    "memory": 1,
    "storage": 10,
    "bandwidth": 1,
    "duration": 1,
    "validators": 1,
}

print("[v69-test] Submitting task...", flush=True)
runner.run(resources, ENCL, VER, code, "", TZ)

t0 = time.time()
while runner.is_running():
    elapsed = int(time.time() - t0)
    if elapsed % 15 == 0 and elapsed > 0:
        print(f"[v69-test] waiting... {elapsed}s", flush=True)
    time.sleep(1)

state = runner.get_state()
print(f"[v69-test] state: {state['status']}", flush=True)

if state["status"] == "ERROR":
    for line in state.get("log", []):
        print(f"  ERR: {line}", flush=True)
    sys.exit(1)

result = runner.get_result()
print(f"[v69-test] result: {json.dumps(result, indent=2)}", flush=True)
print("[v69-test] SUCCESS — v69 executes on PoX 1.2", flush=True)
