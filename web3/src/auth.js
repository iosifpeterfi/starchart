/**
 * StarChart Auth — Web3Auth Modal + MetaMask unified auth
 *
 * Two login paths, same wallet interface:
 *   1. Web3Auth Modal (Google, email, social logins) → embedded wallet
 *   2. MetaMask / browser wallet → user's existing wallet
 *
 * Both return: { address, signer, provider, method, userInfo }
 */
import { Web3Auth, WEB3AUTH_NETWORK } from '@web3auth/modal';
import { ethers } from 'ethers';

const BLOXBERG = {
  chainId: '0x231B',
  chainIdNum: 8995,
  chainName: 'Bloxberg',
  rpcUrl: 'https://core.bloxberg.org',
  blockExplorer: 'https://blockexplorer.bloxberg.org',
  ticker: 'BERG',
  tickerName: 'berg',
};

let _web3auth = null;
let _session = null;
let _injectedEthereum = false;
let _ethListenersAdded = false;

const StarChartAuth = {
  /**
   * Initialize Web3Auth. Must be called before login.
   * @param {object} opts - { clientId: string (Web3Auth dashboard client ID) }
   */
  async init(opts = {}) {
    const clientId = opts.clientId || '';
    if (!clientId) {
      console.warn('StarChartAuth: No Web3Auth clientId provided');
      return;
    }

    _web3auth = new Web3Auth({
      clientId,
      web3AuthNetwork: WEB3AUTH_NETWORK.SAPPHIRE_DEVNET,
      uiConfig: {
        appName: 'Star Chart',
        logoLight: 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><text y="80" font-size="80">⭐</text></svg>'),
        logoDark: 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><text y="80" font-size="80">⭐</text></svg>'),
      },
      chainConfig: {
        chainNamespace: 'eip155',
        chainId: BLOXBERG.chainId,
        rpcTarget: BLOXBERG.rpcUrl,
        displayName: BLOXBERG.chainName,
        blockExplorerUrl: BLOXBERG.blockExplorer,
        ticker: BLOXBERG.ticker,
        tickerName: BLOXBERG.tickerName,
      },
    });

    if (typeof _web3auth.init === 'function') {
      await _web3auth.init();
    } else if (typeof _web3auth.initModal === 'function') {
      await _web3auth.initModal();
    }
    console.log('Web3Auth init success, status:', _web3auth.status);
  },

  /**
   * Login via Web3Auth modal (Google, email, social).
   * Returns a session with an embedded wallet.
   */
  async loginWithWeb3Auth() {
    if (!_web3auth) throw new Error('Call StarChartAuth.init() first');

    const connectResult = await _web3auth.connect();   // interactive login modal
    if (!connectResult) throw new Error('Web3Auth connection failed');

    // Web3Auth v11 returns a connector object; extract the EIP-1193 ethereum provider
    const w3aProvider = connectResult.ethereumProvider || connectResult.provider || connectResult;
    return await this._buildSession(w3aProvider);
  },

  /**
   * Build the app session from an already-connected Web3Auth provider.
   * Shared by interactive login and SILENT refresh-restore (no modal, no connect()).
   */
  async _buildSession(w3aProvider) {
    // Get the private key from Web3Auth and create a Bloxberg wallet directly
    // (Web3Auth embedded wallets don't support custom chains like Bloxberg)
    let signer, provider, address;
    try {
      // Try multiple methods to get the private key
      let privateKey = null;
      const providerProxy = w3aProvider._providerEngineProxy || w3aProvider;
      for (const method of ['private_key', 'eth_private_key']) {
        try {
          privateKey = await providerProxy.request({ method });
          if (privateKey) break;
        } catch (e) { /* try next */ }
      }
      if (privateKey) {
        const bloxbergProvider = new ethers.JsonRpcProvider(BLOXBERG.rpcUrl, {
          chainId: BLOXBERG.chainIdNum,
          name: BLOXBERG.chainName,
        });
        const wallet = new ethers.Wallet(privateKey, bloxbergProvider);
        signer = wallet;
        provider = bloxbergProvider;
        address = wallet.address.toLowerCase();
        // Expose private key for Ethernity Cloud runner SDK (needs Bloxberg provider)
        window._bloxbergPrivateKey = privateKey;
        console.log('Created Bloxberg wallet from Web3Auth key');
      } else {
        throw new Error('No private key available');
      }
    } catch (keyErr) {
      // Fallback: use the Web3Auth provider directly (won't work for Bloxberg txns)
      console.warn('Could not extract private key, using default provider:', keyErr.message);
      provider = new ethers.BrowserProvider(w3aProvider);
      signer = await provider.getSigner();
      address = (await signer.getAddress()).toLowerCase();
    }

    let userInfo = null;
    try {
      userInfo = await _web3auth.getUserInfo();
    } catch (e) {
      userInfo = { name: address.slice(0, 6) + '...' + address.slice(-4) };
    }

    _session = { address, signer, provider, method: 'web3auth', userInfo, rawProvider: w3aProvider };

    if (!window.ethereum) {
      window.ethereum = w3aProvider;
      _injectedEthereum = true;
      console.log('Injected Web3Auth provider as window.ethereum');
    }

    return _session;
  },

  /**
   * Connect via MetaMask / browser wallet.
   */
  async connectWallet() {
    if (!window.ethereum) {
      throw new Error('No wallet found. Install MetaMask.');
    }

    // Switch/add Bloxberg
    try {
      await window.ethereum.request({
        method: 'wallet_switchEthereumChain',
        params: [{ chainId: BLOXBERG.chainId }],
      });
    } catch (e) {
      if (e.code === 4902) {
        await window.ethereum.request({
          method: 'wallet_addEthereumChain',
          params: [{
            chainId: BLOXBERG.chainId,
            chainName: BLOXBERG.chainName,
            rpcUrls: [BLOXBERG.rpcUrl],
            blockExplorerUrls: [BLOXBERG.blockExplorer],
            nativeCurrency: { name: BLOXBERG.tickerName, symbol: BLOXBERG.ticker, decimals: 18 },
          }],
        });
      } else {
        throw e;
      }
    }

    const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' });
    if (!accounts?.length) throw new Error('No accounts returned');

    const provider = new ethers.BrowserProvider(window.ethereum);
    const signer = await provider.getSigner();
    const address = (await signer.getAddress()).toLowerCase();

    // Derive a deterministic Bloxberg session key from MetaMask — MetaMask cannot
    // export raw private keys, so we sign a fixed message and hash the signature.
    const sessionSig = await signer.signMessage('StarChart Bloxberg session key v1');
    const sessionKey = ethers.keccak256(ethers.toUtf8Bytes(sessionSig)).slice(2);
    window._bloxbergPrivateKey = sessionKey;

    if (!_ethListenersAdded) {
      _ethListenersAdded = true;
      window.ethereum.on('accountsChanged', (accs) => {
        _session = null;
        location.reload();
      });
      window.ethereum.on('chainChanged', () => location.reload());
    }

    _session = {
      address,
      signer,
      provider,
      method: 'wallet',
      userInfo: { name: address.slice(0, 6) + '...' + address.slice(-4) },
    };
    return _session;
  },

  /**
   * Try restoring a previous Web3Auth session.
   */
  async tryRestore() {
    // Web3Auth auto-restores the session in init(); if already connected, reuse the
    // cached provider directly. Do NOT call connect()/loginWithWeb3Auth() here — that
    // re-opens the Web3Auth modal ("Verify your account…") on every refresh.
    if (_web3auth && _web3auth.connected) {
      const w3aProvider = _web3auth.provider
        || (_web3auth.connectedAdapter && _web3auth.connectedAdapter.provider);
      if (w3aProvider) return await this._buildSession(w3aProvider);
      // No provider handle exposed — fall back to interactive (rare).
      return await this.loginWithWeb3Auth();
    }
    // Try MetaMask
    if (window.ethereum) {
      try {
        const accounts = await window.ethereum.request({ method: 'eth_accounts' });
        if (accounts?.length) return await this.connectWallet();
      } catch (e) { /* ignore */ }
    }
    return null;
  },

  /**
   * Logout
   */
  async logout() {
    if (_web3auth && _web3auth.connected) {
      try { await _web3auth.logout(); } catch (e) { /* ignore */ }
    }
    if (_injectedEthereum) {
      delete window.ethereum;
      _injectedEthereum = false;
    }
    window._bloxbergPrivateKey = null;
    _session = null;
  },

  getSession() { return _session; },

  /** Read-only RPC provider */
  getReadProvider() {
    return new ethers.JsonRpcProvider(BLOXBERG.rpcUrl, {
      chainId: BLOXBERG.chainIdNum,
      name: BLOXBERG.chainName,
    });
  },
};

// Expose globally for the inline script in index.html
window.StarChartAuth = StarChartAuth;
window.ethers = ethers;
