/**
 * Nombre de mots d'une note pour la barre d'état. En HTML, seul le texte lisible compte : balises,
 * commentaires, <script> et <style> sont ignorés, les entités comptent comme un caractère.
 */
export function countWords(content: string, isHtml: boolean): number {
  let text = content
  if (isHtml) {
    text = text
      .replace(/<!--[\s\S]*?-->/g, ' ')
      .replace(/<(script|style)\b[\s\S]*?<\/\1\s*>/gi, ' ')
      .replace(/<[^>]*>/g, ' ')
      .replace(/&[#a-z0-9]+;/gi, 'x')
  }
  const words = text.match(/[\p{L}\p{N}][\p{L}\p{N}'’_-]*/gu)
  return words ? words.length : 0
}
