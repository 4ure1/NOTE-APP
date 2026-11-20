/*! NOTE-APP — © 2026 4URE1 — https://github.com/4ure1 — Tous droits réservés. */
/**
 * Présentation de l'app au premier lancement (clé `onboardingDone`), relançable depuis les Paramètres.
 * Chaque écran rejoue une vraie séquence dans une maquette réduite de l'app (barre de titre, barre
 * latérale, note, barre d'état), avec un curseur. Tout est dessiné en CSS avec les tokens du thème
 * actif : aucune image ni ressource réseau. Lecture automatique (pause possible), ← → pour naviguer,
 * Échap pour passer.
 */
import { useCallback, useEffect, useRef, useState, type ReactElement, type ReactNode } from 'react'
import { AUTHOR, AUTHOR_GITHUB, REPOSITORY } from '../utils/credits'
import {
  ChatGPTIcon,
  CheckIcon,
  ClaudeIcon,
  ClockIcon,
  FileTextIcon,
  FolderIcon,
  GeminiIcon,
  PlusIcon,
  SearchIcon,
  StarIcon
} from './Icons'
import { DEFAULT_SHORTCUTS, actionLabel, formatShortcut } from '../../../shared/shortcuts'

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
  keys?: string[]
  // false : pas d'avance automatique (écran à remplir, dernier écran)
  auto?: boolean
  scene?: () => ReactElement
}

// Durée d'une scène ; les animations du CSS sont calées sur la même valeur (8s)
const SCENE_MS = 8000

function openLink(url: string): void {
  window.api.openExternalUrl(url).catch((err: unknown) => console.error('[WelcomeTour]', err))
}

function shortcutOf(actionId: string): string | null {
  const m = DEFAULT_SHORTCUTS.find((s) => s.actionId === actionId)
  return m ? formatShortcut(m) : null
}

function Keys({ combo }: { combo: string }): ReactElement {
  return (
    <span className="wt-keys">
      {combo.split(' ').map((k, i) => (
        <kbd key={i}>{k}</kbd>
      ))}
    </span>
  )
}

function Cursor({ className }: { className: string }): ReactElement {
  return (
    <span className={'wt-cursor ' + className} aria-hidden="true">
      <svg width="14" height="20" viewBox="0 0 14 20">
        <path
          d="M1 1 L1 16 L5 12.5 L8 19 L10.5 18 L7.6 11.6 L12.6 11.6 Z"
          fill="#fff"
          stroke="#111"
          strokeWidth="1.2"
          strokeLinejoin="round"
        />
      </svg>
    </span>
  )
}

// ---------- Maquette réduite de l'app ----------
const TREE: Array<[string, number, boolean]> = [
  ['Cours', 0, true],
  ['SQL', 1, true],
  ['Jointures.html', 2, false],
  ['Index.html', 2, false],
  ['Projets', 0, true],
  ['Révisions.md', 1, false]
]

function Sidebar({
  active = 'Jointures.html',
  extra
}: {
  active?: string
  extra?: ReactNode
}): ReactElement {
  return (
    <div className="wt-sb">
      <div className="wt-sb-head">
        <span>Notes</span>
        <i>
          <SearchIcon size={10} />
        </i>
        <i className="wt-sb-plus">
          <PlusIcon size={10} />
        </i>
      </div>
      {TREE.map(([label, depth, folder], i) => (
        <div
          key={label}
          className={'wt-sb-row' + (label === active ? ' on' : '')}
          style={{ paddingLeft: 8 + depth * 11, animationDelay: 0.15 + i * 0.08 + 's' }}
        >
          {folder ? <FolderIcon size={10} /> : <FileTextIcon size={10} />}
          {label}
        </div>
      ))}
      {extra}
      <div className="wt-sb-label">Favoris</div>
      <div className="wt-sb-row" style={{ animationDelay: '0.7s' }}>
        <StarIcon size={10} />
        Jointures.html
      </div>
    </div>
  )
}

function MiniApp(props: {
  sidebar?: ReactNode
  title: string
  status?: ReactNode
  children: ReactNode
  panel?: ReactNode
  className?: string
}): ReactElement {
  return (
    <div className={'wt-app ' + (props.className || '')}>
      <div className="wt-tb">
        <b>NOTE-APP</b>
        <span className="wt-tb-btns">
          <i />
          <i />
          <i />
        </span>
      </div>
      {props.sidebar ?? <Sidebar />}
      <div className="wt-main">
        <div className="wt-nh">
          <span className="wt-crumb">
            Cours / SQL / <b>{props.title}</b>
          </span>
          <span className="wt-seg">
            <i>Code</i>
            <i>Côte à côte</i>
            <i className="on">Aperçu</i>
          </span>
        </div>
        <div className="wt-body-row">
          <div className="wt-doc">{props.children}</div>
          {props.panel}
        </div>
      </div>
      <div className="wt-sbar">
        <span>HTML</span>
        <span>412 mots</span>
        <span className="wt-sbar-end">
          {props.status ?? (
            <>
              <CheckIcon size={9} /> Enregistré
            </>
          )}
        </span>
      </div>
    </div>
  )
}

function DocLines({ n, from = 0 }: { n: number; from?: number }): ReactElement {
  return (
    <>
      {Array.from({ length: n }).map((_, i) => (
        <i
          key={i}
          className="wt-l"
          style={{ width: [92, 84, 96, 70, 88, 60][(i + from) % 6] + '%' }}
        />
      ))}
    </>
  )
}

// ---------- Scènes ----------
function SceneWelcome(): ReactElement {
  return (
    <MiniApp title="Jointures.html" className="wt-sc-welcome">
      <h4 className="wt-h1">Les jointures SQL</h4>
      <p className="wt-p">
        Une jointure relie deux tables par une <strong className="o">clé commune</strong>.
      </p>
      <div className="wt-steps">
        <div className="wt-step b">
          <b>INNER</b>
          <i />
          <i />
        </div>
        <div className="wt-step p">
          <b>LEFT</b>
          <i />
          <i />
        </div>
        <div className="wt-step g">
          <b>FULL</b>
          <i />
          <i />
        </div>
      </div>
      <div className="wt-callout">Astuce : toujours indexer la clé de jointure.</div>
    </MiniApp>
  )
}

function SceneOrganize(): ReactElement {
  return (
    <MiniApp
      title="Nouvelle note.html"
      className="wt-sc-organize"
      sidebar={
        <Sidebar
          active=""
          extra={
            <div className="wt-sb-row wt-new-row" style={{ paddingLeft: 19 }}>
              <FileTextIcon size={10} />
              <span className="wt-type-name">Nouvelle note.html</span>
            </div>
          }
        />
      }
    >
      <div className="wt-empty-doc">
        <h4 className="wt-h1 wt-new-title">Nouvelle note</h4>
        <DocLines n={2} />
      </div>
      <Cursor className="wt-cur-organize" />
    </MiniApp>
  )
}

