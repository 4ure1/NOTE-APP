// @vitest-environment node
import http from 'node:http'
import type { AddressInfo } from 'node:net'
import { afterEach, describe, it, expect } from 'vitest'
import { BlockedUrlError, isPrivateAddress, safeFetch } from './safeFetch'

describe('isPrivateAddress', () => {
  it.each([
    '127.0.0.1',
    '127.255.0.1',
    '10.1.2.3',
    '172.16.0.1',
    '172.31.255.255',
    '192.168.1.1',
    '169.254.169.254',
    '100.64.0.1',
    '0.0.0.0',
    '224.0.0.1',
    '255.255.255.255',
    '::',
    '::1',
    'fe80::1',
    'fc00::1',
    'fd12:3456::1',
    'ff02::1',
    '::ffff:127.0.0.1',
    '::ffff:7f00:1',
    '::ffff:192.168.0.1',
    '64:ff9b::10.0.0.1',
    'pas-une-ip'
  ])('refuse %s', (ip) => {
    expect(isPrivateAddress(ip)).toBe(true)
  })

  it.each([
    '8.8.8.8',
    '1.1.1.1',
    '172.15.255.255',
    '172.32.0.1',
    '100.128.0.1',
    '193.168.1.1',
    '2606:4700:4700::1111',
    '::ffff:8.8.8.8'
  ])('accepte %s', (ip) => {
    expect(isPrivateAddress(ip)).toBe(false)
  })
})

describe('safeFetch', () => {
  let server: http.Server | null = null

  afterEach(() => {
    server?.close()
    server = null
  })

  function serve(handler: http.RequestListener): Promise<string> {
    return new Promise((resolve) => {
      server = http.createServer(handler)
      server.listen(0, '127.0.0.1', () => {
        resolve(`http://127.0.0.1:${(server!.address() as AddressInfo).port}`)
      })
    })
  }

  it('refuse une adresse IP locale sans se connecter', async () => {
    await expect(safeFetch('http://127.0.0.1:9/')).rejects.toBeInstanceOf(BlockedUrlError)
    await expect(safeFetch('http://[::1]:9/')).rejects.toBeInstanceOf(BlockedUrlError)
  })

  it('refuse une écriture détournée de l’adresse locale', async () => {
    await expect(safeFetch('http://2130706433/')).rejects.toBeInstanceOf(BlockedUrlError)
    await expect(safeFetch('http://0x7f.1/')).rejects.toBeInstanceOf(BlockedUrlError)
  })

  it('refuse un nom qui se résout en adresse locale', async () => {
    await expect(safeFetch('http://localhost:9/')).rejects.toBeInstanceOf(BlockedUrlError)
  })

  it('refuse les autres protocoles et les adresses invalides', async () => {
    await expect(safeFetch('file:///C:/secret.txt')).rejects.toBeInstanceOf(BlockedUrlError)
    await expect(safeFetch('pas une url')).rejects.toBeInstanceOf(BlockedUrlError)
  })

  it('renvoie le corps d’une réponse autorisée', async () => {
    const base = await serve((_req, res) => res.end('bonjour'))
    const res = await safeFetch(base, { isBlocked: () => false })
    expect(res.ok).toBe(true)
    expect(res.body.toString()).toBe('bonjour')
  })

  it('suit une redirection et la revérifie', async () => {
    const base = await serve((req, res) => {
      if (req.url === '/fin') res.end('arrivé')
      else res.writeHead(302, { location: '/fin' }).end()
    })
    const res = await safeFetch(base + '/debut', { isBlocked: () => false })
    expect(res.body.toString()).toBe('arrivé')
    expect(res.url).toBe(base + '/fin')
  })

  it('refuse une redirection vers le réseau local', async () => {
    const base = await serve((_req, res) => {
      res.writeHead(302, { location: 'http://10.0.0.1/admin' }).end()
    })
    const isBlocked = (ip: string): boolean => ip.startsWith('10.')
    await expect(safeFetch(base, { isBlocked })).rejects.toBeInstanceOf(BlockedUrlError)
  })

  it('arrête les boucles de redirection', async () => {
    const base = await serve((_req, res) => res.writeHead(302, { location: '/' }).end())
    await expect(
      safeFetch(base, { isBlocked: () => false, maxRedirects: 2 })
    ).rejects.toBeInstanceOf(BlockedUrlError)
  })

  it('coupe une réponse trop volumineuse', async () => {
    const base = await serve((_req, res) => res.end('x'.repeat(5000)))
    await expect(safeFetch(base, { isBlocked: () => false, maxBytes: 100 })).rejects.toThrow(
      'trop volumineuse'
    )
  })
})
