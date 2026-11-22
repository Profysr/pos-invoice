export function wrapText(input, width) {
  const safeWidth = Math.max(1, Number(width) || 48)
  return String(input ?? '')
    .split('\n')
    .flatMap((paragraph) => {
      const words = paragraph.trim().split(/\s+/).filter(Boolean)
      if (words.length === 0) return ['']

      const lines = []
      let line = ''
      for (const word of words) {
        if (word.length > safeWidth) {
          if (line) lines.push(line)
          line = ''
          for (let index = 0; index < word.length; index += safeWidth) {
            lines.push(word.slice(index, index + safeWidth))
          }
          continue
        }
        if (!line) {
          line = word
          continue
        }
        if (`${line} ${word}`.length <= safeWidth) {
          line += ` ${word}`
          continue
        }
        lines.push(line)
        line = word
      }
      if (line) lines.push(line)
      return lines
    })
}
