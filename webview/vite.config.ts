import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react-swc';
import tailwindcss from '@tailwindcss/vite';
import { viteSingleFile } from 'vite-plugin-singlefile';
import postcssRTLCSS from 'postcss-rtlcss';
import { Mode } from 'postcss-rtlcss/options';

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    viteSingleFile(),
  ],
  css: {
    postcss: {
      // Right-to-left layout (utils/uiDirection.ts): every rule with a left or right in it
      // gets a mirrored [dir="rtl"] counterpart, so the whole interface flips with the
      // document root's dir. Left-to-right output is unchanged.
      plugins: [postcssRTLCSS({ mode: Mode.override, processKeyFrames: true })],
    },
  },
  esbuild: {
    drop: ['debugger'],
    keepNames: true,
  },
  build: {
    minify: 'esbuild',
    assetsInlineLimit: 1024 * 1024,
    cssCodeSplit: false,
    sourcemap: false,
    rollupOptions: {
      output: {
        manualChunks: undefined,
      },
    },
  },
  server: {
    proxy: {
      // Dev-mode fallback for the vendored TokenTracker dashboard: when the
      // webview runs in a plain browser (no JCEF bridge), dashboard traffic
      // goes to a locally running `tokentracker serve` instance instead.
      '/tt-dev': {
        // 端口变更时同步更新 useTokenTrackerServer.ts 的 TT_DEV_PREVIEW_PORT。
        target: 'http://127.0.0.1:7680',
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/tt-dev/, ''),
      },
    },
  },
});

