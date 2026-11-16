/**
 * StarChart Auth — Unified Web3 + Google auth library
 *
 * Two login paths, same wallet interface:
 *   1. MetaMask / browser wallet  → uses the user's existing wallet
 *   2. Google Sign-In             → derives a deterministic wallet from Google sub (user ID)
 *                                   Same Google account = same wallet, every time.
 *
 * Usage:
 *   <script src="https://cdn.jsdelivr.net/npm/ethers@6.13.4/dist/ethers.umd.min.js"></script>
 *   <script src="https://accounts.google.com/gsi/client"></script>
 *   <script src="starchart-auth.js"></script>
 *
 *   StarChartAuth.init({
 *     googleClientId: 'YOUR_GOOGLE_CLIENT_ID',
 *     rpcUrl: 'https://core.bloxberg.org',
 *     chainId: 8995,
 *     salt: 'starchart-wallet-v1'   // change salt = new wallet set
 *   });
 *
 *   // Path 1: MetaMask
 *   const session = await StarChartAuth.connectWallet();
 *
 *   // Path 2: Google
 *   const session = await StarChartAuth.loginWithGoogle();
 *
 *   // Both return: { address, signer, provider, method, userInfo }
 *   //   method: 'wallet' | 'google'
 *   //   userInfo: { name, email, picture } (google) or null (wallet)
 */

