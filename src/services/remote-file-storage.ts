export const remoteFileStorage = () => {

  const uploadFile = async (file: File): Promise<string> => {
    const formData = new FormData()
    formData.append('file', file)

    const uploadUrl = import.meta.env.VITE_UPLOAD_URL || '/api/upload'
    const response = await fetch(uploadUrl, {
      method: 'POST',
      body: formData
    })
    // console.log('upload response', response)

    if (!response.ok) {
      throw new Error(`Upload failed: ${response.statusText}`)
    }

    const { url } = await response.json()
    return url
  }

  const downloadFile = async (url: string): Promise<File> => {
      const response = await fetch(url)
      // console.log('downloaded file response', response)
      if (!response.ok) {
        throw new Error(`Download failed: ${response.statusText}`)
      }
      const blob = await response.blob()
      const filename = url.split('/').pop() ?? 'noname'
      const type = blob.type || response.headers.get('content-type') || ''
      const file = new File([blob], filename, { type, lastModified: Date.now() })
      // console.log('downloaded file', type, file.name, file)
      return file
  }

  const deleteFile = async (url: string): Promise<void> => {
    const response = await fetch(url, {
      method: 'DELETE'
    })

    if (!response.ok) {
      throw new Error(`Delete failed: ${response.statusText}`)
    }
  }

  return {
    uploadFile,
    downloadFile,
    deleteFile
  }
}