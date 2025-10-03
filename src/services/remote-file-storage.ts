export const remoteFileStorage = () => {

  const uploadFile = async (file: File): Promise<string> => {
    const formData = new FormData()
    formData.append('file', file)

    const uploadUrl = import.meta.env.VITE_D3_UPLOAD_URL || '/api/upload'
    const response = await fetch(uploadUrl, {
      method: 'POST',
      body: formData
    })

    if (!response.ok) {
      throw new Error(`Upload failed: ${response.statusText}`)
    }

    const { url } = await response.json()
    return url
  }

  const downloadFile = async (url: string): Promise<File> => {
      const response = await fetch(url)
      if (!response.ok) {
        throw new Error(`Download failed: ${response.statusText}`)
      }
      const file = await response.blob() as File
      return new File([file], file.name, { type: file.type })
  }

  return {
    uploadFile,
    downloadFile
  }
}