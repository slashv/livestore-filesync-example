import { Schema } from '@livestore/livestore'
import {
  tables,
  localFileState as localFileStateSchema,
  localFilesState as localFilesStateSchema,
  transferStatus
} from '../livestore/schema'

export type Image = typeof tables.images.rowSchema.Type

export type LocalFile = typeof localFileStateSchema.Type
const localFileStateSchemaMutable = Schema.mutable(localFileStateSchema)
export type LocalFileMutable = typeof localFileStateSchemaMutable.Type

export type LocalFilesState = typeof localFilesStateSchema.Type
const localFilesStateSchemaMutable = Schema.mutable(localFilesStateSchema)
export type LocalFileStateMutable = typeof localFilesStateSchemaMutable.Type

export type TransferStatus = typeof transferStatus.Type

export type FileType = typeof tables.files.rowSchema.Type