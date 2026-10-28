const { app, BrowserWindow } = require('electron')
const path = require('path')
const fs = require('fs')

app.commandLine.appendSwitch('disable-gpu')

app.whenReady().then(async () => {
  const outDir = path.join(__dirname, 'screenshots')
  if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir, { recursive: true })
  }

  const mockups = [
    { file: 'direction-1-linear-technical.html', name: 'direction-1-linear-technical.png' },
    { file: 'direction-2-paper-and-ink.html', name: 'direction-2-paper-and-ink.png' },
    { file: 'direction-3-monolith-slate.html', name: 'direction-3-monolith-slate.png' }
  ]

  const win = new BrowserWindow({
    width: 1440,
    height: 900,
    show: false,
    webPreferences: {
      offscreen: false,
      preload: path.join(__dirname, '..', 'out', 'preload', 'index.js'),
      sandbox: false
    }
  })

  // Capture de l'application actuelle AVANT refonte
  try {
    const appPath = path.join(__dirname, '..', 'out', 'renderer', 'index.html')
    await win.loadFile(appPath)
    await new Promise((r) => setTimeout(r, 1200))
    const appImage = await win.webContents.capturePage()
    fs.writeFileSync(path.join(outDir, 'app-avant-refonte.png'), appImage.toPNG())
    console.log('Captured: app-avant-refonte.png')
  } catch (err) {
    console.warn('App capture skipped:', err.message)
  }

  for (const m of mockups) {
    const fullPath = path.join(__dirname, m.file)
    await win.loadFile(fullPath)
    await new Promise((r) => setTimeout(r, 600))
    const image = await win.webContents.capturePage()
    fs.writeFileSync(path.join(outDir, m.name), image.toPNG())
    console.log(`Captured: ${m.name}`)
  }

  app.quit()
})
