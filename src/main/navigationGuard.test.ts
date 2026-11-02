import { describe, it, expect } from 'vitest'
import {
  isAllowedExternalUrl,
  hostMatches,
  isAppUrl,
  isAllowedSubframeUrl,
  isAllowedWebviewSrc,
  isOAuthPopupUrl,
  isYouTubeUrl,
  isOpenAiFileUrl
} from './navigationGuard'

describe('isAllowedExternalUrl', () => {
  it('accepte http, https et mailto', () => {
    expect(isAllowedExternalUrl('https://example.com/a')).toBe(true)
    expect(isAllowedExternalUrl('http://example.com')).toBe(true)
    expect(isAllowedExternalUrl('mailto:moi@example.com')).toBe(true)
  })

  it('refuse les schémas dangereux ou locaux', () => {
    for (const url of [
      'file:///C:/Windows/System32/calc.exe',
      'ms-msdt:/id PCWDiagnostic',
      'search-ms:query=x',
      'javascript:alert(1)',
      'data:text/html,<script>',
      'vbscript:x',
      'ms-settings:',
      'C:\\Windows\\calc.exe',
      'pas une url',
      ''
    ]) {
      expect(isAllowedExternalUrl(url), url).toBe(false)
    }
  })
})

describe('hostMatches', () => {
  it('accepte le domaine et ses sous-domaines', () => {
    expect(hostMatches('google.com', ['google.com'])).toBe(true)
    expect(hostMatches('accounts.google.com', ['google.com'])).toBe(true)
    expect(hostMatches('ACCOUNTS.Google.com.', ['google.com'])).toBe(true)
  })

  it('refuse les imitations', () => {
    expect(hostMatches('evilgoogle.com', ['google.com'])).toBe(false)
    expect(hostMatches('google.com.evil.fr', ['google.com'])).toBe(false)
    expect(hostMatches('notgoogle.com', ['google.com'])).toBe(false)
  })
})

describe('isAppUrl', () => {
  const prod = 'file:///C:/Program%20Files/NOTE-APP/resources/app.asar/out/renderer/index.html'

  it('build : même fichier, en ignorant query, hash et casse sous Windows', () => {
    expect(isAppUrl(prod + '#/notes', prod, true)).toBe(true)
    expect(isAppUrl(prod + '?x=1', prod, true)).toBe(true)
    expect(
      isAppUrl(
        'file:///c:/program%20files/note-app/resources/app.asar/out/renderer/INDEX.html',
        prod,
        true
      )
    ).toBe(true)
  })

  it('build : refuse un autre fichier local ou un site web', () => {
    expect(isAppUrl('file:///C:/Users/x/Notes/note-piegee.html', prod, true)).toBe(false)
    expect(isAppUrl('file:///C:/Windows/System32/calc.exe', prod, true)).toBe(false)
    expect(isAppUrl('https://example.com/', prod, true)).toBe(false)
  })

  it('dev : même origine que le serveur Vite seulement', () => {
    const dev = 'http://localhost:5173'
    expect(isAppUrl('http://localhost:5173/', dev)).toBe(true)
    expect(isAppUrl('http://localhost:5173/index.html?t=1#x', dev)).toBe(true)
    expect(isAppUrl('http://localhost:5174/', dev)).toBe(false)
    expect(isAppUrl('https://localhost:5173/', dev)).toBe(false)
    expect(isAppUrl('http://evil.com/', dev)).toBe(false)
  })

  it('refuse une URL invalide', () => {
    expect(isAppUrl('pas une url', prod)).toBe(false)
  })
})

describe('isAllowedSubframeUrl', () => {
  it('n’autorise que les aperçus srcdoc et about:blank', () => {
    expect(isAllowedSubframeUrl('about:srcdoc')).toBe(true)
    expect(isAllowedSubframeUrl('about:blank')).toBe(true)
    expect(isAllowedSubframeUrl('https://example.com/')).toBe(false)
    expect(isAllowedSubframeUrl('file:///C:/x.html')).toBe(false)
    expect(isAllowedSubframeUrl('about:srcdoc#piege')).toBe(false)
  })
})

describe('isAllowedWebviewSrc', () => {
  it('accepte les sites IA, YouTube et about:blank en https', () => {
    for (const url of [
      'https://claude.ai',
      'https://chatgpt.com',
      'https://gemini.google.com/app',
      'https://www.youtube.com/',
      'https://youtu.be/abc',
      'about:blank'
    ]) {
      expect(isAllowedWebviewSrc(url), url).toBe(true)
    }
  })

  it('refuse le reste, y compris en http ou en file', () => {
    for (const url of [
      'http://claude.ai',
      'https://evil.com/?claude.ai',
      'https://claude.ai.evil.com',
      'file:///C:/x.html',
      'javascript:alert(1)'
    ]) {
      expect(isAllowedWebviewSrc(url), url).toBe(false)
    }
  })
})

describe('isOAuthPopupUrl', () => {
  it('accepte les fournisseurs de connexion connus', () => {
    for (const url of [
      'https://accounts.google.com/o/oauth2/auth',
      'https://appleid.apple.com/auth',
      'https://tenant.auth0.com/login',
      'https://auth.openai.com/authorize',
      'https://claude.ai/login',
      'https://chatgpt.com/auth'
    ]) {
      expect(isOAuthPopupUrl(url), url).toBe(true)
    }
  })

  it('refuse une URL qui ne fait que contenir un nom de domaine connu', () => {
    for (const url of [
      'https://evil.com/?next=accounts.google.com',
      'https://google.com.evil.fr/',
      'https://www.apple.com/',
      'https://openai.com/',
      'http://accounts.google.com/'
    ]) {
      expect(isOAuthPopupUrl(url), url).toBe(false)
    }
  })
})

describe('isYouTubeUrl et isOpenAiFileUrl', () => {
  it('compare l’hôte, pas l’URL entière', () => {
    expect(isYouTubeUrl('https://m.youtube.com/watch?v=1')).toBe(true)
    expect(isYouTubeUrl('https://evil.com/youtube.com')).toBe(false)
    expect(isOpenAiFileUrl('https://files.oaiusercontent.com/file-1')).toBe(true)
    expect(isOpenAiFileUrl('https://evil.com/files.oaiusercontent.com')).toBe(false)
  })
})
