# StarChart Web3 — Session Reliability Sprint

## Objective
Fix the stuck drain queue and session reliability issues. After this sprint, chore taps should reliably commit through an interactive session or fall back cleanly to one-shot tasks.

## Current Problems (from debug logs)
1. **Nonce race**: pre-opened session and drainQueue both try wallet txs → "nonce already used"
2. **Drain stuck forever**: `_queueRunning=true` never released when one-shot or session hangs
3. **No session reattach**: page reload loses the session, opens a new one (minutes wasted)
4. **No one-shot timeout**: the submitTask fallback has no timeout, hangs indefinitely
5. **Queue survives logout**: 19 stale jobs persist across sign-out/sign-in

## Tasks

### T1 — Remove pre-open session races
Remove the fire-and-forget `startSession()` calls from `createFamily()` and `unlockApp()`. Only `drainQueue` → `ensureSession()` opens sessions. Eliminates the nonce collision.

### T2 — Session reattach via attachSession
- Persist session orderId in localStorage (`sc2_session_order`)
- `ensureSession()` tries `attachSession(orderId)` first, falls back to new `startSession()`
- Clear saved orderId on logout and when attach fails

### T3 — Timeout on one-shot fallback
Wrap `submitTask()` in a 120s timeout in `drainQueue`. If it times out, the job stays in the queue for retry on next drain cycle.

### T4 — Drain watchdog
Start a 5-minute watchdog timer when `drainQueue` begins. If the drain hasn't made progress (shifted a job) in 5 minutes, force-reset `_queueRunning` and `_activeWrite`. This prevents permanent stuck state.

### T5 — Clean logout
On logout: clear the queue, reset `_queueRunning`/`_activeWrite`, remove session orderId from localStorage. Fresh state on next login.

### T6 — Limit queue size
Cap the queue at 50 items. Drop oldest jobs beyond the cap. Prevents 19+ stale jobs from accumulating.

## Files to Modify
- `web3/index.html` — drainQueue, ensureSession, doLogout, enqueueAction
- `web3/src/ethernity_runner.js` — attachSession wrapper, resetRunner

## Acceptance Criteria
- No pre-open session calls outside drainQueue
- Session reattaches on page reload
- Drain never stuck for more than 5 minutes
- One-shot has a 120s timeout
- Queue cleared on logout
- Queue capped at 50
