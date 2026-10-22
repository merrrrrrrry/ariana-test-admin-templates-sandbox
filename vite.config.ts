import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import { bstageDevPlugin } from '@bstage-sdk/cli/vite'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')

  return {
    plugins: [react(), bstageDevPlugin({ phase: env.VITE_BSTAGE_PHASE })],
  }
})