function SceneWrite(): ReactElement {
  return (
    <MiniApp title="Jointures.html" className="wt-sc-write">
      <h4 className="wt-h1">Les jointures SQL</h4>
      <p className="wt-p">Trois façons de relier deux tables :</p>
      <div className="wt-typing">
        <span className="wt-typed">/cards-3</span>
        <span className="wt-caret" />
      </div>
      <div className="wt-slash">
        <div className="on">
          <code>/cards-3</code> 3 cartes <kbd>Entrée</kbd>
        </div>
        <div>
          <code>/table-3-2</code> Tableau 3 × 2
        </div>
        <div>
          <code>/canvas-4</code> Cartes à relier
        </div>
        <div>
          <code>/divider</code> Nouveau chapitre
        </div>
      </div>
      <div className="wt-steps wt-insert">
        <div className="wt-step b">
          <b>INNER</b>
          <i />
          <i />
        </div>
        <div className="wt-step p">
          <b>LEFT</b>
          <i />
          <i />
        </div>
        <div className="wt-step g">
          <b>FULL</b>
          <i />
          <i />
        </div>
      </div>
    </MiniApp>
  )
}

function SceneFormat(): ReactElement {
  return (
    <MiniApp title="Jointures.html" className="wt-sc-format">
      <h4 className="wt-h1">Les jointures SQL</h4>
      <p className="wt-p wt-fmt-p">
        Une jointure relie deux tables par une{' '}
        <span className="wt-target">
          clé commune
          <span className="wt-fmt-bar">
            <b>B</b>
            <em>I</em>
            <u>U</u>
            <s className="wt-sep" />
            <i className="c-b" />
            <i className="c-o" />
            <i className="c-g" />
            <i className="c-p" />
            <s className="wt-sep" />
            <span className="wt-hl-btn">Surligner</span>
            <span className="wt-font-btn">Aa</span>
          </span>
          <Cursor className="wt-cur-format" />
        </span>
        , souvent un identifiant.
      </p>
      <DocLines n={3} from={2} />
      <div className="wt-chapter">Chapitre 2 · Index</div>
    </MiniApp>
  )
}

function SceneCanvas(): ReactElement {
  return (
    <MiniApp title="Schéma.html" className="wt-sc-canvas">
      <div className="wt-canvas">
        <svg viewBox="0 0 400 170" className="wt-links">
          <path className="wt-link" d="M 128 42 C 190 42 190 118 250 118" />
          <path className="wt-link wt-link2" d="M 70 70 C 70 140 120 150 150 150" />
        </svg>
        <div className="wt-node r" style={{ left: 14, top: 18 }}>
          <b>Requête</b>
          <i />
          <span className="wt-handle" />
        </div>
        <div className="wt-node g wt-node-b" style={{ left: 250, top: 94 }}>
          <b>Résultat</b>
          <i />
        </div>
        <div className="wt-node y wt-node-c" style={{ left: 150, top: 132 }}>
          <b>Index</b>
        </div>
        <Cursor className="wt-cur-canvas" />
      </div>
    </MiniApp>
  )
}

function SceneAssistant(): ReactElement {
  return (
    <MiniApp
      title="Jointures.html"
      className="wt-sc-ai"
      panel={
        <div className="wt-ai">
          <div className="wt-ai-tabs">
            <span>
              <ClaudeIcon size={9} />
              Claude
            </span>
            <span>
              <ChatGPTIcon size={9} />
              ChatGPT
            </span>
            <span>
              <GeminiIcon size={9} />
              Gemini
            </span>
            <span>Local</span>
            <i className="wt-ai-ind" />
          </div>
          <div className="wt-ai-chat">
            <div className="wt-msg me">Fais-moi un QCM sur cette note</div>
            <div className="wt-msg bot">
              <i />
              <i />
              <i />
            </div>
            <div className="wt-msg bot b2">
              <i />
              <i />
            </div>
          </div>
          <div className="wt-ai-input">Demander…</div>
        </div>
      }
    >
      <h4 className="wt-h1">Les jointures SQL</h4>
      <DocLines n={6} />
      <div className="wt-send">Note envoyée à l’assistant</div>
    </MiniApp>
  )
}

function SceneSources(): ReactElement {
  return (
    <MiniApp title="Cours SQL.pdf" className="wt-sc-sources">
      <div className="wt-src">
        <div className="wt-pdf">
          <div className="wt-pdf-bar">
            <span>Page 3 / 12</span>
            <span>100 %</span>
          </div>
          <div className="wt-pdf-page">
            <b />
            <DocLines n={3} />
            <i className="wt-l wt-pdf-hl" style={{ width: '80%' }} />
            <DocLines n={3} from={3} />
          </div>
        </div>
        <div className="wt-yt">
          <div className="wt-yt-video">
            <span className="wt-yt-play" />
            <i className="wt-yt-progress" />
          </div>
          <div className="wt-yt-ch on">00:00 Introduction</div>
          <div className="wt-yt-ch">04:12 INNER JOIN</div>
          <div className="wt-yt-ch">09:30 LEFT JOIN</div>
        </div>
      </div>
    </MiniApp>
  )
}

function SceneHistory(): ReactElement {
  return (
    <MiniApp
      title="Jointures.html"
      className="wt-sc-history"
      status={
        <>
          <span className="wt-st-saved">
            <CheckIcon size={9} /> Enregistré
          </span>
          <span className="wt-st-restored">Version de 14:05 restaurée</span>
        </>
      }
      panel={
        <div className="wt-hist">
          <div className="wt-hist-head">
            <ClockIcon size={10} /> Historique
          </div>
          {['Aujourd’hui 16:31', 'Aujourd’hui 14:05', 'Aujourd’hui 10:40', 'Hier 18:02'].map(
            (t, i) => (
              <div key={t} className={'wt-ver' + (i === 1 ? ' wt-ver-pick' : '')}>
                <span />
                {t}
              </div>
            )
          )}
          <div className="wt-restore">Restaurer</div>
        </div>
      }
    >
      <h4 className="wt-h1">Les jointures SQL</h4>
      <i className="wt-l" style={{ width: '90%' }} />
      <i className="wt-l wt-diff-del" style={{ width: '76%' }} />
      <i className="wt-l wt-diff-add" style={{ width: '64%' }} />
      <DocLines n={3} from={1} />
      <Cursor className="wt-cur-history" />
    </MiniApp>
  )
}

const FINAL_KEYS: Array<[string, string]> = [
  ['create-note', 'Nouvelle note'],
  ['open-search', 'Rechercher'],
  ['toggle-claude', 'Assistant'],
  ['cycle-editor-mode', 'Code / aperçu'],
  ['open-history', 'Historique'],
  ['toggle-fullscreen', 'Plein écran'],
  ['toggle-sidebar', 'Barre latérale'],
  ['open-settings', 'Paramètres']
]

