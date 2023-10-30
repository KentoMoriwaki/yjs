import {
  StructStore,
  AbstractType, Item, NanoStore, Transaction, YArray, YMap, YText, YXmlElement, YXmlFragment, YXmlText, transact, encodeStateAsUpdateV2, applyUpdateV2, ContentBlockRef, ContentBlockUnref, YEvent, // eslint-disable-line
} from '../internals.js'
import * as random from 'lib0/random'
import * as map from 'lib0/map'
import { Observable } from 'lib0/observable'

const ROOT_NAME_ID_PREFIX = '@'

export const generateNewClientId = random.uint32

const generateNewBlockId = random.uuidv4

// const DEFAULT_NAME = ''

/**
 * @typedef {"array" | "map" | "text" | "xmlElement" | "xmlFragment" | "xmlText"} BlockType
 */

/**
 * @typedef {Object} NanoBlockOpts
 * @property {string | undefined} [id]
 * @property {BlockType} type
 * @property {NanoStore | undefined} [store]
 * @property {boolean} [gc=true] Disable garbage collection (default: gc=store.gc||true)
 * @property {function(Item):boolean} [gcFilter] Will be called before an Item is garbage collected. Return false to keep the Item.
 * @property {boolean} [isRoot] Whether this is a root block
 * @property {string | null} [rootName] Name of the root block
 */

/**
 * A Yjs instance handles the state of shared data.
 * @extends Observable<string>
 */
export class NanoBlock extends Observable {
  /**
   * @param {NanoBlockOpts} opts configuration
   */
  constructor (opts) {
    super()

    /**
     * @type {string | null}
     */
    this._id = opts.id ?? (opts.isRoot ? null : generateNewBlockId())

    /**
     * @type {BlockType}
     */
    this.blockType = opts.type ?? 'xmlFragment'

    /**
     * @type {Map<string, AbstractType<YEvent<any>>>}
     */
    this.share = new Map()

    /**
     * @type {StructStore}
     */
    this.structStore = new StructStore()

    /**
     * @type {NanoStore | undefined}
     */
    this.store = opts.store

    /**
     * @type {number}
     */
    this.clientID = this.store ? this.store.clientID : generateNewClientId()

    /**
     * @type {boolean} Whether to try to garbage collect
     */
    this.gc = this.store ? this.store.gc : (opts.gc ?? true)

    /**
     * @type {function(Item):boolean}
     */
    this.gcFilter = this.store ? this.store.gcFilter : (opts.gcFilter ?? (() => true))

    /**
     * @type {boolean} Whether to try to garbage collect
     */
    this.isRoot = opts.isRoot ?? false

    /**
     * @type {string | null}
     */
    this.rootName = opts.rootName ?? null

    /**
     * @type {Transaction | null}
     */
    this._transaction = null
    /**
     * @type {Array<Transaction>}
     */
    this._transactionCleanups = []

    /**
     * @type {AbstractType<any> | null}
     * @private
     */
    this._type = null

    /**
     * Referrer item
     * @type {Item & { content: ContentBlockRef } | null}
     */
    this._referrer = null

    /**
     * Previous referrer item
     * @type {Item & { content: ContentBlockRef } | null}
     */
    this._prevReferrer = null

    /**
     * @type {NanoBlock | null}
     * @private
     */
    this._rootBlock = null
  }

  get id () {
    return this._id ?? `${ROOT_NAME_ID_PREFIX}${this.rootName}`
  }

  /**
   * @param {string} newId
   */
  setId (newId) {
    if (this._id) {
      console.error('Cannot set id of block which already has an id.')
      return
    }
    this._id = newId
    if (this.store) {
      this.store.blocks.set(newId, this)
    }
  }

  /**
   * Define a shared data type.
   *
   * Multiple calls of `y.get(name, TypeConstructor)` yield the same result
   * and do not overwrite each other. I.e.
   * `y.define(name, Y.Array) === y.define(name, Y.Array)`
   *
   * After this method is called, the type is also available on `y.share.get(name)`.
   *
   * *Best Practices:*
   * Define all types right after the Yjs instance is created and store them in a separate object.
   * Also use the typed methods `getText(name)`, `getArray(name)`, ..
   *
   * @example
   *   const y = new Y(..)
   *   const appState = {
   *     document: y.getText('document')
   *     comments: y.getArray('comments')
   *   }
   *
   * @param {string} name
   * @param {Function} TypeConstructor The constructor of the type definition. E.g. Y.Text, Y.Array, Y.Map, ...
   * @return {AbstractType<any>} The created type. Constructed with TypeConstructor
   *
   * @public
   */
  get (name, TypeConstructor = AbstractType) {
    const type = map.setIfUndefined(this.share, name, () => {
      // @ts-ignore
      const t = new TypeConstructor()
      t._integrate(this, null)
      return t
    })
    const Constr = type.constructor
    if (TypeConstructor !== AbstractType && Constr !== TypeConstructor) {
      if (Constr === AbstractType) {
        // @ts-ignore
        const t = new TypeConstructor()
        t._map = type._map
        type._map.forEach(/** @param {Item?} n */ n => {
          for (; n !== null; n = n.left) {
            // @ts-ignore
            n.parent = t
          }
        })
        t._start = type._start
        for (let n = t._start; n !== null; n = n.right) {
          n.parent = t
        }
        t._length = type._length
        this.share.set(name, t)
        t._integrate(this, null)
        return t
      } else {
        throw new Error(`Type with the name ${name} has already been defined with a different constructor`)
      }
    }
    return type
  }

