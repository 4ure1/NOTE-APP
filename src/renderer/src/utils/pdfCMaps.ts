// Tables de caractères des PDF, embarquées pour fonctionner hors ligne. Intégrées au bundle et non lues
// par URL : pdf.js ne peut pas les récupérer depuis file:// dans l'app empaquetée. Chargées à la demande.
const CMAPS = import.meta.glob('../../../../node_modules/pdfjs-dist/cmaps/*.bcmap', {
  query: '?inline',
  import: 'default'
}) as Record<string, () => Promise<string>>

/** Remplace le lecteur de pdf.js (option CMapReaderFactory de getDocument). */
export class LocalCMapReaderFactory {
  async fetch({ name }: { name: string }): Promise<{ cMapData: Uint8Array; isCompressed: boolean }> {
    const key = Object.keys(CMAPS).find((path) => path.endsWith(`/${name}.bcmap`))
    if (!key) throw new Error(`Table de caractères PDF inconnue : ${name}`)
    const dataUrl = await CMAPS[key]()
    const binary = atob(dataUrl.slice(dataUrl.indexOf(',') + 1))
    const cMapData = new Uint8Array(binary.length)
    for (let i = 0; i < binary.length; i++) cMapData[i] = binary.charCodeAt(i)
    return { cMapData, isCompressed: true }
  }
}
