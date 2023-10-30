import { NanoBlock, Item, Transaction, UpdateDecoderV1, UpdateDecoderV2, UpdateEncoderV1, UpdateEncoderV2, ID, StructStore, AbstractType, getBlockTypeFromInstance, updateBlockReferrer, NanoStore, YMap, YArray } from '../internals.js' // eslint-disable-line

import * as error from 'lib0/error'

/**
 * @typedef {Object} ContentBlockRefOpts
 * @property {string} blockId
 * @property {import("../utils/NanoBlock.js").BlockType} blockType
 */

export class ContentBlockRef {
  /**
   * Initialized with either a NanoBlock or a AbstractType when manipulated by the user.
   * @param {NanoBlock | AbstractType<any> | ContentBlockRefOpts} opt
   */
  constructor (opt) {
    /**
     * Block id to refer
     * @type {string}
     */
    this.blockId = ''

    /**
     * Block type
     * @type {import("../utils/NanoBlock.js").BlockType}
     */
    // @ts-ignore
    this.blockType = ''

    /**
     * Block if of previous referrer
     * @type {string}
     */
    this.prevBlockId = ''

    /**
     * Item ID of previous referrer
     * @type {ID | null}
     */
    this.prevItemId = null

    /**
     * @type {NanoBlock | null}
     */
    this._block = null

    /**
     * @type {AbstractType<any> | null}
     */
    this._type = null

    if (opt instanceof NanoBlock) {
      const block = opt
      if (block.isRoot) {
        throw new Error('This block is already a root block.')
      }
      // if (block._referrer) {
      //   throw new Error('This block is already referred.')
      // }
      this._block = block
      this._type = block.getType()

      this.blockId = block.id
      this.blockType = block.blockType
    } else if (opt instanceof AbstractType) {
      const type = opt
      const block = type.block
      if (!block && type._item?.block) {
        throw new Error("Cannot create a referrer for a type that's a child of a type already referred.")
      }
      this._type = type
      this.blockType = getBlockTypeFromInstance(type)
      if (block) {
        this._block = block
        this.blockId = block.id
      }
    } else {
      this.blockId = opt.blockId
      this.blockType = opt.blockType
    }

    /**
     * @type {Item & { content: ContentBlockRef } | null}
     */
    this._item = null
  }

  /**
   *
   * @param {Transaction} transaction
   * @param {Item & { content: ContentBlockRef }} item
   */
  integrate (transaction, item) {
    this._item = item
    if (!transaction.storeTransaction) return
    const store = transaction.storeTransaction.store
    const createdFromUpdate = !this._type
    // When this ref is created from an update, the conflict should be resolve during cleanup transcation
    if (!createdFromUpdate) {
      if (!this._block) {
        if (this.blockId) {
          this._block = store.getRootBlockOrCreate(this.blockId, this.blockType)
        } else if (this._type) {
          const newBlock = store.createBlock(this.blockType, undefined, this._type)
          this._block = newBlock
          this.blockId = newBlock.id
        } else {
          throw new Error('Cannot create block')
        }
      }
      if (this._block._referrer && this._block._referrer !== item) {
        // Clone block and update blockId and blockType
        const newBlock = this._block.clone()
        this._block = newBlock
        this._type = newBlock.getType()
        this.blockId = newBlock.id
        this.blockType = newBlock.blockType
      }
      updateBlockReferrer(this._block, this)
      if (this._block._prevReferrer && this._block._prevReferrer.block) {
        this.prevBlockId = this._block._prevReferrer.block?.id
        this.prevItemId = this._block._prevReferrer.id
      }
    }
    transaction.storeTransaction.blockRefsAdded.add(this)
  }

  /**
   * @param {Transaction} transaction
   */
  delete (transaction) {
    if (this._block && this._block._referrer && this._block._referrer === this._item) {
      this._block._prevReferrer = this._block._referrer
      this._block._referrer = null
    }
    if (transaction.storeTransaction) {
      if (transaction.storeTransaction.blockRefsAdded.has(this)) {
        transaction.storeTransaction.blockRefsAdded.delete(this)
      } else {
        transaction.storeTransaction.blockRefsRemoved.add(this)
      }
    }
  }

  /**
   * @param {StructStore} store
   */
  gc (store) { }

