/*! NOTE-APP — © 2026 4URE1 — https://github.com/4ure1 — Tous droits réservés. */
/**
 * Visite guidée affichée au premier lancement (clé `onboardingDone` de .config.json), et à la demande
 * depuis les Paramètres. Sept écrans, chacun avec une illustration animée dessinée en CSS (aucune image
 * ni ressource réseau : l'app fonctionne hors ligne). Flèches ← → pour naviguer, Échap pour passer.
 */
import { useEffect, useState, type ReactElement } from 'react'
import { AUTHOR, AUTHOR_GITHUB, REPOSITORY } from '../utils/credits'

interface WelcomeTourProps {
  // Fin de la visite ; notesDir = dossier de notes choisi (absent : inchangé)
  onClose: (notesDir?: string) => void
}

interface AppSetupInfo {
  notesDir: string
  defaultNotesDir: string
  fromEnv: boolean
}

interface Step {
  // 'folder' : écran interactif du choix du dossier de notes
  id?: string
  eyebrow: string
  title: string
  text: string
  points: string[]
  art?: () => ReactElement
}

function openLink(url: string): void {
  window.api.openExternalUrl(url).catch((err: unknown) => console.error('[WelcomeTour]', err))
}

// ---------- Illustrations ----------
function ArtWelcome(): ReactElement {
  return (
    <div className="wt-art wt-art-welcome">
      <div className="wt-orbit">
        <span className="wt-dot wt-d1" />
        <span className="wt-dot wt-d2" />
        <span className="wt-dot wt-d3" />
        <span className="wt-dot wt-d4" />
      </div>
      <div className="wt-logo">✦</div>
      <div className="wt-brand">NOTE-APP</div>
      <div className="wt-badges">
        <span>100 % local</span>
        <span>HTML + Markdown</span>
        <span>Hors ligne</span>
      </div>
    </div>
  )
}

function ArtOrganize(): ReactElement {
  const rows: Array<[string, number, string]> = [
    ['📁 Cours', 0, ''],
    ['📁 SQL', 1, ''],
    ['📄 Jointures.html', 2, ''],
    ['📄 Index.html', 2, ''],
    ['📄 Révisions.md', 1, ''],
    ['📄 Ma note.html', 1, 'wt-new']
  ]
  return (
    <div className="wt-art wt-art-tree">
      <div className="wt-window">
        <div className="wt-window-bar">
          <span />
          <span />
          <span />
          <em>Notes</em>
          <b className="wt-plus">+</b>
        </div>
        {rows.map(([label, depth, cls], i) => (
          <div
            key={label}
            className={'wt-row ' + cls}
            style={{ paddingLeft: 12 + depth * 16, animationDelay: i * 0.25 + 's' }}
          >
            {label}
          </div>
        ))}
      </div>
      <div className="wt-tip">Ctrl+N : nouvelle note, en HTML par défaut</div>
    </div>
  )
}

function ArtWrite(): ReactElement {
  return (
    <div className="wt-art wt-art-write">
      <div className="wt-page">
        <div className="wt-h">Cours de SQL</div>
        <div className="wt-line">
          <span className="wt-typed">/table-3-2</span>
          <span className="wt-caret" />
        </div>
        <div className="wt-menu">
          <div className="wt-menu-item wt-active">
            <code>/table-3-2</code> Tableau 3 colonnes × 2 lignes
          </div>
          <div className="wt-menu-item">
            <code>/cards-3</code> 3 cartes
          </div>
          <div className="wt-menu-item">
            <code>/canvas-3</code> Cartes à relier
          </div>
          <div className="wt-menu-item">
            <code>/ho</code> Texte orange
          </div>
        </div>
        <div className="wt-table">
          {Array.from({ length: 9 }).map((_, i) => (
            <span
              key={i}
              className={i < 3 ? 'wt-th' : ''}
              style={{ animationDelay: 3.1 + i * 0.06 + 's' }}
            />
          ))}
        </div>
      </div>
    </div>
  )
}