  /**
   * @template {AbstractType<any>} T
   * @param {string} name
   * @returns {T}
   */
  getType (name = '') {
    // @ts-ignore
    return this.get(name, getTypeConstructor(this.blockType))
  }

  /**
   * Changes that happen inside of a transaction are bundled. This means that
   * the observer fires _after_ the transaction is finished and that all changes
   * that happened inside of the transaction are sent as one message to the
   * other peers.
   *
   * @template T
   * @param {function(Transaction):T} f The function that should be executed as a transaction
   * @param {any} [origin] Origin of who started the transaction. Will be stored on transaction.origin
   * @return T
   *
   * @public
   */
  transact (f, origin = null) {
    return transact(this, f, origin)
  }

  /**
   * Return the root block of this block.
   * @returns {NanoBlock | null}
   */
  getRootBlock () {
    if (this._rootBlock) {
      return this._rootBlock
    }
    const root = this.isRoot ? this : this._referrer?.block?.getRootBlock() ?? null
    if (root) {
      this._rootBlock = root
      return root
    }
    return null
  }

  /**
   * @param {{ id?: string, isRoot?: boolean }} [opt]
   * @return {NanoBlock}
   */
  clone (opt = {}) {
    /** @type {NanoBlock} */
    let block
    if (this.store) {
      block = this.store.createBlock(this.blockType)
    } else {
      block = new NanoBlock({
        id: opt.id,
        type: this.blockType,
        gc: this.gc,
        gcFilter: this.gcFilter,
        store: this.store,
        isRoot: opt.isRoot
      })
    }
    // Apply all items to the new block
    const update = encodeStateAsUpdateV2(this)
    applyUpdateV2(block, update)
    return block
  }
}

/**
 * @param {NanoBlock} block
 * @param {ContentBlockRef | null} refItem
 */
export function updateBlockReferrer (block, refItem, updatePrev = true) {
  if (refItem === null && block._referrer) {
    block._referrer.content._block = null
    block._referrer.content._type = null
    if (updatePrev) {
      block._prevReferrer = block._referrer
    }
    block._referrer = null
  } if (refItem) {
    if (block._referrer && block._referrer !== refItem._item) {
      block._referrer.content._block = null
      block._referrer.content._type = null
      if (updatePrev) {
        block._prevReferrer = block._referrer
      }
    }
    block._referrer = refItem._item
  }
}

/**
 * @param {NanoBlock} block
 * @param {ContentBlockRef} ref
 */
export function addUnrefToBlock (block, ref) {
  const unrefArray = /** @type {YArray<any>} */(block.get('_unrefs', YArray))
  if (!ref._item) {
    return
  }
  const unref = new ContentBlockUnref({
    blockId: ref.blockId,
    refClient: ref._item.id.client,
    refClock: ref._item.id.clock
  })
  unrefArray.push([unref])
}

/**
 * @param {BlockType} type
 * @return {new() => AbstractType<any>}
 */
function getTypeConstructor (type) {
  if (type === 'array') {
    return YArray
  }
  if (type === 'map') {
    return YMap
  }
  if (type === 'text') {
    return YText
  }
  if (type === 'xmlElement') {
    return YXmlElement
  }
  if (type === 'xmlFragment') {
    return YXmlFragment
  }
  if (type === 'xmlText') {
    return YXmlText
  }
  const /** @type {never} */ _type = type
  throw new Error(`Unexpected type ${_type}`)
}

/**
 * @param {AbstractType<any>} type
 * @return {BlockType}
 */
export function getBlockTypeFromInstance (type) {
  if (type instanceof YArray) {
    return 'array'
  }
  if (type instanceof YMap) {
    return 'map'
  }
  if (type instanceof YText) {
    return 'text'
  }
  if (type instanceof YXmlElement) {
    return 'xmlElement'
  }
  if (type instanceof YXmlFragment) {
    return 'xmlFragment'
  }
  if (type instanceof YXmlText) {
    return 'xmlText'
  }
  throw new Error(`Unexpected type ${type}`)
}
