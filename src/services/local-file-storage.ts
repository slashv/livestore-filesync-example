export const localFileStorage = () => {

  const getRoot = async () => navigator.storage.getDirectory()

  const splitPath = (path: string): { dirs: string[]; file: string } => {
    const parts = path.split('/').filter(Boolean)
    const fileWithQuery = parts.pop() ?? ''
    const file = fileWithQuery.split('?')[0]
    return { dirs: parts, file }
  }

  const getDirectory = async (path: string, options: { create: boolean }): Promise<FileSystemDirectoryHandle> => {
    const root = await getRoot()
    let dir: FileSystemDirectoryHandle = root
    const parts = path.split('/').filter(Boolean)
    for (const segment of parts) {
      dir = await dir.getDirectoryHandle(segment, { create: options.create })
    }
    return dir
  }

  const getParentDirectory = async (path: string, options: { create: boolean }): Promise<{
    dir: FileSystemDirectoryHandle
    name: string
  }> => {
    const { dirs, file } = splitPath(path)
    const dir = await getDirectory(dirs.join('/'), { create: options.create })
    return { dir, name: file }
  }

  const writeFile = async (path: string, file: File): Promise<void> => {
    const { dir, name } = await getParentDirectory(path, { create: true })
    const handle = await dir.getFileHandle(name, { create: true })
    const writable = await handle.createWritable()
    const arrayBuffer = await file.arrayBuffer()
    await writable.write(arrayBuffer)
    await writable.close()
  }

  const readFile = async (path: string): Promise<File> => {
    try {
      const { dir, name } = await getParentDirectory(path, { create: false })
      const handle = await dir.getFileHandle(name, { create: false })
      return await handle.getFile()
    } catch(e) {
      throw new Error(`Unable to read file: ${path} - ${e}`)
    }
  }

  const deleteFile = async (path: string): Promise<void> => {
    const { dir, name } = await getParentDirectory(path, { create: false })
    await dir.removeEntry(name)
  }

  const fileExists = async (path: string): Promise<boolean> => {
    try {
      const { dir, name } = await getParentDirectory(path, { create: false })
      await dir.getFileHandle(name, { create: false })
    } catch(e: any) {
      if (e?.name === 'NotFoundError') return false
      throw e
    }
    return true
  }

  const getFileUrl = async (path: string): Promise<string> => {
    const file = await readFile(path)
    return URL.createObjectURL(file)
  }

  return {
    writeFile,
    readFile,
    getFileUrl,
    fileExists,
    deleteFile
  }
}