function ArtBlocks(): ReactElement {
  return (
    <div className="wt-art wt-art-blocks">
      <div className="wt-cards">
        <div className="wt-card wt-red">
          <b>Parse</b>
          <i />
          <i />
        </div>
        <div className="wt-card wt-purple wt-moving">
          <b>Validate</b>
          <i />
          <i />
          <span className="wt-grip">⠿</span>
        </div>
        <div className="wt-card wt-teal">
          <b>Execute</b>
          <i />
          <i />
        </div>
      </div>
      <div className="wt-ctx">
        <div className="wt-ctx-title">Fond de la case</div>
        <div className="wt-swatches">
          {['#ef4444', '#e0823d', '#d4b13a', '#57ab5a', '#a371f7', '#3fb9a8', '#4a8fe7'].map(
            (c) => (
              <span key={c} style={{ background: c }} />
            )
          )}
        </div>
        <div className="wt-ctx-item">Insérer une ligne</div>
        <div className="wt-ctx-item">Insérer une colonne</div>
      </div>
    </div>
  )
}

function ArtCanvas(): ReactElement {
  return (
    <div className="wt-art wt-art-canvas">
      <svg viewBox="0 0 420 220" className="wt-links">
        <path className="wt-path" d="M 150 60 C 210 60 210 160 270 160" />
        <path className="wt-head" d="M 270 160 L 260 154 L 260 166 Z" />
        <path className="wt-path wt-p2" d="M 95 92 C 95 170 150 175 200 182" />
      </svg>
      <div className="wt-node wt-red" style={{ left: 20, top: 30 }}>
        <b>Cause</b>
        <i />
        <span className="wt-handle" style={{ right: -6, top: 26 }} />
      </div>
      <div className="wt-node wt-green" style={{ left: 270, top: 130 }}>
        <b>Effet</b>
        <i />
        <span className="wt-handle" style={{ left: -6, top: 26 }} />
      </div>
      <div className="wt-node wt-yellow wt-small" style={{ left: 200, top: 160 }}>
        <b>Note</b>
      </div>
    </div>
  )
}

function ArtSafe(): ReactElement {
  return (
    <div className="wt-art wt-art-safe">
      <div className="wt-timeline">
        {['09:12', '10:40', '14:05', '16:31', 'maintenant'].map((t, i) => (
          <div key={t} className="wt-version" style={{ animationDelay: i * 0.3 + 's' }}>
            <span />
            {t}
          </div>
        ))}
      </div>
      <div className="wt-keys">
        <kbd className="wt-press">Ctrl</kbd>+<kbd className="wt-press wt-late">Z</kbd>
      </div>
      <div className="wt-saved">
        <span className="wt-check">✓</span> Enregistré sur le disque, en un seul coup
      </div>
    </div>
  )
}

function ArtReady(): ReactElement {
  const keys: Array<[string, string]> = [
    ['Ctrl+N', 'Nouvelle note'],
    ['/', 'Insérer un bloc'],
    ['Ctrl+Z', 'Annuler'],
    ['Ctrl+B', 'Barre latérale'],
    ['Ctrl+R', 'Notes récentes'],
    ['Ctrl+,', 'Paramètres']
  ]
  return (
    <div className="wt-art wt-art-ready">
      <div className="wt-shortcuts">
        {keys.map(([k, label], i) => (
          <div key={k} className="wt-shortcut" style={{ animationDelay: i * 0.12 + 's' }}>
            <kbd>{k}</kbd>
            <span>{label}</span>
          </div>
        ))}
      </div>
      <button className="wt-github" onClick={() => openLink(REPOSITORY)}>
        <span className="wt-star">★</span> Voir NOTE-APP sur GitHub
      </button>
    </div>
  )
}

