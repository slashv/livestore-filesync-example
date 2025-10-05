import { makeDurableObject, makeWorker } from '@livestore/sync-cf/cf-worker'

export class WebSocketServer extends makeDurableObject({
  onPush: async (message) => {
    console.log('onPush', message.batch)
  },
  onPull: async (message) => {
    console.log('onPull', message)
  },
}) {}

const livestoreWorker = makeWorker({
  validatePayload: (payload: any) => {
    if (payload?.authToken !== 'very-secret-token-pizza') {
      throw new Error(`Invalid auth token: ${payload?.authToken}`)
    }
  },
  enableCORS: true
})

interface Env {
  FILE_BUCKET: R2Bucket
  WEBSOCKET_SERVER: DurableObjectNamespace
  DB: D1Database
  ADMIN_SECRET: string
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url)

    // Handle CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Requested-With',
          'Access-Control-Max-Age': '86400'
        }
      })
    }

    // Handle file upload
    if (url.pathname === '/api/upload' && request.method === 'POST') {
      try {
        const formData = await request.formData()
        const file = formData.get('file') as File | null

        if (!file) {
          return new Response('No file provided', { status: 400, headers: { 'Access-Control-Allow-Origin': '*' } })
        }

        await env.FILE_BUCKET.put(file.name, file.stream())

        const fileUrl = `${url.origin}/api/files/${file.name}`

        return new Response(JSON.stringify({ url: fileUrl }), {
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*'
          }
        })
      } catch (error: any) {
        return new Response(`Upload failed: ${error.message}`, { status: 500, headers: { 'Access-Control-Allow-Origin': '*' } })
      }
    }

    // Handle file download
    if (url.pathname.startsWith('/api/files/') && request.method === 'GET') {
      const fileKey = url.pathname.replace('/api/files/', '')

      try {
        const object = await env.FILE_BUCKET.get(fileKey)

        if (!object) {
          return new Response('File not found', { status: 404, headers: { 'Access-Control-Allow-Origin': '*' } })
        }

        return new Response(object.body, {
          headers: {
            'Content-Type': object.httpMetadata?.contentType || 'application/octet-stream',
            'Access-Control-Allow-Origin': '*'
          }
        })
      } catch (error: any) {
        return new Response(`Download failed: ${error.message}`, { status: 500, headers: { 'Access-Control-Allow-Origin': '*' } })
      }
    }

    // Handle file delete
    if (url.pathname.startsWith('/api/files/') && request.method === 'DELETE') {
      const fileKey = url.pathname.replace('/api/files/', '')

      try {
        await env.FILE_BUCKET.delete(fileKey)

        return new Response(null, {
          status: 204,
          headers: {
            'Access-Control-Allow-Origin': '*'
          }
        })
      } catch (error: any) {
        return new Response(`Delete failed: ${error.message}`, { status: 500, headers: { 'Access-Control-Allow-Origin': '*' } })
      }
    }

    // Delegate to LiveStore worker for all other requests
    return livestoreWorker.fetch(request, env, ctx)
  }
}