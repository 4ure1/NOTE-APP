// Capture de sites de référence pour le moodboard (inspiration, aucune reprise de leur identité)
// Lancer depuis la racine : npx electron design-mockups/proposition/references/capture-refs.js
const { app, BrowserWindow, session } = require('electron')
const path = require('path')
const fs = require('fs')

app.commandLine.appendSwitch('disable-gpu')

const refs = [
  ['ia-writer', 'https://ia.net/writer'],
  ['bear', 'https://bear.app'],
  ['zed', 'https://zed.dev'],
  ['arena', 'https://www.are.na'],
  ['teenage-engineering', 'https://teenage.engineering'],
  ['ghostty', 'https://ghostty.org'],
  ['obsidian', 'https://obsidian.md'],
  ['craft', 'https://www.craft.do']
]

app.whenReady().then(async () => {
  const outDir = path.join(__dirname, 'shots')
  fs.mkdirSync(outDir, { recursive: true })
  session.defaultSession.setPermissionRequestHandler((_wc, _p, cb) => cb(false))
  const only = process.argv.slice(2).filter((a) => !a.startsWith('-') && !a.endsWith('.js'))
  for (const [name, url] of refs.filter(([n]) => only.length === 0 || only.includes(n))) {
    const win = new BrowserWindow({ width: 1440, height: 900, show: false, webPreferences: { sandbox: true } })
    win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
    try {
      await Promise.race([win.loadURL(url), new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 20000))])
      await new Promise((r) => setTimeout(r, 3500))
      const img = await win.webContents.capturePage()
      fs.writeFileSync(path.join(outDir, `${name}.png`), img.toPNG())
      console.log(`OK ${name}`)
    } catch (err) {
      console.log(`ECHEC ${name}: ${err.message}`)
    }
    win.destroy()
  }
  app.quit()
})
