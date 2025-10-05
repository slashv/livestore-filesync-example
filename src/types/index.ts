import { Schema } from '@livestore/livestore'
import {
  tables,
  localFileState as localFileStateSchema,
  localFilesState as localFilesStateSchema,
  transferStatus
} from '../livestore/schema'

export type Image = typeof tables.images.rowSchema.Type

const localFileStateSchemaMutable = Schema.mutable(localFileStateSchema)
export type LocalFile = typeof localFileStateSchemaMutable.Type

const localFilesStateSchemaMutable = Schema.mutable(localFilesStateSchema)
export type LocalFilesState = typeof localFilesStateSchemaMutable.Type

export type TransferStatus = typeof transferStatus.Type