function ArtFolder(props: {
  setup: AppSetupInfo | null
  chosen: string | null
  error: string
  onPick: () => void
  onReset: () => void
}): ReactElement {
  const { setup, chosen, error, onPick, onReset } = props
  const current = chosen || (setup ? setup.notesDir : '')
  const willMove = !!(chosen && setup && chosen !== setup.notesDir)
  return (
    <div className="wt-art wt-art-folder">
      <div className="wt-folder">
        <span className="wt-folder-back" />
        <span className="wt-folder-sheet wt-s1" />
        <span className="wt-folder-sheet wt-s2" />
        <span className="wt-folder-front">✦</span>
      </div>
      <div className="wt-path" title={current}>
        {current || '…'}
      </div>
      {setup && setup.fromEnv ? (
        <div className="wt-note">Mode test : dossier imposé par NOTE_APP_NOTES_DIR</div>
      ) : (
        <div className="wt-folder-actions">
          <button className="wt-btn wt-primary" onClick={onPick}>
            Choisir un autre dossier…
          </button>
          {setup && current !== setup.defaultNotesDir && (
            <button className="wt-btn wt-ghost" onClick={onReset}>
              Dossier par défaut
            </button>
          )}
        </div>
      )}
      {error && <div className="wt-error">{error}</div>}
      {willMove && (
        <div className="wt-note">L’app redémarrera sur ce dossier à la fin de la visite.</div>
      )}
    </div>
  )
}

const STEPS: Step[] = [
  {
    eyebrow: 'Bienvenue',
    title: 'Tes notes, tes fichiers, ta machine',
    text: 'NOTE-APP range tes notes en simples fichiers HTML ou Markdown dans ton dossier Notes. Rien ne part sur Internet : tout reste chez toi, même hors ligne.',
    points: [
      'Des fichiers lisibles partout',
      'Un design soigné, prêt à l’emploi',
      'Un historique de chaque version'
    ],
    art: ArtWelcome
  },
  {
    id: 'folder',
    eyebrow: 'Ton dossier',
    title: 'Où ranger tes notes ?',
    text: 'Toutes tes notes seront de simples fichiers dans ce dossier. Tu peux garder le dossier proposé, ou en choisir un autre : un dossier synchronisé (OneDrive, Dropbox…) ou un disque externe.',
    points: [
      'Modifiable plus tard (Paramètres, Visite guidée)',
      'Historique et corbeille rangés avec les notes'
    ]
  },
  {
    eyebrow: '1 · Organiser',
    title: 'Des dossiers et des notes, comme sur ton disque',
    text: 'La barre latérale montre ton dossier de notes. Crée une note avec Ctrl+N ou le bouton + : sans extension, elle devient une page HTML.',
    points: [
      'Glisser-déposer pour ranger',
      'Favoris, tags et notes récentes',
      'Corbeille pour tout récupérer'
    ],
    art: ArtOrganize
  },
  {
    eyebrow: '2 · Écrire',
    title: 'Écris directement dans l’aperçu',
    text: 'Pas besoin de toucher au code : tape « / » pour ouvrir le menu des blocs. Avec un nombre, tu choisis la taille : /table-3-2, /cards-4, /ul-5…',
    points: [
      'Entrée crée de vrais paragraphes',
      'Couleurs : /ho orange, /hg vert, /hb bleu…',
      'Le code reste propre et lisible'
    ],
    art: ArtWrite
  },
  {
    eyebrow: '3 · Mettre en forme',
    title: 'Cartes, tableaux et blocs à la souris',
    text: 'La poignée ⠿ à gauche d’un bloc le déplace ; un clic dessus le sélectionne (Ctrl+clic pour plusieurs). Clic droit dans un tableau pour colorer les cases.',
    points: [
      'Suppr et Ctrl+D sur une sélection',
      'Couleur des cartes au clic droit',
      'Lignes et colonnes en un clic'
    ],
    art: ArtBlocks
  },
  {
    eyebrow: '4 · Relier',
    title: 'Des canvas pour relier tes idées',
    text: 'Tape /canvas-4 : des cartes libres apparaissent. Tire un point du bord d’une carte vers une autre pour créer une flèche souple, qui suit les cartes quand tu les déplaces.',
    points: [
      'Double-clic dans le vide : nouvelle carte',
      'Clic sur une flèche puis Suppr',
      'Tout reste du HTML lisible'
    ],
    art: ArtCanvas
  },
  {
    eyebrow: '5 · Ne rien perdre',
    title: 'Chaque modification est en sécurité',
    text: 'Les notes sont écrites d’un seul coup sur le disque, l’historique garde les versions précédentes, et Ctrl+Z annule tout ce que tu fais dans l’aperçu.',
    points: [
      'Time Travel : revenir à une version',
      'Alerte si un autre programme modifie la note',
      'Corbeille avant toute suppression'
    ],
    art: ArtSafe
  },
  {
    eyebrow: 'C’est parti',
    title: 'Tu as l’essentiel en main',
    text: 'Retrouve cette visite à tout moment dans les Paramètres. Si l’app te plaît, une étoile sur GitHub fait toujours plaisir !',
    points: [],
    art: ArtReady
  }
]

