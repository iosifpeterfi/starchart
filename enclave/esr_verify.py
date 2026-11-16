#!/usr/bin/env python3
"""Submit an arbitrary enclave function call to v47 and print the result.
Usage: python3 esr_verify.py 'esr_selftest()'
"""
import os, sys, json, time
os.environ.setdefault("IPFS_URL", "https://ipfs.ethernity.cloud/api/v0")
from ethernity_cloud_runner_py.runner import EthernityCloudRunner

RUNNER_KEY = os.environ["EC_RUNNER_KEY"]
code = sys.argv[1] if len(sys.argv) > 1 else "esr_selftest()"
# Pin to a specific ESR-capable operator (empty = any operator in the queue).
NODE = sys.argv[2] if len(sys.argv) > 2 else "0x837EA0A09612CFF93a787db84Bbe11c65E431133"

runner = EthernityCloudRunner("bloxberg", "testnet")
runner.set_log_level("INFO")
runner.set_private_key(RUNNER_KEY)
runner.set_storage_ipfs(os.environ["IPFS_URL"])
runner.connect()

resources = {"taskPrice": 3, "cpu": 1, "memory": 1, "storage": 10, "bandwidth": 1, "duration": 1, "validators": 1}
print(f"[esr_verify] submitting: {code}", flush=True)
t0 = time.time()
print(f"[esr_verify] targeting node: {NODE or '(any)'}", flush=True)
runner.run(resources, "starchart_enclave", "v3", code, NODE, "etny-pynithy-testnet")
while runner.is_running():
    time.sleep(0.5)
state = runner.get_state()
dt = time.time() - t0
if state["status"] == "ERROR":
    print(f"[esr_verify] TASK FAILED after {dt:.0f}s:", flush=True)
    for l in state.get("log", [])[-12:]:
        print("   ", l, flush=True)
    sys.exit(1)
res = runner.get_result()
print(f"[esr_verify] RESULT after {dt:.0f}s:", flush=True)
try:
    print(json.dumps(json.loads(res["value"]) if isinstance(res, dict) else res, indent=2), flush=True)
except Exception:
    print(res, flush=True)
