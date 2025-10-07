/// <reference lib="webworker" />
declare const self: ServiceWorkerGlobalScope
import { localFileStorage } from '../services/local-file-storage'

self.addEventListener('install', () => {
  self.skipWaiting()
})

self.addEventListener('activate', (event: ExtendableEvent) => {
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
    const remoteUrl = `${FILES_BASE_URL}/${remotePath}`
    const headers: Record<string, string> = {}
    if (WORKER_AUTH_TOKEN) headers['Authorization'] = `Bearer ${WORKER_AUTH_TOKEN}`
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


