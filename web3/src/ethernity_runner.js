/**
 * Ethernity Cloud Runner wrapper for StarChart Web3
 *
 * @ethernity-cloud/runner 0.6.x on Bloxberg testnet (PoX 1.2), raw private key from
 * Web3Auth. Matches the SDK 0.8.21 enclave stack and uses the runner's own ESR
 * capabilities (no hand-rolled contract calls):
 *   - Tasks end via `ecld_result(...)` so the result envelope carries the ESR
 *     attachment (enclave_address + touched-key state) the runner cache absorbs.
 *   - Reads go through the AUTHENTICATED `read_family` (never the unauthenticated
 *     built-in `esr_fetch`) wrapped in `esrRead()` — cache hit = one free
 *     eth_call, zero orders.
 *   - Writes end via `execute` and pin an idempotency `esr_nonce` (exactly-once;
 *     a resubmit returns task code 36, state untouched).
 *   - `esrVersion` / `esrWaitForVersion` give free (zero-order) version-watching.
 *   - node-relay commits: the enclave signs, the node pays — the client never
 *     writes ESR.
 */
import EthernityCloudRunner from '@ethernity-cloud/runner/runner.js';
import { ECAddress, ECStatus } from '@ethernity-cloud/runner/enums.js';

const ENCLAVE_CONFIG = {
  secureLockEnclave: 'starchart_enclave',
  trustedZoneEnclave: 'etny-pynithy-testnet',
  nodeAddress: '0x837EA0A09612CFF93a787db84Bbe11c65E431133',
  registryAddress: '0x0Ea1728EAE108FD3B9340ae91451348E2Cc6b4E4', // ESR registry (Bloxberg testnet) — nonce now public on-chain (getNonce)
  // enclave ESR identity for the CURRENTLY published build (v70, PoX 1.2). It rotates on
  // every rebuild (new MRENCLAVE) — update after each publish (it's in the publish banner
  // and .config.json ESR.wallet_address). Seeds cold-start reads/version/nonce before any
  // write has taught the runner the address; a live write overwrites it via the result envelope.
  enclaveAddress: '0x6AE9190707b11824ED043CaBAF90BFf1742b482d',
  resources: {
    taskPrice: 3,
    cpu: 1,
    memory: 1,
    storage: 10,
    bandwidth: 1,
    duration: 1,
    validators: 1,
  },
};

const WALLET_LS_KEY = 'sc2_esr_wallet'; // enclave address (rotates per rebuild), persisted for cold-load cache lookups
const _lastVersion = {}; // familyId -> last version we observed (guards the client's own still-relaying commit)

/* ---- singleton runner: keeps the enclave-address memo + cache warm across calls ---- */
let _runner = null;
let _runnerKey = null;

function getRunner() {
  const key = window._bloxbergPrivateKey;
  if (!key) throw new Error('No Bloxberg private key available. Please sign in first.');
  if (!_runner || _runnerKey !== key) {
    _runner = new EthernityCloudRunner(ECAddress.BLOXBERG.TESTNET_ADDRESS, { privateKey: key });
    _runner.enableStateCache(); // localStorage-backed in the browser
    _runnerKey = key;
    const w = enclaveAddress(); // learned address (localStorage) or the config seed for v63
    if (w) {
      _runner._esrWalletMemo = _runner._esrWalletMemo || {};
      _runner._esrWalletMemo[ENCLAVE_CONFIG.secureLockEnclave] = w;
    }
  }
  return _runner;
}

function enclaveAddress() {
  // Prefer the address learned from a live result envelope (survives rebuilds via
  // localStorage); fall back to the config seed for the published build so a cold
  // load can still resolve the namespace for version()/cache-gated reads.
  return localStorage.getItem(WALLET_LS_KEY) || ENCLAVE_CONFIG.enclaveAddress || null;
}

function persistWallet(runner) {
  const w = runner._esrWalletMemo && runner._esrWalletMemo[ENCLAVE_CONFIG.secureLockEnclave];
  if (w) localStorage.setItem(WALLET_LS_KEY, w);
}

function intentToCode(fn, familyId, signedIntent) {
  const intentJson = JSON.stringify(signedIntent, Object.keys(signedIntent).sort());
  return `ecld_result(${fn}("${familyId}", '${intentJson}'))`;
}

/* Drive a full run() to completion via events (writes, and read cache-misses). */
function runToCompletion(runner, code, onProgress) {
  const listeners = [];
  if (onProgress) {
    for (const evtName of Object.values(ECStatus)) {
      const fn = (e) => onProgress(e.detail || { message: runner.progress });
      runner.addEventListener(evtName, fn);
      listeners.push([evtName, fn]);
    }
  }
  const cleanup = () => listeners.forEach(([n, fn]) => runner.removeEventListener(n, fn));
  return runner
    .run(
      ENCLAVE_CONFIG.resources,
      ENCLAVE_CONFIG.secureLockEnclave,
      code,
      ENCLAVE_CONFIG.nodeAddress,
      ENCLAVE_CONFIG.trustedZoneEnclave,
    )
    .then(() => {
      cleanup();
      persistWallet(runner);
      let result = runner.result;
      try { result = typeof result === 'string' ? JSON.parse(result) : result; } catch (e) { /* leave */ }
      return result;
    })
    .catch((err) => { cleanup(); throw new Error(err && err.message ? err.message : String(err)); });
}

