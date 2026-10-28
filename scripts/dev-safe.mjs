// Lance l'app en développement sur ./test-vault au lieu du vrai dossier de notes (~/Notes).
// electron-vite transmet process.env au processus Electron (spawn sans option env).
import { spawn } from 'node:child_process'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const notesDir = resolve(root, 'test-vault')
const env = { ...process.env, NOTE_APP_NOTES_DIR: notesDir }

console.log(`[dev:safe] NOTE_APP_NOTES_DIR = ${notesDir}`)

const child = spawn('npx electron-vite dev', { cwd: root, env, stdio: 'inherit', shell: true })
child.on('exit', (code) => process.exit(code ?? 0))
