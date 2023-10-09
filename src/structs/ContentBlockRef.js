import { NanoBlock, Item, Transaction, UpdateDecoderV1, UpdateDecoderV2, UpdateEncoderV1, UpdateEncoderV2, ID, StructStore, AbstractType } from '../internals.js' // eslint-disable-line

import * as error from 'lib0/error'

/**
 * @typedef {Object} ContentBlockRefOpts
 * @property {string} blockId
 * @property {import("../utils/NanoBlock.js").BlockType} blockType
 */

export class ContentBlockRef {
  /**
   * @param {NanoBlock | ContentBlockRefOpts} block
   */
  constructor (block) {
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
    this.prBlockId = ''

    /**
     * Item ID of previous referrer
     * @type {ID | null}
     */
    this.prItemId = null

    /**
     * @type {NanoBlock | null}
     */
    this._block = null

    /**
     * @type {AbstractType<any> | null}
     */
    this._type = null

    if (block instanceof NanoBlock) {
      if (block.isRoot) {
        throw new Error('This block is already a root block.')
      }
      if (block._referrer) {
        throw new Error('This block is already referred.')
      }
      this._block = block
      this._type = block.getType()

      this.blockId = block.id
      this.blockType = block.blockType

      if (block._prevReferrer) {
        // this.prBlockId = block._prevReferrer.parent.block.id
        // this.prItemId = block._prevReferrer._item?.id
      }
    } else {
      console.log('block', block)
      this.blockId = block.blockId
      this.blockType = block.blockType
    }

    /**
     * @type {Item | null}
     */
    this._item = null
  }

  /**
   *
   * @param {Transaction} transaction
   * @param {Item} item
   */
  integrate (transaction, item) {
    this._item = item
    if (transaction.storeTransaction) {
      transaction.storeTransaction.blockRefsAdded.add(this)
    }
  }

  /**
   * @param {Transaction} transaction
   */
  delete (transaction) {
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
 * @property {string} blockId
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
  }

  /**
   * @param {Transaction} transaction
   * @param {Item} item
   */
  integrate (transaction, item) {
    // Unref が作成される時には対応する Ref が削除されるので、ここでの処理は不要
    // Unref が GC されるとバックエンドでの Ref の更新ができないので、GC しないように keep フラグを立てる
    item.keep = true
  }

  /**
   * @param {Transaction} transaction
   */
  delete (transaction) {
    // if (transaction.storeTransaction) {
    //   transaction.storeTransaction.blockRefsRemoved.delete(this)
    // }
  }

  copy () {
    return new ContentBlockUnref({
      blockId: this.blockId
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

  return {
    blockId
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
