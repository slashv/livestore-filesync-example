export async function hashFile(file: File | Blob): Promise<string> {
  const buffer = await file.arrayBuffer()
  const hashBuffer = await crypto.subtle.digest('SHA-256', buffer)
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('')
  return hashHex
}

export function makeStoredFilePath(originalName: string): { id: string; path: string; filename: string } {
  const ext = originalName.includes('.') ? originalName.split('.').pop() || '' : ''
  const id = crypto.randomUUID()
  const filename = ext ? `${id}.${ext}` : id
  const path = `files/${filename}`
  return { id, path, filename }
}

export function makeStoredPathForId(id: string, originalName: string): { path: string; filename: string } {
  const ext = originalName.includes('.') ? originalName.split('.').pop() || '' : ''
  const filename = ext ? `${id}.${ext}` : id
  const path = `files/${filename}`
  return { path, filename }
}