/**
 * Module de mise à jour sûre des liens internes (WikiLinks, HTML href/src, Markdown).
 * Gère le renommage et déplacement de notes et de dossiers.
 * Préserve strictement le contenu de <pre>, <code>, ```, <style>, <script>.
 */

export interface LinkChangeDetail {
  line: number
  original: string
  replacement: string
  type: 'wikilink' | 'html-href' | 'html-src' | 'markdown-link'
}

export interface FileUpdatePlan {
  relativePath: string
  changesCount: number
  changes: LinkChangeDetail[]
  originalContent: string
  newContent: string
}

export interface RenameOperationPlan {
  // Identifiant du plan conservé côté main : apply n'utilise que ce plan, pas le contenu renvoyé
  planId?: string
  oldPath: string
  newPath: string
  isFolder: boolean
  affectedFiles: FileUpdatePlan[]
  totalChanges: number
  hasCollision: boolean
  collisionError?: string
}

// ---------------------------------------------------------------------------
// 1. Protection des zones de code, scripts et styles
// ---------------------------------------------------------------------------

interface MaskResult {
  masked: string
  unmask: (str: string) => string
}

/**
 * Masque les zones protégées (<pre>, <code>, ```, `code`, <style>, <script>)
 * pour garantir qu'aucun lien situé dans ces blocs ne soit modifié.
 */
