/**
 * Build script for ethernity.bundle.js
 */
import * as esbuild from 'esbuild';

await esbuild.build({
  entryPoints: ['src/ethernity_runner.js'],
  bundle: true,
  format: 'iife',
  platform: 'browser',
  target: ['es2020'],
  outfile: 'dist/ethernity.bundle.js',
  define: {
    'global': 'globalThis',
  },
  external: ['http', 'https', 'zlib', 'url', 'net', 'tls', 'crypto', 'stream', 'os', 'path', 'fs', 'child_process', 'worker_threads', 'node:fs/promises', 'node:path', 'node:os', 'node:crypto'],
  logLevel: 'info',
});

console.log('Build complete: dist/ethernity.bundle.js');
