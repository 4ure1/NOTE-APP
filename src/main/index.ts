import { app, shell, BrowserWindow, ipcMain, session, dialog, protocol, net, Menu } from 'electron'
import path, { join } from 'path'
import { pathToFileURL } from 'url'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import fs from 'fs'
import os from 'os'
import { spawn, ChildProcess, execSync } from 'child_process'
import {
  searchWeb,
  searchYouTube,
  getOllamaStatus,
  callOllamaChat,
  callOllamaInlineCompletion
} from './aiTools'
import { saveSnapshot, getHistory, getVersionContent } from './versionHistory'
import { prepareRenameOrMove, applyRenameOrMove, undoRenameOrMove } from './linkRefactorService'
import { RenameOperationPlan } from '../shared/linkUpdater'
import { expandTemplate, NoteTemplate, TemplateContext } from '../shared/sessionDetector'
import { PdfAnnotation } from '../shared/pdfAnnotations'
import { isPdfUrl } from '../shared/pdfLink'
import { exportToHtml, exportToPdf, exportToDocx, ExportNoteParams } from './exportNote'
import { runAgentLoop, checkOllamaModelAvailable } from './agent/ollamaAgent'
import { globalUndoManager } from './agent/undoManager'
import { AgentRunParams } from './agent/types'
import { resolveNotesDir, isDefaultNotesDir, NOTES_DIR_ENV } from './notesDir'
import {
  assertSafeNotePath,
  assertSafeFileName,
  sanitizeDownloadName,
  PathAccessError,
  SafePathOptions
} from './agent/security'

// Dossier de notes : NOTE_APP_NOTES_DIR si défini (ex. ./test-vault via `npm run dev:safe`), sinon ~/Notes
const NOTES_DIR = resolveNotesDir(process.env[NOTES_DIR_ENV], os.homedir(), process.cwd())
const IS_DEFAULT_NOTES_DIR = isDefaultNotesDir(NOTES_DIR, os.homedir())
console.log(`[Notes] dossier actif : ${NOTES_DIR}`)
const TRASH_DIR = join(NOTES_DIR, '.trash')
const CONFIG_FILE = join(NOTES_DIR, '.config.json')
let currentActiveFolderRel = ''
let globalMainWindow: BrowserWindow | null = null

// Chemin absolu d'un élément du dossier de notes reçu du renderer (refuse toute sortie du dossier)
function notePath(relativePath: string, options?: SafePathOptions): string {
  return assertSafeNotePath(NOTES_DIR, relativePath, options)
}

// Dossier cible d'un import ou d'un téléchargement : dossier demandé, sinon dossier actif, sinon racine
function activeTargetDir(targetFolderRel?: string): string {
  const rel = targetFolderRel || currentActiveFolderRel
  const dir = rel ? notePath(rel, { allowRoot: true }) : NOTES_DIR
  ensureDir(dir)
  return dir
}

// Seules les URL web peuvent être téléchargées ou ouvertes à l'extérieur (pas de file:, javascript:...)
function assertWebUrl(url: string): void {
  let protocol = ''
  try {
    protocol = new URL(url).protocol
  } catch {
    protocol = ''
  }
  if (protocol !== 'http:' && protocol !== 'https:') {
    throw new PathAccessError(`seules les adresses http(s) sont autorisées ("${url}").`)
  }
}

// Extensions qu'open-in-browser peut confier au système (shell.openPath exécuterait un .exe ou un .bat)
const OPENABLE_EXTENSIONS = new Set(['.html', '.htm', '.md', '.pdf', '.txt'])

const chromeVersion = process.versions.chrome || '134.0.6998.35'
const CHROME_UA = `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${chromeVersion} Safari/537.36`
const FIREFOX_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:135.0) Gecko/20100101 Firefox/135.0'

// Éliminer les détections d'automatisation Chromium et autoriser les cookies cross-site pour Google/YouTube
app.commandLine.appendSwitch('disable-blink-features', 'AutomationControlled')
app.commandLine.appendSwitch(
  'disable-features',
  'BlockThirdPartyCookies,PartitionedCookies,AutomationControlled'
)

function getExternalBrowserPath(): string | null {
  const candidatePaths = [
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    `${os.homedir()}\\AppData\\Local\\Google\\Chrome\\Application\\chrome.exe`,
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\BraveSoftware\\Brave-Browser\\Application\\brave.exe'
  ]
  for (const p of candidatePaths) {
    if (fs.existsSync(p)) return p
  }
  return null
}

let activeExternalBrowserProc: ChildProcess | null = null

interface ParsedCookieItem {
  name: string
  value: string
  domain?: string
  path?: string
  secure?: boolean
  httpOnly?: boolean
  sameSite?: 'unspecified' | 'no_restriction' | 'lax' | 'strict'
  expirationDate?: number
}

async function setCookieSafely(
  sessionObj: Electron.Session,
  cookie: ParsedCookieItem,
  fallbackDomain: string
): Promise<boolean> {
  const isHostOnlyPrefix = cookie.name.startsWith('__Host-')
  const isSecurePrefix = cookie.name.startsWith('__Secure-')
  const isSecure = isHostOnlyPrefix || isSecurePrefix || cookie.secure === true

  const rawDomain = cookie.domain || fallbackDomain
  const cleanDomain = rawDomain.startsWith('.') ? rawDomain.slice(1) : rawDomain
  const protocol = isSecure ? 'https://' : 'http://'
  const cookiePath = isHostOnlyPrefix
    ? '/'
    : cookie.path && cookie.path.startsWith('/')
      ? cookie.path
      : '/'

  // URL canonique basée sur le domaine exact du cookie (ne jamais préfixer arbitrairement par www.)
  const primaryUrl = `${protocol}${cleanDomain}${cookiePath}`

  // RÈGLE CHROMIUM STRICTE : SameSite=None ('no_restriction') requiert Secure=true !
  // Si secure est false (ex: SID, HSID, SSID), sameSite DOIT être 'unspecified' sinon Chromium rejette le cookie !
  let sameSite: 'unspecified' | 'no_restriction' | 'lax' | 'strict' = 'unspecified'
  if (cookie.sameSite === 'strict') sameSite = 'strict'
  else if (cookie.sameSite === 'lax') sameSite = 'lax'
  else if (cookie.sameSite === 'no_restriction') {
    sameSite = isSecure ? 'no_restriction' : 'unspecified'
  }

  const details: Electron.CookiesSetDetails = {
    url: primaryUrl,
    name: cookie.name,
    value: cookie.value,
    path: cookiePath,
    secure: isSecure,
    httpOnly: !!cookie.httpOnly,
    sameSite
  }
  if (cookie.expirationDate && cookie.expirationDate > 0) {
    details.expirationDate = Math.floor(cookie.expirationDate)
  }

  // 1ère tentative : avec le domain exact (STRICTEMENT INTERDIT pour __Host-)
  if (!isHostOnlyPrefix && cookie.domain) {
    const d = cookie.domain.startsWith('.') ? cookie.domain : `.${cookie.domain}`
    try {
      await sessionObj.cookies.set({ ...details, domain: d })
      return true
    } catch (_) {}
  }

  // 2ème tentative : sans paramètre domain (Electron lie le cookie à l'hôte exact de l'URL)
  try {
    await sessionObj.cookies.set(details)
    return true
  } catch (_) {}

  // 3ème tentative : pour les domaines comme youtube.com ou google.com, tester avec www.
  if (cleanDomain === 'youtube.com' || cleanDomain === 'google.com') {
    try {
      await sessionObj.cookies.set({
        ...details,
        url: `${protocol}www.${cleanDomain}${cookiePath}`,
        domain: `.${cleanDomain}`
      })
      return true
    } catch (_) {}
  }

  return false
}

function killProcessOnPort(port: number): void {
  try {
    const out = execSync(`netstat -ano | findstr :${port}`, {
      stdio: ['ignore', 'pipe', 'ignore']
    }).toString()
    const lines = out.split(/\r?\n/)
    for (const line of lines) {
      const parts = line.trim().split(/\s+/)
      const pidStr = parts[parts.length - 1]
      const pid = parseInt(pidStr, 10)
      if (!isNaN(pid) && pid > 0 && pid !== process.pid) {
        try {
          execSync(`taskkill /F /PID ${pid}`, { stdio: 'ignore' })
        } catch (_) {}
      }
    }
  } catch (_) {}
}

async function syncCookiesToSessions(cookies: any[]): Promise<number> {
  const youtubeSession = session.fromPartition('persist:youtube')
  const claudeSession = session.fromPartition('persist:claude')
  const defaultSession = session.defaultSession

  let syncedCount = 0
  for (const c of cookies) {
    let parsedSameSite: 'unspecified' | 'no_restriction' | 'lax' | 'strict' | undefined = undefined
    if (typeof c.sameSite === 'string') {
      const s = c.sameSite.toLowerCase()
      if (s === 'strict') parsedSameSite = 'strict'
      else if (s === 'lax') parsedSameSite = 'lax'
      else if (s === 'none' || s === 'no_restriction') parsedSameSite = 'no_restriction'
    }

    const item: ParsedCookieItem = {
      name: c.name,
      value: c.value,
      domain: c.domain,
      path: c.path,
      secure: !!c.secure,
      httpOnly: !!c.httpOnly,
      sameSite: parsedSameSite,
      expirationDate: c.expires > 0 ? c.expires : undefined
    }

    const ok1 = await setCookieSafely(youtubeSession, item, 'youtube.com')
    await setCookieSafely(claudeSession, item, 'claude.ai')
    await setCookieSafely(defaultSession, item, 'google.com')
    if (ok1) syncedCount++
  }

  try {
    await youtubeSession.flushStorageData()
    await claudeSession.flushStorageData()
    await defaultSession.flushStorageData()
  } catch (_) {}

  return syncedCount
}

async function syncCookiesFromBrowser(
  service: 'youtube' | 'claude' = 'youtube'
): Promise<{ success: boolean; count: number }> {
  const port = 9338
  try {
    const res = await net.fetch(`http://127.0.0.1:${port}/json/version`)
    if (!res.ok) {
      const ytSession = session.fromPartition('persist:claude')
      const cookies = await ytSession.cookies.get({})
      const hasLogin = cookies.some(
        (c) => (c.domain || '').includes('youtube.com') && c.name === 'LOGIN_INFO'
      )
      return { success: hasLogin, count: cookies.length }
    }
    const info = (await res.json()) as { webSocketDebuggerUrl?: string }
    if (!info.webSocketDebuggerUrl) return { success: false, count: 0 }

    return new Promise((resolve) => {
      const WebSocketCtor = (globalThis as any).WebSocket
      if (!WebSocketCtor) {
        resolve({ success: false, count: 0 })
        return
      }
      const ws = new WebSocketCtor(info.webSocketDebuggerUrl)
      let resolved = false
      const timer = setTimeout(() => {
        if (!resolved) {
          resolved = true
          try {
            ws.close()
          } catch (_) {}
          resolve({ success: false, count: 0 })
        }
      }, 5000)

      ws.onopen = () => {
        ws.send(JSON.stringify({ id: 900, method: 'Storage.getCookies' }))
      }
      ws.onmessage = async (evt: any) => {
        if (resolved) return
        try {
          const data = JSON.parse(evt.data.toString())
          if (data.id === 900 && data.result?.cookies) {
            resolved = true
            clearTimeout(timer)
            const count = await syncCookiesToSessions(data.result.cookies)
            try {
              ws.send(JSON.stringify({ id: 9999, method: 'Browser.close' }))
              ws.close()
            } catch (_) {}
            if (globalMainWindow && !globalMainWindow.isDestroyed()) {
              globalMainWindow.webContents.send('google-login-success', service)
            }
            resolve({ success: count > 0, count })
          }
        } catch (_) {
          if (!resolved) {
            resolved = true
            clearTimeout(timer)
            resolve({ success: false, count: 0 })
          }
        }
      }
      ws.onerror = () => {
        if (!resolved) {
          resolved = true
          clearTimeout(timer)
          resolve({ success: false, count: 0 })
        }
      }
    })
  } catch (_) {
    return { success: false, count: 0 }
  }
}

