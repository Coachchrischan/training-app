// Launchpad entry point: starts the API server (8129) and the Vite dev server (8128).
// The Launchpad waits on port 8128 (the web app); Vite proxies /api to 8129.
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const root = path.dirname(fileURLToPath(import.meta.url))

function run(name, cmd, args, cwd) {
  const child = spawn(cmd, args, { cwd, stdio: ['ignore', 'inherit', 'inherit'], shell: false })
  child.on('exit', (code) => {
    console.log(`[launch] ${name} exited with code ${code}; shutting down`)
    process.exit(code ?? 1)
  })
  return child
}

const node = process.execPath
const api = run('api', node, [path.join(root, 'server', 'src', 'index.mjs')], path.join(root, 'server'))
const vite = run('web', node, [
  path.join(root, 'web', 'node_modules', 'vite', 'bin', 'vite.js'),
  '--port', '8128', '--strictPort', '--host', '127.0.0.1',
], path.join(root, 'web'))

for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, () => { api.kill(); vite.kill(); process.exit(0) })
}
