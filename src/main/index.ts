import { app, shell, BrowserWindow, ipcMain } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import fs from 'fs'
import os from 'os'

function createWindow(): void {
  const mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow.show()
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

app.whenReady().then(() => {
  electronApp.setAppUserModelId('com.electron')

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