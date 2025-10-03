import { Events, makeSchema, Schema, SessionIdSymbol, State } from '@livestore/livestore'

export const localFileState = Schema.Struct({
  opfsKey: Schema.String,
  localHash: Schema.String,
  downloadStatus: Schema.Literal('pending', 'queued', 'inProgress', 'done', 'error'),
  uploadStatus: Schema.Literal('pending', 'queued', 'inProgress', 'done', 'error'),
  lastSyncError: Schema.String
})

export const localFilesState = Schema.Record({
  key: Schema.String,  // file ID
  value: localFileState
})

const localFileStateDefault: typeof localFilesState.Type = {}

// State is modelled as SQLite tables
export const tables = {
  images: State.SQLite.table({
    name: 'images',
    columns: {
      id: State.SQLite.text({ primaryKey: true }),
      title: State.SQLite.text({ default: '' }),
      fileId: State.SQLite.text({ default: '' }),
      deletedAt: State.SQLite.integer({ nullable: true, schema: Schema.DateFromNumber }),
    }
  }),
  files: State.SQLite.table({
    name: 'files',
    columns: {
      id: State.SQLite.text({ primaryKey: true }),
      uploadState: State.SQLite.text(),
      remoteUrl: State.SQLite.text({ default: '' }),
      localPath: State.SQLite.text({ default: '' }),
      contentHash: State.SQLite.text({ default: '' }),
      createdAt: State.SQLite.integer({ schema: Schema.DateFromNumber }),
      updatedAt: State.SQLite.integer({ schema: Schema.DateFromNumber }),
      deletedAt: State.SQLite.integer({ nullable: true, schema: Schema.DateFromNumber }),
    }
  }),
  // Client documents can be used for client-only state (for example form inputs)
  uiState: State.SQLite.clientDocument({
    name: 'uiState',
    schema: Schema.Struct({
      sortFilesBy: Schema.Literal('createdAt', 'updatedAt', 'id')
    }),
    default: {
      id: SessionIdSymbol,
      value: {
        sortFilesBy: 'updatedAt',
      }
    }
  }),
  // Local file state is used to keep a client-local file syncing state
  localFileState: State.SQLite.clientDocument({
    name: 'localFileState',
    schema: Schema.Struct({
      localFiles: localFilesState
    }),
    default: {
      id: SessionIdSymbol,
      value: {
        localFiles: localFileStateDefault,
      },
    },
  })
}

export const events = {
  imageCreated: Events.synced({
    name: 'v1.ImageCreated',
    schema: Schema.Struct({ id: Schema.String, title: Schema.String, fileId: Schema.String }),
  }),
  imageUpdated: Events.synced({
    name: 'v1.ImageUpdated',
    schema: Schema.Struct({ id: Schema.String, title: Schema.String }),
  }),
  imageDeleted: Events.synced({
    name: 'v1.ImageDeleted',
    schema: Schema.Struct({ id: Schema.String, deletedAt: Schema.Date }),
  }),
  fileCreated: Events.synced({
    name: 'v1.FileCreated',
    schema: Schema.Struct({
      id: Schema.String,
      uploadState: Schema.Literal('pending', 'queued', 'inProgress', 'done', 'error'),
      localPath: Schema.String,
      contentHash: Schema.String,
      createdAt: Schema.Date,
      updatedAt: Schema.Date,
    }),
  }),
  fileUpdated: Events.synced({
    name: 'v1.FileUpdated',
    schema: Schema.Struct({
      id: Schema.String,
      uploadState: Schema.Literal('pending', 'queued', 'inProgress', 'done', 'error'),
      remoteUrl: Schema.String,
      localPath: Schema.String,
      contentHash: Schema.String,
      updatedAt: Schema.Date,
    }),
  }),
  fileDeleted: Events.synced({
    name: 'v1.FileDeleted',
    schema: Schema.Struct({ id: Schema.String, deletedAt: Schema.Date }),
  }),
  uiStateSet: tables.uiState.set,
  localFileStateSet: tables.localFileState.set
}

// Materializers are used to map events to state
const materializers = State.SQLite.materializers(events, {
  'v1.ImageCreated': ({ id, title, fileId }) => tables.images.insert({ id, title, fileId }),
  'v1.ImageUpdated': ({ id, title }) => tables.images.update({ title }).where({ id }),
  'v1.ImageDeleted': ({ id, deletedAt }) => tables.images.update({ deletedAt }).where({ id }),
  'v1.FileCreated': ({ id, uploadState, localPath, contentHash, createdAt, updatedAt }) =>
    tables.files.insert({ id, uploadState, localPath, contentHash, createdAt, updatedAt }),
  'v1.FileUpdated': ({ id, uploadState, remoteUrl, contentHash, updatedAt }) =>
    tables.files.update({ uploadState, remoteUrl, contentHash, updatedAt }).where({ id }),
  'v1.FileDeleted': ({ id, deletedAt }) => tables.files.update({ deletedAt }).where({ id }),
})

const state = State.SQLite.makeState({ tables, materializers })
export const schema = makeSchema({ events, state })