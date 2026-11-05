import dns from 'node:dns'
import http from 'node:http'
import https from 'node:https'
import net from 'node:net'

/**
 * Téléchargements déclenchés par du contenu web ou par l'agent : ils ne doivent jamais atteindre le
 * réseau local (box, Ollama, services de la machine). L'adresse est vérifiée au moment de la connexion
 * (option `lookup`) : une vérification préalable laisserait passer un DNS qui change entre-temps.
 * Chaque redirection est revérifiée.
 */
export class BlockedUrlError extends Error {
  constructor(url: string, reason: string) {
    super(`Adresse refusée (${reason}) : ${url}`)
    this.name = 'BlockedUrlError'
  }
}

function ipv4ToNumber(ip: string): number {
  return ip.split('.').reduce((n, part) => n * 256 + Number(part), 0)
}

function inV4Range(ip: string, base: string, bits: number): boolean {
  const size = 2 ** (32 - bits)
  return Math.floor(ipv4ToNumber(ip) / size) === Math.floor(ipv4ToNumber(base) / size)
}

const PRIVATE_V4: Array<[string, number]> = [
  ['0.0.0.0', 8],
  ['10.0.0.0', 8],
  ['100.64.0.0', 10],
  ['127.0.0.0', 8],
  ['169.254.0.0', 16],
  ['172.16.0.0', 12],
  ['192.0.0.0', 24],
  ['192.168.0.0', 16],
  ['198.18.0.0', 15],
  ['224.0.0.0', 4],
  ['240.0.0.0', 4]
]

/** Les 8 groupes d'une adresse IPv6, « :: » et IPv4 finale développés. */
function ipv6Groups(ip: string): number[] {
  let address = ip.split('%')[0].toLowerCase()
  const v4 = /(\d+\.\d+\.\d+\.\d+)$/.exec(address)
  if (v4) {
    const n = ipv4ToNumber(v4[1])
    const hi = Math.floor(n / 65536).toString(16)
    const lo = (n % 65536).toString(16)
    address = address.slice(0, v4.index) + `${hi}:${lo}`
  }
  const [head, tail] = address.split('::')
  const left = head ? head.split(':') : []
  const right = tail ? tail.split(':') : []
  const fill = address.includes('::') ? 8 - left.length - right.length : 0
  return [...left, ...Array(fill).fill('0'), ...right].map((g) => parseInt(g, 16))
}

/** Adresse non publique : boucle locale, réseau privé, lien local, multidiffusion, réservée. */
export function isPrivateAddress(ip: string): boolean {
  const version = net.isIP(ip.split('%')[0])
  if (version === 4) return PRIVATE_V4.some(([base, bits]) => inV4Range(ip, base, bits))
  if (version !== 6) return true

  const g = ipv6Groups(ip)
  const zeros = (n: number): boolean => g.slice(0, n).every((v) => v === 0)
  if (zeros(7) && g[7] <= 1) return true // :: et ::1
  // IPv4 transportée dans une IPv6 (::ffff:a.b.c.d, ::a.b.c.d, 64:ff9b::a.b.c.d)
  if ((zeros(5) && g[5] === 0xffff) || zeros(6) || (g[0] === 0x64 && g[1] === 0xff9b)) {
    const v4 = [g[6] >> 8, g[6] & 255, g[7] >> 8, g[7] & 255].join('.')
    return isPrivateAddress(v4)
  }
  if ((g[0] & 0xfe00) === 0xfc00) return true // fc00::/7, adresses locales uniques
  if ((g[0] & 0xffc0) === 0xfe80) return true // fe80::/10, lien local
  if ((g[0] & 0xffc0) === 0xfec0) return true // fec0::/10, site local (obsolète)
  return (g[0] & 0xff00) === 0xff00 // ff00::/8, multidiffusion
}

export interface SafeResponse {
  ok: boolean
  status: number
  url: string
  headers: http.IncomingHttpHeaders
  body: Buffer
}

export interface SafeFetchOptions {
  headers?: Record<string, string>
  timeoutMs?: number
  maxBytes?: number
  maxRedirects?: number
  /** Remplaçable dans les tests pour joindre un serveur local. */
  isBlocked?: (ip: string) => boolean
}

function hostnameOf(url: URL): string {
  return url.hostname.replace(/^\[|\]$/g, '')
}

function requestOnce(url: URL, options: Required<SafeFetchOptions>): Promise<SafeResponse> {
  return new Promise((resolve, reject) => {
    const lookup: net.LookupFunction = (hostname, lookupOptions, callback) => {
      dns.lookup(hostname, { ...lookupOptions, all: true }, (err, addresses) => {
        if (err) {
          callback(err, '', 0)
          return
        }
        const blocked = addresses.find((a) => options.isBlocked(a.address))
        if (blocked) {
          callback(new BlockedUrlError(url.href, blocked.address), '', 0)
          return
        }
        if (lookupOptions.all) callback(null, addresses)
        else callback(null, addresses[0].address, addresses[0].family)
      })
    }

    const client = url.protocol === 'https:' ? https : http
    const req = client.request(
      url,
      { method: 'GET', headers: options.headers, lookup, timeout: options.timeoutMs },
      (res) => {
        const chunks: Buffer[] = []
        let size = 0
        let tooLarge = false
        res.on('data', (chunk: Buffer) => {
          if (tooLarge) return
          size += chunk.length
          if (size > options.maxBytes) {
            tooLarge = true
            reject(new Error(`Réponse trop volumineuse : ${url.href}`))
            res.destroy()
            return
          }
          chunks.push(chunk)
        })
        res.on('error', reject)
        res.on('end', () => {
          if (tooLarge) return
          const status = res.statusCode ?? 0
          resolve({
            ok: status >= 200 && status < 300,
            status,
            url: url.href,
            headers: res.headers,
            body: Buffer.concat(chunks)
          })
        })
      }
    )
    req.on('timeout', () => req.destroy(new Error(`Délai dépassé : ${url.href}`)))
    req.on('error', reject)
    req.end()
  })
}

/** GET http(s) refusant le réseau local ; lève BlockedUrlError si l'adresse est interdite. */
export async function safeFetch(
  rawUrl: string,
  options: SafeFetchOptions = {}
): Promise<SafeResponse> {
  const settings: Required<SafeFetchOptions> = {
    headers: options.headers ?? {},
    timeoutMs: options.timeoutMs ?? 30_000,
    maxBytes: options.maxBytes ?? 200 * 1024 * 1024,
    maxRedirects: options.maxRedirects ?? 5,
    isBlocked: options.isBlocked ?? isPrivateAddress
  }

  let current = rawUrl
  for (let hop = 0; hop <= settings.maxRedirects; hop++) {
    let url: URL
    try {
      url = new URL(current)
    } catch {
      throw new BlockedUrlError(current, 'adresse invalide')
    }
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      throw new BlockedUrlError(current, 'protocole interdit')
    }
    // Une adresse IP écrite telle quelle ne passe pas par `lookup`
    const host = hostnameOf(url)
    if (net.isIP(host) && settings.isBlocked(host)) {
      throw new BlockedUrlError(current, host)
    }

    const res = await requestOnce(url, settings)
    const location = res.headers.location
    if (res.status < 300 || res.status >= 400 || !location) return res
    current = new URL(location, url).href
  }
  throw new BlockedUrlError(rawUrl, 'trop de redirections')
}