let activeGoogleLoginWindow: BrowserWindow | null = null

async function openGoogleLoginWindow(
  service: 'youtube' | 'claude' | 'default' = 'default',
  customUrl?: string
): Promise<boolean> {
  if (activeGoogleLoginWindow && !activeGoogleLoginWindow.isDestroyed()) {
    activeGoogleLoginWindow.focus()
    return true
  }

  // Utiliser la partition partagée persist:claude pour tous les services Google / IA
  const targetSession = session.fromPartition('persist:claude')

  let initialUrl = customUrl
  if (service === 'youtube' || (customUrl && customUrl.includes('youtube'))) {
    initialUrl =
      'https://accounts.google.com/ServiceLogin?service=youtube&continue=https%3A%2F%2Fwww.youtube.com%2F&hl=fr'
  } else if (service === 'claude') {
    initialUrl = customUrl || 'https://claude.ai/login'
  } else if (!initialUrl || initialUrl.includes('signin/rejected')) {
    initialUrl = 'https://accounts.google.com'
  }

  console.log(
    `[GoogleLoginWindow] Ouverture de la popup de connexion Google (service=${service}, url=${initialUrl})...`
  )

  const loginWin = new BrowserWindow({
    width: 520,
    height: 700,
    title: 'Connexion Google',
    autoHideMenuBar: true,
    parent: globalMainWindow && !globalMainWindow.isDestroyed() ? globalMainWindow : undefined,
    modal: false,
    show: true,
    webPreferences: {
      session: targetSession,
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  activeGoogleLoginWindow = loginWin
  loginWin.webContents.setUserAgent(CHROME_UA)

  return new Promise((resolve) => {
    let resolved = false
    let cookieTimer: NodeJS.Timeout | null = null

    const checkSuccessAndClose = async (navUrl: string) => {
      const lower = navUrl.toLowerCase()
      const isYoutubeDone =
        lower.includes('youtube.com') &&
        !lower.includes('accounts.google.com') &&
        !lower.includes('servicelogin')
      const isGoogleDone =
        lower.includes('myaccount.google.com') ||
        (lower.includes('google.com') &&
          !lower.includes('accounts.google.com') &&
          !lower.includes('signin') &&
          !lower.includes('servicelogin'))
      const isClaudeDone =
        service === 'claude' && lower.includes('claude.ai') && !lower.includes('login')
      const isChatGptDone =
        lower.includes('chatgpt.com') && !lower.includes('login') && !lower.includes('auth')

      if (isYoutubeDone || isGoogleDone || isClaudeDone || isChatGptDone) {
        if (!resolved) {
          resolved = true
          if (cookieTimer) {
            clearInterval(cookieTimer)
            cookieTimer = null
          }
          console.log(
            `[GoogleLoginWindow] Connexion Google confirmée pour ${service} (URL: ${navUrl}) !`
          )
          try {
            await targetSession.flushStorageData()
            await session.fromPartition('persist:youtube').flushStorageData()
            await session.defaultSession.flushStorageData()
          } catch (_) {}

          if (globalMainWindow && !globalMainWindow.isDestroyed()) {
            globalMainWindow.webContents.send('google-login-success', service)
          }

          setTimeout(() => {
            if (loginWin && !loginWin.isDestroyed()) {
              loginWin.close()
            }
          }, 600)
          resolve(true)
        }
      }
    }

    // Vérification périodique des cookies (détection ultra rapide dès validation Google)
    cookieTimer = setInterval(async () => {
      if (resolved || loginWin.isDestroyed()) {
        if (cookieTimer) clearInterval(cookieTimer)
        return
      }
      try {
        const cookies = await targetSession.cookies.get({})
        const hasLogin = cookies.some(
          (c) => (c.domain || '').includes('youtube.com') && c.name === 'LOGIN_INFO'
        )
        const hasSid = cookies.some(
          (c) => (c.domain || '').includes('google.com') && c.name === 'SID'
        )
        const currentUrl = loginWin.webContents.getURL() || ''
        const lower = currentUrl.toLowerCase()

        if (
          hasLogin ||
          (hasSid && lower.includes('youtube.com') && !lower.includes('servicelogin'))
        ) {
          if (cookieTimer) clearInterval(cookieTimer)
          checkSuccessAndClose(currentUrl || 'https://www.youtube.com/')
        }
      } catch (_) {}
    }, 1000)

    loginWin.webContents.on('did-navigate', (_e, navUrl) => {
      loginWin.webContents.setUserAgent(CHROME_UA)
      checkSuccessAndClose(navUrl)
    })

    loginWin.webContents.on('did-navigate-in-page', (_e, navUrl) => {
      checkSuccessAndClose(navUrl)
    })

    loginWin.on('closed', () => {
      if (cookieTimer) {
        clearInterval(cookieTimer)
        cookieTimer = null
      }
      activeGoogleLoginWindow = null
      if (!resolved) {
        resolved = true
        targetSession.cookies
          .get({})
          .then((cookies) => {
            const hasSid = cookies.some(
              (c) => (c.domain || '').includes('google.com') && c.name === 'SID'
            )
            const hasLogin = cookies.some(
              (c) => (c.domain || '').includes('youtube.com') && c.name === 'LOGIN_INFO'
            )
            const ok = hasSid || hasLogin
            if (ok && globalMainWindow && !globalMainWindow.isDestroyed()) {
              globalMainWindow.webContents.send('google-login-success', service)
            }
            resolve(ok)
          })
          .catch(() => resolve(false))
      }
    })

    loginWin.loadURL(initialUrl)
  })
}

function setupCookieSynchronization(): void {
  // Tous les services (YouTube, Gemini, Claude, ChatGPT) partagent désormais nativement
  // la partition 'persist:claude'. Ils ont donc le même magasin de cookies sans clonage.
  console.log('[Cookies] Partition partagée persist:claude active pour tous les services.')
}

export async function loginWithExternalBrowser(
  service: 'youtube' | 'claude' | 'default' = 'youtube',
  customUrl?: string,
  targetWebview?: Electron.WebContents
): Promise<boolean> {
  const browserPath = getExternalBrowserPath()
  if (!browserPath) {
    console.error('[ExternalBrowser] Aucun navigateur compatible (Chrome/Edge/Brave) trouvé!')
    return false
  }

  const port = 9338

  // Fermer proprement toute instance précédente résiduelle et libérer le port 9338
  if (activeExternalBrowserProc && !activeExternalBrowserProc.killed) {
    try {
      activeExternalBrowserProc.kill()
    } catch (_) {}
    activeExternalBrowserProc = null
  }
  killProcessOnPort(port)

  const profileDir = join(app.getPath('userData'), 'ExternalAuthProfile')
  if (!fs.existsSync(profileDir)) {
    fs.mkdirSync(profileDir, { recursive: true })
  }

  // Nettoyer les fichiers de verrouillage résiduels (SingletonLock)
  for (const lockName of ['SingletonLock', 'SingletonCookie', 'SingletonSocket']) {
    const lockPath = join(profileDir, lockName)
    if (fs.existsSync(lockPath)) {
      try {
        fs.unlinkSync(lockPath)
      } catch (_) {}
    }
  }

  let loginUrl = customUrl
  if (!loginUrl || loginUrl.includes('signin/rejected')) {
    if (service === 'youtube') {
      loginUrl =
        'https://accounts.google.com/ServiceLogin?service=youtube&continue=https%3A%2F%2Fwww.youtube.com%2F'
    } else if (service === 'claude') {
      loginUrl = 'https://claude.ai/login'
    } else {
      loginUrl = 'https://accounts.google.com'
    }
  }

  console.log(`[ExternalBrowser] Lancement de ${browserPath} sur le port ${port}...`)
  const proc = spawn(
    browserPath,
    [
      `--remote-debugging-port=${port}`,
      `--user-data-dir=${profileDir}`,
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-features=DiceWebSigninIntercept,ChromeWhatsNewUI',
      '--signin-intercept-promo=0',
      '--disable-sync',
      loginUrl
    ],
    {
      detached: true,
      stdio: 'ignore',
      windowsHide: false
    }
  )
  proc.unref()
  activeExternalBrowserProc = proc

  return new Promise((resolve) => {
    let checkInterval: NodeJS.Timeout | null = null
    let ws: any = null
    let isFinished = false
    let lastRetrievedCookies: any[] = []

    const cleanup = () => {
      isFinished = true
      if (checkInterval) {
        clearInterval(checkInterval)
        checkInterval = null
      }
      if (ws) {
        try {
          ws.send(JSON.stringify({ id: 9999, method: 'Browser.close' }))
          ws.close()
        } catch (_) {}
        ws = null
      }
      if (activeExternalBrowserProc && !activeExternalBrowserProc.killed) {
        try {
          activeExternalBrowserProc.kill()
        } catch (_) {}
        activeExternalBrowserProc = null
      }
    }

    const finalizeSuccess = async (cookiesToSync: any[]): Promise<void> => {
      if (isFinished) return
      isFinished = true
      console.log(
        `[ExternalBrowser] Connexion confirmée pour ${service} ! Synchronisation de ${cookiesToSync.length} cookies...`
      )

      if (checkInterval) {
        clearInterval(checkInterval)
        checkInterval = null
      }

      const synced = await syncCookiesToSessions(cookiesToSync)
      console.log(
        `[ExternalBrowser] Synchronisation terminée : ${synced}/${cookiesToSync.length} cookies appliqués avec succès.`
      )

      cleanup()

      if (targetWebview && !targetWebview.isDestroyed()) {
        try {
          const cur = (targetWebview.getURL() || '').toLowerCase()
          if (cur.includes('accounts.google.com') || cur === 'about:blank' || !cur) {
            if (service === 'youtube' || cur.includes('youtube')) {
              targetWebview.loadURL('https://www.youtube.com/')
            } else {
              targetWebview.loadURL('https://claude.ai/')
            }
          } else {
            targetWebview.reloadIgnoringCache()
          }
        } catch (_) {}
      }

      if (globalMainWindow && !globalMainWindow.isDestroyed()) {
        globalMainWindow.webContents.send('google-login-success', service)
      }

      resolve(true)
    }

    const connectCDP = async (): Promise<boolean> => {
      try {
        const res = await net.fetch(`http://127.0.0.1:${port}/json/version`)
        if (!res.ok) return false
        const info = (await res.json()) as { webSocketDebuggerUrl?: string }
        if (!info.webSocketDebuggerUrl) return false

        const WebSocketCtor = (globalThis as any).WebSocket
        if (!WebSocketCtor) {
          console.error('[ExternalBrowser] WebSocket non disponible')
          return false
        }

        ws = new WebSocketCtor(info.webSocketDebuggerUrl)

        ws.onopen = () => {
          console.log(
            '[ExternalBrowser] Connecté à Chrome via CDP ! Surveillance des cookies de session...'
          )
          try {
            ws.send(JSON.stringify({ id: 100, method: 'Storage.getCookies' }))
          } catch (_) {}

          checkInterval = setInterval(async () => {
            if (ws && ws.readyState === 1 && !isFinished) {
              try {
                ws.send(JSON.stringify({ id: 100, method: 'Storage.getCookies' }))
              } catch (_) {}
            }
          }, 1000)
        }

        ws.onclose = async () => {
          console.log('[ExternalBrowser] WebSocket déconnecté.')
          if (!isFinished) {
            const hasLoginInfo = lastRetrievedCookies.some(
              (c) => c.domain.includes('youtube.com') && c.name === 'LOGIN_INFO'
            )
            const hasSid = lastRetrievedCookies.some(
              (c) =>
                (c.domain.includes('youtube.com') || c.domain.includes('google.com')) &&
                c.name === 'SID'
            )
            const hasSapisid = lastRetrievedCookies.some(
              (c) =>
                (c.domain.includes('youtube.com') || c.domain.includes('google.com')) &&
                c.name === 'SAPISID'
            )
            const hasGoogleAuth = hasSid && hasSapisid

            let canSucceed = false
            if (service === 'youtube') {
              canSucceed = hasLoginInfo || hasGoogleAuth
            } else if (service === 'claude') {
              canSucceed =
                lastRetrievedCookies.some(
                  (c) =>
                    c.domain.includes('claude.ai') &&
                    (c.name.includes('session') ||
                      c.name.includes('token') ||
                      c.name === 'lastActiveOrg')
                ) || hasGoogleAuth
            } else {
              canSucceed = hasGoogleAuth
            }

            if (canSucceed && lastRetrievedCookies.length > 0) {
              console.log(
                "[ExternalBrowser] Chrome fermé, mais cookies d'authentification valides détectés !"
              )
              await finalizeSuccess(lastRetrievedCookies)
              return
            }

            cleanup()
            resolve(false)
          }
        }

        ws.onerror = (e: any) => {
          console.error('[ExternalBrowser] Erreur WebSocket:', e)
        }

        ws.onmessage = async (evt: any) => {
          if (isFinished) return
          try {
            const data = JSON.parse(evt.data.toString())
            if (data.id === 100 && data.result?.cookies) {
              const cookies: any[] = data.result.cookies
              lastRetrievedCookies = cookies

              const hasLoginInfo = cookies.some(
                (c) => c.domain.includes('youtube.com') && c.name === 'LOGIN_INFO'
              )
              const hasSid = cookies.some(
                (c) =>
                  (c.domain.includes('youtube.com') || c.domain.includes('google.com')) &&
                  c.name === 'SID'
              )
              const hasSapisid = cookies.some(
                (c) =>
                  (c.domain.includes('youtube.com') || c.domain.includes('google.com')) &&
                  c.name === 'SAPISID'
              )
              const hasGoogleAuth = hasSid && hasSapisid

              let hasLoggedIn = false
              if (service === 'youtube') {
                hasLoggedIn = hasLoginInfo
                if (!hasLoginInfo && hasGoogleAuth) {
                  try {
                    const tabsRes = await net.fetch(`http://127.0.0.1:${port}/json`)
                    if (tabsRes.ok) {
                      const tabs = (await tabsRes.json()) as any[]
                      for (const t of tabs) {
                        if (t.type === 'page' && !t.url.includes('youtube.com')) {
                          const pageWs = new WebSocketCtor(t.webSocketDebuggerUrl)
                          pageWs.onopen = () => {
                            pageWs.send(
                              JSON.stringify({
                                id: 1,
                                method: 'Page.navigate',
                                params: { url: 'https://www.youtube.com/' }
                              })
                            )
                            setTimeout(() => {
                              try {
                                pageWs.close()
                              } catch (_) {}
                            }, 500)
                          }
                        }
                      }
                    }
                  } catch (_) {}
                }
              } else if (service === 'claude') {
                hasLoggedIn =
                  cookies.some(
                    (c) =>
                      c.domain.includes('claude.ai') &&
                      (c.name.includes('session') ||
                        c.name.includes('token') ||
                        c.name === 'lastActiveOrg')
                  ) || hasGoogleAuth
              } else {
                hasLoggedIn = hasGoogleAuth
              }

              if (hasLoggedIn && !isFinished) {
                await finalizeSuccess(cookies)
              }
            }
          } catch (e) {
            console.error('[ExternalBrowser] Erreur parsing cookies:', e)
          }
        }

        return true
      } catch (_) {
        return false
      }
    }

    let attempts = 0
    const retryInterval = setInterval(async () => {
      if (isFinished) {
        clearInterval(retryInterval)
        return
      }

      attempts++
      const ok = await connectCDP()
      if (ok) {
        clearInterval(retryInterval)
        return
      }

      if (attempts >= 300) {
        console.warn("[ExternalBrowser] Délai d'attente dépassé (300s) sans connexion CDP.")
        clearInterval(retryInterval)
        cleanup()
        resolve(false)
      }
    }, 1000)
  })
}

async function applyCookiesToSession(
  targetSession: Electron.Session,
  defaultDomain: string,
  rawInput: string
): Promise<number> {
  const trimmed = rawInput.trim()
  if (!trimmed) return 0

  const parsedItems: ParsedCookieItem[] = []

  // 1. Format JSON (ex: export Cookie-Editor ou EditThisCookie)
  if (
    (trimmed.startsWith('[') && trimmed.endsWith(']')) ||
    (trimmed.startsWith('{') && trimmed.endsWith('}'))
  ) {
    try {
      const parsed = JSON.parse(trimmed)
      if (Array.isArray(parsed)) {
        for (const c of parsed) {
          if (!c.name || c.value === undefined) continue
          let parsedSameSite: 'unspecified' | 'no_restriction' | 'lax' | 'strict' | undefined =
            undefined
          if (typeof c.sameSite === 'string') {
            const s = c.sameSite.toLowerCase()
            if (s === 'strict') parsedSameSite = 'strict'
            else if (s === 'lax') parsedSameSite = 'lax'
            else if (s === 'no_restriction' || s === 'none') parsedSameSite = 'no_restriction'
          }
          parsedItems.push({
            name: String(c.name).trim(),
            value: String(c.value).trim(),
            domain: c.domain || defaultDomain,
            path: c.path || '/',
            secure: !!c.secure,
            httpOnly: !!c.httpOnly,
            sameSite: parsedSameSite,
            expirationDate: c.expirationDate || c.expires
          })
        }
      } else if (typeof parsed === 'object' && parsed !== null) {
        for (const [key, val] of Object.entries(parsed)) {
          if (key && typeof val === 'string') {
            parsedItems.push({
              name: key.trim(),
              value: val.trim(),
              domain: defaultDomain,
              path: '/',
              secure: true
            })
          }
        }
      }
    } catch (e) {
      console.warn('[applyCookiesToSession] Échec du parse JSON:', e)
    }
  }

  // 2. Format Netscape / curl cookie file (tab-separated)
  if (parsedItems.length === 0 && trimmed.includes('\t')) {
    const lines = trimmed.split(/\r?\n/)
    for (const line of lines) {
      const cleanLine = line.trim()
      if (!cleanLine || (cleanLine.startsWith('#') && !cleanLine.startsWith('#HttpOnly_'))) continue
      const parts = cleanLine.split('\t')
      if (parts.length >= 7) {
        const domain = parts[0].replace(/^#HttpOnly_/, '')
        const path = parts[2] || '/'
        const secure = parts[3].toUpperCase() === 'TRUE'
        const exp = parseInt(parts[4], 10)
        const name = parts[5].trim()
        const value = parts[6].trim()
        if (name) {
          parsedItems.push({
            name,
            value,
            domain,
            path,
            secure,
            httpOnly: cleanLine.startsWith('#HttpOnly_'),
            expirationDate: isNaN(exp) ? undefined : exp
          })
        }
      }
    }
  }

  // 3. Format header standard (clé=valeur; clé2=valeur2) ou séparé par sauts de ligne
  if (parsedItems.length === 0) {
    const entries = trimmed.split(/[;\n]/)
    for (const entry of entries) {
      const clean = entry.trim()
      const idx = clean.indexOf('=')
      if (idx > 0) {
        const name = clean.slice(0, idx).trim()
        const value = clean.slice(idx + 1).trim()
        if (
          name &&
          !name.toLowerCase().startsWith('path') &&
          !name.toLowerCase().startsWith('expires')
        ) {
          parsedItems.push({
            name,
            value,
            domain: defaultDomain,
            path: '/',
            secure: true
          })
        }
      }
    }
  }

  console.log(
    `[applyCookiesToSession] ${parsedItems.length} cookies extraits du texte pour ${defaultDomain}`
  )

  let count = 0
  const ytSession = session.fromPartition('persist:youtube')
  const claudeSession = session.fromPartition('persist:claude')

  for (const item of parsedItems) {
    const ok = await setCookieSafely(targetSession, item, defaultDomain)
    await setCookieSafely(ytSession, item, defaultDomain)
    await setCookieSafely(claudeSession, item, defaultDomain)
    await setCookieSafely(session.defaultSession, item, defaultDomain)
    if (ok) count++
  }

  try {
    await targetSession.flushStorageData()
    await ytSession.flushStorageData()
    await claudeSession.flushStorageData()
    await session.defaultSession.flushStorageData()
  } catch (_) {}

  console.log(
    `[applyCookiesToSession] ${count}/${parsedItems.length} cookies appliqués avec succès !`
  )
  return count
}

protocol.registerSchemesAsPrivileged([
  {
    scheme: 'note-pdf',
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      corsEnabled: true,
      stream: true,
      bypassCSP: true
    }
  }
])

function createWindow(): void {
  const applySessionSettings = (ses: Electron.Session) => {
    ses.setUserAgent(CHROME_UA)

    ses.webRequest.onBeforeSendHeaders((details, callback) => {
      const lower = details.url.toLowerCase()
      const referrer = (details.referrer || '').toLowerCase()
      const isGoogleAuth =
        lower.includes('accounts.google.') ||
        lower.includes('accounts.youtube.') ||
        lower.includes('oauth') ||
        lower.includes('auth0') ||
        lower.includes('signin') ||
        lower.includes('servicelogin') ||
        (referrer.includes('accounts.google.') &&
          (lower.includes('gstatic.com') ||
            lower.includes('google.com') ||
            lower.includes('googleapis.com') ||
            lower.includes('googleusercontent.com') ||
            lower.includes('recaptcha.net')))

      if (isGoogleAuth) {
        details.requestHeaders['User-Agent'] = FIREFOX_UA
        for (const key in details.requestHeaders) {
          if (key.toLowerCase().startsWith('sec-ch-ua')) {
            delete details.requestHeaders[key]
          }
        }
      } else {
        details.requestHeaders['User-Agent'] = CHROME_UA
      }
      callback({ requestHeaders: details.requestHeaders })
    })

    ses.setPermissionRequestHandler((_wc, permission, callback) => {
      callback(['notifications', 'media', 'geolocation', 'clipboard-read'].includes(permission))
    })
  }

  applySessionSettings(session.defaultSession)
  applySessionSettings(session.fromPartition('persist:claude'))

  const mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    show: true,
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      webviewTag: true,
      plugins: true,
      backgroundThrottling: false
    }
  })
  globalMainWindow = mainWindow

  // Rappel visuel quand l'app ne travaille pas sur le vrai dossier de notes
  if (!IS_DEFAULT_NOTES_DIR) {
    mainWindow.on('page-title-updated', (event, title) => {
      event.preventDefault()
      mainWindow.setTitle(`${title} [TEST-VAULT]`)
    })
  }

  mainWindow.on('ready-to-show', () => {
    mainWindow.show()
  })

  // Synchronisation du plein écran et capture inconditionnelle de Escape
  mainWindow.on('enter-full-screen', () => {
    mainWindow.webContents.send('fullscreen-change', true)
  })

  mainWindow.on('leave-full-screen', () => {
    mainWindow.webContents.send('fullscreen-change', false)
  })

  mainWindow.webContents.on('before-input-event', (event, input) => {
    if (input.key === 'Escape' && input.type === 'keyDown') {
      if (mainWindow.isFullScreen()) {
        event.preventDefault()
        mainWindow.setFullScreen(false)
      }
      mainWindow.webContents.send('escape-pressed')
    }
    if (
      (input.control || input.meta) &&
      (input.key.toLowerCase() === 'r' || input.code === 'KeyR') &&
      input.type === 'keyDown'
    ) {
      event.preventDefault()
      mainWindow.webContents.send('shortcut-recent')
    }
    if (
      (input.control || input.meta) &&
      (input.key.toLowerCase() === 'j' || input.code === 'KeyJ') &&
      input.type === 'keyDown'
    ) {
      event.preventDefault()
      mainWindow.webContents.send('shortcut-toggle-ai')
    }
    if (
      (input.control || input.meta) &&
      (input.key.toLowerCase() === 'f' || input.code === 'KeyF') &&
      input.type === 'keyDown'
    ) {
      event.preventDefault()
      mainWindow.webContents.send('shortcut-toggle-fullscreen')
    }
  })

  // Surveillance en temps réel du dossier de notes (création, suppression, renommage depuis l'explorateur Windows)
  let fileWatcher: fs.FSWatcher | null = null
  let debounceTimeout: NodeJS.Timeout | null = null

  const startWatcher = () => {
    ensureDir(NOTES_DIR)
    try {
      if (fileWatcher) {
        fileWatcher.close()
        fileWatcher = null
      }
      fileWatcher = fs.watch(NOTES_DIR, { recursive: true }, (_eventType, filename) => {
        if (filename && filename.includes('.snippets')) {
          if (!mainWindow.isDestroyed()) {
            mainWindow.webContents.send('snippets-updated')
          }
          return
        }
        // Ignorer la corbeille interne, la config ou les fichiers temporaires
        if (filename && (filename.startsWith('.') || filename.includes('node_modules'))) {
          return
        }
        if (debounceTimeout) clearTimeout(debounceTimeout)
        debounceTimeout = setTimeout(() => {
          if (!mainWindow.isDestroyed()) {
            mainWindow.webContents.send('notes-updated')
          }
        }, 200)
      })
    } catch (err) {
      console.error('File watcher error:', err)
    }
  }

  startWatcher()

  // Quand l'application reprend le focus (ex: après une suppression dans l'Explorateur Windows)
  mainWindow.on('focus', () => {
    if (!mainWindow.isDestroyed()) {
      mainWindow.webContents.send('notes-updated')
    }
  })

  mainWindow.on('closed', () => {
    if (globalMainWindow === mainWindow) {
      globalMainWindow = null
    }
    if (fileWatcher) {
      try {
        fileWatcher.close()
      } catch (_) {}
      fileWatcher = null
    }
  })

  // Intercepter les téléchargements (HTML, PDF, images...) pour les placer dans le dossier actif
  const handleDownload = (_event: any, item: Electron.DownloadItem) => {
    ensureDir(NOTES_DIR)
    let targetDir = NOTES_DIR
    try {
      targetDir = activeTargetDir()
    } catch (err) {
      console.error('[Download] Dossier actif refusé, téléchargement annulé :', err)
      item.cancel()
      return
    }

    // Le nom vient du site distant : on le nettoie (pas de "..", de lecteur ni de nom réservé)
    const rawFilename = sanitizeDownloadName(item.getFilename() || 'document.pdf', '')
    let finalPath = join(targetDir, rawFilename)

    if (fs.existsSync(finalPath)) {
      const ext = path.extname(rawFilename)
      const base = path.basename(rawFilename, ext)
      let counter = 1
      while (fs.existsSync(join(targetDir, `${base} (${counter})${ext}`))) {
        counter++
      }
      finalPath = join(targetDir, `${base} (${counter})${ext}`)
    }

    item.setSavePath(finalPath)

    item.once('done', (_e, state) => {
      console.log('[Download] Fichier terminé, state:', state, 'path:', finalPath)
      if (state === 'completed') {
        if (!mainWindow.isDestroyed()) {
          const rel = path.relative(NOTES_DIR, finalPath).replace(/\\/g, '/')
          mainWindow.webContents.send('notes-updated')
          mainWindow.webContents.send('download-completed', rel, path.basename(finalPath))
        }
      }
    })
  }

  session.defaultSession.on('will-download', handleDownload)

  mainWindow.webContents.on('did-attach-webview', (_, webviewContents) => {
    webviewContents.setUserAgent(CHROME_UA)
    try {
      webviewContents.setBackgroundThrottling(false)
    } catch (_) {}

    // Helper: télécharger un PDF depuis une URL et le sauvegarder dans le dossier actif
    const downloadPdfFromUrl = async (pdfUrl: string) => {
      try {
        ensureDir(NOTES_DIR)
        assertWebUrl(pdfUrl)
        const targetDir = activeTargetDir()
        const res = await net.fetch(pdfUrl)
        if (!res.ok) {
          shell.openExternal(pdfUrl)
          return
        }
        const buf = Buffer.from(await res.arrayBuffer())
        const disposition = res.headers.get('content-disposition') || ''
        let fname = ''
        const m = disposition.match(/filename\*?=["']?(?:UTF-8'')?([^;"'\r\n]+)/i)
        if (m) fname = decodeURIComponent(m[1].trim())
        if (!fname)
          fname = decodeURIComponent(pdfUrl.split('/').pop()?.split('?')[0] || 'document.pdf')
        // Nom fourni par le serveur distant (Content-Disposition ou URL) : nettoyé avant usage
        fname = sanitizeDownloadName(fname)
        let destPath = join(targetDir, fname)
        if (fs.existsSync(destPath)) {
          const ext = path.extname(fname)
          const base = path.basename(fname, ext)
          let c = 1
          while (fs.existsSync(join(targetDir, `${base} (${c})${ext}`))) c++
          destPath = join(targetDir, `${base} (${c})${ext}`)
        }
        fs.writeFileSync(destPath, buf)
        console.log('[Download-pdf] PDF sauvegardé:', destPath)
        if (!mainWindow.isDestroyed()) {
          const rel = path.relative(NOTES_DIR, destPath).replace(/\\/g, '/')
          mainWindow.webContents.send('notes-updated')
          mainWindow.webContents.send('download-completed', rel, fname)
        }
      } catch (err) {
        console.error('[Download-pdf] Erreur téléchargement PDF:', err)
        if (!(err instanceof PathAccessError)) shell.openExternal(pdfUrl)
      }
    }

    // Intercepte les navigations directes dans le webview (PDF uniquement) et prépare le User-Agent
    webviewContents.on('will-navigate', (event, navUrl) => {
      const lowerUrl = navUrl.toLowerCase()
      if (
        isPdfUrl(navUrl) ||
        lowerUrl.includes('files.oaiusercontent.com') ||
        lowerUrl.includes('/download')
      ) {
        event.preventDefault()
        downloadPdfFromUrl(navUrl)
        return
      }
      if (
        lowerUrl.includes('accounts.google.') ||
        lowerUrl.includes('accounts.youtube.') ||
        lowerUrl.includes('signin')
      ) {
        webviewContents.setUserAgent(FIREFOX_UA)
      } else if (!lowerUrl.includes('google.') && !lowerUrl.includes('gstatic.')) {
        webviewContents.setUserAgent(CHROME_UA)
      }
    })

    webviewContents.on('did-navigate', (_e, navUrl) => {
      const lowerUrl = navUrl.toLowerCase()
      if (
        lowerUrl.includes('accounts.google.') ||
        lowerUrl.includes('accounts.youtube.') ||
        lowerUrl.includes('signin')
      ) {
        webviewContents.setUserAgent(FIREFOX_UA)
      } else if (!lowerUrl.includes('google.') && !lowerUrl.includes('gstatic.')) {
        webviewContents.setUserAgent(CHROME_UA)
      }
    })

    webviewContents.setWindowOpenHandler((details) => {
      const url = details.url
      const lowerUrl = url.toLowerCase()
      // PDF ou téléchargement ouvert dans nouvel onglet → intercepter
      if (
        isPdfUrl(url) ||
        lowerUrl.includes('files.oaiusercontent.com') ||
        lowerUrl.includes('/download') ||
        url.startsWith('blob:')
      ) {
        if (url.startsWith('blob:')) {
          try {
            webviewContents.downloadURL(url)
          } catch (_) {
            downloadPdfFromUrl(url)
          }
        } else {
          downloadPdfFromUrl(url)
        }
        return { action: 'deny' }
      }

      // Autoriser les popups d'authentification OAuth (Google, Apple, Claude, OpenAI, ChatGPT, etc.)
      if (
        lowerUrl.includes('accounts.google.com') ||
        lowerUrl.includes('appleid.apple.com') ||
        lowerUrl.includes('auth0.com') ||
        lowerUrl.includes('auth.openai.com') ||
        lowerUrl.includes('claude.ai') ||
        lowerUrl.includes('chatgpt.com') ||
        lowerUrl.includes('oaistatic.com') ||
        lowerUrl.includes('google.com')
      ) {
        return {
          action: 'allow',
          overrideBrowserWindowOptions: {
            width: 520,
            height: 680,
            autoHideMenuBar: true,
            webPreferences: {
              session: session.fromPartition('persist:claude'),
              sandbox: false
            }
          }
        }
      }

      // Liens YouTube (vidéos, chaînes, playlists)
      if (lowerUrl.includes('youtube.com') || lowerUrl.includes('youtu.be')) {
        return { action: 'allow' }
      }

      // Autres liens externes → navigateur système
      shell.openExternal(url)
      return { action: 'deny' }
    })

    webviewContents.on('before-input-event', (event, input) => {
      if (input.key === 'Escape' && input.type === 'keyDown') {
        if (mainWindow.isFullScreen()) {
          event.preventDefault()
          mainWindow.setFullScreen(false)
        }
        mainWindow.webContents.send('escape-pressed')
      }
      if (
        (input.control || input.meta) &&
        (input.key.toLowerCase() === 'r' || input.code === 'KeyR') &&
        input.type === 'keyDown'
      ) {
        event.preventDefault()
        mainWindow.webContents.send('shortcut-recent')
      }
      if (
        (input.control || input.meta) &&
        (input.key.toLowerCase() === 'j' || input.code === 'KeyJ') &&
        input.type === 'keyDown'
      ) {
        event.preventDefault()
        mainWindow.webContents.send('shortcut-toggle-ai')
      }
      if (
        (input.control || input.meta) &&
        (input.key.toLowerCase() === 'f' || input.code === 'KeyF') &&
        input.type === 'keyDown'
      ) {
        event.preventDefault()
        mainWindow.webContents.send('shortcut-toggle-fullscreen')
      }
    })

    webviewContents.on('context-menu', (_e, params) => {
      const menu = Menu.buildFromTemplate([
        { role: 'cut', label: 'Couper' },
        { role: 'copy', label: 'Copier' },
        { role: 'paste', label: 'Coller' },
        { type: 'separator' },
        {
          label: "Inspecter l'élément",
          click: () => {
            webviewContents.inspectElement(params.x, params.y)
            if (!webviewContents.isDevToolsOpened()) {
              webviewContents.openDevTools({ mode: 'detach' })
            }
          }
        },
        {
          label: 'Ouvrir les outils de développement (DevTools)',
          click: () => {
            if (webviewContents.isDevToolsOpened()) {
              webviewContents.closeDevTools()
            } else {
              webviewContents.openDevTools({ mode: 'detach' })
            }
          }
        }
      ])
      menu.popup()
    })
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  mainWindow.webContents.on('did-finish-load', () => {
    console.log('MAIN: did-finish-load')
  })

  mainWindow.webContents.on('did-fail-load', (_, errorCode, errorDescription) => {
    console.error('MAIN: did-fail-load', errorCode, errorDescription)
  })

  mainWindow.webContents.on('console-message', (_e, level, message) => {
    const levelStr = level === 3 ? 'ERROR' : level === 2 ? 'WARN' : 'INFO'
    console.log(`[Renderer ${levelStr}]`, message)
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    console.log('MAIN: loading URL', process.env['ELECTRON_RENDERER_URL'])
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

function ensureDir(dir: string): void {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true })
  }
}

interface TreeNode {
  id: string
  name: string
  relativePath: string
  type: 'file' | 'folder'
  children?: TreeNode[]
  mtime?: number
  birthtime?: number
  size?: number
}

function scanDir(currentDir: string, rootDir: string): TreeNode[] {
  ensureDir(currentDir)
  const entries = fs.readdirSync(currentDir, { withFileTypes: true })
  const result: TreeNode[] = []

  for (const entry of entries) {
    if (
      entry.name.startsWith('.') ||
      entry.name === '.snippets' ||
      entry.name === '.trash' ||
      entry.name === 'node_modules'
    )
      continue
    const fullPath = join(currentDir, entry.name)
    const rel = path.relative(rootDir, fullPath).replace(/\\/g, '/')

    if (entry.isDirectory()) {
      const children = scanDir(fullPath, rootDir)
      result.push({
        id: rel,
        name: entry.name,
        relativePath: rel,
        type: 'folder',
        children
      })
    } else if (
      entry.isFile() &&
      (entry.name.endsWith('.md') ||
        entry.name.endsWith('.html') ||
        entry.name.endsWith('.htm') ||
        entry.name.toLowerCase().endsWith('.pdf'))
    ) {
      try {
        const stats = fs.statSync(fullPath)
        result.push({
          id: rel,
          name: entry.name,
          relativePath: rel,
          type: 'file',
          size: stats.size,
          mtime: stats.mtimeMs,
          birthtime: stats.birthtimeMs
        })
      } catch {
        result.push({
          id: rel,
          name: entry.name,
          relativePath: rel,
          type: 'file'
        })
      }
    }
  }

  // Sort: folders first, then files alphabetically
  result.sort((a, b) => {
    if (a.type !== b.type) return a.type === 'folder' ? -1 : 1
    return a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' })
  })

  return result
}

// Tree view
ipcMain.handle('get-notes-tree', () => {
  ensureDir(NOTES_DIR)
  ensureDir(TRASH_DIR)
  return scanDir(NOTES_DIR, NOTES_DIR)
})

// Legacy flat list support
ipcMain.handle('list-markdown-files', () => {
  ensureDir(NOTES_DIR)
  const tree = scanDir(NOTES_DIR, NOTES_DIR)
  const flat: string[] = []
  function flatten(nodes: TreeNode[]) {
    for (const node of nodes) {
      if (node.type === 'file') flat.push(node.relativePath)
      if (node.children) flatten(node.children)
    }
  }
  flatten(tree)
  return flat
})

// Create folder
ipcMain.handle('create-folder', (_event, parentRelativePath: string, folderName: string) => {
  ensureDir(NOTES_DIR)
  const cleanParent = parentRelativePath ? parentRelativePath.trim() : ''
  const targetDir = join(notePath(cleanParent, { allowRoot: true }), assertSafeFileName(folderName))
  if (!fs.existsSync(targetDir)) {
    fs.mkdirSync(targetDir, { recursive: true })
    return path.relative(NOTES_DIR, targetDir).replace(/\\/g, '/')
  }
  return null
})

// Create note/page in folder or root (markdown by default, or html if specified)
ipcMain.handle(
  'create-note',
  (_event, parentRelativePath?: string, title?: string, templateType: 'html' | 'md' = 'md') => {
    ensureDir(NOTES_DIR)
    const cleanParent = parentRelativePath ? parentRelativePath.trim() : ''
    const targetDir = notePath(cleanParent, { allowRoot: true })
    ensureDir(targetDir)

    const rawTitle = title && title.trim() ? title.trim() : ''
    const isHtml =
      templateType === 'html' ||
      rawTitle.toLowerCase().endsWith('.html') ||
      rawTitle.toLowerCase().endsWith('.htm')
    const hasExt =
      rawTitle.toLowerCase().endsWith('.html') ||
      rawTitle.toLowerCase().endsWith('.htm') ||
      rawTitle.toLowerCase().endsWith('.md')

    let fileName = ''
    if (hasExt) {
      fileName = rawTitle
    } else if (rawTitle) {
      fileName = `${rawTitle}${isHtml ? '.html' : '.md'}`
    } else {
      fileName = isHtml ? 'page.html' : 'note.md'
    }
    assertSafeFileName(fileName)

    let counter = 1
    while (fs.existsSync(join(targetDir, fileName))) {
      const curExt = path.extname(fileName) || (isHtml ? '.html' : '.md')
      const curBase = fileName.replace(curExt, '')
      fileName = `${curBase} ${counter}${curExt}`
      counter++
    }

    const fullPath = join(targetDir, fileName)
    const noteTitle = fileName.replace(/\.(html|htm|md)$/i, '')

    if (isHtml) {
      const htmlStarter = `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${noteTitle}</title>
  <style>
    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: #0f0f11;
      color: #f4f4f5;
      padding: 32px;
      min-height: 100vh;
    }
    .container {
      max-width: 800px;
      margin: 0 auto;
    }
    h1 {
      color: #38bdf8;
      font-size: 32px;
      margin-bottom: 12px;
    }
    p {
      color: #a1a1aa;
      font-size: 16px;
      line-height: 1.6;
      margin-bottom: 20px;
    }
    .card {
      background: #18181b;
      border: 1px solid rgba(255, 255, 255, 0.1);
      border-radius: 12px;
      padding: 24px;
      margin-top: 24px;
    }
    button {
      background: #38bdf8;
      color: #09090b;
      border: none;
      padding: 10px 20px;
      border-radius: 8px;
      font-weight: 600;
      font-size: 14px;
      cursor: pointer;
      transition: transform 0.15s, opacity 0.15s;
    }
    button:hover {
      opacity: 0.9;
      transform: translateY(-1px);
    }
    #counter-display {
      font-size: 20px;
      font-weight: 700;
      color: #4ade80;
      margin-top: 14px;
    }
  </style>
</head>
<body>
  <div class="container">
    <h1>${noteTitle}</h1>
    <p>Cette page HTML supporte le CSS intégré et le JavaScript interactif en direct !</p>

    <div class="card">
      <h3 style="margin-bottom: 8px;">Test interactif</h3>
      <p style="margin-bottom: 12px;">Cliquez pour tester l'exécution du JavaScript :</p>
      <button id="btn-count">Incrémenter le compteur</button>
      <div id="counter-display">Compteur : 0</div>
    </div>
  </div>

  <script>
    let count = 0;
    const btn = document.getElementById('btn-count');
    const display = document.getElementById('counter-display');

    btn.addEventListener('click', () => {
      count++;
      display.textContent = 'Compteur : ' + count;
    });

    console.log('${noteTitle} prêt !');
  </script>
</body>
</html>`
      fs.writeFileSync(fullPath, htmlStarter, 'utf-8')
    } else {
      fs.writeFileSync(fullPath, `# ${noteTitle}\n\n`, 'utf-8')
    }

    return path.relative(NOTES_DIR, fullPath).replace(/\\/g, '/')
  }
)

ipcMain.handle('create-specific-note', (_event, title: string) => {
  ensureDir(NOTES_DIR)
  let cleanTitle = title.trim()
  const hasExt =
    cleanTitle.endsWith('.md') || cleanTitle.endsWith('.html') || cleanTitle.endsWith('.htm')
  if (!hasExt) cleanTitle = `${cleanTitle}.html`
  const filePath = notePath(cleanTitle)
  if (!fs.existsSync(filePath)) {
    const rawTitle = cleanTitle.replace(/\.(html|htm|md)$/i, '')
    fs.writeFileSync(
      filePath,
      `<!DOCTYPE html>\n<html>\n<head><title>${rawTitle}</title></head>\n<body>\n<h1>${rawTitle}</h1>\n</body>\n</html>`,
      'utf-8'
    )
  }
  return cleanTitle
})

ipcMain.handle('read-note', (_event, relativePath: string) => {
  ensureDir(NOTES_DIR)
  const filePath = notePath(relativePath)
  if (fs.existsSync(filePath)) {
    return fs.readFileSync(filePath, 'utf-8')
  }
  return ''
})

ipcMain.handle('write-note', (_event, relativePath: string, content: string) => {
  ensureDir(NOTES_DIR)
  const filePath = notePath(relativePath)
  const dir = path.dirname(filePath)
  ensureDir(dir)
  fs.writeFileSync(filePath, content, 'utf-8')
  // Sauvegarde automatique d'un instantané dans l'historique local (Time Travel)
  saveSnapshot(NOTES_DIR, relativePath, content).catch(() => {})
})

ipcMain.handle('rename-note', (_event, oldRelativePath: string, newName: string) => {
  ensureDir(NOTES_DIR)
  const oldPath = notePath(oldRelativePath)
  if (!fs.existsSync(oldPath)) return null

  const dir = path.dirname(oldPath)
  const isFile = fs.statSync(oldPath).isFile()
  const oldExt = path.extname(oldPath)
  let finalName = newName.trim()
  if (isFile && !path.extname(finalName)) {
    finalName += oldExt || '.html'
  }

  const newPath = join(dir, assertSafeFileName(finalName))
  if (!fs.existsSync(newPath)) {
    fs.renameSync(oldPath, newPath)
    if (oldPath.toLowerCase().endsWith('.pdf')) {
      const oldAnn = `${oldPath}.annotations.json`
      const newAnn = `${newPath}.annotations.json`
      if (fs.existsSync(oldAnn)) {
        try {
          fs.renameSync(oldAnn, newAnn)
        } catch {}
      }
    }
    return path.relative(NOTES_DIR, newPath).replace(/\\/g, '/')
  }
  return null
})

// Ouvrir une note du dossier avec l'application par défaut du système (types de fichiers sûrs uniquement)
ipcMain.handle('open-in-browser', (_event, relativePath: string) => {
  ensureDir(NOTES_DIR)
  const fullPath = notePath(relativePath)
  if (!OPENABLE_EXTENSIONS.has(path.extname(fullPath).toLowerCase())) {
    throw new PathAccessError(`type de fichier non autorisé pour l'ouverture ("${relativePath}").`)
  }
  if (fs.existsSync(fullPath)) {
    shell.openPath(fullPath)
    return true
  }
  return false
})

// Ouvrir une adresse web dans le navigateur du système (http et https uniquement)
ipcMain.handle('open-external-url', async (_event, url: string) => {
  assertWebUrl(url)
  await shell.openExternal(url)
  return true
})

// Move note or folder to target folder
ipcMain.handle(
  'move-item',
  (_event, sourceRelativePath: string, targetFolderRelativePath: string) => {
    ensureDir(NOTES_DIR)
    const cleanSource = sourceRelativePath.replace(/\\/g, '/').trim()
    const cleanTarget = targetFolderRelativePath
      ? targetFolderRelativePath.replace(/\\/g, '/').trim()
      : ''

    const sourcePath = notePath(cleanSource)
    if (!fs.existsSync(sourcePath)) return null

    const targetDir = notePath(cleanTarget, { allowRoot: true })
    ensureDir(targetDir)

    // Prevent moving into itself or its own subfolder
    const normSource = path.resolve(sourcePath)
    const normTargetDir = path.resolve(targetDir)
    if (normTargetDir === normSource || normTargetDir.startsWith(normSource + path.sep)) {
      return null
    }

    const itemName = path.basename(sourcePath)
    let destPath = join(targetDir, itemName)

    // If already inside target directory
    if (path.resolve(path.dirname(sourcePath)) === normTargetDir) {
      return cleanSource
    }

    // Handle name collision
    if (fs.existsSync(destPath)) {
      const isFile = fs.statSync(sourcePath).isFile()
      const ext = isFile ? path.extname(itemName) : ''
      const base = isFile ? path.basename(itemName, ext) : itemName
      let counter = 1
      while (fs.existsSync(destPath)) {
        destPath = join(targetDir, `${base} ${counter}${ext}`)
        counter++
      }
    }

    fs.renameSync(sourcePath, destPath)
    if (sourcePath.toLowerCase().endsWith('.pdf')) {
      const oldAnn = `${sourcePath}.annotations.json`
      const newAnn = `${destPath}.annotations.json`
      if (fs.existsSync(oldAnn)) {
        try {
          fs.renameSync(oldAnn, newAnn)
        } catch {}
      }
    }
    return path.relative(NOTES_DIR, destPath).replace(/\\/g, '/')
  }
)

// --- Gestion sécurisée des liens lors du renommage / déplacement ---
ipcMain.handle(
  'prepare-rename-or-move',
  (_event, oldRelativePath: string, newTarget: string, isFolder: boolean, isMove: boolean) => {
    ensureDir(NOTES_DIR)
    return prepareRenameOrMove(NOTES_DIR, oldRelativePath, newTarget, isFolder, isMove)
  }
)

ipcMain.handle('apply-rename-or-move', async (_event, plan: RenameOperationPlan) => {
  ensureDir(NOTES_DIR)
  return await applyRenameOrMove(NOTES_DIR, plan)
})

ipcMain.handle('undo-rename-or-move', async (_event, operationId?: string) => {
  ensureDir(NOTES_DIR)
  return await undoRenameOrMove(NOTES_DIR, operationId)
})

// Soft delete (move to .trash)
ipcMain.handle('delete-note', (_event, relativePath: string) => {
  ensureDir(NOTES_DIR)
  ensureDir(TRASH_DIR)
  const targetPath = notePath(relativePath)
  if (fs.existsSync(targetPath)) {
    const fileName = path.basename(targetPath)
    const timeStamp = Date.now()
    const trashTarget = join(TRASH_DIR, `${timeStamp}___${fileName}`)
    fs.renameSync(targetPath, trashTarget)
    if (targetPath.toLowerCase().endsWith('.pdf')) {
      const oldAnn = `${targetPath}.annotations.json`
      const trashAnn = join(TRASH_DIR, `${timeStamp}___${fileName}.annotations.json`)
      if (fs.existsSync(oldAnn)) {
        try {
          fs.renameSync(oldAnn, trashAnn)
        } catch {}
      }
    }
    return true
  }
  return false
})

// Get deleted notes
ipcMain.handle('get-deleted-notes', () => {
  ensureDir(TRASH_DIR)
  const files = fs.readdirSync(TRASH_DIR)
  return files
    .filter((f) => !f.endsWith('.annotations.json'))
    .map((f) => {
      const parts = f.split('___')
      const originalName = parts.length > 1 ? parts.slice(1).join('___') : f
      const date = parts.length > 1 ? parseInt(parts[0], 10) : 0
      return {
        trashId: f,
        name: originalName,
        deletedAt: date
      }
    })
})

// Restore deleted note
ipcMain.handle('restore-deleted-note', (_event, trashId: string) => {
  ensureDir(TRASH_DIR)
  ensureDir(NOTES_DIR)
  const trashPath = join(TRASH_DIR, assertSafeFileName(trashId))
  if (fs.existsSync(trashPath)) {
    const parts = trashId.split('___')
    const originalName = parts.length > 1 ? parts.slice(1).join('___') : trashId
    let target = notePath(assertSafeFileName(originalName))
    let counter = 1
    while (fs.existsSync(target)) {
      target = join(NOTES_DIR, `Restored ${counter} - ${originalName}`)
      counter++
    }
    fs.renameSync(trashPath, target)
    if (trashPath.toLowerCase().endsWith('.pdf') || originalName.toLowerCase().endsWith('.pdf')) {
      const trashAnn = `${trashPath}.annotations.json`
      const targetAnn = `${target}.annotations.json`
      if (fs.existsSync(trashAnn)) {
        try {
          fs.renameSync(trashAnn, targetAnn)
        } catch {}
      }
    }
    return path.relative(NOTES_DIR, target).replace(/\\/g, '/')
  }
  return null
})

// Empty trash permanently
ipcMain.handle('empty-trash', () => {
  ensureDir(TRASH_DIR)
  try {
    const files = fs.readdirSync(TRASH_DIR)
    for (const f of files) {
      const p = join(TRASH_DIR, f)
      try {
        if (fs.lstatSync(p).isDirectory()) {
          fs.rmSync(p, { recursive: true, force: true })
        } else {
          fs.unlinkSync(p)
        }
      } catch (err) {
        console.error('Erreur suppression fichier corbeille:', err)
      }
    }
    return true
  } catch (err) {
    console.error('Erreur vider corbeille:', err)
    return false
  }
})

// Delete single note permanently from trash
ipcMain.handle('delete-permanently', (_event, trashId: string) => {
  ensureDir(TRASH_DIR)
  // trashId doit désigner un élément direct de .trash (sinon "..", par exemple, viserait tout le vault)
  const trashPath = join(TRASH_DIR, assertSafeFileName(trashId))
  if (fs.existsSync(trashPath)) {
    try {
      if (fs.lstatSync(trashPath).isDirectory()) {
        fs.rmSync(trashPath, { recursive: true, force: true })
      } else {
        fs.unlinkSync(trashPath)
      }
      return true
    } catch (err) {
      console.error('Erreur suppression definitive:', err)
      return false
    }
  }
  return false
})

// Favorites and config
ipcMain.handle('get-config', () => {
  ensureDir(NOTES_DIR)
  if (fs.existsSync(CONFIG_FILE)) {
    try {
      return JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf-8'))
    } catch {
      return {}
    }
  }
  return {}
})

ipcMain.handle('save-config', (_event, config: Record<string, any>) => {
  ensureDir(NOTES_DIR)
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2), 'utf-8')
  return true
})

// Snippets (Obsidian style)
const SNIPPETS_DIR = join(NOTES_DIR, '.snippets')
const SNIPPETS_FILE = join(SNIPPETS_DIR, 'snippets.json')

function getDefaultSnippetsData(): any {
  const candidates = [
    join(__dirname, '../defaultSnippets.json'),
    join(__dirname, '../../src/main/defaultSnippets.json'),
    join(process.cwd(), 'src/main/defaultSnippets.json'),
    join(__dirname, '../renderer/assets/snippets.default.json')
  ]
  for (const c of candidates) {
    if (fs.existsSync(c)) {
      try {
        return JSON.parse(fs.readFileSync(c, 'utf-8'))
      } catch {}
    }
  }
  return { version: 1, trigger: '/', snippets: [] }
}

function loadSnippets(): { snippets: any[]; trigger: string; error?: string } {
  ensureDir(NOTES_DIR)
  ensureDir(SNIPPETS_DIR)
  const defaults = getDefaultSnippetsData()

  if (!fs.existsSync(SNIPPETS_FILE)) {
    try {
      fs.writeFileSync(SNIPPETS_FILE, JSON.stringify(defaults, null, 2), 'utf-8')
      return { snippets: defaults.snippets || [], trigger: defaults.trigger || '/' }
    } catch (err: any) {
      return {
        snippets: defaults.snippets || [],
        trigger: defaults.trigger || '/',
        error: err.message
      }
    }
  }

  try {
    const raw = fs.readFileSync(SNIPPETS_FILE, 'utf-8')
    const parsed = JSON.parse(raw)
    if (parsed && Array.isArray(parsed.snippets)) {
      return { snippets: parsed.snippets, trigger: parsed.trigger || '/' }
    } else {
      return {
        snippets: defaults.snippets || [],
        trigger: defaults.trigger || '/',
        error:
          "Format invalide dans .snippets/snippets.json (la propriété 'snippets' doit être un tableau). Les snippets par défaut sont conservés."
      }
    }
  } catch (err: any) {
    return {
      snippets: defaults.snippets || [],
      trigger: defaults.trigger || '/',
      error: `Erreur de syntaxe dans .snippets/snippets.json : ${err.message}. Les snippets par défaut sont conservés.`
    }
  }
}

ipcMain.handle('get-snippets', () => {
  return loadSnippets()
})

ipcMain.handle('save-snippets', (_event, content: string) => {
  ensureDir(NOTES_DIR)
  ensureDir(SNIPPETS_DIR)
  fs.writeFileSync(SNIPPETS_FILE, content, 'utf-8')
  if (globalMainWindow && !globalMainWindow.isDestroyed()) {
    globalMainWindow.webContents.send('snippets-updated')
  }
  return true
})

// ---------------------------------------------------------------------------
// Modèles de cours (.templates) & Création de séances
// ---------------------------------------------------------------------------
const TEMPLATES_DIR = join(NOTES_DIR, '.templates')

const DEFAULT_COURSE_TEMPLATE_HTML = `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <title>\${NOTE_TITLE}</title>
</head>
<body>
  <div class="container">
    <div style="display: flex; gap: 8px; margin-bottom: 12px; font-size: 12px;">
      <span class="tag-pill tag-pill-blue">\${FOLDER_NAME}</span>
      <span class="tag-pill tag-pill-green">Séance \${SESSION_NUMBER_PAD}</span>
      <span class="tag-pill tag-pill-neutral">\${CURRENT_DATE}</span>
    </div>

    <h1>\${NOTE_TITLE}</h1>
    <p class="lead">Objectifs pédagogiques et notions clés de la séance \${SESSION_NUMBER}.</p>

    <div class="callout callout-info">
      <div class="callout-title">💡 Objectifs de la séance</div>
      <p>Comprendre les principes fondamentaux et les mettre en pratique à travers des exercices guidés.</p>
    </div>

    <h2>1. Rappels & Mise en contexte</h2>
    <div class="card">
      <p>Introduction et prérequis pour cette séance...</p>
    </div>

    <h2>2. Notions fondamentales</h2>
    <div class="step">
      <div class="step-num">1</div>
      <div class="step-content">
        <h3>Première notion clé</h3>
        <p>Explications détaillées, définitions et concepts...</p>
      </div>
    </div>

    <div class="step">
      <div class="step-num">2</div>
      <div class="step-content">
        <h3>Deuxième notion clé</h3>
        <p>Approfondissement et cas concrets d'application...</p>
      </div>
    </div>

    <h2>3. Travaux Pratiques & Exercices</h2>
    <div class="duo">
      <div class="card">
        <h3>Exercice 1</h3>
        <p>Énoncé de l'exercice guidé...</p>
      </div>
      <div class="card">
        <h3>Points d'attention</h3>
        <p>Erreurs fréquentes et bonnes pratiques...</p>
      </div>
    </div>

    <h2>4. Synthèse & Prochaine étape</h2>
    <div class="card card-accent">
      <p>À retenir pour la prochaine séance :</p>
      <ul>
        <li>Point clé 1</li>
        <li>Point clé 2</li>
      </ul>
    </div>
  </div>
</body>
</html>`

const DEFAULT_COURSE_TEMPLATE_MD = `# \${NOTE_TITLE}

> **Matière :** \${FOLDER_NAME}  
> **Séance :** \${SESSION_NUMBER_PAD}  
> **Date :** \${CURRENT_DATE}  
> **Tags :** \${TAGS}

---

## 🎯 Objectifs de la séance
- Comprendre les notions fondamentales de la séance \${SESSION_NUMBER}.
- Mettre en pratique à travers des exercices d'application.

---

## 📚 1. Notions du cours

### 1.1 Concepts clés
Définitions et explications détaillées...

### 1.2 Exemples concrets
Exemple d'illustration...

---

## ✍️ 2. Exercices & Travaux dirigés
1. Question / Exercice 1
2. Question / Exercice 2

---

## 📌 Résumé de fin de séance
- Point essentiel 1
- Point essentiel 2
`

function initTemplates(): void {
  ensureDir(NOTES_DIR)
  ensureDir(TEMPLATES_DIR)

  const htmlTmplPath = join(TEMPLATES_DIR, 'modele-cours.html')
  if (!fs.existsSync(htmlTmplPath)) {
    try {
      fs.writeFileSync(htmlTmplPath, DEFAULT_COURSE_TEMPLATE_HTML, 'utf-8')
    } catch (e) {
      console.warn('Impossible de créer modele-cours.html:', e)
    }
  }

  const mdTmplPath = join(TEMPLATES_DIR, 'modele-cours.md')
  if (!fs.existsSync(mdTmplPath)) {
    try {
      fs.writeFileSync(mdTmplPath, DEFAULT_COURSE_TEMPLATE_MD, 'utf-8')
    } catch (e) {
      console.warn('Impossible de créer modele-cours.md:', e)
    }
  }
}

ipcMain.handle('get-templates', (): NoteTemplate[] => {
  initTemplates()
  const templates: NoteTemplate[] = []

  try {
    const entries = fs.readdirSync(TEMPLATES_DIR, { withFileTypes: true })
    for (const entry of entries) {
      if (entry.isFile()) {
        const lower = entry.name.toLowerCase()
        if (lower.endsWith('.html') || lower.endsWith('.htm') || lower.endsWith('.md')) {
          const fullPath = join(TEMPLATES_DIR, entry.name)
          const content = fs.readFileSync(fullPath, 'utf-8')
          const isHtml = lower.endsWith('.html') || lower.endsWith('.htm')

          const cleanName = entry.name
            .replace(/\.(html|htm|md)$/i, '')
            .replace(/[-_]/g, ' ')
            .trim()
          const capitalized = cleanName.charAt(0).toUpperCase() + cleanName.slice(1)

          templates.push({
            name: `${capitalized} (${isHtml ? 'HTML' : 'Markdown'})`,
            fileName: entry.name,
            extension: isHtml ? 'html' : 'md',
            content
          })
        }
      }
    }
  } catch (err) {
    console.warn('Erreur lors de la lecture des modèles:', err)
  }

  return templates
})

ipcMain.handle(
  'create-note-from-template',
  async (
    _event,
    params: {
      folderPath: string
      fileName: string
      templateFileName?: string
      context?: TemplateContext
    }
  ) => {
    initTemplates()
    ensureDir(NOTES_DIR)

    const targetDir = notePath(params.folderPath || '', { allowRoot: true })
    ensureDir(targetDir)
    assertSafeFileName(params.fileName)

    // Récupérer le contenu du modèle
    let rawTemplate = ''
    if (params.templateFileName) {
      const templatePath = join(TEMPLATES_DIR, assertSafeFileName(params.templateFileName))
      if (fs.existsSync(templatePath)) {
        rawTemplate = fs.readFileSync(templatePath, 'utf-8')
      }
    }

    if (!rawTemplate) {
      rawTemplate = params.fileName.endsWith('.md')
        ? DEFAULT_COURSE_TEMPLATE_MD
        : DEFAULT_COURSE_TEMPLATE_HTML
    }

    // Expansion des variables
    const expanded = expandTemplate(rawTemplate, params.context || {})

    // Résolution d'éventuels conflits de nom de fichier
    let finalFileName = params.fileName
    let counter = 1
    const ext = path.extname(finalFileName) || (params.fileName.endsWith('.html') ? '.html' : '.md')
    const base = finalFileName.replace(ext, '')

    while (fs.existsSync(join(targetDir, finalFileName))) {
      finalFileName = `${base} ${counter}${ext}`
      counter++
    }

    const targetPath = join(targetDir, finalFileName)
    const tempPath = `${targetPath}.tmp_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`

    // Écriture atomique
    fs.writeFileSync(tempPath, expanded, 'utf-8')
    fs.renameSync(tempPath, targetPath)

    const relPath = path.relative(NOTES_DIR, targetPath).replace(/\\/g, '/')

    // Sauvegarde immédiate dans l'historique Time Travel
    try {
      await saveSnapshot(NOTES_DIR, relPath, expanded)
    } catch {}

    return {
      success: true,
      relativePath: relPath
    }
  }
)

ipcMain.handle('create-note-with-content', (_event, fileName: string, content: string) => {
  ensureDir(NOTES_DIR)
  const filePath = notePath(fileName)
  if (fs.existsSync(filePath)) {
    const existing = fs.readFileSync(filePath, 'utf-8')
    fs.writeFileSync(filePath, existing + '\n\n---\n\n' + content, 'utf-8')
  } else {
    fs.writeFileSync(filePath, content, 'utf-8')
  }
  return fileName
})

ipcMain.handle('toggle-fullscreen', (event) => {
  const win = BrowserWindow.fromWebContents(event.sender)
  if (win) {
    const nextState = !win.isFullScreen()
    win.setFullScreen(nextState)
    return nextState
  }
  return false
})

ipcMain.handle('set-fullscreen', (event, flag: boolean) => {
  const win = BrowserWindow.fromWebContents(event.sender)
  if (win) {
    win.setFullScreen(flag)
    return win.isFullScreen()
  }
  return false
})

ipcMain.handle('is-fullscreen', (event) => {
  const win = BrowserWindow.fromWebContents(event.sender)
  return win ? win.isFullScreen() : false
})

ipcMain.handle('toggle-maximize', (event) => {
  const win = BrowserWindow.fromWebContents(event.sender)
  if (win) {
    if (win.isMaximized()) {
      win.unmaximize()
      return false
    } else {
      win.maximize()
      return true
    }
  }
  return false
})

ipcMain.handle('is-maximized', (event) => {
  const win = BrowserWindow.fromWebContents(event.sender)
  return win ? win.isMaximized() : false
})

ipcMain.handle('set-active-folder', (_event, folderPath: string) => {
  const candidate = typeof folderPath === 'string' ? folderPath.trim() : ''
  try {
    notePath(candidate, { allowRoot: true })
  } catch (err) {
    currentActiveFolderRel = ''
    throw err
  }
  currentActiveFolderRel = candidate
  return true
})

// Importer des fichiers PDF via dialogue système
ipcMain.handle('import-pdf-dialog', async (_event, targetFolderRel?: string) => {
  ensureDir(NOTES_DIR)
  const targetDir = activeTargetDir(targetFolderRel)

  console.log('[import-pdf-dialog] Opening dialog for targetDir:', targetDir)

  const result = await dialog.showOpenDialog({
    title: 'Importer des fichiers PDF',
    properties: ['openFile', 'multiSelections'],
    filters: [
      { name: 'Documents PDF (*.pdf)', extensions: ['pdf'] },
      { name: 'Tous les fichiers (*.*)', extensions: ['*'] }
    ]
  })
  console.log('[import-pdf-dialog] result:', result)

  if (result.canceled || result.filePaths.length === 0) {
    return []
  }

  const importedRelPaths: string[] = []
  for (const srcPath of result.filePaths) {
    const filename = path.basename(srcPath)
    let destPath = join(targetDir, filename)
    if (fs.existsSync(destPath)) {
      const ext = path.extname(filename)
      const base = path.basename(filename, ext)
      let counter = 1
      while (fs.existsSync(join(targetDir, `${base} (${counter})${ext}`))) {
        counter++
      }
      destPath = join(targetDir, `${base} (${counter})${ext}`)
    }
    fs.copyFileSync(srcPath, destPath)
    const rel = path.relative(NOTES_DIR, destPath).replace(/\\/g, '/')
    importedRelPaths.push(rel)
  }

  return importedRelPaths
})

// Importer un fichier externe depuis son chemin absolu (drag & drop)
ipcMain.handle(
  'import-file-from-path',
  async (_event, srcPath: string, targetFolderRel?: string) => {
    ensureDir(NOTES_DIR)
    if (!fs.existsSync(srcPath)) return null

    const targetDir = activeTargetDir(targetFolderRel)

    const filename = path.basename(srcPath)
    let destPath = join(targetDir, filename)
    if (fs.existsSync(destPath)) {
      const ext = path.extname(filename)
      const base = path.basename(filename, ext)
      let counter = 1
      while (fs.existsSync(join(targetDir, `${base} (${counter})${ext}`))) {
        counter++
      }
      destPath = join(targetDir, `${base} (${counter})${ext}`)
    }

    fs.copyFileSync(srcPath, destPath)
    return path.relative(NOTES_DIR, destPath).replace(/\\/g, '/')
  }
)

// Lire un fichier binaire (PDF) en Base64
ipcMain.handle('read-binary-file', (_event, relativePath: string) => {
  ensureDir(NOTES_DIR)
  const fullPath = notePath(relativePath)
  if (fs.existsSync(fullPath)) {
    return fs.readFileSync(fullPath).toString('base64')
  }
  return null
})

// Récupérer les annotations d'un PDF depuis son sidecar JSON
ipcMain.handle('get-pdf-annotations', (_event, pdfRelativePath: string): PdfAnnotation[] => {
  ensureDir(NOTES_DIR)
  const annotationsPath = `${notePath(pdfRelativePath)}.annotations.json`
  if (fs.existsSync(annotationsPath)) {
    try {
      const data = fs.readFileSync(annotationsPath, 'utf-8')
      const parsed = JSON.parse(data)
      return Array.isArray(parsed.annotations) ? parsed.annotations : []
    } catch (err) {
      console.warn(`[get-pdf-annotations] Erreur lecture ${annotationsPath}:`, err)
      return []
    }
  }
  return []
})

// Sauvegarder les annotations d'un PDF dans son sidecar JSON (écriture atomique)
ipcMain.handle(
  'save-pdf-annotations',
  (_event, pdfRelativePath: string, annotations: PdfAnnotation[]): boolean => {
    ensureDir(NOTES_DIR)
    const normRel = pdfRelativePath.replace(/\\/g, '/')
    const annotationsPath = `${notePath(normRel)}.annotations.json`
    const targetDir = path.dirname(annotationsPath)
    ensureDir(targetDir)

    const payload = {
      pdfFilePath: normRel,
      version: 1,
      updatedAt: new Date().toISOString(),
      annotations
    }

    try {
      const content = JSON.stringify(payload, null, 2)
      const tempPath = `${annotationsPath}.tmp_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`
      fs.writeFileSync(tempPath, content, 'utf-8')
      fs.renameSync(tempPath, annotationsPath)
      return true
    } catch (err) {
      console.error(`[save-pdf-annotations] Erreur écriture ${annotationsPath}:`, err)
      return false
    }
  }
)

// Révéler le fichier dans l'explorateur Windows
ipcMain.handle('show-item-in-folder', (_event, relativePath: string) => {
  ensureDir(NOTES_DIR)
  // Simple affichage dans l'Explorateur : les dossiers internes (ex. .snippets depuis les réglages) sont permis
  const fullPath = notePath(relativePath, { allowInternal: true })
  if (fs.existsSync(fullPath)) {
    shell.showItemInFolder(fullPath)
    return true
  }
  return false
})

// Sauvegarder un PDF envoyé en Base64 depuis le webview (blob: URLs interceptées)
ipcMain.handle('save-pdf-base64', (_event, filename: string, base64: string) => {
  ensureDir(NOTES_DIR)
  const targetDir = activeTargetDir()
  const safeName = sanitizeDownloadName(filename)
  let destPath = join(targetDir, safeName)
  if (fs.existsSync(destPath)) {
    const ext = path.extname(safeName)
    const base = path.basename(safeName, ext)
    let c = 1
    while (fs.existsSync(join(targetDir, `${base} (${c})${ext}`))) c++
    destPath = join(targetDir, `${base} (${c})${ext}`)
  }
  const buf = Buffer.from(base64, 'base64')
  fs.writeFileSync(destPath, buf)
  console.log('[save-pdf-base64] PDF sauvegardé:', destPath)
  return path.relative(NOTES_DIR, destPath).replace(/\\/g, '/')
})

// Sauvegarder un PDF depuis un ArrayBuffer (FileReader / input file)
ipcMain.handle(
  'save-pdf-binary',
  (_event, filename: string, buffer: ArrayBuffer | Uint8Array, targetFolderRel?: string) => {
    ensureDir(NOTES_DIR)
    const targetDir = activeTargetDir(targetFolderRel)
    const safeName = sanitizeDownloadName(filename)
    let destPath = join(targetDir, safeName)
    if (fs.existsSync(destPath)) {
      const ext = path.extname(safeName)
      const base = path.basename(safeName, ext)
      let c = 1
      while (fs.existsSync(join(targetDir, `${base} (${c})${ext}`))) c++
      destPath = join(targetDir, `${base} (${c})${ext}`)
    }
    const buf = Buffer.from(new Uint8Array(buffer))
    fs.writeFileSync(destPath, buf)
    console.log('[save-pdf-binary] PDF sauvegardé:', destPath)
    return path.relative(NOTES_DIR, destPath).replace(/\\/g, '/')
  }
)

// Télécharger un PDF depuis une URL HTTP et le sauvegarder dans le dossier actif
ipcMain.handle('download-pdf-from-url', async (_event, url: string, filename: string) => {
  ensureDir(NOTES_DIR)
  // Refus levés hors du try : le renderer reçoit l'erreur au lieu d'un simple null
  assertWebUrl(url)
  const targetDir = activeTargetDir()
  try {
    const res = await net.fetch(url)
    if (!res.ok) return null
    const buf = Buffer.from(await res.arrayBuffer())
    const safeName = sanitizeDownloadName(filename)
    let destPath = join(targetDir, safeName)
    if (fs.existsSync(destPath)) {
      const ext = path.extname(safeName)
      const base = path.basename(safeName, ext)
      let c = 1
      while (fs.existsSync(join(targetDir, `${base} (${c})${ext}`))) c++
      destPath = join(targetDir, `${base} (${c})${ext}`)
    }
    fs.writeFileSync(destPath, buf)
    console.log('[download-pdf-from-url] PDF sauvegardé:', destPath)
    return path.relative(NOTES_DIR, destPath).replace(/\\/g, '/')
  } catch (err) {
    console.error('[download-pdf-from-url] Erreur:', err)
    return null
  }
})

// Ouvrir une session de connexion dans une fenêtre dédiée avec transfert automatique de la session
ipcMain.handle(
  'open-google-login',
  async (_event, service?: 'youtube' | 'claude' | 'default', customUrl?: string) => {
    console.log('[IPC open-google-login] Lancement fenêtre Google dédiée:', service, customUrl)
    return openGoogleLoginWindow(service || 'youtube', customUrl)
  }
)

// Forcer la synchronisation manuelle des cookies depuis Chrome
ipcMain.handle('sync-chrome-session', async (_event, service: 'youtube' | 'claude' = 'youtube') => {
  console.log('[IPC sync-chrome-session] Synchronisation demandée pour:', service)
  return syncCookiesFromBrowser(service)
})

// Importer manuellement des cookies (format JSON d'extensions comme Cookie-Editor ou chaîne d'en-tête)
ipcMain.handle(
  'import-cookies',
  async (_event, service: 'youtube' | 'claude', rawCookies: string) => {
    const targetSession = session.fromPartition('persist:claude')
    const defaultDomain = service === 'youtube' ? 'youtube.com' : 'claude.ai'
    const count = await applyCookiesToSession(targetSession, defaultDomain, rawCookies)
    console.log(`[IPC import-cookies] ${count} cookies importés pour ${service}`)
    if (count > 0 && globalMainWindow && !globalMainWindow.isDestroyed()) {
      globalMainWindow.webContents.send('google-login-success', service)
    }
    return count
  }
)

// Handlers IA Autonome
ipcMain.handle('ai-search-web', async (_event, query: string) => {
  return await searchWeb(query)
})

ipcMain.handle('ai-search-youtube', async (_event, query: string) => {
  return await searchYouTube(query)
})

ipcMain.handle('ai-ollama-status', async () => {
  return await getOllamaStatus()
})

ipcMain.handle('ai-ollama-chat', async (_event, messages: any[], tools: any[], model?: string) => {
  return await callOllamaChat(messages, tools, model)
})

// Handlers Agent ReAct Autonome
let activeAgentController: AbortController | null = null

ipcMain.handle('agent-run', async (event, params: AgentRunParams) => {
  if (activeAgentController) {
    activeAgentController.abort()
  }
  activeAgentController = new AbortController()

  const webContents = event.sender || globalMainWindow?.webContents

  let savedApiKey = ''
  try {
    if (fs.existsSync(CONFIG_FILE)) {
      const cfg = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf-8'))
      if (cfg.ollamaApiKey) savedApiKey = cfg.ollamaApiKey
    }
  } catch {}

  const context = {
    notesDir: NOTES_DIR,
    mainWindow: globalMainWindow,
    undoManager: globalUndoManager,
    ollamaApiKey: params.ollamaApiKey || savedApiKey
  }

  try {
    const result = await runAgentLoop(
      params,
      context,
      (step) => {
        if (webContents && !webContents.isDestroyed()) {
          webContents.send('agent-step', step)
        }
      },
      activeAgentController.signal
    )
    return { success: true, result }
  } catch (err: any) {
    return { success: false, error: err.message }
  } finally {
    activeAgentController = null
  }
})

ipcMain.handle('agent-cancel', async () => {
  if (activeAgentController) {
    activeAgentController.abort()
    activeAgentController = null
    return true
  }
  return false
})

ipcMain.handle('agent-undo', async () => {
  const res = await globalUndoManager.undoLast(NOTES_DIR)
  if (globalMainWindow && !globalMainWindow.isDestroyed()) {
    globalMainWindow.webContents.send('notes-updated')
  }
  return res
})

ipcMain.handle('agent-check-model', async (_event, modelName: string) => {
  return await checkOllamaModelAvailable(modelName)
})

// Handlers Copilote Inline IA (Ghostwriter Ollama)
ipcMain.handle('ai-ollama-inline-complete', async (_event, prompt: string, modelName?: string) => {
  return await callOllamaInlineCompletion(prompt, modelName)
})

// Handlers Time Travel / Historique de versions
ipcMain.handle('get-note-history', async (_event, relativePath: string) => {
  notePath(relativePath)
  return await getHistory(NOTES_DIR, relativePath)
})

ipcMain.handle(
  'get-history-version-content',
  async (_event, relativePath: string, versionId: string) => {
    notePath(relativePath)
    return await getVersionContent(NOTES_DIR, relativePath, versionId)
  }
)

ipcMain.handle('restore-note-version', async (_event, relativePath: string, versionId: string) => {
  const fullPath = notePath(relativePath)
  const content = await getVersionContent(NOTES_DIR, relativePath, versionId)
  if (content !== null) {
    fs.writeFileSync(fullPath, content, 'utf-8')
    await saveSnapshot(NOTES_DIR, relativePath, content)
    return content
  }
  throw new Error('Version introuvable')
})

// Handler Exportateur Pro Multi-formats (PDF, Word docx, HTML autonome)
ipcMain.handle('export-note', async (_event, params: ExportNoteParams) => {
  let themeCss = ''
  try {
    const themePath = join(NOTES_DIR, '.snippets', 'theme.css')
    if (fs.existsSync(themePath)) {
      themeCss = fs.readFileSync(themePath, 'utf-8')
    }
  } catch {}

  const baseFileName =
    params.defaultFileName ||
    (params.title ? params.title.replace(/[^a-zA-Z0-9_\u00C0-\u017F\s-]/g, '').trim() : 'note')

  if (params.format === 'html') {
    return await exportToHtml(
      params.title,
      params.htmlRendered || params.content,
      themeCss,
      `${baseFileName}.html`
    )
  } else if (params.format === 'pdf') {
    return await exportToPdf(
      params.title,
      params.htmlRendered || params.content,
      themeCss,
      `${baseFileName}.pdf`
    )
  } else if (params.format === 'docx') {
    return await exportToDocx(params.title, params.content, `${baseFileName}.docx`)
  }

  return { success: false, error: 'Format non supporté' }
})

app.whenReady().then(async () => {
  console.log('MAIN: app.whenReady fired!')
  electronApp.setAppUserModelId('com.electron')
  app.userAgentFallback = CHROME_UA

  // Activer la configuration des cookies
  setupCookieSynchronization()

  // Gestionnaire de protocole note-pdf://notes/<chemin relatif encodé> : fichiers du dossier de notes uniquement
  protocol.handle('note-pdf', (request) => {
    try {
      const url = new URL(request.url)
      if (url.hostname !== 'notes') {
        return new Response('Forbidden', { status: 403 })
      }
      const pathname = decodeURIComponent(url.pathname.replace(/^\/+/, ''))
      const fullPath = notePath(pathname)
      if (fs.existsSync(fullPath)) {
        return net.fetch(pathToFileURL(fullPath).toString())
      }
    } catch (e) {
      if (e instanceof PathAccessError) {
        console.warn('[note-pdf]', e.message)
        return new Response('Forbidden', { status: 403 })
      }
      console.error('Error handling note-pdf protocol:', e)
    }
    return new Response('Not found', { status: 404 })
  })

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
    window.webContents.on('will-navigate', (_e, navUrl) => {
      const lower = navUrl.toLowerCase()
      if (
        lower.includes('accounts.google.') ||
        lower.includes('accounts.youtube.') ||
        lower.includes('signin')
      ) {
        window.webContents.setUserAgent(FIREFOX_UA)
      } else if (!lower.includes('google.') && !lower.includes('gstatic.')) {
        window.webContents.setUserAgent(CHROME_UA)
      }
    })
    window.webContents.on('did-navigate', (_e, navUrl) => {
      const lower = navUrl.toLowerCase()
      if (
        lower.includes('accounts.google.') ||
        lower.includes('accounts.youtube.') ||
        lower.includes('signin')
      ) {
        window.webContents.setUserAgent(FIREFOX_UA)
      } else if (!lower.includes('google.') && !lower.includes('gstatic.')) {
        window.webContents.setUserAgent(CHROME_UA)
      }
    })
  })

  console.log('MAIN: calling createWindow()...')
  createWindow()
  console.log('MAIN: createWindow() finished!')

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
