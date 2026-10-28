import { BrowserWindow, dialog } from 'electron'
import fs from 'fs'
import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  HeadingLevel,
  ShadingType,
  BorderStyle
} from 'docx'

export interface ExportNoteParams {
  format: 'html' | 'pdf' | 'docx'
  title: string
  content: string
  htmlRendered?: string
  defaultFileName?: string
}

/**
 * Exporte la note au format HTML autonome (styles embarqués)
 */
export async function exportToHtml(
  title: string,
  htmlContent: string,
  themeCss: string,
  defaultFileName = 'note.html'
): Promise<{ success: boolean; filePath?: string; error?: string }> {
  try {
    const saveRes = await dialog.showSaveDialog({
      title: 'Exporter la note en HTML autonome',
      defaultPath: defaultFileName.endsWith('.html') ? defaultFileName : `${defaultFileName}.html`,
      filters: [{ name: 'Page Web HTML', extensions: ['html', 'htm'] }]
    })

    if (saveRes.canceled || !saveRes.filePath) {
      return { success: false, error: 'Annulé par l\'utilisateur' }
    }

    const fullHtml = `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeXml(title)}</title>
  <style>
    ${themeCss}
    body {
      background-color: #121214;
      color: #e4e4e7;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      line-height: 1.6;
      margin: 0;
      padding: 40px 20px;
    }
    .exported-container {
      max-width: 900px;
      margin: 0 auto;
      background: #18181b;
      padding: 40px;
      border-radius: 12px;
      border: 1px solid rgba(255, 255, 255, 0.08);
      box-shadow: 0 10px 30px rgba(0,0,0,0.5);
    }
    h1.note-title {
      font-size: 2.2rem;
      font-weight: 800;
      margin-top: 0;
      margin-bottom: 24px;
      border-bottom: 1px solid rgba(255, 255, 255, 0.1);
      padding-bottom: 12px;
      color: #f4f4f5;
    }
  </style>
</head>
<body>
  <div class="exported-container">
    <h1 class="note-title">${escapeXml(title)}</h1>
    <div class="note-body">
      ${htmlContent}
    </div>
  </div>
</body>
</html>`

    fs.writeFileSync(saveRes.filePath, fullHtml, 'utf-8')
    return { success: true, filePath: saveRes.filePath }
  } catch (err: any) {
    return { success: false, error: err.message }
  }
}

/**
 * Exporte la note en PDF imprimable de haute qualité via Chromium
 */
export async function exportToPdf(
  title: string,
  htmlContent: string,
  themeCss: string,
  defaultFileName = 'note.pdf'
): Promise<{ success: boolean; filePath?: string; error?: string }> {
  let printWin: BrowserWindow | null = null
  try {
    const saveRes = await dialog.showSaveDialog({
      title: 'Exporter la note en PDF Pro',
      defaultPath: defaultFileName.endsWith('.pdf') ? defaultFileName : `${defaultFileName}.pdf`,
      filters: [{ name: 'Document PDF', extensions: ['pdf'] }]
    })

    if (saveRes.canceled || !saveRes.filePath) {
      return { success: false, error: 'Annulé par l\'utilisateur' }
    }

    const printHtml = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>${escapeXml(title)}</title>
  <style>
    ${themeCss}
    @page {
      margin: 18mm 15mm 20mm 15mm;
      size: A4 portrait;
    }
    body {
      background-color: #ffffff !important;
      color: #1a1a1a !important;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif !important;
      font-size: 11pt;
      line-height: 1.6;
    }
    h1, h2, h3, h4, h5, h6 {
      color: #09090b !important;
      page-break-after: avoid;
    }
    h1.print-title {
      font-size: 22pt;
      margin-bottom: 15px;
      border-bottom: 2px solid #38bdf8;
      padding-bottom: 8px;
    }
    pre, blockquote, .card, .step, table {
      page-break-inside: avoid;
    }
    pre {
      background: #f4f4f5 !important;
      color: #18181b !important;
      border: 1px solid #e4e4e7 !important;
      padding: 12px !important;
      border-radius: 6px !important;
    }
    pre code {
      color: #18181b !important;
    }
  </style>
</head>
<body>
  <h1 class="print-title">${escapeXml(title)}</h1>
  ${htmlContent}
</body>
</html>`

    printWin = new BrowserWindow({
      show: false,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true
      }
    })

    await printWin.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(printHtml)}`)

    const pdfBuffer = await printWin.webContents.printToPDF({
      printBackground: true,
      preferCSSPageSize: true,
      displayHeaderFooter: true,
      headerTemplate: '<div></div>',
      footerTemplate: `<div style="font-size:8pt;color:#71717a;text-align:right;width:100%;padding-right:20mm;font-family:sans-serif;">
        Page <span class="pageNumber"></span> / <span class="totalPages"></span>
      </div>`
    })

    fs.writeFileSync(saveRes.filePath, pdfBuffer)
    return { success: true, filePath: saveRes.filePath }
  } catch (err: any) {
    return { success: false, error: err.message }
  } finally {
    if (printWin) {
      printWin.destroy()
    }
  }
}