export default function WelcomeTour({ onClose }: WelcomeTourProps): ReactElement {
  const [index, setIndex] = useState(0)
  const [setup, setSetup] = useState<AppSetupInfo | null>(null)
  const [chosen, setChosen] = useState<string | null>(null)
  const [folderError, setFolderError] = useState('')

  useEffect(() => {
    window.api
      .getAppSetup()
      .then((s) =>
        setSetup({ notesDir: s.notesDir, defaultNotesDir: s.defaultNotesDir, fromEnv: s.fromEnv })
      )
      .catch((err: unknown) => console.error('[WelcomeTour]', err))
  }, [])

  const pickFolder = (): void => {
    setFolderError('')
    window.api
      .chooseNotesFolder()
      .then((res) => {
        if (res.success) setChosen(res.path)
        else if (!res.canceled && res.error) setFolderError(res.error)
      })
      .catch((err: unknown) => setFolderError(err instanceof Error ? err.message : String(err)))
  }

  const finish = (): void => onClose(chosen || undefined)
  const step = STEPS[index]
  const last = index === STEPS.length - 1
  const Art = step.art

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        e.preventDefault()
        finish()
      } else if (e.key === 'ArrowRight' || e.key === 'Enter') {
        e.preventDefault()
        if (index < STEPS.length - 1) setIndex(index + 1)
        else finish()
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault()
        setIndex(Math.max(0, index - 1))
      }
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [index, onClose, chosen])

  return (
    <div
      className="wt-overlay"
      role="dialog"
      aria-modal="true"
      aria-label="Visite guidée de NOTE-APP"
    >
      <style>{TOUR_CSS}</style>
      <div className="wt-card" key={index}>
        <div className="wt-stage">
          {step.id === 'folder' ? (
            <ArtFolder
              setup={setup}
              chosen={chosen}
              error={folderError}
              onPick={pickFolder}
              onReset={() => setup && setChosen(setup.defaultNotesDir)}
            />
          ) : (
            Art && <Art />
          )}
        </div>
        <div className="wt-body">
          <div className="wt-eyebrow">{step.eyebrow}</div>
          <h2 className="wt-title">{step.title}</h2>
          <p className="wt-text">{step.text}</p>
          {step.points.length > 0 && (
            <ul className="wt-points">
              {step.points.map((p) => (
                <li key={p}>{p}</li>
              ))}
            </ul>
          )}
        </div>
        <div className="wt-footer">
          <div className="wt-dots">
            {STEPS.map((s, i) => (
              <button
                key={s.title}
                className={'wt-dot-btn' + (i === index ? ' wt-on' : '')}
                aria-label={'Écran ' + (i + 1)}
                onClick={() => setIndex(i)}
              />
            ))}
          </div>
          <div className="wt-credit">
            par{' '}
            <button className="wt-link" onClick={() => openLink(AUTHOR_GITHUB)}>
              {AUTHOR}
            </button>
          </div>
          <div className="wt-actions">
            {!last && (
              <button className="wt-btn wt-ghost" onClick={finish}>
                Passer
              </button>
            )}
            {index > 0 && (
              <button className="wt-btn wt-ghost" onClick={() => setIndex(index - 1)}>
                Précédent
              </button>
            )}
            <button
              className="wt-btn wt-primary"
              onClick={() => (last ? finish() : setIndex(index + 1))}
              autoFocus
            >
              {last ? 'Commencer' : 'Suivant'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

const TOUR_CSS = `
.wt-overlay{position:fixed;inset:0;z-index:100000;display:grid;place-items:center;padding:24px;
  background:rgba(8,8,10,0.72);backdrop-filter:blur(6px);animation:wt-fade .25s ease-out;
  font-family:'Segoe UI',system-ui,sans-serif;color:#e4e4e7;}
.wt-card{width:min(760px,100%);max-height:calc(100vh - 48px);overflow:auto;border-radius:18px;
  background:linear-gradient(180deg,#1c1c20,#151518);border:1px solid rgba(255,255,255,0.08);
  box-shadow:0 30px 80px rgba(0,0,0,0.6);animation:wt-rise .35s cubic-bezier(.2,.8,.2,1);}
.wt-stage{height:280px;position:relative;overflow:hidden;border-radius:18px 18px 0 0;
  background:radial-gradient(circle at 30% 20%,rgba(79,193,255,0.14),transparent 55%),
    radial-gradient(circle at 80% 80%,rgba(197,134,192,0.14),transparent 55%),#121215;}
.wt-body{padding:22px 30px 6px;}
.wt-eyebrow{font-size:12px;letter-spacing:.8px;text-transform:uppercase;color:#4fc1ff;font-weight:600;}
.wt-title{margin:6px 0 8px;font-size:24px;font-weight:700;color:#fafafa;}
.wt-text{margin:0;color:#a1a1aa;font-size:14.5px;line-height:1.6;}
.wt-points{display:flex;flex-wrap:wrap;gap:8px;margin:14px 0 0;padding:0;list-style:none;}
.wt-points li{padding:5px 11px;border-radius:999px;background:rgba(255,255,255,0.05);
  border:1px solid rgba(255,255,255,0.08);font-size:12.5px;color:#d4d4d8;}
.wt-points li::before{content:'✓ ';color:#6a9955;}
.wt-footer{display:flex;align-items:center;gap:14px;padding:18px 30px 22px;}
.wt-dots{display:flex;gap:6px;}
.wt-dot-btn{width:8px;height:8px;padding:0;border:none;border-radius:999px;background:#3f3f46;cursor:pointer;
  transition:width .25s ease,background .25s ease;}
.wt-dot-btn.wt-on{width:22px;background:#4fc1ff;}
.wt-credit{flex:1;font-size:12px;color:#71717a;}
.wt-link{border:none;background:none;padding:0;color:#7dd3fc;cursor:pointer;font-size:12px;text-decoration:underline;}
.wt-actions{display:flex;gap:8px;}
.wt-btn{border-radius:8px;padding:8px 16px;font-size:13px;font-weight:600;cursor:pointer;border:1px solid transparent;
  transition:background .15s ease,transform .15s ease;}
.wt-ghost{background:transparent;color:#a1a1aa;border-color:rgba(255,255,255,0.1);}
.wt-ghost:hover{background:rgba(255,255,255,0.06);color:#fff;}
.wt-primary{background:linear-gradient(135deg,#4fc1ff,#7c8cff);color:#0b0b0d;}
.wt-primary:hover{transform:translateY(-1px);}
.wt-art{position:absolute;inset:0;display:grid;place-items:center;}

/* Bienvenue */
.wt-art-welcome{align-content:center;gap:10px;}
.wt-logo{width:84px;height:84px;border-radius:24px;display:grid;place-items:center;font-size:40px;color:#fff;
  background:linear-gradient(135deg,#4fc1ff,#c586c0);box-shadow:0 0 50px rgba(79,193,255,0.35);
  animation:wt-pulse 2.6s ease-in-out infinite;z-index:1;}
.wt-brand{font-size:26px;font-weight:800;letter-spacing:2px;background:linear-gradient(90deg,#4fc1ff,#c586c0,#ce9178,#4fc1ff);
  background-size:300% 100%;-webkit-background-clip:text;background-clip:text;color:transparent;animation:wt-shine 5s linear infinite;}
.wt-badges{display:flex;gap:8px;}
.wt-badges span{padding:4px 10px;border-radius:999px;font-size:12px;background:rgba(255,255,255,0.06);color:#d4d4d8;
  animation:wt-up .5s ease-out both;}
.wt-badges span:nth-child(2){animation-delay:.15s;} .wt-badges span:nth-child(3){animation-delay:.3s;}
.wt-orbit{position:absolute;width:230px;height:230px;top:50%;left:50%;margin:-150px 0 0 -115px;
  border:1px dashed rgba(255,255,255,0.08);border-radius:50%;animation:wt-spin 14s linear infinite;}
.wt-dot{position:absolute;width:12px;height:12px;border-radius:50%;}
.wt-d1{top:-6px;left:50%;background:#4fc1ff;} .wt-d2{bottom:-6px;left:50%;background:#c586c0;}
.wt-d3{left:-6px;top:50%;background:#ce9178;} .wt-d4{right:-6px;top:50%;background:#6a9955;}

/* Dossier */
.wt-art-folder{align-content:center;gap:14px;padding:0 30px;}
.wt-folder{position:relative;width:110px;height:84px;justify-self:center;animation:wt-pulse 3s ease-in-out infinite;}
.wt-folder-back{position:absolute;inset:8px 0 0 0;border-radius:10px;background:#c9a24a;}
.wt-folder-back::before{content:'';position:absolute;left:0;top:-8px;width:44px;height:14px;border-radius:8px 8px 0 0;background:#c9a24a;}
.wt-folder-sheet{position:absolute;left:14px;right:14px;height:60px;border-radius:6px;background:#f4f4f5;}
.wt-s1{top:0;transform:rotate(-4deg);animation:wt-sheet 3s ease-in-out infinite;}
.wt-s2{top:4px;background:#e4e4e7;transform:rotate(3deg);animation:wt-sheet 3s .4s ease-in-out infinite;}
.wt-folder-front{position:absolute;left:0;right:0;bottom:0;height:58px;border-radius:10px;display:grid;place-items:center;
  background:linear-gradient(180deg,#e8bd5c,#d4a33f);color:#fff;font-size:20px;box-shadow:0 10px 24px rgba(0,0,0,0.35);}
.wt-path{justify-self:center;max-width:100%;padding:8px 14px;border-radius:9px;background:#1e1e22;border:1px solid rgba(255,255,255,0.1);
  font:13px Consolas,monospace;color:#e4e4e7;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
.wt-folder-actions{display:flex;gap:8px;justify-content:center;}
.wt-note{text-align:center;font-size:12px;color:#7dd3fc;}
.wt-error{text-align:center;font-size:12.5px;color:#f48771;}
@keyframes wt-sheet{0%,100%{translate:0 0}50%{translate:0 -8px}}

/* Organiser */
.wt-window{width:300px;border-radius:12px;background:#18181b;border:1px solid rgba(255,255,255,0.08);
  box-shadow:0 14px 40px rgba(0,0,0,0.45);overflow:hidden;font-size:13px;}
.wt-window-bar{display:flex;align-items:center;gap:6px;padding:7px 12px;border-bottom:1px solid rgba(255,255,255,0.06);}
.wt-window-bar span{width:9px;height:9px;border-radius:50%;background:#3f3f46;}
.wt-window-bar em{flex:1;font-style:normal;color:#a1a1aa;margin-left:6px;}
.wt-plus{width:22px;height:22px;border-radius:6px;display:grid;place-items:center;background:rgba(79,193,255,0.15);
  color:#4fc1ff;animation:wt-pulse 1.6s ease-in-out infinite;}
.wt-art-tree{align-content:center;gap:12px;}
.wt-row{padding:4px 12px;font-size:12.5px;color:#d4d4d8;animation:wt-up .4s ease-out both;}
.wt-row.wt-new{color:#4fc1ff;background:rgba(79,193,255,0.08);animation:wt-up .4s ease-out both, wt-glow 2s 1.8s ease-in-out infinite;}
.wt-tip{justify-self:center;font-size:12px;color:#a1a1aa;padding:5px 12px;border-radius:999px;background:rgba(255,255,255,0.05);}

/* Écrire */
.wt-page{width:430px;height:220px;position:relative;border-radius:12px;background:#1e1e1e;padding:18px 22px;
  border:1px solid rgba(255,255,255,0.06);box-shadow:0 14px 40px rgba(0,0,0,0.45);}
.wt-h{font-size:18px;font-weight:700;color:#4fc1ff;margin-bottom:12px;}
.wt-line{display:flex;align-items:center;font:14px Consolas,monospace;color:#e4e4e7;height:20px;}
.wt-typed{display:inline-block;overflow:hidden;white-space:nowrap;width:0;animation:wt-type 1.4s steps(10) .3s forwards, wt-vanish .2s 3s forwards;}
.wt-caret{width:2px;height:18px;background:#4fc1ff;animation:wt-blink 1s step-end infinite;}
.wt-menu{position:absolute;left:22px;top:78px;width:300px;border-radius:9px;background:#18181b;padding:4px;
  border:1px solid rgba(255,255,255,0.1);box-shadow:0 12px 30px rgba(0,0,0,0.5);opacity:0;
  animation:wt-menu 1.6s 1.4s ease-out forwards;font-size:12.5px;}
.wt-menu-item{padding:5px 8px;border-radius:6px;color:#d4d4d8;}
.wt-menu-item code{color:#7dd3fc;margin-right:8px;}
.wt-menu-item.wt-active{background:rgba(56,189,248,0.14);box-shadow:inset 2px 0 0 #38bdf8;}
.wt-table{position:absolute;left:22px;top:52px;display:grid;grid-template-columns:repeat(3,110px);gap:2px;
  border-radius:8px;overflow:hidden;}
.wt-table span{height:28px;background:#2a2a2e;opacity:0;animation:wt-pop .3s ease-out forwards;}
.wt-table span.wt-th{background:rgba(79,193,255,0.18);}

/* Blocs */
.wt-art-blocks{grid-template-columns:auto auto;gap:22px;align-content:center;justify-content:center;}
.wt-cards{display:grid;grid-template-columns:repeat(3,110px);gap:12px;}
.wt-card,.wt-node{position:relative;border-radius:11px;padding:10px 12px;border:1.5px solid var(--c);
  background:color-mix(in srgb,var(--c) 14%,#1b1b1d);font-size:13px;}
.wt-card b,.wt-node b{display:block;color:#f4f4f5;margin-bottom:8px;}
.wt-card i,.wt-node i{display:block;height:6px;border-radius:3px;background:rgba(255,255,255,0.12);margin-top:6px;}
.wt-card i + i{width:60%;}
.wt-red{--c:#ef4444;} .wt-purple{--c:#a371f7;} .wt-teal{--c:#3fb9a8;} .wt-green{--c:#57ab5a;} .wt-yellow{--c:#d4b13a;}
.wt-moving{animation:wt-swap 3.2s ease-in-out infinite;z-index:1;}
.wt-grip{position:absolute;left:-22px;top:6px;width:16px;height:22px;border-radius:5px;display:grid;place-items:center;
  font-size:12px;color:#e4e4e7;background:#202024;border:1px solid #38bdf8;}
.wt-ctx{width:170px;border-radius:10px;background:#18181b;border:1px solid rgba(255,255,255,0.1);padding:6px;
  box-shadow:0 12px 30px rgba(0,0,0,0.5);font-size:12px;animation:wt-up .5s .4s ease-out both;}
.wt-ctx-title{color:#a1a1aa;font-size:10.5px;text-transform:uppercase;padding:4px 6px;}
.wt-swatches{display:flex;flex-wrap:wrap;gap:5px;padding:4px 6px 8px;}
.wt-swatches span{width:16px;height:16px;border-radius:5px;}
.wt-swatches span:nth-child(5){outline:2px solid #fff;animation:wt-pulse 1.4s ease-in-out infinite;}
.wt-ctx-item{padding:5px 6px;border-radius:5px;color:#d4d4d8;}
.wt-ctx-item:first-of-type{background:rgba(56,189,248,0.14);}

/* Canvas */
.wt-art-canvas{display:block;width:420px;height:220px;margin:30px auto;position:relative;inset:auto;}
.wt-links{position:absolute;inset:0;width:100%;height:100%;overflow:visible;}
.wt-path{fill:none;stroke:#9a9a9a;stroke-width:2;stroke-dasharray:260;stroke-dashoffset:260;animation:wt-draw 1.6s .4s ease-out forwards;}
.wt-p2{stroke:#d4b13a;animation-delay:1.6s;}
.wt-head{fill:#9a9a9a;opacity:0;animation:wt-pop .3s 1.9s forwards;}
.wt-node{position:absolute;width:130px;}
.wt-node.wt-small{width:70px;padding:8px 10px;}
.wt-handle{position:absolute;width:11px;height:11px;border-radius:50%;background:#1e1e1e;border:2px solid #38bdf8;
  animation:wt-pulse 1.4s ease-in-out infinite;}

/* Sécurité */
.wt-art-safe{align-content:center;gap:22px;}
.wt-timeline{display:flex;gap:26px;position:relative;}
.wt-timeline::before{content:'';position:absolute;left:6px;right:6px;top:6px;height:2px;background:#3f3f46;}
.wt-version{display:flex;flex-direction:column;align-items:center;gap:8px;font-size:11.5px;color:#a1a1aa;
  animation:wt-up .4s ease-out both;}
.wt-version span{width:14px;height:14px;border-radius:50%;background:#27272a;border:2px solid #4fc1ff;z-index:1;}
.wt-version:last-child span{background:#4fc1ff;box-shadow:0 0 14px rgba(79,193,255,0.6);}
.wt-keys{display:flex;align-items:center;gap:8px;color:#71717a;}
.wt-keys kbd,.wt-shortcut kbd{font:13px Consolas,monospace;padding:5px 10px;border-radius:7px;background:#232327;
  border:1px solid #3f3f46;border-bottom-width:3px;color:#f4f4f5;}
.wt-press{animation:wt-key 2.4s ease-in-out infinite;}
.wt-late{animation-delay:.15s;}
.wt-saved{display:flex;align-items:center;gap:8px;font-size:13px;color:#d4d4d8;}
.wt-check{width:22px;height:22px;border-radius:50%;display:grid;place-items:center;background:#57ab5a;color:#0b0b0d;
  font-weight:800;animation:wt-pulse 2s ease-in-out infinite;}

/* Fin */
.wt-art-ready{align-content:center;gap:22px;}
.wt-shortcuts{display:grid;grid-template-columns:repeat(3,auto);gap:12px 22px;}
.wt-shortcut{display:flex;align-items:center;gap:10px;font-size:13px;color:#d4d4d8;animation:wt-up .4s ease-out both;}
.wt-github{justify-self:center;display:flex;align-items:center;gap:8px;padding:10px 20px;border-radius:999px;border:none;
  cursor:pointer;font-weight:700;font-size:14px;color:#0b0b0d;background:linear-gradient(135deg,#4fc1ff,#c586c0);
  box-shadow:0 8px 30px rgba(79,193,255,0.3);transition:transform .2s ease;}
.wt-github:hover{transform:translateY(-2px) scale(1.02);}
.wt-star{display:inline-block;animation:wt-spin 4s linear infinite;}

@keyframes wt-fade{from{opacity:0}to{opacity:1}}
@keyframes wt-rise{from{opacity:0;transform:translateY(14px) scale(.98)}to{opacity:1;transform:none}}
@keyframes wt-up{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}
@keyframes wt-pop{from{opacity:0;transform:scale(.8)}to{opacity:1;transform:none}}
@keyframes wt-pulse{0%,100%{transform:scale(1)}50%{transform:scale(1.07)}}
@keyframes wt-spin{to{transform:rotate(360deg)}}
@keyframes wt-shine{to{background-position:300% 0}}
@keyframes wt-glow{0%,100%{box-shadow:inset 2px 0 0 #4fc1ff}50%{box-shadow:inset 2px 0 0 #4fc1ff,0 0 16px rgba(79,193,255,0.25)}}
@keyframes wt-type{to{width:10ch}}
@keyframes wt-vanish{to{opacity:0}}
@keyframes wt-blink{50%{opacity:0}}
@keyframes wt-menu{0%{opacity:0;transform:translateY(-4px)}15%,80%{opacity:1;transform:none}100%{opacity:0}}
@keyframes wt-swap{0%,15%{transform:none}45%,60%{transform:translate(122px,-10px) rotate(2deg)}85%,100%{transform:none}}
@keyframes wt-draw{to{stroke-dashoffset:0}}
@keyframes wt-key{0%,70%,100%{transform:none;border-bottom-width:3px}78%{transform:translateY(2px);border-bottom-width:1px}}
@media (prefers-reduced-motion: reduce){.wt-overlay *{animation-duration:.01s !important;animation-iteration-count:1 !important;}}
`
