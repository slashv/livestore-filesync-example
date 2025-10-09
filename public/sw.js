self.addEventListener('install', () => {
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim())
})

const FILES_BASE_URL = (() => {
  try {
    const params = new URLSearchParams(self.location.search)
    return params.get('filesBaseUrl') || 'http://localhost:8787/api/files'
  } catch {
    return 'http://localhost:8787/api/files'
  }
})()

const WORKER_AUTH_TOKEN = (() => {
  try {
    const params = new URLSearchParams(self.location.search)
    return params.get('token') || ''
  } catch {
    return ''
  }
})()

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url)
  if (url.origin === self.location.origin && url.pathname.startsWith('/files/')) {
    event.respondWith(handleFileRequest(event.request, url.pathname.slice(1)))
  }
})

async function handleFileRequest(_request, opfsPath) {
  try {
    const file = await opfsReadFile(opfsPath)
    const body = await file.arrayBuffer()
    const type = file.type || guessMimeFromPath(opfsPath)
    return new Response(body, {
      status: 200,
      headers: {
        'content-type': type,
        'cache-control': 'no-store'
      }
    })
  } catch {
    const remotePath = opfsPath.replace(/^files\//, '')
    const remoteUrl = `${FILES_BASE_URL}/${remotePath}`
    const headers = {}
    if (WORKER_AUTH_TOKEN) headers['Authorization'] = `Bearer ${WORKER_AUTH_TOKEN}`
    return fetch(remoteUrl, { headers })
  }
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

function splitPath(path) {
  const parts = path.split('/').filter(Boolean)
  const fileWithQuery = parts.pop() || ''
  const file = fileWithQuery.split('?')[0]
  return { dirs: parts, file }
}

async function getDirectory(path, options) {
  const root = await navigator.storage.getDirectory()
  let dir = root
  const parts = path.split('/').filter(Boolean)
  for (const segment of parts) {
    dir = await dir.getDirectoryHandle(segment, { create: options.create })
  }
  return dir
}

async function getParentDirectory(path, options) {
  const { dirs, file } = splitPath(path)
  const dir = await getDirectory(dirs.join('/'), { create: options.create })
  return { dir, name: file }
}

async function opfsReadFile(path) {
  const { dir, name } = await getParentDirectory(path, { create: false })
  const handle = await dir.getFileHandle(name, { create: false })
  return await handle.getFile()
}


