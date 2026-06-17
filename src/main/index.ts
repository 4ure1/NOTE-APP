import { app, shell, BrowserWindow, ipcMain, session } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import fs from 'fs'
import os from 'os'

function createWindow(): void {
  const CHROME_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36'
  const FIREFOX_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:126.0) Gecko/20100101 Firefox/126.0'

  session.defaultSession.webRequest.onBeforeSendHeaders((details, callback) => {
    const isGoogleAuth = details.url.includes('accounts.google.com') || 
                         details.url.includes('oauth') || 
                         details.url.includes('auth') || 
                         details.url.includes('login') || 
                         details.url.includes('signin')
    
    details.requestHeaders['User-Agent'] = isGoogleAuth ? FIREFOX_UA : CHROME_UA
    
    if (isGoogleAuth) {
      for (const key in details.requestHeaders) {
        if (key.toLowerCase().startsWith('sec-ch-ua')) {
          delete details.requestHeaders[key]
        }
      }
    }
    
    callback({ requestHeaders: details.requestHeaders })
  })

  session.defaultSession.setPermissionRequestHandler((_wc, permission, callback) => {
    callback(['notifications', 'media', 'geolocation', 'clipboard-read'].includes(permission))
  })

  const mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      webviewTag: true
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow.show()
  })

  mainWindow.webContents.on('did-attach-webview', (_, webviewContents) => {
    webviewContents.setUserAgent(CHROME_UA)
    webviewContents.setWindowOpenHandler((details) => {
      const url = details.url
      if (
        url.includes('accounts.google.com') ||
        url.includes('oauth') ||
        url.includes('auth') ||
        url.includes('login') ||
        url.includes('signin')
      ) {
        const authWindow = new BrowserWindow({
          width: 500,
          height: 650,
          parent: mainWindow,
          modal: false,
          autoHideMenuBar: true,
          webPreferences: { nodeIntegration: false, contextIsolation: true }
        })
        authWindow.webContents.setUserAgent(FIREFOX_UA)
        authWindow.loadURL(url)
        authWindow.webContents.on('will-navigate', (_e, navUrl) => {
          if (navUrl.includes('claude.ai') || navUrl.includes('anthropic.com')) authWindow.close()
        })
        return { action: 'deny' }
      }
      shell.openExternal(url)
      return { action: 'deny' }
    })
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

ipcMain.handle('list-markdown-files', () => {
  const notesDir = join(os.homedir(), 'Notes')
  if (!fs.existsSync(notesDir)) {
    fs.mkdirSync(notesDir, { recursive: true })
  }
  const files = fs.readdirSync(notesDir).filter((file) => file.endsWith('.md'))
  return files
})

ipcMain.handle('create-note', (_event, title: string) => {
  const notesDir = join(os.homedir(), 'Notes')
  if (!fs.existsSync(notesDir)) {
    fs.mkdirSync(notesDir, { recursive: true })
  }
  
  let baseName = title
  let fileName = ''
  
  if (!baseName) {
    baseName = 'note #'
    let counter = 1
    fileName = `${baseName}${counter}.md`
    while (fs.existsSync(join(notesDir, fileName))) {
      counter++
      fileName = `${baseName}${counter}.md`
    }
  } else {
    fileName = title.endsWith('.md') ? title : `${title}.md`
    // Handle duplicates if created manually without exact title
    if (fs.existsSync(join(notesDir, fileName))) {
      let counter = 1
      const nameWithoutExt = fileName.replace('.md', '')
      while (fs.existsSync(join(notesDir, `${nameWithoutExt} ${counter}.md`))) {
        counter++
      }
      fileName = `${nameWithoutExt} ${counter}.md`
    }
  }

  fs.writeFileSync(join(notesDir, fileName), `# ${fileName.replace('.md', '')}`)
  return fileName
})

ipcMain.handle('rename-note', (_event, oldName: string, newName: string) => {
  const notesDir = join(os.homedir(), 'Notes')
  const oldPath = join(notesDir, oldName.endsWith('.md') ? oldName : `${oldName}.md`)
  const newFileName = newName.endsWith('.md') ? newName : `${newName}.md`
  const newPath = join(notesDir, newFileName)
  
  if (fs.existsSync(oldPath) && !fs.existsSync(newPath)) {
    fs.renameSync(oldPath, newPath)
    return newFileName
  }
  return null
})

ipcMain.handle('create-specific-note', (_event, title: string) => {
  const notesDir = join(os.homedir(), 'Notes')
  if (!fs.existsSync(notesDir)) {
    fs.mkdirSync(notesDir, { recursive: true })
  }
  const fileName = title.endsWith('.md') ? title : `${title}.md`
  const filePath = join(notesDir, fileName)
  
  if (!fs.existsSync(filePath)) {
    fs.writeFileSync(filePath, `# ${title}`)
  }
  return fileName
})

ipcMain.handle('read-note', (_event, fileName: string) => {
  const notesDir = join(os.homedir(), 'Notes')
  return fs.readFileSync(join(notesDir, fileName), 'utf-8')
})

ipcMain.handle('write-note', (_event, fileName: string, content: string) => {
  const notesDir = join(os.homedir(), 'Notes')
  fs.writeFileSync(join(notesDir, fileName), content)
})

ipcMain.handle('delete-note', (_event, fileName: string) => {
  const notesDir = join(os.homedir(), 'Notes')
  const filePath = join(notesDir, fileName.endsWith('.md') ? fileName : `${fileName}.md`)
  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath)
    return true
  }
  return false
})

ipcMain.handle('create-note-with-content', (_event, fileName: string, content: string) => {
  const notesDir = join(os.homedir(), 'Notes')
  if (!fs.existsSync(notesDir)) fs.mkdirSync(notesDir, { recursive: true })
  
  const filePath = join(notesDir, fileName)
  if (fs.existsSync(filePath)) {
    const existing = fs.readFileSync(filePath, 'utf-8')
    fs.writeFileSync(filePath, existing + '\n\n---\n\n' + content, 'utf-8')
  } else {
    fs.writeFileSync(filePath, content, 'utf-8')
  }
  return fileName
})

app.whenReady().then(() => {
  electronApp.setAppUserModelId('com.electron')
  app.userAgentFallback = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36'

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  createWindow()

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})