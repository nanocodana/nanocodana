/**
 * Simple in-memory virtual filesystem for browser
 */
export class MemoryFileSystem {
  private files: Map<string, string> = new Map()
  private onFilesChange?: (changes: Array<{ path: string; content?: string }>) => void

  constructor(initialFiles?: Array<{ path: string; content: string }>, onFilesChange?: (changes: Array<{ path: string; content?: string }>) => void) {
    this.onFilesChange = onFilesChange

    if (initialFiles && initialFiles.length > 0) {
      for (const { path, content } of initialFiles) {
        this.files.set(path, content)
      }
      this.onFilesChange?.(initialFiles)
    }
  }

  async read(path: string): Promise<string> {
    const content = this.files.get(path)
    if (content === undefined) {
      throw new Error(`File not found: ${path}`)
    }
    return content
  }

  async write(path: string, content: string): Promise<void> {
    this.files.set(path, content)
    this.onFilesChange?.([{ path, content }])
  }

  async edit(path: string, oldText: string, newText: string, replaceAll: boolean = false): Promise<void> {
    const content = await this.read(path)

    if (!content.includes(oldText)) {
      throw new Error(`Text not found in file: ${oldText}`)
    }

    const updatedContent = replaceAll
      ? content.replaceAll(oldText, newText)
      : content.replace(oldText, newText)

    this.files.set(path, updatedContent)
    this.onFilesChange?.([{ path, content: updatedContent }])
  }

  async list(): Promise<string[]> {
    return Array.from(this.files.keys())
  }

  async glob(pattern: string): Promise<string[]> {
    const allFiles = await this.list()

    // Special cases for common patterns
    if (pattern === '**/*' || pattern === '**' || pattern === '*') {
      return allFiles
    }

    // Convert glob pattern to regex
    // Use placeholder to avoid ** and * interfering with each other
    const regexPattern = pattern
      .replace(/\./g, '\\.')
      .replace(/\*\*/g, '__GLOBSTAR__')
      .replace(/\*/g, '[^/]*')
      .replace(/\?/g, '.')
      .replace(/__GLOBSTAR__/g, '.*')

    const regex = new RegExp(`^${regexPattern}$`)

    return allFiles.filter(file => regex.test(file))
  }

  async grep(
    pattern: string,
    filePattern?: string,
    caseSensitive: boolean = true
  ): Promise<Array<{ file: string; line: number; content: string }>> {
    const filesToSearch = filePattern ? await this.glob(filePattern) : await this.list()
    const results: Array<{ file: string; line: number; content: string }> = []

    const flags = caseSensitive ? 'g' : 'gi'
    const regex = new RegExp(pattern, flags)

    for (const file of filesToSearch) {
      try {
        const content = await this.read(file)
        const lines = content.split('\n')

        lines.forEach((line, index) => {
          if (regex.test(line)) {
            results.push({
              file,
              line: index + 1,
              content: line
            })
          }
        })
      } catch {
        // Skip files that can't be read
      }
    }

    return results
  }

  async exists(path: string): Promise<boolean> {
    return this.files.has(path)
  }

  async delete(path: string): Promise<void> {
    this.files.delete(path)
    this.onFilesChange?.([{ path }])
  }
}
