import { makeCfSync } from '@livestore/sync-cf'
import { makeWorker } from '@livestore/adapter-web/worker'

import { schema } from './schema'

makeWorker({
  schema,
  sync: { backend: makeCfSync({ url: import.meta.env.VITE_LIVESTORE_SYNC_URL }) }
})