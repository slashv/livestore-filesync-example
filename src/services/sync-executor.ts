export type TransferKind = 'download' | 'upload'

type TaskKey = `${TransferKind}:${string}`

export interface SyncExecutorOptions {
  maxConcurrentPerKind?: Partial<Record<TransferKind, number>>
  baseDelayMs?: number
  maxDelayMs?: number
  jitterMs?: number
  isOnline: () => boolean
  run: (kind: TransferKind, fileId: string) => Promise<void>
}

export function createSyncExecutor(options: SyncExecutorOptions) {
  const maxPerKind: Record<TransferKind, number> = {
    download: options.maxConcurrentPerKind?.download ?? 2,
    upload: options.maxConcurrentPerKind?.upload ?? 2,
  }

  const queues: Record<TransferKind, Set<string>> = {
    download: new Set(),
    upload: new Set(),
  }

  const inflight: Record<TransferKind, number> = {
    download: 0,
    upload: 0,
  }

  const attempts = new Map<TaskKey, number>()
  let paused = false
  let processing = false

  const makeTaskKey = (kind: TransferKind, id: string): TaskKey => `${kind}:${id}`

  const computeBackoffDelay = (taskKey: TaskKey) => {
    const attemptCount = (attempts.get(taskKey) ?? 0) + 1
    attempts.set(taskKey, attemptCount)
    const base = options.baseDelayMs ?? 1000
    const max = options.maxDelayMs ?? 60000
    const jitter = options.jitterMs ?? 500
    const delay = Math.min(base * 2 ** (attemptCount - 1), max) + Math.floor(Math.random() * jitter)
    return delay
  }

  const enqueue = (kind: TransferKind, fileId: string) => {
    queues[kind].add(fileId)
    tick()
  }

  const dequeue = (kind: TransferKind): string | undefined => {
    const iterator = queues[kind].values().next()
    if (iterator.done) return undefined
    const fileId = iterator.value as string
    queues[kind].delete(fileId)
    return fileId
  }

  const runOne = async (kind: TransferKind, fileId: string) => {
    inflight[kind]++
    try {
      await options.run(kind, fileId)
      attempts.delete(makeTaskKey(kind, fileId))
    } catch {
      const delay = computeBackoffDelay(makeTaskKey(kind, fileId))
      setTimeout(() => {
        queues[kind].add(fileId)
        tick()
      }, delay)
    } finally {
      inflight[kind]--
      tick()
    }
  }

  const tick = () => {
    if (processing) return
    processing = true
    queueMicrotask(() => {
      processing = false
      if (paused || !options.isOnline()) return
      for (const kind of ['download', 'upload'] as const) {
        while (inflight[kind] < maxPerKind[kind]) {
          const fileId = dequeue(kind)
          if (!fileId) break
          runOne(kind, fileId)
        }
      }
    })
  }

  const pause = () => { paused = true }
  const resume = () => { paused = false; tick() }

  const clear = () => {
    queues.download.clear()
    queues.upload.clear()
    attempts.clear()
  }

  return {
    enqueue,
    pause,
    resume,
    clear,
    stats: () => ({
      queuedDownload: queues.download.size,
      queuedUpload: queues.upload.size,
      inflight: { ...inflight },
      paused,
    }),
  }
}
export default createSyncExecutor
