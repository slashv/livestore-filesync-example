export const remoteFileStorage = () => {

  const getAuthHeaders = (): HeadersInit => {
    const token = import.meta.env.VITE_WORKER_AUTH_TOKEN
    return token ? { Authorization: `Bearer ${token}` } : {}
  }

  const checkHealth = async (): Promise<boolean> => {
    const baseUrl = import.meta.env.VITE_WORKER_API_URL || 'http://localhost:8787/api'
    const response = await fetch(`${baseUrl}/health`, {
      method: 'GET',
      cache: 'no-store',
      headers: getAuthHeaders()
    })
    return response.ok
  }

  const uploadFile = async (file: File): Promise<string> => {
    console.log('uploading file', file)
    const formData = new FormData()
    formData.append('file', file)

    const baseUrl = import.meta.env.VITE_WORKER_API_URL || 'http://localhost:8787/api'
    const uploadUrl = `${baseUrl}/upload`
    // console.log('uploading file to', uploadUrl)
    const response = await fetch(uploadUrl, {
      method: 'POST',
      body: formData,
      headers: getAuthHeaders()
    })
    // console.log('upload response', response)

    if (!response.ok) {
      throw new Error(`Upload failed: ${response.statusText}`)
    }

    const { url } = await response.json()
    return url
  }

  const downloadFile = async (url: string): Promise<File> => {
      // console.log('downloading file with fake delay', url)
      // await new Promise((resolve) => setTimeout(resolve, 5000))

      const response = await fetch(url, { headers: getAuthHeaders() })
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
      method: 'DELETE',
      headers: getAuthHeaders()
    })

    if (!response.ok) {
      throw new Error(`Delete failed: ${response.statusText}`)
    }
  }

  return {
    uploadFile,
    downloadFile,
    deleteFile,
    checkHealth
  }
}