function SceneReady(): ReactElement {
  return (
    <div className="wt-ready">
      <div className="wt-ready-grid">
        {FINAL_KEYS.map(([id, label], i) => {
          const combo = shortcutOf(id)
          if (!combo) return null
          return (
            <div key={id} className="wt-ready-row" style={{ animationDelay: i * 0.06 + 's' }}>
              <span>{label}</span>
              <Keys combo={combo} />
            </div>
          )
        })}
      </div>
      <button className="wt-btn wt-ghost wt-gh" onClick={() => openLink(REPOSITORY)}>
        <StarIcon size={12} /> Voir le projet sur GitHub
      </button>
    </div>
  )
}

function FolderScene(props: {
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
    <div className="wt-folder">
      <div className="wt-folder-box">
        <div className="wt-folder-icon">
          <FolderIcon size={22} />
        </div>
        <div className="wt-folder-path" title={current}>
          {current || '…'}
        </div>
        <div className="wt-folder-files">
          <span>Jointures.html</span>
          <span>Révisions.md</span>
          <span>.history/</span>
          <span>.trash/</span>
        </div>
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
    title: 'Des notes soignées, en simples fichiers',
    text: 'Chaque note est un fichier HTML ou Markdown de ton dossier, avec un design prêt à l’emploi : titres, cartes, encadrés, couleurs. Tout reste sur ta machine, même hors ligne.',
    scene: SceneWelcome
  },
  {
    id: 'folder',
    eyebrow: 'Ton dossier',
    title: 'Où ranger tes notes ?',
    text: 'Garde le dossier proposé ou choisis-en un autre, synchronisé (OneDrive, Dropbox…) ou sur un disque externe. L’historique et la corbeille y sont rangés avec les notes.',
    auto: false
  },
  {
    eyebrow: '1 · Organiser',
    title: 'Ton dossier, dans la barre latérale',
    text: 'Le bouton + crée une note, en HTML par défaut. Glisse-dépose pour ranger, épingle tes favoris, retrouve tout avec la recherche.',
    keys: ['create-note', 'open-search', 'open-recent'],
    scene: SceneOrganize
  },
  {
    eyebrow: '2 · Écrire',
    title: 'Tape « / » pour insérer un bloc',
    text: 'Cartes, tableaux, listes, QCM, chapitres : le menu « / » les insère directement dans l’aperçu. Un nombre choisit la taille : /cards-3, /table-3-2. Tab passe d’un champ à l’autre.',
    keys: ['cycle-editor-mode'],
    scene: SceneWrite
  },
  {
    eyebrow: '3 · Mettre en forme',
    title: 'Sélectionne, la barre de mise en forme apparaît',
    text: 'Gras, couleur, surlignage, police et taille sur la sélection. Le halo bleu montre où s’arrête le style ; il reste en place même si tu effaces le texte.',
    scene: SceneFormat
  },
  {
    eyebrow: '4 · Relier',
    title: 'Des canvas pour relier tes idées',
    text: 'Tire un point du bord d’une carte vers une autre : la flèche suit les cartes quand tu les déplaces. Tout reste du HTML lisible.',
    scene: SceneCanvas
  },
  {
    eyebrow: '5 · Assistant',
    title: 'Claude, ChatGPT, Gemini ou un modèle local',
    text: 'Le panneau de droite garde tes assistants côte à côte avec la note. Envoie-leur la note en un raccourci, ou utilise un modèle Ollama sans connexion.',
    keys: ['toggle-claude', 'send-to-ai', 'switch-ai'],
    scene: SceneAssistant
  },
  {
    eyebrow: '6 · Sources',
    title: 'Tes PDF et tes vidéos à côté des notes',
    text: 'Importe un PDF pour le lire et l’annoter, ouvre YouTube dans l’app pour suivre un cours chapitre par chapitre.',
    keys: ['import-pdf', 'open-youtube'],
    scene: SceneSources
  },
  {
    eyebrow: '7 · Ne rien perdre',
    title: 'Reviens à n’importe quelle version',
    text: 'Chaque note est écrite d’un seul coup sur le disque et l’historique garde ses versions. Compare, restaure ; la corbeille rattrape les suppressions.',
    keys: ['open-history'],
    scene: SceneHistory
  },
  {
    eyebrow: 'C’est parti',
    title: 'Les raccourcis à retenir',
    text: 'Tous sont modifiables dans Paramètres › Raccourcis. Cette présentation se relance depuis Paramètres › Général › Visite guidée.',
    auto: false,
    scene: SceneReady
  }
]

function prefersReducedMotion(): boolean {
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches
  } catch {
    return false
  }
}

