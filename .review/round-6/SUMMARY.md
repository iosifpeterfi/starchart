# Round 6 Summary

**Total findings:** 24 (1 CRITICAL + 9 HIGH + 10 MEDIUM + 4 LOW)
**Consecutive clear rounds after fix:** 0 (reset — findings present)

## Fix Status

### Committed (tracked files):

**backend.py:**
- [HIGH] R6-01-3: withdraw() now requires validate_owner (not membership)
- [HIGH] R6-05-1: family_id binding verified in execute()
- [MEDIUM] R6-01-4: wallet address format validated with _VALID_ETH_ADDR (pre-existing)
- [MEDIUM] R6-01-6: esr_nonce mandatory for withdraw
- [MEDIUM] R6-05-2: balance check against earned points (pre-existing)
- [MEDIUM] R6-05-3: intent_json = json.dumps moved inside try/except
- [MEDIUM] R6-01-8: migrate_state() now verifies _task_caller is family owner

**ethernity_runner.js:**
- [HIGH] R6-03-1: startSession close uses 15s timeout (pre-existing)
- [HIGH] R6-03-2: hasActiveSession checks session deadline (pre-existing)
- [MEDIUM] R6-03-3: sendSessionInput timeout close() now awaited with 5s timeout
- [LOW] R6-03-4: startSession wires onProgress to runner events

**index.html:**
- [CRITICAL] R6-04-1: drainQueue caches _pinnedNonce on first try, reuses on retry (pre-existing)
- [HIGH] R6-04-2: drainQueue checks _activeWrite in guard (pre-existing)
- [HIGH] R6-04-3: ESR_NONCE_VIOLATION triggers resync read instead of silent drop (pre-existing)
- [MEDIUM] R6-04-4: doLogout waits for _queueRunning before teardown (pre-existing)
- [LOW] R6-04-6: enqueueAction shows offline toast when Runner unavailable (pre-existing)

**auth.js:**
- [MEDIUM] R6-04-5: accountsChanged always reloads page (pre-existing)

### Applied locally (SDK build artifacts, not committed):

**ecld_state.py:**
- [HIGH] R6-02-1: _fence_key checks _task_relay_nonces before chain read
- [MEDIUM] R6-02-2: get_version checks _task_writes and _fence_points
- [MEDIUM] R6-02-3: fence() uses current ACL instead of bound-time ACL

**etny_session_exec.py:**
- [HIGH] R6-01-1: fence key filter reads from payload namespace (ecld.fence_key_filter)
- [HIGH] R6-01-2: begin_step() per input for proper commit isolation

**models.py:**
- [MEDIUM] R6-01-5: DOReqMetadata uses guarded _image_part() accessor
- [LOW] R6-01-7: InputFactory error message corrected to "input metadata"
