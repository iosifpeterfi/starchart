import type { IKeyManager } from '@metamask/mobile-wallet-protocol-core';
/**
 * Creates an {@link IKeyManager} backed by the `eciesjs` library.
 *
 * The factory dynamically imports `eciesjs` so the heavy crypto dependency is
 * only loaded when MWP transport is actually used. The returned object closes
 * over the imported symbols, allowing synchronous methods like
 * `generateKeyPair` and `validatePeerKey` to work without a second await.
 *
 * @returns A ready-to-use key manager instance.
 */
export declare function createKeyManager(): Promise<IKeyManager>;
//# sourceMappingURL=KeyManager.d.ts.map