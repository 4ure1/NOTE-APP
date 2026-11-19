import { describe, expect, it, vi } from 'vitest'
import { disablePasskeys } from './noPasskeyScript'

function fakeWindow(): Window & { DOMException: typeof DOMException } & {
  navigator: { credentials: { get: ReturnType<typeof vi.fn>; create: ReturnType<typeof vi.fn> } }
  PublicKeyCredential: Record<string, () => Promise<boolean>>
} {
  return {
    DOMException,
    navigator: {
      credentials: {
        get: vi.fn(() => Promise.resolve('mdp')),
        create: vi.fn(() => Promise.resolve('c'))
      }
    },
    PublicKeyCredential: {
      isConditionalMediationAvailable: () => Promise.resolve(true),
      isUserVerifyingPlatformAuthenticatorAvailable: () => Promise.resolve(true)
    }
  } as never
}

describe('disablePasskeys', () => {
  it('refuse les demandes de passkey sans appeler le navigateur', async () => {
    const win = fakeWindow()
    const original = win.navigator.credentials.get
    disablePasskeys(win)
    await expect(win.navigator.credentials.get({ publicKey: {} } as never)).rejects.toMatchObject({
      name: 'NotAllowedError'
    })
    await expect(
      win.navigator.credentials.create({ publicKey: {} } as never)
    ).rejects.toMatchObject({ name: 'NotAllowedError' })
    expect(original).not.toHaveBeenCalled()
  })

  it('laisse passer les autres identifiants', async () => {
    const win = fakeWindow()
    disablePasskeys(win)
    await expect(win.navigator.credentials.get({ password: true } as never)).resolves.toBe('mdp')
  })

  it('annonce qu’aucune passkey n’est disponible', async () => {
    const win = fakeWindow()
    disablePasskeys(win)
    await expect(win.PublicKeyCredential.isConditionalMediationAvailable()).resolves.toBe(false)
    await expect(
      win.PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable()
    ).resolves.toBe(false)
  })

  it('la source transmise à la page est autonome et vise son window', async () => {
    const win = fakeWindow()
    new Function('window', `(${disablePasskeys.toString()})()`)(win)
    await expect(win.navigator.credentials.get({ publicKey: {} } as never)).rejects.toMatchObject({
      name: 'NotAllowedError'
    })
  })

  it('ne casse rien sans WebAuthn', () => {
    expect(() => disablePasskeys({ navigator: {}, DOMException } as never)).not.toThrow()
  })
})
