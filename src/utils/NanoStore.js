import {
  AbstractType,
  Item, NanoBlock, StoreTransaction // eslint-disable-line
} from '../internals.js'
import { Observable } from 'lib0/observable'
import { generateNewClientId } from './NanoBlock.js'

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
   * @template {AbstractType<any>} T
   * @param {CollectionName} collectionName
   * @param {DocumentId} documentId
   * @param {FieldName} fieldName
   * @param {new () => T} TypeConstructor
   * @returns {T} The root type
   */
  getRoot (collectionName, documentId, fieldName, TypeConstructor) {
    let block = this.getRootBlock(collectionName, documentId, fieldName)
    const owner = createOwnerId(collectionName, documentId, fieldName)
    if (!block) {
      const type = new TypeConstructor()
      block = this.setRootBlock(owner, type)
    }
    const type = block.type
    const Constr = type.constructor
    if (TypeConstructor !== AbstractType && Constr !== TypeConstructor) {
      if (Constr === AbstractType) {
        const concreteType = new TypeConstructor()
        castToConcreteType(type, concreteType)
        this.setRootBlock(owner, concreteType)
        // FIXME: Integrate concreteType to this store
      } else {
        throw new Error(
          `Type with the name ${collectionName}/${documentId}/${fieldName} has already been defined with a different constructor`
        )
      }
    }
    // @ts-ignore
    return type
  }

  /**
   * @private
   * @param {OwnerId} owner
   * @param {AbstractType<any>} rootType
   * @returns {NanoBlock}
   */
  setRootBlock (owner, rootType) {
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
      block = {
        root: true,
        id: null,
        owner,
        type: rootType
      }
      documents.set(owner.fieldName, block)
    }
    return block
  }

  /**
   * @param {CollectionName} collectionName
   * @param {DocumentId} documentId
   * @param {FieldName} fieldName
   * @returns {RootBlock | undefined} The root type
   * @private
   */
  getRootBlock (collectionName, documentId, fieldName) {
    return this.roots.get(collectionName)?.get(documentId)?.get(fieldName)
  }
}

/**
 * @param {CollectionName} collectionName
 * @param {DocumentId} documentId
 * @param {FieldName} fieldName
 * @returns {OwnerId}
 */
function createOwnerId (collectionName, documentId, fieldName) {
  return {
    collectionName,
    documentId,
    fieldName
  }
}

/**
 * @param {AbstractType<any>} abstractType
 * @param {AbstractType<any>} concreteType
 */
function castToConcreteType (abstractType, concreteType) {
  concreteType._map = abstractType._map
  abstractType._map.forEach(
    /** @param {Item?} n */ (n) => {
      for (; n !== null; n = n.left) {
        n.parent = concreteType
      }
    }
  )
  concreteType._start = abstractType._start
  for (let n = concreteType._start; n !== null; n = n.right) {
    n.parent = concreteType
  }
  concreteType._length = abstractType._length
}