export default function WelcomeTour({ onClose }: WelcomeTourProps): ReactElement {
  const [index, setIndex] = useState(0)
  const [playing, setPlaying] = useState(() => !prefersReducedMotion())
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

  const finish = useCallback((): void => onClose(chosen || undefined), [onClose, chosen])
  const step = STEPS[index]
  const last = index === STEPS.length - 1
  const auto = step.auto !== false
  const Scene = step.scene
  const next = useCallback((): void => setIndex((i) => Math.min(STEPS.length - 1, i + 1)), [])

  // Avance automatique : minuteur (la barre de progression n'est qu'un repère visuel) ;
  // la pause garde le temps restant de l'écran
  const remainingRef = useRef(SCENE_MS)
  useEffect(() => {
    remainingRef.current = SCENE_MS
  }, [index])
  useEffect(() => {
    if (!playing || !auto || last) return
    const start = Date.now()
    const timer = setTimeout(next, remainingRef.current)
    return () => {
      clearTimeout(timer)
      remainingRef.current = Math.max(0, remainingRef.current - (Date.now() - start))
    }
  }, [playing, auto, last, index, next])

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
      } else if (e.key === ' ' && e.target === document.body) {
        e.preventDefault()
        setPlaying((p) => !p)
      }
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [index, finish])

  return (
    <div
      className={'wt-overlay' + (playing ? '' : ' wt-paused')}
      role="dialog"
      aria-modal="true"
      aria-label="Présentation de NOTE-APP"
    >
      <style>{TOUR_CSS}</style>
      <div className="wt-card">
        <div className="wt-progress" role="tablist" aria-label="Écrans">
          {STEPS.map((s, i) => (
            <button
              key={s.title}
              role="tab"
              aria-selected={i === index}
              aria-label={`Écran ${i + 1} : ${s.eyebrow}`}
              className={'wt-seg-btn' + (i < index ? ' done' : '')}
              onClick={() => setIndex(i)}
            >
              {i === index && (
                <i
                  key={index}
                  className={'wt-fill' + (auto ? '' : ' full')}
                  style={{ animationDuration: SCENE_MS + 'ms' }}
                />
              )}
            </button>
          ))}
        </div>
        <div className="wt-stage" key={index}>
          {step.id === 'folder' ? (
            <FolderScene
              setup={setup}
              chosen={chosen}
              error={folderError}
              onPick={pickFolder}
              onReset={() => setup && setChosen(setup.defaultNotesDir)}
            />
          ) : (
            Scene && <Scene />
          )}
        </div>
        <div className="wt-body" key={'b' + index}>
          <div className="wt-eyebrow">{step.eyebrow}</div>
          <h2 className="wt-title">{step.title}</h2>
          <p className="wt-text">{step.text}</p>
          {step.keys && (
            <div className="wt-key-list">
              {step.keys.map((id) => {
                const combo = shortcutOf(id)
                return combo ? (
                  <span key={id} className="wt-key-item">
                    <Keys combo={combo} />
                    {actionLabel(id)}
                  </span>
                ) : null
              })}
            </div>
          )}
        </div>
        <div className="wt-footer">
          <div className="wt-credit">
            par{' '}
            <button className="wt-link" onClick={() => openLink(AUTHOR_GITHUB)}>
              {AUTHOR}
            </button>
          </div>
          <div className="wt-actions">
            {!last && (
              <button className="wt-btn wt-text-btn" onClick={finish}>
                Passer
              </button>
            )}
            {auto && !last && (
              <button
                className="wt-btn wt-ghost"
                onClick={() => setPlaying((p) => !p)}
                aria-pressed={!playing}
              >
                {playing ? 'Pause' : 'Lecture'}
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

/* Couleurs : tokens du thème actif (base.css / appThemes.ts), valeurs de repli pour les maquettes.
   Les scènes durent 8s (SCENE_MS) et bouclent. */
const TOUR_CSS = `
.wt-overlay{position:fixed;inset:0;z-index:100000;display:grid;place-items:center;padding:24px;
  background:var(--overlay-bg,rgba(0,0,0,.6));animation:wt-fade .2s ease-out;
  font-family:var(--font-ui,'Segoe UI',system-ui,sans-serif);color:var(--text-primary,#d4d4d8);}
.wt-card{position:relative;width:min(820px,100%);max-height:calc(100vh - 48px);overflow:auto;border-radius:12px;
  background:var(--surface-panel,#1c1c1e);border:1px solid var(--border-strong,#3a3a3d);
  box-shadow:0 24px 60px rgba(0,0,0,.45);animation:wt-rise .3s cubic-bezier(.2,.8,.2,1);}
.wt-progress{position:absolute;top:10px;left:14px;right:14px;z-index:3;display:flex;gap:4px;}
.wt-seg-btn{flex:1;height:14px;padding:6px 0;border:none;background:none;cursor:pointer;position:relative;}
.wt-seg-btn::before{content:'';position:absolute;left:0;right:0;top:6px;height:2px;border-radius:2px;
  background:var(--border-strong,#3a3a3d);}
.wt-seg-btn.done::before{background:var(--text-secondary,#a1a1aa);}
.wt-fill{position:absolute;left:0;top:6px;height:2px;border-radius:2px;background:var(--text-strong,#fafafa);
  width:0;animation:wt-fill linear forwards;}
.wt-fill.full{width:100%;animation:none;}
.wt-paused .wt-fill,.wt-paused .wt-stage *{animation-play-state:paused !important;}
.wt-stage{height:330px;position:relative;overflow:hidden;display:grid;place-items:center;
  background:var(--surface-sunken,#141416);border-bottom:1px solid var(--border-color,#2a2a2d);}
.wt-body{padding:20px 28px 4px;animation:wt-up .3s ease-out both;}
.wt-eyebrow{font-size:var(--fs-sm,12px);font-weight:600;color:var(--accent-color,#4a8fe7);}
.wt-title{margin:4px 0 8px;font-size:22px;font-weight:650;letter-spacing:-.01em;color:var(--text-strong,#fafafa);
  font-family:var(--font-title,inherit);}
.wt-text{margin:0;max-width:640px;color:var(--text-secondary,#a1a1aa);font-size:14px;line-height:1.6;}
.wt-key-list{display:flex;flex-wrap:wrap;gap:6px 18px;margin-top:12px;font-size:12.5px;color:var(--text-secondary,#a1a1aa);}
.wt-key-item{display:inline-flex;align-items:center;gap:8px;}
.wt-keys{display:inline-flex;gap:3px;}
.wt-keys kbd{min-width:18px;height:19px;padding:0 5px;border:1px solid var(--border-strong,#3a3a3d);border-bottom-width:2px;
  border-radius:4px;background:var(--surface-control,#252528);color:var(--text-strong,#fafafa);
  font:11px/16px var(--font-ui,'Segoe UI',sans-serif);text-align:center;}
.wt-footer{display:flex;align-items:center;gap:14px;padding:16px 28px 20px;}
.wt-credit{flex:1;font-size:12px;color:var(--text-muted,#71717a);}
.wt-link{border:none;background:none;padding:0;color:var(--text-secondary,#a1a1aa);cursor:pointer;font-size:12px;
  text-decoration:underline;text-underline-offset:3px;}
.wt-actions{display:flex;gap:8px;}
.wt-btn{display:inline-flex;align-items:center;gap:6px;height:32px;border-radius:6px;padding:0 14px;font-size:13px;
  font-weight:600;cursor:pointer;border:1px solid transparent;font-family:inherit;}
.wt-ghost{background:transparent;color:var(--text-primary,#d4d4d8);border-color:var(--border-strong,#3a3a3d);}
.wt-ghost:hover{background:var(--element-bg-hover,#2a2a2d);color:var(--text-strong,#fff);}
.wt-text-btn{background:none;color:var(--text-muted,#71717a);padding:0 8px;}
.wt-text-btn:hover{color:var(--text-strong,#fff);}
.wt-primary{background:var(--accent-color,#4a8fe7);color:#fff;}
.wt-primary:hover{background:var(--accent-color-hover,#5b9cf0);}
.wt-btn:focus-visible,.wt-seg-btn:focus-visible,.wt-link:focus-visible{outline:2px solid var(--accent-color,#4a8fe7);outline-offset:2px;}

/* ---- Maquette de l'app (640 × 296) ---- */
.wt-app{position:relative;width:640px;height:296px;border-radius:8px;overflow:hidden;font-size:10px;
  background:var(--app-bg,#19191a);border:1px solid var(--border-strong,#3a3a3d);box-shadow:0 18px 40px rgba(0,0,0,.4);
  display:grid;grid-template-columns:150px 1fr;grid-template-rows:22px 1fr 18px;text-align:left;
  animation:wt-up .35s ease-out both;}
.wt-tb{grid-column:1/-1;display:flex;align-items:center;padding:0 8px;background:var(--sidebar-bg,#161617);
  border-bottom:1px solid var(--border-color,#2a2a2d);}
.wt-tb b{font-size:9px;font-weight:600;letter-spacing:.04em;color:var(--text-muted,#71717a);}
.wt-tb-btns{margin-left:auto;display:flex;gap:12px;}
.wt-tb-btns i{width:8px;height:1px;background:var(--text-muted,#71717a);}
.wt-sb{background:var(--sidebar-bg,#161617);border-right:1px solid var(--border-color,#2a2a2d);padding-bottom:6px;overflow:hidden;}
.wt-sb-head{display:flex;align-items:center;gap:6px;height:26px;padding:0 8px;color:var(--text-secondary,#a1a1aa);font-weight:600;}
.wt-sb-head span{flex:1;}
.wt-sb-head i{display:grid;place-items:center;width:16px;height:16px;border-radius:4px;color:var(--text-muted,#71717a);}
.wt-sb-row{display:flex;align-items:center;gap:5px;height:18px;margin:0 4px;border-radius:4px;white-space:nowrap;
  color:var(--text-secondary,#a1a1aa);animation:wt-up .3s ease-out both;}
.wt-sb-row svg{flex:none;color:var(--text-muted,#71717a);}
.wt-sb-row.on{background:var(--element-active,#2c2c30);color:var(--text-strong,#fafafa);}
.wt-sb-label{margin:8px 8px 2px;font-size:8.5px;font-weight:600;color:var(--text-muted,#71717a);text-transform:uppercase;letter-spacing:.06em;}
.wt-main{display:flex;flex-direction:column;min-width:0;background:var(--editor-bg,#1e1e1f);}
.wt-nh{display:flex;align-items:center;height:26px;padding:0 10px;border-bottom:1px solid var(--border-color,#2a2a2d);}
.wt-crumb{flex:1;color:var(--text-muted,#71717a);white-space:nowrap;overflow:hidden;}
.wt-crumb b{color:var(--text-strong,#fafafa);font-weight:500;}
.wt-seg{display:flex;padding:1px;border-radius:4px;background:var(--surface-sunken,#141416);}
.wt-seg i{font-style:normal;padding:1px 6px;border-radius:3px;color:var(--text-muted,#71717a);font-size:8.5px;}
.wt-seg i.on{background:var(--element-active,#2c2c30);color:var(--text-strong,#fafafa);}
.wt-body-row{flex:1;display:flex;min-height:0;}
.wt-doc{position:relative;flex:1;min-width:0;padding:12px 22px;font-family:var(--note-font,var(--font-ui,'Segoe UI'));}
.wt-sbar{grid-column:1/-1;display:flex;align-items:center;gap:12px;padding:0 10px;font-size:8.5px;
  color:var(--text-muted,#71717a);background:var(--sidebar-bg,#161617);border-top:1px solid var(--border-color,#2a2a2d);}
.wt-sbar-end{margin-left:auto;display:inline-flex;align-items:center;gap:4px;position:relative;}
.wt-h1{margin:0 0 6px;font-size:15px;font-weight:700;color:var(--text-strong,#fafafa);}
.wt-p{margin:0 0 8px;font-size:10.5px;line-height:1.5;color:var(--text-primary,#d4d4d8);}
.wt-p strong.o{color:#e0823d;}
.wt-l{display:block;height:5px;margin:7px 0;border-radius:3px;background:var(--border-strong,#3a3a3d);opacity:.7;}
.wt-steps{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin:8px 0;}
.wt-step{padding:7px 8px;border-radius:6px;border:1px solid var(--border-color,#2a2a2d);border-top:2px solid var(--c);
  background:var(--surface-raised,#232326);}
.wt-step b{display:block;font-size:9.5px;color:var(--c);margin-bottom:5px;}
.wt-step i{display:block;height:4px;margin-top:4px;border-radius:2px;background:var(--border-strong,#3a3a3d);}
.wt-step i+i{width:60%;}
.b{--c:#4a8fe7;} .p{--c:#a371f7;} .g{--c:#57ab5a;} .r{--c:#e5534b;} .y{--c:#d4b13a;}
.wt-callout{padding:7px 10px;border-radius:6px;border-left:3px solid #57ab5a;background:color-mix(in srgb,#57ab5a 10%,transparent);
  color:var(--text-primary,#d4d4d8);font-size:10px;}
.wt-cursor{position:absolute;z-index:6;pointer-events:none;filter:drop-shadow(0 2px 2px rgba(0,0,0,.4));}

/* Bienvenue : la note se construit */
.wt-sc-welcome .wt-doc > *{animation:wt-up .4s ease-out both;}
.wt-sc-welcome .wt-doc > :nth-child(1){animation-delay:.5s}
.wt-sc-welcome .wt-doc > :nth-child(2){animation-delay:.8s}
.wt-sc-welcome .wt-doc > :nth-child(3){animation-delay:1.1s}
.wt-sc-welcome .wt-doc > :nth-child(4){animation-delay:1.5s}
.wt-sc-welcome .wt-step{animation:wt-pop .35s ease-out both;}
.wt-sc-welcome .wt-step:nth-child(2){animation-delay:1.25s} .wt-sc-welcome .wt-step:nth-child(3){animation-delay:1.4s}
.wt-sc-welcome .wt-step:first-child{animation-delay:1.1s}

/* Organiser : clic sur +, la note apparaît et se nomme */
.wt-sc-organize .wt-sb-plus{animation:wt-press-plus 8s infinite;}
.wt-new-row{background:var(--element-active,#2c2c30);color:var(--text-strong,#fafafa) !important;
  animation:wt-org-row 8s infinite !important;}
.wt-type-name{display:inline-block;overflow:hidden;width:0;animation:wt-org-type 8s steps(18) infinite;}
.wt-sc-organize .wt-empty-doc{animation:wt-org-doc 8s infinite;}
.wt-new-title{display:inline-block;overflow:hidden;white-space:nowrap;}
.wt-cur-organize{left:0;top:0;animation:wt-org-cur 8s ease-in-out infinite;}
@keyframes wt-press-plus{0%,26%,34%,100%{background:transparent;color:var(--text-muted,#71717a)}28%,32%{background:var(--element-active,#2c2c30);color:var(--text-strong,#fff)}}
@keyframes wt-org-row{0%,30%{opacity:0;height:0}36%,92%{opacity:1;height:18px}100%{opacity:0;height:18px}}
@keyframes wt-org-type{0%,38%{width:0}58%,100%{width:18ch}}
@keyframes wt-org-doc{0%,58%{opacity:0;transform:translateY(4px)}64%,92%{opacity:1;transform:none}100%{opacity:0}}
@keyframes wt-org-cur{0%{transform:translate(300px,200px)}24%{transform:translate(-14px,-25px)}28%{transform:translate(-14px,-25px) scale(.8)}
  32%,60%{transform:translate(-14px,-25px)}80%,100%{transform:translate(200px,40px)}}
.wt-sc-organize .wt-cur-organize{left:auto;right:auto;}
.wt-sc-organize .wt-doc{position:static;}
.wt-sc-organize .wt-cur-organize{left:150px;top:60px;}

/* Écrire : / puis Entrée insère des cartes */
.wt-typing{display:flex;align-items:center;height:16px;font-size:10.5px;color:var(--text-primary,#d4d4d8);animation:wt-w-line 8s infinite;}
.wt-typed{display:inline-block;overflow:hidden;white-space:nowrap;width:0;animation:wt-w-type 8s steps(8) infinite;}
.wt-caret{width:1px;height:12px;background:var(--text-strong,#fafafa);animation:wt-blink 1s step-end infinite;}
.wt-slash{position:absolute;left:22px;top:84px;width:230px;padding:3px;border-radius:6px;z-index:2;
  background:var(--surface-raised,#232326);border:1px solid var(--border-strong,#3a3a3d);box-shadow:0 10px 24px rgba(0,0,0,.4);
  animation:wt-w-menu 8s infinite;}
.wt-slash div{display:flex;align-items:center;gap:6px;padding:3px 6px;border-radius:4px;color:var(--text-secondary,#a1a1aa);}
.wt-slash div.on{background:var(--element-active,#2c2c30);color:var(--text-strong,#fafafa);}
.wt-slash code{font-family:var(--font-mono,Consolas,monospace);color:var(--text-strong,#fafafa);min-width:62px;}
.wt-slash kbd{margin-left:auto;font:8px var(--font-ui,sans-serif);padding:0 4px;border:1px solid var(--border-strong,#3a3a3d);border-radius:3px;
  animation:wt-w-enter 8s infinite;}
.wt-insert .wt-step{animation:wt-w-card 8s infinite;}
.wt-insert .wt-step:nth-child(2){animation-name:wt-w-card2} .wt-insert .wt-step:nth-child(3){animation-name:wt-w-card3}
@keyframes wt-w-type{0%,8%{width:0}30%,100%{width:8ch}}
@keyframes wt-w-line{0%,56%{opacity:1;height:16px}60%,100%{opacity:0;height:0}}
@keyframes wt-w-menu{0%,14%{opacity:0;transform:translateY(-4px)}18%,55%{opacity:1;transform:none}58%,100%{opacity:0}}
@keyframes wt-w-enter{0%,48%,56%,100%{background:transparent}50%,54%{background:var(--accent-color,#4a8fe7);color:#fff}}
@keyframes wt-w-card{0%,58%{opacity:0;transform:scale(.9)}63%,92%{opacity:1;transform:none}100%{opacity:0}}
@keyframes wt-w-card2{0%,61%{opacity:0;transform:scale(.9)}66%,92%{opacity:1;transform:none}100%{opacity:0}}
@keyframes wt-w-card3{0%,64%{opacity:0;transform:scale(.9)}69%,92%{opacity:1;transform:none}100%{opacity:0}}

/* Mise en forme : sélection, halo, barre, couleur puis surlignage */
.wt-fmt-p{margin-top:30px;}
.wt-target{position:relative;display:inline-block;border-radius:3px;animation:wt-f-target 8s infinite;}
.wt-target::before{content:'';position:absolute;left:0;top:0;bottom:0;border-radius:2px;z-index:-1;
  background:color-mix(in srgb,var(--accent-color,#4a8fe7) 35%,transparent);animation:wt-f-sel 8s infinite;}
.wt-fmt-bar{position:absolute;left:-30px;bottom:calc(100% + 8px);display:flex;align-items:center;gap:2px;padding:3px;
  border-radius:6px;background:var(--surface-raised,#232326);border:1px solid var(--border-strong,#3a3a3d);
  box-shadow:0 8px 20px rgba(0,0,0,.45);white-space:nowrap;font-size:9.5px;color:var(--text-primary,#d4d4d8);
  animation:wt-f-bar 8s infinite;}
.wt-fmt-bar > b,.wt-fmt-bar > em,.wt-fmt-bar > u,.wt-hl-btn,.wt-font-btn{display:grid;place-items:center;min-width:16px;height:16px;padding:0 3px;border-radius:3px;}
.wt-fmt-bar .wt-sep{width:1px;height:12px;margin:0 3px;background:var(--border-strong,#3a3a3d);}
.wt-fmt-bar > i{width:10px;height:10px;margin:0 2px;border-radius:50%;background:var(--c);}
.c-b{--c:#4a8fe7} .c-o{--c:#e0823d} .c-g{--c:#57ab5a} .c-p{--c:#a371f7}
.wt-fmt-bar > i.c-o{animation:wt-f-dot 8s infinite;}
.wt-hl-btn{animation:wt-f-hlbtn 8s infinite;}
.wt-cur-format{left:0;top:0;animation:wt-f-cur 8s ease-in-out infinite;}
.wt-chapter{display:flex;align-items:center;gap:8px;margin-top:10px;font-size:9px;font-weight:600;color:var(--text-muted,#71717a);}
.wt-chapter::before,.wt-chapter::after{content:'';flex:1;height:1px;background:var(--border-strong,#3a3a3d);}
@keyframes wt-f-sel{0%,8%{width:0;opacity:1}26%,44%{width:100%;opacity:1}48%,100%{width:100%;opacity:0}}
@keyframes wt-f-target{0%,28%{box-shadow:none;color:inherit;background:transparent}
  32%,48%{box-shadow:0 0 0 2px color-mix(in srgb,var(--accent-color,#4a8fe7) 70%,transparent);color:inherit;background:transparent}
  50%,64%{box-shadow:0 0 0 2px color-mix(in srgb,var(--accent-color,#4a8fe7) 70%,transparent);color:#e0823d;background:transparent}
  66%,84%{box-shadow:0 0 0 2px color-mix(in srgb,var(--accent-color,#4a8fe7) 45%,transparent);color:#e0823d;background:rgba(212,177,58,.22)}
  92%,100%{box-shadow:none;color:#e0823d;background:rgba(212,177,58,.22)}}
@keyframes wt-f-bar{0%,30%{opacity:0;transform:translateY(4px)}34%,80%{opacity:1;transform:none}84%,100%{opacity:0}}
@keyframes wt-f-dot{0%,47%,53%,100%{box-shadow:none}49%,51%{box-shadow:0 0 0 2px var(--text-strong,#fff)}}
@keyframes wt-f-hlbtn{0%,62%,68%,100%{background:transparent}63%,67%{background:var(--element-active,#2c2c30)}}
@keyframes wt-f-cur{0%{transform:translate(-40px,30px)}8%{transform:translate(0,4px)}26%{transform:translate(58px,4px)}
  36%{transform:translate(58px,4px)}46%,48%{transform:translate(43px,-22px)}49%,51%{transform:translate(43px,-22px) scale(.8)}
  60%,62%{transform:translate(94px,-22px)}63%,66%{transform:translate(94px,-22px) scale(.8)}
  80%,100%{transform:translate(140px,30px)}}

/* Canvas : on tire une flèche, puis une carte bouge */
.wt-sc-canvas .wt-doc{padding:10px 14px;}
.wt-canvas{position:relative;width:400px;height:170px;margin:0 auto;border-radius:6px;border:1px dashed var(--border-strong,#3a3a3d);
  background-image:radial-gradient(var(--border-color,#2a2a2d) 1px,transparent 1px);background-size:14px 14px;}
.wt-links{position:absolute;inset:0;width:100%;height:100%;overflow:visible;}
.wt-link{fill:none;stroke:var(--text-secondary,#a1a1aa);stroke-width:1.6;stroke-dasharray:200;animation:wt-c-draw 8s infinite;}
.wt-link:not(.wt-link2){animation:wt-c-draw 8s infinite,wt-c-path 8s ease-in-out infinite;}
.wt-link2{stroke:#d4b13a;animation-name:wt-c-draw2;}
.wt-node{position:absolute;width:112px;padding:7px 9px;border-radius:7px;border:1px solid var(--c);
  background:color-mix(in srgb,var(--c) 12%,var(--surface-raised,#232326));}
.wt-node b{display:block;font-size:10px;color:var(--text-strong,#fafafa);margin-bottom:5px;}
.wt-node i{display:block;height:4px;border-radius:2px;background:var(--border-strong,#3a3a3d);}
.wt-node-c{width:70px;}
.wt-node-b{animation:wt-c-move 8s ease-in-out infinite;}
.wt-handle{position:absolute;right:-5px;top:19px;width:8px;height:8px;border-radius:50%;
  background:var(--editor-bg,#1e1e1f);border:1.5px solid var(--accent-color,#4a8fe7);}
.wt-cur-canvas{left:0;top:0;animation:wt-c-cur 8s ease-in-out infinite;}
@keyframes wt-c-draw{0%,10%{stroke-dashoffset:200;opacity:1}36%,92%{stroke-dashoffset:0;opacity:1}100%{stroke-dashoffset:0;opacity:0}}
@keyframes wt-c-draw2{0%,40%{stroke-dashoffset:200;opacity:1}56%,92%{stroke-dashoffset:0;opacity:1}100%{stroke-dashoffset:0;opacity:0}}
@keyframes wt-c-path{0%,60%{d:path('M 128 42 C 190 42 190 118 250 118')}76%,92%{d:path('M 128 42 C 180 42 180 88 230 88')}100%{d:path('M 128 42 C 190 42 190 118 250 118')}}
@keyframes wt-c-move{0%,60%{transform:none}76%,92%{transform:translate(-20px,-30px)}100%{transform:none}}
@keyframes wt-c-cur{0%{transform:translate(200px,140px)}10%{transform:translate(126px,22px)}12%{transform:translate(126px,22px) scale(.85)}
  36%{transform:translate(256px,104px) scale(.85)}40%,58%{transform:translate(256px,104px)}60%{transform:translate(300px,104px)}
  62%{transform:translate(300px,104px) scale(.85)}76%{transform:translate(280px,74px) scale(.85)}80%,100%{transform:translate(340px,140px)}}

/* Assistant */
.wt-ai{width:206px;display:flex;flex-direction:column;border-left:1px solid var(--border-color,#2a2a2d);background:var(--surface-panel,#1c1c1e);
  animation:wt-ai-in .5s .2s ease-out both;}
.wt-ai-tabs{position:relative;display:flex;border-bottom:1px solid var(--border-color,#2a2a2d);}
.wt-ai-tabs span{flex:1;display:flex;align-items:center;justify-content:center;gap:3px;height:22px;font-size:8.5px;color:var(--text-muted,#71717a);}
.wt-ai-ind{position:absolute;bottom:-1px;left:0;width:25%;height:2px;background:var(--text-strong,#fafafa);animation:wt-ai-tab 8s infinite;}
.wt-ai-chat{flex:1;display:flex;flex-direction:column;gap:6px;padding:8px;}
.wt-msg{max-width:85%;padding:5px 7px;border-radius:7px;font-size:9px;}
.wt-msg.me{align-self:flex-end;background:var(--element-active,#2c2c30);color:var(--text-strong,#fafafa);animation:wt-ai-m1 8s infinite;}
.wt-msg.bot{align-self:flex-start;width:80%;background:var(--surface-raised,#232326);animation:wt-ai-m2 8s infinite;}
.wt-msg.b2{animation-name:wt-ai-m3;width:60%;}
.wt-msg.bot i{display:block;height:4px;margin:3px 0;border-radius:2px;background:var(--border-strong,#3a3a3d);}
.wt-msg.bot i:last-child{width:55%;}
.wt-ai-input{margin:6px;padding:5px 7px;border-radius:5px;border:1px solid var(--border-strong,#3a3a3d);color:var(--text-muted,#71717a);font-size:9px;}
.wt-send{position:absolute;right:12px;bottom:10px;padding:4px 8px;border-radius:5px;font-size:9px;
  background:var(--surface-raised,#232326);border:1px solid var(--border-strong,#3a3a3d);color:var(--text-primary,#d4d4d8);animation:wt-ai-send 8s infinite;}
@keyframes wt-ai-in{from{opacity:0;transform:translateX(20px)}to{opacity:1;transform:none}}
@keyframes wt-ai-tab{0%,58%{left:0}64%,70%{left:25%}76%,82%{left:50%}88%,96%{left:75%}100%{left:0}}
@keyframes wt-ai-send{0%,6%{opacity:0;transform:translateY(4px)}10%,22%{opacity:1;transform:none}26%,100%{opacity:0}}
@keyframes wt-ai-m1{0%,14%{opacity:0;transform:translateY(4px)}18%,56%{opacity:1;transform:none}60%,100%{opacity:0}}
@keyframes wt-ai-m2{0%,26%{opacity:0;transform:translateY(4px)}32%,56%{opacity:1;transform:none}60%,100%{opacity:0}}
@keyframes wt-ai-m3{0%,36%{opacity:0;transform:translateY(4px)}42%,56%{opacity:1;transform:none}60%,100%{opacity:0}}

/* Sources : PDF annoté et vidéo YouTube */
.wt-sc-sources .wt-doc{padding:10px;}
.wt-src{display:grid;grid-template-columns:1fr 1fr;gap:10px;height:100%;}
.wt-pdf,.wt-yt{display:flex;flex-direction:column;border-radius:6px;border:1px solid var(--border-color,#2a2a2d);overflow:hidden;
  background:var(--surface-sunken,#141416);}
.wt-pdf-bar{display:flex;justify-content:space-between;padding:4px 8px;font-size:8.5px;color:var(--text-muted,#71717a);
  border-bottom:1px solid var(--border-color,#2a2a2d);}
.wt-pdf-page{flex:1;margin:8px 16px 0;padding:10px 12px;border-radius:3px 3px 0 0;background:#f4f4f2;}
.wt-pdf-page b{display:block;width:50%;height:7px;margin-bottom:8px;border-radius:2px;background:#3a3a3d;}
.wt-pdf-page .wt-l{background:#c9c9c6;opacity:1;}
.wt-pdf-hl{position:relative;background:#c9c9c6 !important;}
.wt-pdf-hl::after{content:'';position:absolute;left:-2px;top:-3px;bottom:-3px;width:0;border-radius:2px;background:rgba(212,177,58,.55);
  animation:wt-s-hl 8s infinite;}
.wt-yt{padding:8px;gap:3px;}
.wt-yt-video{position:relative;aspect-ratio:16/9;border-radius:4px;background:#0c0c0d;display:grid;place-items:center;margin-bottom:4px;}
.wt-yt-play{width:0;height:0;border-left:12px solid #fff;border-top:7px solid transparent;border-bottom:7px solid transparent;opacity:.85;
  animation:wt-s-play 8s infinite;}
.wt-yt-progress{position:absolute;left:0;bottom:0;height:2px;background:#e5534b;animation:wt-s-prog 8s linear infinite;}
.wt-yt-ch{padding:3px 6px;border-radius:4px;font-size:9px;color:var(--text-secondary,#a1a1aa);}
.wt-yt-ch:nth-of-type(2){animation:wt-s-ch2 8s infinite;}
.wt-yt-ch.on{animation:wt-s-ch1 8s infinite;}
@keyframes wt-s-hl{0%,12%{width:0}34%,100%{width:calc(100% + 4px)}}
@keyframes wt-s-play{0%,40%{opacity:.85}44%,100%{opacity:0}}
@keyframes wt-s-prog{0%,42%{width:4%}100%{width:62%}}
@keyframes wt-s-ch1{0%,70%{background:var(--element-active,#2c2c30);color:var(--text-strong,#fafafa)}72%,100%{background:transparent}}
@keyframes wt-s-ch2{0%,70%{background:transparent}72%,100%{background:var(--element-active,#2c2c30);color:var(--text-strong,#fafafa)}}

/* Historique */
.wt-hist{position:relative;width:170px;padding:6px;border-left:1px solid var(--border-color,#2a2a2d);background:var(--surface-panel,#1c1c1e);}
.wt-hist-head{display:flex;align-items:center;gap:5px;padding:2px 4px 6px;font-weight:600;color:var(--text-secondary,#a1a1aa);}
.wt-ver{display:flex;align-items:center;gap:6px;height:20px;padding:0 6px;border-radius:4px;color:var(--text-secondary,#a1a1aa);}
.wt-ver span{width:6px;height:6px;border-radius:50%;border:1.5px solid var(--text-muted,#71717a);}
.wt-ver-pick{animation:wt-h-pick 8s infinite;}
.wt-restore{position:absolute;left:12px;right:12px;bottom:10px;height:22px;display:grid;place-items:center;border-radius:5px;
  font-weight:600;color:#fff;background:var(--accent-color,#4a8fe7);animation:wt-h-btn 8s infinite;}
.wt-diff-del{animation:wt-h-del 8s infinite;}
.wt-diff-add{animation:wt-h-add 8s infinite;}
.wt-st-saved{display:inline-flex;align-items:center;gap:4px;animation:wt-h-saved 8s infinite;}
.wt-st-restored{position:absolute;right:0;white-space:nowrap;color:var(--text-strong,#fafafa);animation:wt-h-restored 8s infinite;}
.wt-sc-history .wt-doc{position:static;}
.wt-cur-history{left:0;top:0;animation:wt-h-cur 8s ease-in-out infinite;}
@keyframes wt-h-pick{0%,26%{background:transparent;color:var(--text-secondary,#a1a1aa)}30%,92%{background:var(--element-active,#2c2c30);color:var(--text-strong,#fafafa)}100%{background:transparent}}
@keyframes wt-h-del{0%,32%{background:var(--border-strong,#3a3a3d)}36%,64%{background:rgba(229,83,75,.55)}70%,100%{background:var(--border-strong,#3a3a3d)}}
@keyframes wt-h-add{0%,32%{background:var(--border-strong,#3a3a3d)}36%,64%{background:rgba(87,171,90,.6)}70%,100%{background:var(--border-strong,#3a3a3d)}}
@keyframes wt-h-btn{0%,24%{opacity:0;transform:translateY(4px)}30%,58%{opacity:1;transform:none}60%,64%{opacity:1;transform:scale(.95)}68%,100%{opacity:0}}
@keyframes wt-h-saved{0%,66%{opacity:1}68%,90%{opacity:0}94%,100%{opacity:1}}
@keyframes wt-h-restored{0%,66%{opacity:0}70%,88%{opacity:1}92%,100%{opacity:0}}
@keyframes wt-h-cur{0%{transform:translate(380px,220px)}22%,26%{transform:translate(530px,96px)}28%{transform:translate(530px,96px) scale(.8)}
  30%,46%{transform:translate(530px,96px)}56%,60%{transform:translate(540px,248px)}62%{transform:translate(540px,248px) scale(.8)}
  64%,80%{transform:translate(540px,248px)}100%{transform:translate(380px,220px)}}

/* Dossier */
.wt-folder{display:grid;gap:14px;justify-items:center;width:min(520px,90%);}
.wt-folder-box{width:100%;padding:16px;border-radius:8px;background:var(--surface-panel,#1c1c1e);border:1px solid var(--border-strong,#3a3a3d);
  display:grid;grid-template-columns:auto 1fr;gap:6px 12px;align-items:center;}
.wt-folder-icon{grid-row:span 2;display:grid;place-items:center;width:42px;height:42px;border-radius:8px;
  background:var(--element-active,#2c2c30);color:var(--text-strong,#fafafa);}
.wt-folder-path{min-width:0;font:12.5px var(--font-mono,Consolas,monospace);color:var(--text-strong,#fafafa);
  white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
.wt-folder-files{display:flex;flex-wrap:wrap;gap:4px 12px;font-size:11.5px;color:var(--text-muted,#71717a);}
.wt-folder-actions{display:flex;gap:8px;}
.wt-note{text-align:center;font-size:12px;color:var(--text-secondary,#a1a1aa);}
.wt-error{text-align:center;font-size:12.5px;color:var(--danger-color,#f48771);}

/* Fin */
.wt-ready{display:grid;gap:18px;justify-items:center;width:min(560px,92%);}
.wt-ready-grid{width:100%;display:grid;grid-template-columns:1fr 1fr;gap:0 24px;}
.wt-ready-row{display:flex;align-items:center;justify-content:space-between;gap:12px;height:34px;
  border-bottom:1px solid var(--border-color,#2a2a2d);font-size:13px;color:var(--text-primary,#d4d4d8);animation:wt-up .3s ease-out both;}

@keyframes wt-fade{from{opacity:0}to{opacity:1}}
@keyframes wt-rise{from{opacity:0;transform:translateY(10px) scale(.99)}to{opacity:1;transform:none}}
@keyframes wt-up{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:none}}
@keyframes wt-pop{from{opacity:0;transform:scale(.92)}to{opacity:1;transform:none}}
@keyframes wt-fill{from{width:0}to{width:100%}}
@keyframes wt-blink{50%{opacity:0}}
@media (max-width:700px){.wt-app{transform:scale(.8);}}
@media (prefers-reduced-motion: reduce){
  .wt-stage *,.wt-body{animation-duration:.01s !important;animation-iteration-count:1 !important;animation-delay:0s !important;}
  .wt-cursor{display:none;}
}
`
