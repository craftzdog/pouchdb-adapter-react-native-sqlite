function quote(str: string) {
  return "'" + str + "'"
}

/** The schema version; opening a database with an older one runs its migrations. */
export const ADAPTER_VERSION = 8

/** Holds each document's metadata: its revision tree and whether it is deleted. */
export const DOC_STORE = quote('document-store')
/** Holds each revision of a document, keyed by its sequence number. */
export const BY_SEQ_STORE = quote('by-sequence')
/** Holds attachment bodies, keyed by digest. */
export const ATTACH_STORE = quote('attach-store')
export const LOCAL_STORE = quote('local-store')
export const META_STORE = quote('metadata-store')
/** Relates attachment digests to the sequence numbers that reference them. */
export const ATTACH_AND_SEQ_STORE = quote('attach-seq-store')
