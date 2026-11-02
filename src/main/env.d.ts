// Imports de fichiers bruts par Vite dans le processus principal (ex. le thème des notes, theme.css?raw)
declare module '*?raw' {
  const content: string
  export default content
}