/**
 * Exporte la note en document Word (.docx) professionnel
 */
export async function exportToDocx(
  title: string,
  rawContent: string,
  defaultFileName = 'note.docx'
): Promise<{ success: boolean; filePath?: string; error?: string }> {
  try {
    const saveRes = await dialog.showSaveDialog({
      title: 'Exporter la note en Word (.docx)',
      defaultPath: defaultFileName.endsWith('.docx') ? defaultFileName : `${defaultFileName}.docx`,
      filters: [{ name: 'Document Word', extensions: ['docx'] }]
    })

    if (saveRes.canceled || !saveRes.filePath) {
      return { success: false, error: 'Annulé par l\'utilisateur' }
    }

    const paragraphs: Paragraph[] = [
      new Paragraph({
        text: title,
        heading: HeadingLevel.HEADING_1,
        spacing: { before: 200, after: 200 }
      })
    ]

    // Analyse simple du contenu ligne par ligne (Markdown & texte brut)
    const lines = rawContent.split('\n')
    let inCodeBlock = false
    let codeBuffer: string[] = []

    for (const rawLine of lines) {
      const line = rawLine.trim()

      if (line.startsWith('```')) {
        if (!inCodeBlock) {
          inCodeBlock = true
          codeBuffer = []
        } else {
          inCodeBlock = false
          paragraphs.push(
            new Paragraph({
              children: [
                new TextRun({
                  text: codeBuffer.join('\n'),
                  font: 'Consolas',
                  size: 20
                })
              ],
              shading: {
                type: ShadingType.CLEAR,
                fill: 'F4F4F5'
              },
              border: {
                left: { style: BorderStyle.SINGLE, size: 4, color: '38BDF8' }
              },
              spacing: { before: 120, after: 120 }
            })
          )
        }
        continue
      }

      if (inCodeBlock) {
        codeBuffer.push(rawLine)
        continue
      }

      if (line.startsWith('# ')) {
        paragraphs.push(
          new Paragraph({
            text: line.replace('# ', ''),
            heading: HeadingLevel.HEADING_1,
            spacing: { before: 300, after: 100 }
          })
        )
      } else if (line.startsWith('## ')) {
        paragraphs.push(
          new Paragraph({
            text: line.replace('## ', ''),
            heading: HeadingLevel.HEADING_2,
            spacing: { before: 240, after: 80 }
          })
        )
      } else if (line.startsWith('### ')) {
        paragraphs.push(
          new Paragraph({
            text: line.replace('### ', ''),
            heading: HeadingLevel.HEADING_3,
            spacing: { before: 180, after: 60 }
          })
        )
      } else if (line.startsWith('> ')) {
        paragraphs.push(
          new Paragraph({
            children: [
              new TextRun({
                text: line.replace('> ', ''),
                italics: true,
                color: '3F3F46'
              })
            ],
            border: {
              left: { style: BorderStyle.SINGLE, size: 6, color: 'A1A1AA' }
            },
            spacing: { before: 100, after: 100 }
          })
        )
      } else if (line.startsWith('- ') || line.startsWith('* ')) {
        paragraphs.push(
          new Paragraph({
            text: line.substring(2),
            bullet: { level: 0 },
            spacing: { before: 40, after: 40 }
          })
        )
      } else if (line.length > 0) {
        // Supprimer d'éventuelles balises HTML simples si la note est en HTML
        const stripped = line.replace(/<[^>]*>?/gm, '')
        if (stripped.trim().length > 0) {
          paragraphs.push(
            new Paragraph({
              text: stripped,
              spacing: { before: 60, after: 60 }
            })
          )
        }
      }
    }

    const doc = new Document({
      sections: [
        {
          properties: {},
          children: paragraphs
        }
      ]
    })

    const buffer = await Packer.toBuffer(doc)
    fs.writeFileSync(saveRes.filePath, buffer)

    return { success: true, filePath: saveRes.filePath }
  } catch (err: any) {
    return { success: false, error: err.message }
  }
}

function escapeXml(unsafe: string): string {
  return unsafe
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}
