import {
  StructStore,
  AbstractType, Item, NanoStore, Transaction, YArray, YMap, YText, YXmlElement, YXmlFragment, YXmlText, // eslint-disable-line
} from '../internals.js'
import * as random from 'lib0/random'
import { Observable } from 'lib0/observable'

/**
 * @typedef {{
 *   collectionName: string;
 *   documentId: string;
 *   fieldName: string;
 * }} OwnerId
 * @typedef {{
 *   root: boolean;
 *   id: string | null;
 *   owner: OwnerId;
 *   type: AbstractType<any>;
 * }} RootBlock
 * @typedef {{
 *   root: boolean;
 *   id: string;
 *   type: AbstractType<any>;
 * }} NonRootBlock
 */

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
     * @type {string}
     */
    this.id = opts.id ?? generateNewBlockId()

    /**
     * @type {BlockType}
     */
    this.blockType = opts.type ?? 'xmlFragment'

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
  }

  /**
   * @template {AbstractType<any>} T
   * @returns T
   */
  getType () {
    if (this._type) return this._type
    // Different from Doc, we knows what the type is before integration
    this._type = createType(this.blockType)
    this._type._integrate(this, null)
    return this._type
  }
}

/**
 * @param {BlockType} type
 * @return {AbstractType<any>}
 */
function createType (type) {
  if (type === 'array') {
    return new YArray()
  }
  if (type === 'map') {
    return new YMap()
  }
  if (type === 'text') {
    return new YText()
  }
  if (type === 'xmlElement') {
    return new YXmlElement()
  }
  if (type === 'xmlFragment') {
    return new YXmlFragment()
  }
  if (type === 'xmlText') {
    return new YXmlText()
  }
  const /** @type {never} */ _type = type
  throw new Error(`Unexpected type ${_type}`)
}
