function quote(str: string) {
  return "'" + str + "'"
}

const ADAPTER_VERSION = 7 // used to manage migrations

// The object stores created for each database
// DOC_STORE stores the document meta data, its revision history and state
const DOC_STORE = quote('document-store')
// BY_SEQ_STORE stores a particular version of a document, keyed by its
// sequence id
const BY_SEQ_STORE = quote('by-sequence')
// Where we store attachments
const ATTACH_STORE = quote('attach-store')
const LOCAL_STORE = quote('local-store')
const META_STORE = quote('metadata-store')
// where we store many-to-many relations between attachment
// digests and seqs
const ATTACH_AND_SEQ_STORE = quote('attach-seq-store')

export {
  ADAPTER_VERSION as ADAPTER_VERSION,
  DOC_STORE as DOC_STORE,
  BY_SEQ_STORE as BY_SEQ_STORE,
  ATTACH_STORE as ATTACH_STORE,
  LOCAL_STORE as LOCAL_STORE,
  META_STORE as META_STORE,
  ATTACH_AND_SEQ_STORE as ATTACH_AND_SEQ_STORE,
}
