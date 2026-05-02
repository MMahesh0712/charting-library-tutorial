import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const dataHubHttpTarget = env.VITE_DATA_HUB_HTTP_TARGET || 'http://127.0.0.1:8000';
  const dataHubWsTarget = env.VITE_DATA_HUB_WS_TARGET || 'ws://127.0.0.1:8000';
  const appBasePath = env.VITE_APP_BASE_PATH || '/';

  return {
    base: appBasePath,
    plugins: [react()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
        '@components': path.resolve(__dirname, './src/components'),
        '@hooks': path.resolve(__dirname, './src/hooks'),
        '@services': path.resolve(__dirname, './src/services'),
        '@utils': path.resolve(__dirname, './src/utils'),
        '@context': path.resolve(__dirname, './src/context'),
        '@types': path.resolve(__dirname, './src/types'),
        '@store': path.resolve(__dirname, './src/store'),
        '@constants': path.resolve(__dirname, './src/constants'),
      },
    },
    server: {
      host: '0.0.0.0',
      port: 7100,
      proxy: {
        '/api': {
          target: dataHubHttpTarget,
          changeOrigin: true,
        },
        '/ws': {
          target: dataHubWsTarget,
          ws: true,
        },
        '/npl-time': {
          target: 'https://www.nplindia.in/cgi-bin/ntp_client',
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/npl-time/, ''),
          headers: {
            Referer: 'https://www.nplindia.in/ntp-service',
            Origin: 'https://www.nplindia.in',
          }
        },
      },
    },
    preview: {
      host: '0.0.0.0',
      port: 7100,
      allowedHosts: ['app.opendhan.in'],
    },
  };
});
