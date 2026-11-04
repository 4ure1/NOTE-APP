/**
 * Date relative courte pour les listes de notes (écran d'accueil) :
 * « à l'instant », « il y a 15 min », « il y a 3 h », « hier », « lundi », « 28 oct. », « 28 oct. 2025 ».
 * `now` est passé en paramètre pour rester testable.
 */
const JOURS = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi']
const MOIS = [
  'janv.',
  'févr.',
  'mars',
  'avr.',
  'mai',
  'juin',
  'juil.',
  'août',
  'sept.',
  'oct.',
  'nov.',
  'déc.'
]

function startOfDay(d: Date): number {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
}

export function formatRelativeDate(timestamp: number, now: number = Date.now()): string {
  if (!(timestamp > 0)) return ''
  const diff = now - timestamp
  if (diff < 60_000) return 'à l’instant'
  if (diff < 3_600_000) return `il y a ${Math.floor(diff / 60_000)} min`

  const date = new Date(timestamp)
  const today = new Date(now)
  const days = Math.round((startOfDay(today) - startOfDay(date)) / 86_400_000)
  if (days === 0) return `il y a ${Math.floor(diff / 3_600_000)} h`
  if (days === 1) return 'hier'
  if (days > 1 && days < 7) return JOURS[date.getDay()]

  const dayMonth = `${date.getDate()} ${MOIS[date.getMonth()]}`
  return date.getFullYear() === today.getFullYear() ? dayMonth : `${dayMonth} ${date.getFullYear()}`
}
