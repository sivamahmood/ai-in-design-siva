import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { gardener } from './gardener-server.js'

// GitHub Pages serves the site at https://<user>.github.io/<repo>/.
// In GitHub Actions, GITHUB_REPOSITORY is "<user>/<repo>"; locally it is unset.
const repo = process.env.GITHUB_REPOSITORY?.split('/')[1]
const base = repo && !repo.endsWith('.github.io') ? `/${repo}/` : '/'

export default defineConfig({
  // gardener() adds the /api/gardener endpoint to `npm run dev` only.
  plugins: [react(), gardener()],
  base,
})