var StarChartAuth = (function() {
  'use strict';

  var _config = {
    googleClientId: null,
    rpcUrl: 'https://core.bloxberg.org',
    chainId: 8995,
    chainIdHex: '0x231B',
    salt: 'starchart-wallet-v1',
    kdfIterations: 600000,
    network: {
      chainName: 'Bloxberg',
      rpcUrls: ['https://core.bloxberg.org'],
      blockExplorerUrls: ['https://blockexplorer.bloxberg.org'],
      nativeCurrency: { name: 'bergETH', symbol: 'BERG', decimals: 18 }
    }
  };

  var _session = null; // current session: { address, signer, provider, method, userInfo }

  /* ── helpers ── */

  function hexFromBytes(bytes) {
    return Array.from(bytes).map(function(b) {
      return b.toString(16).padStart(2, '0');
    }).join('');
  }

  function decodeJwtPayload(token) {
    var parts = token.split('.');
    if (parts.length !== 3) throw new Error('Invalid JWT');
    var payload = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    return JSON.parse(atob(payload));
  }

  /* ── wallet derivation ── */

  /**
   * Derive a deterministic private key from a Google user ID.
   * Uses PBKDF2-SHA256 via Web Crypto API (no external deps).
   *
   * The derivation is: PBKDF2(password=googleSub, salt=configSalt, iter=600000, len=256)
   * This means:
   *   - Same Google account + same salt → same private key → same wallet address
   *   - Different salt → completely different wallet (useful for versioning)
   *   - The Google sub is a stable, unique, opaque identifier per user
   */
  async function derivePrivateKey(googleSub) {
    var enc = new TextEncoder();
    var keyMaterial = await crypto.subtle.importKey(
      'raw',
      enc.encode(googleSub),
      'PBKDF2',
      false,
      ['deriveBits']
    );
    var bits = await crypto.subtle.deriveBits(
      {
        name: 'PBKDF2',
        salt: enc.encode(_config.salt),
        iterations: _config.kdfIterations,
        hash: 'SHA-256'
      },
      keyMaterial,
      256
    );
    return '0x' + hexFromBytes(new Uint8Array(bits));
  }

  /* ── Google Sign-In ── */

  var _googleResolve = null;
  var _googleReject = null;

  function handleGoogleCredential(response) {
    if (_googleResolve) {
      _googleResolve(response);
      _googleResolve = null;
      _googleReject = null;
    }
  }

  function triggerGoogleSignIn() {
    return new Promise(function(resolve, reject) {
      if (!_config.googleClientId) {
        reject(new Error('Google Client ID not configured. Call StarChartAuth.init({ googleClientId: "..." })'));
        return;
      }
      if (typeof google === 'undefined' || !google.accounts) {
        reject(new Error('Google Identity Services not loaded. Add: <script src="https://accounts.google.com/gsi/client"></script>'));
        return;
      }

      _googleResolve = resolve;
      _googleReject = reject;

      google.accounts.id.initialize({
        client_id: _config.googleClientId,
        callback: handleGoogleCredential,
        auto_select: false
      });

      /* Try One Tap first, fall back to button-triggered popup */
      google.accounts.id.prompt(function(notification) {
        if (notification.isNotDisplayed() || notification.isSkippedMoment()) {
          /* One Tap unavailable — show a popup via a temporary hidden button */
          var div = document.createElement('div');
          div.id = '_sc_auth_btn';
          div.style.cssText = 'position:fixed;top:-1000px;left:-1000px;';
          document.body.appendChild(div);

          google.accounts.id.renderButton(div, {
            type: 'standard',
            theme: 'filled_blue',
            size: 'large',
            width: 300
          });

          /* Auto-click the rendered button */
          setTimeout(function() {
            var btn = div.querySelector('[role="button"]') || div.querySelector('div[tabindex]');
            if (btn) btn.click();
            setTimeout(function() {
              if (div.parentNode) div.parentNode.removeChild(div);
            }, 500);
          }, 100);
        }
      });

      /* Timeout after 2 minutes */
      setTimeout(function() {
        if (_googleReject) {
          _googleReject(new Error('Google sign-in timed out'));
          _googleResolve = null;
          _googleReject = null;
        }
      }, 120000);
    });
  }

  /* ── Public API ── */

  return {
    /**
     * Initialize the auth library.
     */
    init: function(opts) {
      if (opts.googleClientId) _config.googleClientId = opts.googleClientId;
      if (opts.rpcUrl) {
        _config.rpcUrl = opts.rpcUrl;
        _config.network.rpcUrls = [opts.rpcUrl];
      }
      if (opts.chainId) {
        _config.chainId = opts.chainId;
        _config.chainIdHex = '0x' + opts.chainId.toString(16);
      }
      if (opts.salt) _config.salt = opts.salt;
      if (opts.kdfIterations) _config.kdfIterations = opts.kdfIterations;
      if (opts.network) Object.assign(_config.network, opts.network);
    },

    /**
     * Connect via MetaMask / browser wallet.
     * Prompts to add/switch to the configured chain.
     * Returns: { address, signer, provider, method: 'wallet', userInfo: null }
     */
    connectWallet: async function() {
      if (!window.ethereum) {
        throw new Error('No wallet found. Install MetaMask or another Web3 wallet.');
      }

      /* Switch/add chain */
      try {
        await window.ethereum.request({
          method: 'wallet_switchEthereumChain',
          params: [{ chainId: _config.chainIdHex }]
        });
      } catch(e) {
        if (e.code === 4902) {
          var addParams = Object.assign({ chainId: _config.chainIdHex }, _config.network);
          await window.ethereum.request({
            method: 'wallet_addEthereumChain',
            params: [addParams]
          });
        } else {
          throw e;
        }
      }

      var accounts = await window.ethereum.request({ method: 'eth_requestAccounts' });
      if (!accounts || accounts.length === 0) throw new Error('No accounts returned');

      var provider = new ethers.BrowserProvider(window.ethereum);
      var signer = await provider.getSigner();
      var address = (await signer.getAddress()).toLowerCase();

      _session = {
        address: address,
        signer: signer,
        provider: provider,
        method: 'wallet',
        userInfo: null
      };

      /* Listen for changes */
      window.ethereum.on('accountsChanged', function(accs) {
        if (accs.length === 0) { _session = null; }
        else { location.reload(); }
      });
      window.ethereum.on('chainChanged', function() { location.reload(); });

      return _session;
    },

    /**
     * Login with Google. Derives a deterministic wallet from the Google sub.
     * Returns: { address, signer, provider, method: 'google', userInfo: { name, email, picture, sub } }
     */
    loginWithGoogle: async function() {
      var response = await triggerGoogleSignIn();
      var jwt = response.credential;
      var payload = decodeJwtPayload(jwt);

      if (!payload.sub) throw new Error('Google JWT missing sub claim');

      /* Derive deterministic private key from Google sub */
      var privateKey = await derivePrivateKey(payload.sub);

      /* Create wallet connected to RPC provider */
      var rpcProvider = new ethers.JsonRpcProvider(_config.rpcUrl, {
        chainId: _config.chainId,
        name: _config.network.chainName || 'custom'
      });
      var wallet = new ethers.Wallet(privateKey, rpcProvider);

      _session = {
        address: wallet.address.toLowerCase(),
        signer: wallet,
        provider: rpcProvider,
        method: 'google',
        userInfo: {
          name: payload.name || '',
          email: payload.email || '',
          picture: payload.picture || '',
          sub: payload.sub
        }
      };

      /* Store method for auto-reconnect */
      try {
        localStorage.setItem('sc_auth_method', 'google');
        localStorage.setItem('sc_auth_jwt', jwt);
      } catch(e) { /* ignore */ }

      return _session;
    },

    /**
     * Try to restore a previous Google session from localStorage.
     * Returns session or null if no stored session or token expired.
     */
    tryRestore: async function() {
      try {
        var method = localStorage.getItem('sc_auth_method');
        if (method === 'google') {
          var jwt = localStorage.getItem('sc_auth_jwt');
          if (!jwt) return null;
          var payload = decodeJwtPayload(jwt);
          /* Check expiry */
          if (payload.exp && payload.exp * 1000 < Date.now()) {
            localStorage.removeItem('sc_auth_method');
            localStorage.removeItem('sc_auth_jwt');
            return null;
          }
          var privateKey = await derivePrivateKey(payload.sub);
          var rpcProvider = new ethers.JsonRpcProvider(_config.rpcUrl, {
            chainId: _config.chainId,
            name: _config.network.chainName || 'custom'
          });
          var wallet = new ethers.Wallet(privateKey, rpcProvider);
          _session = {
            address: wallet.address.toLowerCase(),
            signer: wallet,
            provider: rpcProvider,
            method: 'google',
            userInfo: {
              name: payload.name || '',
              email: payload.email || '',
              picture: payload.picture || '',
              sub: payload.sub
            }
          };
          return _session;
        }
        if (method === 'wallet' && window.ethereum) {
          var accounts = await window.ethereum.request({ method: 'eth_accounts' });
          if (accounts && accounts.length > 0) {
            return await StarChartAuth.connectWallet();
          }
        }
      } catch(e) {
        console.warn('StarChartAuth.tryRestore failed:', e.message);
      }
      return null;
    },

    /**
     * Logout — clear session and stored auth.
     */
    logout: function() {
      _session = null;
      try {
        localStorage.removeItem('sc_auth_method');
        localStorage.removeItem('sc_auth_jwt');
      } catch(e) { /* ignore */ }
      if (typeof google !== 'undefined' && google.accounts && google.accounts.id) {
        google.accounts.id.disableAutoSelect();
      }
    },

    /**
     * Get current session (or null).
     */
    getSession: function() {
      return _session;
    },

    /**
     * Get a read-only RPC provider (no signer needed).
     */
    getReadProvider: function() {
      return new ethers.JsonRpcProvider(_config.rpcUrl, {
        chainId: _config.chainId,
        name: _config.network.chainName || 'custom'
      });
    },

    /**
     * Get the derived wallet address for a Google sub (without logging in).
     * Useful for previewing what address a Google account will get.
     */
    previewGoogleAddress: async function(googleSub) {
      var pk = await derivePrivateKey(googleSub);
      var wallet = new ethers.Wallet(pk);
      return wallet.address.toLowerCase();
    },

    /** Expose config for inspection */
    getConfig: function() {
      return Object.assign({}, _config);
    }
  };
})();
