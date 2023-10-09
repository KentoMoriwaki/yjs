import {
  NanoBlock,
  generateNewClientId,
  Item, StoreTransaction // eslint-disable-line
} from '../internals.js'
import { Observable } from 'lib0/observable'

/**
 * @typedef {string} CollectionName
 * @typedef {string} DocumentId
 * @typedef {string} FieldName
 * @typedef {string} BlockId
 * @typedef {Map<FieldName, NanoBlock>} FieldBlockMap
 * @typedef {Map<DocumentId, FieldBlockMap>} DocumentFieldMap
 * @typedef {Map<CollectionName, DocumentFieldMap>} CollectionDocumentMap
 * @typedef {CollectionDocumentMap} RootMap
 * @typedef {Map<BlockId, NanoBlock>} BlockMap
 */

/**
 * @typedef {Object} NanoStoreOpts
 * @property {boolean} [NanoStoreOpts.gc=true] Disable garbage collection (default: gc=true)
 * @property {function(Item):boolean} [NanoStoreOpts.gcFilter] Will be called before an Item is garbage collected. Return false to keep the Item.
 */

/**
 * A Yjs instance handles the state of shared data.
 * @extends Observable<string>
 */
export class NanoStore extends Observable {
  /**
   * @param {NanoStoreOpts} opts configuration
   */
  constructor ({ gc = true, gcFilter = () => true } = {}) {
    super()
    this.clientID = generateNewClientId()
    /**
     * @type {boolean} Whether to try to garbage collect
     */
    this.gc = gc

    /**
     * @type {function(Item):boolean}
     */
    this.gcFilter = gcFilter

    /**
     * @type {RootMap}
     */
    this.roots = new Map()

    /**
     * @type {BlockMap}
     */
    this.blocks = new Map()

    /**
     * @type {StoreTransaction | null}
     */
    this._transaction = null
    /**
     * @type {Array<StoreTransaction>}
     */
    this._transactionCleanups = []
  }

  /**
   * @param {CollectionName} collectionName
   * @param {DocumentId} documentId
   * @param {FieldName} fieldName
   * @param {import("./NanoBlock.js").BlockType} blockType
   * @returns {NanoBlock} The root type
   */
  getRoot (collectionName, documentId, fieldName, blockType) {
    let block = this.getRootBlock(collectionName, documentId, fieldName)
    if (block === undefined) {
      block = this.setRootBlock(
        createOwnerId(collectionName, documentId, fieldName),
        blockType
      )
    }
    return block
  }

  /**
   * @private
   * @param {import("./NanoBlock.js").OwnerId} owner
   * @param {import("./NanoBlock.js").BlockType} blockType
   * @returns {NanoBlock}
   */
  setRootBlock (owner, blockType) {
    let collections = this.roots.get(owner.collectionName)
    if (!collections) {
      collections = new Map()
      this.roots.set(owner.collectionName, collections)
    }
    let documents = collections.get(owner.documentId)
    if (!documents) {
      documents = new Map()
      collections.set(owner.documentId, documents)
    }
    let block = documents.get(owner.fieldName)
    if (!block) {
      const id = getRootId(owner)
      block = new NanoBlock({
        store: this,
        id,
        isRoot: true,
        type: blockType
      })
      documents.set(owner.fieldName, block)
      this.blocks.set(id, block)
    }
    return block
  }

  /**
   * @param {CollectionName} collectionName
   * @param {DocumentId} documentId
   * @param {FieldName} fieldName
   * @returns {NanoBlock | undefined} The root type
   * @private
   */
  getRootBlock (collectionName, documentId, fieldName) {
    return this.roots.get(collectionName)?.get(documentId)?.get(fieldName)
  }

  /**
   * @param {string} id
   * @returns {NanoBlock | undefined}
   */
  getBlock (id) {
    return this.blocks.get(id)
  }

  /**
   * @param {string} id
   * @param {import("./NanoBlock.js").BlockType} type
   * @returns {NanoBlock}
   */
  getOrCreateBlock (id, type) {
    let block = this.getBlock(id)
    if (!block) {
      block = this.createBlock(type, id)
    }
    return block
  }

  /**
   * Create block
   * @param {import("./NanoBlock.js").BlockType} type
   * @param {string | undefined} [id]
   */
  createBlock (type, id) {
    const block = new NanoBlock({
      store: this,
      type,
      id
    })
    this.blocks.set(block.id, block)
    return block
  }

  destroy () {
    this.emit('destroy', [this])

    super.destroy()
  }
}

/**
 * @param {CollectionName} collectionName
 * @param {DocumentId} documentId
 * @param {FieldName} fieldName
 * @returns {import("./NanoBlock.js").OwnerId}
 */
function createOwnerId (collectionName, documentId, fieldName) {
  return {
    collectionName,
    documentId,
    fieldName
  }
}

/**
 *
 * @param {import("./NanoBlock.js").OwnerId} owner
 * @returns {string}
 */
const getRootId = (owner) => {
  return `@///${owner.collectionName}///${owner.documentId}///${owner.fieldName}`
}