  getLength () {
    return 1
  }

  getContent () {
    return [this._type]
  }

  isCountable () {
    return true
  }

  copy () {
    return new ContentBlockRef({
      blockId: this.blockId,
      blockType: this.blockType
    })
  }

  /**
   * @param {number} offset
   * @return {ContentBlockRef}
   */
  splice (offset) {
    throw error.methodUnimplemented()
  }

  mergeWith () {
    return false
  }

  /**
   * @param {UpdateEncoderV1 | UpdateEncoderV2} encoder
   * @param {number} offset
   */
  write (encoder, offset) {
    encoder.writeString(this.blockId)
    encoder.writeString(this.blockType)
    // encoder.writeAny(this.opts)
  }

  getRef () {
    return 11
  }
}

/**
 * @typedef {Object} ContentBlockUnrefOpts
 * @property {string} blockId target block id
 * @property {number} refClient client id of the ref item
 * @property {number} refClock clock of the ref item
 */

export class ContentBlockUnref {
  /**
   * @param {ContentBlockUnrefOpts} opts
   */
  constructor (opts) {
    /**
     * Block id to refer
     * @type {string}
     */
    this.blockId = opts.blockId

    /**
     * Client id of the ref item
     * @type {number}
     */
    this.refClient = opts.refClient

    /**
     * Clock of the ref item
     * @type {number}
     */
    this.refClock = opts.refClock

    /**
     * @type {Item | null}
     */
    this._item = null
  }

  /**
   * @param {Transaction} transaction
   * @param {Item} item
   */
  integrate (transaction, item) {
    this._item = item
    // Unref が作成される時には対応する Ref が削除されるので、ここでの処理は不要
    // Unref が GC されるとバックエンドでの Ref の更新ができないので、GC しないように keep フラグを立てる
    item.keep = true
    if (transaction.storeTransaction) {
      transaction.storeTransaction.blockUnrefsAdded.add(this)
    }
  }

  /**
   * @param {Transaction} transaction
   */
  delete (transaction) {
  }

  copy () {
    return new ContentBlockUnref({
      blockId: this.blockId,
      refClient: this.refClient,
      refClock: this.refClock
    })
  }

  /**
   * @param {StructStore} store
   */
  gc (store) { }

  getLength () {
    return 1
  }

  getContent () {
    return [this.blockId]
  }

  isCountable () {
    return true
  }

  /**
   * @param {UpdateEncoderV1 | UpdateEncoderV2} encoder
   * @param {number} offset
   */
  write (encoder, offset) {
    encoder.writeString(this.blockId)
    encoder.writeLeftID({
      client: this.refClient,
      clock: this.refClock
    })
  }

  /**
   * @param {number} offset
   * @return {ContentBlockUnref}
   */
  splice (offset) {
    throw error.methodUnimplemented()
  }

  mergeWith () {
    return false
  }

  getRef () {
    return 12
  }
}

/**
 * @param {UpdateDecoderV1 | UpdateDecoderV2} decoder
 * @return {ContentBlockRefOpts}
 */
function createContentBlockRefFromDecoder (decoder) {
  const blockId = decoder.readString()
  /** @type {import("../utils/NanoBlock.js").BlockType} */
  // @ts-ignore
  const blockType = decoder.readString()

  return {
    blockId,
    blockType
  }
}

/**
 * @param {UpdateDecoderV1 | UpdateDecoderV2} decoder
 * @return {ContentBlockUnrefOpts}
 */
function createContentBlockUnrefFromDecoder (decoder) {
  const blockId = decoder.readString()
  const ref = decoder.readLeftID()

  return {
    blockId,
    refClient: ref.client,
    refClock: ref.clock
  }
}

/**
 * @private
 *
 * @param {UpdateDecoderV1 | UpdateDecoderV2} decoder
 * @return {ContentBlockRef}
 */
export const readContentBlockRef = decoder => new ContentBlockRef(createContentBlockRefFromDecoder(decoder))

/**
 * @private
 *
 * @param {UpdateDecoderV1 | UpdateDecoderV2} decoder
 * @return {ContentBlockUnref}
 */
export const readContentBlockUnRef = decoder => new ContentBlockUnref(createContentBlockUnrefFromDecoder(decoder))
