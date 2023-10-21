import {
  NanoBlock,
  generateNewClientId,
  Item, StoreTransaction // eslint-disable-line
} from '../internals.js'
import { Observable } from 'lib0/observable'

/**
 * @typedef {Map<string, NanoBlock>} BlockMap
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
   * @param {string} rootBlockName
   * @param {import("./NanoBlock.js").BlockType} blockType
   * @returns {NanoBlock}
   */
  setRootBlock (rootBlockName, blockType) {
    let block = this.roots.get(rootBlockName)
    if (!block) {
      block = new NanoBlock({
        store: this,
        isRoot: true,
        rootName: rootBlockName,
        type: blockType
      })
      this.roots.set(rootBlockName, block)
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
    if (this._transaction) {
      this._transaction.blocksAdded.add(block)
    }
    return block
  }

  destroy () {
    this.emit('destroy', [this])

    super.destroy()
  }
}
