import { defineConfig, loadEnv } from 'vite'
import { svelte } from '@sveltejs/vite-plugin-svelte'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd())
  const apiHost = env.VITE_API_HOST ?? '127.0.0.1'
  const apiPort = env.VITE_API_PORT ?? '8001'

  return {
    plugins: [svelte()],
    define: {
      __BUILD_TIME__: JSON.stringify(new Date().toISOString()),
    },
    server: {
      proxy: {
        '/api': `http://${apiHost}:${apiPort}`,
      },
    },
  }
})
