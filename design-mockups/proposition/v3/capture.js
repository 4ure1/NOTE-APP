// Capture PNG des maquettes Â« Cahier de nuit Â» (fichiers HTML locaux ; polices chargÃ©es depuis Google Fonts pour la maquette seulement)
// Lancer depuis la racine : npx electron design-mockups/proposition/v2/capture.js
const { app, BrowserWindow } = require('electron')
const path = require('path')
const fs = require('fs')

app.commandLine.appendSwitch('disable-gpu')

app.whenReady().then(async () => {
  const outDir = path.join(__dirname, 'screenshots')
  fs.mkdirSync(outDir, { recursive: true })
  const win = new BrowserWindow({ width: 1440, height: 900, show: false, useContentSize: true })
  for (const name of ['accueil', 'editeur']) {
    await win.loadFile(path.join(__dirname, `${name}.html`))
    await win.webContents.executeJavaScript('document.fonts.ready.then(() => true)')
    await new Promise((r) => setTimeout(r, 800))
    const image = await win.webContents.capturePage()
    fs.writeFileSync(path.join(outDir, `${name}.png`), image.toPNG())
    console.log(`CapturÃ© : ${name}.png`)
  }
  app.quit()
})

