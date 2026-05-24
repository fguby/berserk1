import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const localBackend = env.VITE_DEV_BACKEND_URL || 'http://127.0.0.1:8080';

  return {
    plugins: [react()],
    server: {
      proxy: {
        '/berserk': {
          target: localBackend,
          changeOrigin: true,
          secure: false,
        },
      },
    },
  };
});