export function maskProtectedBlocks(content: string): MaskResult {
  const tokens: string[] = []
  const tokenPrefix = '___PROTECTED_BLOCK_'
  const tokenSuffix = '___'

  // Ordre de priorité de masquage
  const protectedPatterns = [
    // Blocs de code Markdown ``` ... ```
    /```[\s\S]*?```/g,
    // Blocs HTML <pre> ... </pre>
    /<pre\b[^>]*>[\s\S]*?<\/pre>/gi,
    // Balises HTML <code> ... </code>
    /<code\b[^>]*>[\s\S]*?<\/code>/gi,
    // Balises HTML <style> ... </style>
    /<style\b[^>]*>[\s\S]*?<\/style>/gi,
    // Balises HTML <script> ... </script>
    /<script\b[^>]*>[\s\S]*?<\/script>/gi,
    // Code inline Markdown `...`
    /`[^`\r\n]+`/g
  ]

  let current = content
  for (const pattern of protectedPatterns) {
    current = current.replace(pattern, (match) => {
      const idx = tokens.length
      tokens.push(match)
      return `${tokenPrefix}${idx}${tokenSuffix}`
    })
  }

  const unmask = (str: string): string => {
    return str.replace(/___PROTECTED_BLOCK_(\d+)___/g, (_m, idxStr) => {
      const idx = parseInt(idxStr, 10)
      return tokens[idx] !== undefined ? tokens[idx] : _m
    })
  }

  return { masked: current, unmask }
}

// ---------------------------------------------------------------------------
// 2. Utilitaires de chemins POSIX
// ---------------------------------------------------------------------------

export function normalizePosix(p: string): string {
  return p.replace(/\\/g, '/').replace(/^\.\//, '').replace(/\/+/g, '/')
}

export function getDirname(p: string): string {
  const norm = normalizePosix(p)
  const idx = norm.lastIndexOf('/')
  return idx === -1 ? '' : norm.slice(0, idx)
}

export function getBasename(p: string): string {
  const norm = normalizePosix(p)
  const idx = norm.lastIndexOf('/')
  return idx === -1 ? norm : norm.slice(idx + 1)
}

export function getBaseNameWithoutExt(p: string): string {
  const base = getBasename(p)
  const dotIdx = base.lastIndexOf('.')
  return dotIdx > 0 ? base.slice(0, dotIdx) : base
}

export function stripExtension(p: string): string {
  const norm = normalizePosix(p)
  const slashIdx = norm.lastIndexOf('/')
  const dotIdx = norm.lastIndexOf('.')
  return dotIdx > slashIdx ? norm.slice(0, dotIdx) : norm
}

export function getExtension(p: string): string {
  const base = getBasename(p)
  const dotIdx = base.lastIndexOf('.')
  return dotIdx > 0 ? base.slice(dotIdx) : ''
}

/**
 * Calcule le chemin relatif POSIX depuis fromDir vers toFilePath.
 * Ex: fromDir: 'a/b', toFilePath: 'a/c/d.html' -> '../c/d.html'
 * Ex: fromDir: 'a', toFilePath: 'a/d.html' -> 'd.html'
 */
export function computePosixRelativePath(fromDir: string, toFilePath: string): string {
  const cleanFrom = normalizePosix(fromDir).replace(/^\/+|\/+$/g, '')
  const cleanTo = normalizePosix(toFilePath).replace(/^\/+/, '')

  if (!cleanFrom) {
    return cleanTo
  }

  const fromParts = cleanFrom.split('/')
  const toParts = cleanTo.split('/')

  let common = 0
  while (
    common < fromParts.length &&
    common < toParts.length &&
    fromParts[common].toLowerCase() === toParts[common].toLowerCase()
  ) {
    common++
  }

  const upCount = fromParts.length - common
  const downParts = toParts.slice(common)

  const segments: string[] = []
  for (let i = 0; i < upCount; i++) {
    segments.push('..')
  }
  segments.push(...downParts)

  return segments.join('/') || '.'
}

/**
 * Résout un chemin relatif depuis baseDir vers un chemin absolu dans la vault.
 */
export function resolvePosixPath(baseDir: string, relPath: string): string {
  const cleanBase = normalizePosix(baseDir).replace(/^\/+|\/+$/g, '')
  const cleanRel = normalizePosix(relPath).replace(/^\.\//, '')

  // Si c'est déjà un chemin racine
  if (cleanRel.startsWith('/')) {
    return normalizePosix(cleanRel.slice(1))
  }

  const stack = cleanBase ? cleanBase.split('/') : []
  const parts = cleanRel.split('/')

  for (const part of parts) {
    if (!part || part === '.') continue
    if (part === '..') {
      if (stack.length > 0) stack.pop()
    } else {
      stack.push(part)
    }
  }

  return stack.join('/')
}

// ---------------------------------------------------------------------------
// 3. Logique de correspondance et remplacement de liens
// ---------------------------------------------------------------------------

function findLineNumber(text: string, index: number): number {
  return text.slice(0, index).split('\n').length
}

export interface VaultFileRef {
  relativePath: string
  content: string
}

/**
 * Met à jour les liens dans le contenu d'un fichier donné.
 */
export function updateLinksInContent(
  referencingFile: string,
  content: string,
  oldPath: string,
  newPath: string,
  isFolder: boolean,
  knownVaultPaths?: string[]
): { updatedContent: string; changes: LinkChangeDetail[] } {
  const normRef = normalizePosix(referencingFile)
  const normOld = normalizePosix(oldPath)
  const normNew = normalizePosix(newPath)
  const isSelfMoved = isFolder
    ? normRef === normOld || normRef.startsWith(normOld + '/')
    : normRef === normOld

  const changes: LinkChangeDetail[] = []
  const { masked, unmask } = maskProtectedBlocks(content)

  const refDir = getDirname(normRef)
  const oldBaseNoExt = getBaseNameWithoutExt(normOld)
  const newBaseNoExt = getBaseNameWithoutExt(normNew)

  let result = masked

  // --- A. WikiLinks : [[Target]], [[Target|alias]], [[Target#sec]], ![[Target]] ---
  const wikiLinkRegex = /(!?\[\[)([^\]|#]+)(#[^\]|]*)?(\|[^\]]*)?(\]\])/g

  result = result.replace(
    wikiLinkRegex,
    (match, prefix, targetRaw, anchor = '', alias = '', suffix, offset) => {
      const trimmedTarget = targetRaw.trim()
      const normTarget = normalizePosix(trimmedTarget)
      const targetNoExt = getBaseNameWithoutExt(normTarget)
      const targetExt = getExtension(normTarget)

      let shouldUpdate = false
      let updatedTarget = trimmedTarget

      if (isFolder) {
        // Dossier renommé ou déplacé
        if (normTarget.toLowerCase() === normOld.toLowerCase()) {
          updatedTarget = normNew
          shouldUpdate = true
        } else if (normTarget.toLowerCase().startsWith(normOld.toLowerCase() + '/')) {
          const sub = normTarget.slice(normOld.length + 1)
          updatedTarget = `${normNew}/${sub}`
          shouldUpdate = true
        }
      } else {
        // Fichier individuel renommé ou déplacé
        // 1. Correspondance exacte sur chemin complet (avec ou sans extension)
        if (
          normTarget.toLowerCase() === normOld.toLowerCase() ||
          normTarget.toLowerCase() === stripExtension(normOld).toLowerCase() ||
          (normTarget.includes('/') &&
            (normTarget.toLowerCase() === normOld.toLowerCase() ||
              normTarget.toLowerCase() === stripExtension(normOld).toLowerCase()))
        ) {
          // Chemin relatif ou complet
          if (normTarget.includes('/')) {
            const keepExt = Boolean(targetExt)
            updatedTarget = keepExt ? normNew : stripExtension(normNew)
          } else {
            // Nom simple sans dossier
            const keepExt = Boolean(targetExt)
            updatedTarget = keepExt ? getBasename(normNew) : newBaseNoExt
          }
          shouldUpdate = true
        } else if (!normTarget.includes('/')) {
          // Cible simple sans chemin : [[NomNote]]
          if (targetNoExt.toLowerCase() === oldBaseNoExt.toLowerCase()) {
            let isTargetingAnotherLocalNote = false
            if (knownVaultPaths && knownVaultPaths.length > 0) {
              const localDir = getDirname(normRef)
              const oldDir = getDirname(normOld)
              if (localDir.toLowerCase() !== oldDir.toLowerCase()) {
                // Vérifie s'il existe une note homonyme dans le même répertoire que le fichier appelant
                const hasLocalSameName = knownVaultPaths.some((p) => {
                  const pNorm = normalizePosix(p)
                  return (
                    getDirname(pNorm).toLowerCase() === localDir.toLowerCase() &&
                    getBaseNameWithoutExt(pNorm).toLowerCase() === targetNoExt.toLowerCase() &&
                    pNorm.toLowerCase() !== normOld.toLowerCase()
                  )
                })
                if (hasLocalSameName) {
                  isTargetingAnotherLocalNote = true
                }
              }
            }

            if (!isTargetingAnotherLocalNote) {
              const keepExt = Boolean(targetExt)
              updatedTarget = keepExt ? getBasename(normNew) : newBaseNoExt
              shouldUpdate = true
            }
          }
        }
      }

      if (shouldUpdate && updatedTarget !== trimmedTarget) {
        const replacement = `${prefix}${updatedTarget}${anchor}${alias}${suffix}`
        changes.push({
          line: findLineNumber(content, offset),
          original: match,
          replacement,
          type: 'wikilink'
        })
        return replacement
      }

      return match
    }
  )

  // --- B. Liens HTML (href, src) et Markdown [text](path), ![alt](path) ---

  // Helper pour traiter une URL relative / chemin local
  const processUrl = (
    url: string,
    offset: number,
    type: 'html-href' | 'html-src' | 'markdown-link',
    fullMatch: string
  ): string => {
    const trimmed = url.trim()
    // Ne jamais toucher aux URLs externes, protocoles ou ancres pures
    if (!trimmed || /^(https?:|mailto:|tel:|data:|javascript:|#)/i.test(trimmed)) {
      return url
    }

    // Séparer l'ancre / query
    const hashIdx = trimmed.indexOf('#')
    const queryIdx = trimmed.indexOf('?')
    let splitIdx = -1
    if (hashIdx !== -1 && queryIdx !== -1) splitIdx = Math.min(hashIdx, queryIdx)
    else if (hashIdx !== -1) splitIdx = hashIdx
    else if (queryIdx !== -1) splitIdx = queryIdx

    const pathPart = splitIdx !== -1 ? trimmed.slice(0, splitIdx) : trimmed
    const suffixPart = splitIdx !== -1 ? trimmed.slice(splitIdx) : ''

    const decodedPath = decodeURI(pathPart)
    const normUrlPath = normalizePosix(decodedPath)

    // Résoudre le chemin de la cible dans la vault
    // Si isSelfMoved : pour le fichier déplacé lui-même, sa référence originale était calculée depuis oldPath
    const effectiveRefDir = isSelfMoved ? getDirname(normOld) : refDir
    const resolvedVaultTarget = resolvePosixPath(effectiveRefDir, normUrlPath)

    let targetChanged = false
    let newVaultTarget = resolvedVaultTarget

    if (isFolder) {
      if (resolvedVaultTarget.toLowerCase() === normOld.toLowerCase()) {
        newVaultTarget = normNew
        targetChanged = true
      } else if (resolvedVaultTarget.toLowerCase().startsWith(normOld.toLowerCase() + '/')) {
        const sub = resolvedVaultTarget.slice(normOld.length + 1)
        newVaultTarget = `${normNew}/${sub}`
        targetChanged = true
      }
    } else {
      const targetNoExt = stripExtension(resolvedVaultTarget)
      const oldNoExt = stripExtension(normOld)
      const sameDir =
        getDirname(resolvedVaultTarget).toLowerCase() === getDirname(normOld).toLowerCase()

      if (
        resolvedVaultTarget.toLowerCase() === normOld.toLowerCase() ||
        (sameDir && targetNoExt.toLowerCase() === oldNoExt.toLowerCase())
      ) {
        newVaultTarget = normNew
        targetChanged = true
      }
    }

    // Si la cible a changé OU si le fichier lui-même a changé d'emplacement
    const currentNewRefDir = isSelfMoved ? getDirname(normNew) : refDir
    if (targetChanged || (isSelfMoved && effectiveRefDir !== currentNewRefDir)) {
      const newRel = computePosixRelativePath(currentNewRefDir, newVaultTarget)
      // Encoder les espaces si l'original était encodé
      const wasEncoded = pathPart.includes('%20')
      const formattedRel = wasEncoded ? encodeURI(newRel) : newRel
      const newFullUrl = `${formattedRel}${suffixPart}`

      if (newFullUrl !== trimmed) {
        changes.push({
          line: findLineNumber(content, offset),
          original: fullMatch,
          replacement: fullMatch.replace(url, newFullUrl),
          type
        })
        return newFullUrl
      }
    }

    return url
  }

  // 1. HTML href="..."
  const hrefRegex = /(<a\b[^>]*?\bhref=(["']))(.*?)\2/gi
  result = result.replace(hrefRegex, (fullMatch, prefix, quote, url, offset) => {
    const updated = processUrl(url, offset, 'html-href', fullMatch)
    return `${prefix}${updated}${quote}`
  })

  // 2. HTML src="..." (img, script, audio, video, source)
  const srcRegex = /(<(?:img|source|video|audio|script|iframe)\b[^>]*?\bsrc=(["']))(.*?)\2/gi
  result = result.replace(srcRegex, (fullMatch, prefix, quote, url, offset) => {
    const updated = processUrl(url, offset, 'html-src', fullMatch)
    return `${prefix}${updated}${quote}`
  })

  // 3. Markdown links: [text](path) et ![alt](path)
  const mdLinkRegex = /(!?\[[^\]]*\]\()([^)\s]+)(\s+["'][^"']*["'])?\)/g
  result = result.replace(mdLinkRegex, (fullMatch, prefix, url, title = '', offset) => {
    const updated = processUrl(url, offset, 'markdown-link', fullMatch)
    return `${prefix}${updated}${title})`
  })

  const finalContent = unmask(result)

  return {
    updatedContent: finalContent,
    changes
  }
}

/**
 * Construit le plan complet d'impact pour un renommage / déplacement
 * à partir de l'ensemble des fichiers de la vault.
 */
export function buildRenamePlan(
  vaultFiles: VaultFileRef[],
  oldPath: string,
  newPath: string,
  isFolder: boolean
): RenameOperationPlan {
  const normOld = normalizePosix(oldPath)
  const normNew = normalizePosix(newPath)
  const knownVaultPaths = vaultFiles.map((f) => f.relativePath)

  // Vérification de collision de destination
  const hasCollision = vaultFiles.some((f) => {
    const fNorm = normalizePosix(f.relativePath).toLowerCase()
    if (fNorm === normNew.toLowerCase()) {
      // Si c'est le même fichier avec la même casse, ce n'est pas une collision
      return normalizePosix(f.relativePath) !== normOld
    }
    return false
  })

  const affectedFiles: FileUpdatePlan[] = []
  let totalChanges = 0

  for (const file of vaultFiles) {
    const normFile = normalizePosix(file.relativePath)

    // Vérifier si ce fichier est le fichier déplacé ou s'il fait partie du dossier déplacé
    const isTargetFile = isFolder
      ? normFile === normOld || normFile.startsWith(normOld + '/')
      : normFile === normOld

    const { updatedContent, changes } = updateLinksInContent(
      file.relativePath,
      file.content,
      normOld,
      normNew,
      isFolder,
      knownVaultPaths
    )

    if (changes.length > 0 || isTargetFile) {
      // Si des liens ont changé OU si le fichier fait partie de l'entité déplacée et son contenu a changé
      if (changes.length > 0) {
        affectedFiles.push({
          relativePath: file.relativePath,
          changesCount: changes.length,
          changes,
          originalContent: file.content,
          newContent: updatedContent
        })
        totalChanges += changes.length
      }
    }
  }

  return {
    oldPath: normOld,
    newPath: normNew,
    isFolder,
    affectedFiles,
    totalChanges,
    hasCollision,
    collisionError: hasCollision
      ? `Un élément nommé "${getBasename(normNew)}" existe déjà à cet emplacement.`
      : undefined
  }
}
