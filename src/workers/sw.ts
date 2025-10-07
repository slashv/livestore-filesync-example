/// <reference lib="webworker" />
declare const self: ServiceWorkerGlobalScope
import { localFileStorage } from '../services/local-file-storage'

self.addEventListener('install', () => {
  self.skipWaiting()
})

self.addEventListener('activate', (event: ExtendableEvent) => {
  event.waitUntil(self.clients.claim())
})

// Read base URL and token from the registration query string so we can keep it configurable at runtime
;(self as any).__FILES_BASE_URL__ = (() => {
  try {
    const params = new URLSearchParams(self.location.search)
    return params.get('filesBaseUrl') || 'http://localhost:8787/api/files'
  } catch {
    return 'http://localhost:8787/api/files'
  }
})()

;(self as any).__WORKER_AUTH_TOKEN__ = (() => {
  try {
    const params = new URLSearchParams(self.location.search)
    return params.get('token') || ''
  } catch {
    return ''
  }
})()

self.addEventListener('fetch', (event: FetchEvent) => {
  const url = new URL(event.request.url)
  if (url.origin === self.location.origin && url.pathname.startsWith('/files/')) {
    event.respondWith(handleFileRequest(event.request, url.pathname.slice(1)))
  }
})

async function handleFileRequest(_request: Request, opfsPath: string): Promise<Response> {
  try {
    const { readFile } = localFileStorage()
    const file = await readFile(opfsPath)
    const body = await file.arrayBuffer()
    const type = (file as File).type || guessMimeFromPath(opfsPath)
    return new Response(body, {
      status: 200,
      headers: {
        'content-type': type,
        'cache-control': 'no-store'
      }
    })
  } catch {
    const remotePath = opfsPath.replace(/^files\//, '')
    const remoteUrl = `${(self as any).__FILES_BASE_URL__}/${remotePath}`
    const headers: Record<string, string> = {}
    if ((self as any).__WORKER_AUTH_TOKEN__) headers['Authorization'] = `Bearer ${(self as any).__WORKER_AUTH_TOKEN__}`
    return fetch(remoteUrl, { headers })
  }
}

function guessMimeFromPath(path: string): string {
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


