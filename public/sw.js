self.addEventListener('install', () => {
  self.skipWaiting()
})

self.addEventListener('activate', event => {
  event.waitUntil(self.clients.claim())
})

self.__FILES_BASE_URL__ = (() => {
  try {
    const params = new URLSearchParams(self.location.search)
    return params.get('filesBaseUrl') || 'http://localhost:8787/api/files'
  } catch {
    return 'http://localhost:8787/api/files'
  }
})()

self.addEventListener('fetch', event => {
  const url = new URL(event.request.url)
  if (url.origin === self.location.origin && url.pathname.startsWith('/files/')) {
    event.respondWith(handleFileRequest(event.request, url.pathname.slice(1)))
  }
})

async function handleFileRequest(request, opfsPath) {
  try {
    const file = await readOPFSFile(opfsPath)
    const body = await file.arrayBuffer()
    const type = file.type || guessMimeFromPath(opfsPath)
    console.log("returning file from local storage")
    return new Response(body, {
      status: 200,
      headers: {
        'content-type': type,
        'cache-control': 'no-store'
      }
    })
  } catch {
    const remotePath = opfsPath.replace(/^files\//, '')
    const remoteUrl = `${self.__FILES_BASE_URL__}/${remotePath}`
    console.log("returning file from remote storage", remoteUrl)
    return fetch(remoteUrl, { credentials: 'omit' })
  }
}

async function readOPFSFile(path) {
  const parts = path.split('/').filter(Boolean)
  const name = parts.pop()
  let dir = await navigator.storage.getDirectory()
  for (const segment of parts) {
    dir = await dir.getDirectoryHandle(segment, { create: false })
  }
  const handle = await dir.getFileHandle(name, { create: false })
  return handle.getFile()
}

function guessMimeFromPath(path) {
  const ext = path.split('.').pop()?.toLowerCase()
  switch (ext) {
    case 'png': return 'image/png'
    case 'jpg':
    case 'jpeg': return 'image/jpeg'
    case 'webp': return 'image/webp'
    case 'gif': return 'image/gif'
    case 'svg': return 'image/svg+xml'
    default: return 'application/octet-stream'
  }
}