/**
 * WRITE: submit a signed intent (already carrying `esr_nonce` for exactly-once).
 * Ends via ecld_result so the fresh ESR state auto-populates the runner cache.
 * Returns the enclave's execute() result { status, state, version, nonce, ... }.
 */
async function submitTask(familyId, signedIntent, onProgress) {
  const runner = getRunner();
  const result = await runToCompletion(runner, intentToCode('execute', familyId, signedIntent), onProgress);
  if (result && result.version != null) _lastVersion[familyId] = result.version;
  return result;
}

/**
 * READ (cache-gated via the SDK): returns the family's state, running an
 * authenticated read_family task ONLY if the cache is stale/absent per a FREE
 * on-chain check. Cache hits cost zero orders.
 * Returns { state, version, cid, fromCache }.
 */
async function submitRead(familyId, signedIntent, onProgress) {
  const runner = getRunner();
  const readCode = intentToCode('read_family', familyId, signedIntent);

  // Primary: the SDK's cache-gated read. A cache HIT is a single free eth_call
  // (no run() setup needed). A MISS runs read_family via processTask, which
  // needs a prior run() to have initialized the runner — on a cold runner that
  // throws, so we fall back to a full run() below.
  try {
    const r = await runner.esrRead({
      key: familyId,
      registryAddress: ENCLAVE_CONFIG.registryAddress,
      enclaveWallet: enclaveAddress() || undefined,
      readCode,
      trustMinVersion: _lastVersion[familyId], // don't re-read our own still-relaying commit
      walletContext: runner.walletContext,
    });
    persistWallet(runner);
    if (r && r.version != null) _lastVersion[familyId] = r.version;
    return { state: r.state, version: r.version, cid: r.cid, fromCache: !!r.fromCache };
  } catch (e) {
    console.warn('esrRead fast-path unavailable (cold runner / miss); full read task:', e.message);
  }

  const result = await runToCompletion(runner, readCode, onProgress);
  if (result && result.version != null) _lastVersion[familyId] = result.version;
  const state = result && (result.state !== undefined ? result.state : result);
  return { state, version: result && result.version, cid: null, fromCache: false };
}

/** Free (zero-order) current on-chain version for a family's state. */
async function version(familyId) {
  const runner = getRunner();
  const r = await runner.esrVersion({
    key: familyId,
    registryAddress: ENCLAVE_CONFIG.registryAddress,
    enclaveAddress: enclaveAddress() || undefined,
    walletContext: runner.walletContext,
  });
  return r && r.version;
}

/** Free (zero-order) last-accepted idempotency nonce for a family's state key.
 *  The registry now records the nonce publicly on each commit (contract enforces
 *  strict +1), so the exactly-once nonce is `nonce(familyId) + 1`. */
async function nonce(familyId) {
  const runner = getRunner();
  const r = await runner.esrNonce({
    key: familyId,
    registryAddress: ENCLAVE_CONFIG.registryAddress,
    enclaveAddress: enclaveAddress() || undefined,
    walletContext: runner.walletContext,
  });
  return (r && r.nonce != null) ? Number(r.nonce) : 0;
}

/** Free (zero-order) wait until a commit lands on-chain (past `sinceVersion`). */
async function waitForVersion(familyId, sinceVersion, timeoutMs) {
  const runner = getRunner();
  return runner.esrWaitForVersion({
    key: familyId,
    sinceVersion,
    registryAddress: ENCLAVE_CONFIG.registryAddress,
    enclaveAddress: enclaveAddress() || undefined,
    walletContext: runner.walletContext,
    timeoutMs: timeoutMs || 120000,
  });
}

/* ---- Interactive sessions: one running order, many intents ---- */

let _session = null;

async function startSession(onProgress) {
  const runner = getRunner();
  const code = '___etny_on_input___';
  _session = await runner.runSession(
    ENCLAVE_CONFIG.resources,
    ENCLAVE_CONFIG.secureLockEnclave,
    code,
    ENCLAVE_CONFIG.nodeAddress,
    ENCLAVE_CONFIG.trustedZoneEnclave,
  );
  persistWallet(runner);
  return { orderId: _session.orderId, deadline: _session.deadline };
}

async function sendSessionInput(envelope) {
  if (!_session || _session.closed) throw new Error('No active session — call startSession first');
  const data = typeof envelope === 'string' ? envelope : JSON.stringify(envelope);
  const seq = await _session.sendInput(data);
  const [msg] = await _session.waitOutputs(1);
  let parsed = msg;
  try { parsed = typeof msg === 'string' ? JSON.parse(msg) : msg; } catch (e) { /* leave */ }
  if (parsed && parsed.version != null && parsed.family_id) {
    _lastVersion[parsed.family_id] = parsed.version;
  }
  return parsed;
}

async function sessionExecute(familyId, signedIntent) {
  return sendSessionInput({
    op: 'execute',
    family_id: familyId,
    intent: signedIntent,
  });
}

async function sessionRead(familyId, signedIntent) {
  return sendSessionInput({
    op: 'read',
    family_id: familyId,
    intent: signedIntent,
  });
}

async function closeSession() {
  if (!_session) return null;
  const result = await _session.close();
  _session = null;
  return result;
}

function hasActiveSession() {
  return _session !== null && !_session.closed;
}

// Expose globally
window.EthernityRunner = {
  submitTask,
  submitRead,
  version,
  nonce,
  waitForVersion,
  startSession,
  sendSessionInput,
  sessionExecute,
  sessionRead,
  closeSession,
  hasActiveSession,
  ENCLAVE_CONFIG,
};
