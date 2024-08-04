import {
  NanoBlock,
  generateNewClientId,
  Item, StoreTransaction, AbstractType // eslint-disable-line
} from '../internals.js'
import { Observable } from 'lib0/observable'

/**
 * @typedef {Map<string, NanoBlock>} BlockMap
 */

/**
 * @typedef {Object} NanoStoreOpts
 * @property {boolean} [NanoStoreOpts.gc=true] Disable garbage collection (default: gc=true)
 * @property {function(Item):boolean} [NanoStoreOpts.gcFilter] Will be called before an Item is garbage collected. Return false to keep the Item.
 * @property {boolean} [NanoStoreOpts.autoRef=true] Whether to automatically create a reference to a block when it is referenced.
 */

/**
 * A Yjs instance handles the state of shared data.
 * @extends Observable<string>
 */
export class NanoStore extends Observable {
  /**
   * @param {NanoStoreOpts} opts configuration
   */
  constructor ({ gc = true, gcFilter = () => true, autoRef = true } = {}) {
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
     * @type {boolean}
     */
    this.autoRef = autoRef

    /**
     * @type {BlockMap}
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
   * @param {string} rootBlockName
   * @param {import("./NanoBlock.js").BlockType} blockType
   * @returns {NanoBlock} The root type
   */
  getRootBlockOrCreate (rootBlockName, blockType) {
    let block = this.getRootBlock(rootBlockName)
    if (block === undefined) {
      block = this.setRootBlock(
        rootBlockName,
        blockType
      )
    }
    return block
  }

  /**
   * @private
   * @param {string} name
   * @param {import("./NanoBlock.js").BlockType} blockType
   * @returns {NanoBlock}
   */
  setRootBlock (name, blockType) {
    let block = this.roots.get(name)
    if (!block) {
      block = new NanoBlock({
        store: this,
        isRoot: true,
        name,
        type: blockType
      })
      this.roots.set(name, block)
      this.blocks.set(block.id, block)
      if (this._transaction) {
        this._transaction.blocksAdded.add(block)
      }
    }
    return block
  }

  /**
   * @param {string} rootBlockName
   * @returns {NanoBlock | undefined} The root type
   */
  getRootBlock (rootBlockName) {
    return this.roots.get(rootBlockName)
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
   * @param {import("./NanoBlock.js").BlockType} blockType
   * @param {string | undefined} [id]
   * @param {AbstractType<any> | undefined} [type]
   */
  createBlock (blockType, id, type) {
    const block = new NanoBlock({
      store: this,
      type: blockType,
      id
    })
    this.blocks.set(block.id, block)
    if (type) {
      block.share.set('', type)
      type._integrate(block, null)
    }
    if (this._transaction) {
      this._transaction.blocksAdded.add(block)
    }
    return block
  }

  /**
   * Create block
   * @template {import("./NanoBlock.js").BlockType} T
   * @param {T} blockType
   * @param {string | undefined} [id]
   * @return {import("./NanoBlock.js").TypeNameToTypeConstructor[T]} [type]
   */
  createBlockType (blockType, id) {
    const block = this.createBlock(blockType, id)
    return block.getType()
  }

  /**
   * @template {import("./NanoBlock.js").BlockType} T
   * @param {string} rootBlockName
   * @param {T} blockType
   * @returns {import("./NanoBlock.js").TypeNameToTypeConstructor[T]}
   */
  getOrCreateRootBlockType (rootBlockName, blockType) {
    return this.getRootBlockOrCreate(rootBlockName, blockType).getType()
  }

  destroy () {
    this.emit('destroy', [this])

    super.destroy()
  }
}
