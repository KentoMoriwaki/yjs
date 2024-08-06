import { NanoBlock, Item, Transaction, UpdateDecoderV1, UpdateDecoderV2, UpdateEncoderV1, UpdateEncoderV2, ID, StructStore, AbstractType, getBlockTypeFromInstance, updateBlockReferrer, NanoStore, YMap, YArray } from '../internals.js' // eslint-disable-line

import * as error from 'lib0/error'

/**
 * @typedef {Object} ContentBlockUnrefOpts
 * @property {string} blockId target block id
 * @property {number} client client id of the ref item
 * @property {number} clock clock of the ref item
 */

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
      // FIXME: ここには来ないはず
      if (this._block._referrer && this._block._referrer !== item) {
        // Clone block and update blockId and blockType
        const newBlock = this._block.clone()
        this._block = newBlock
        this._type = newBlock.getType()
        this.blockId = newBlock.id
        this.blockType = newBlock.blockType
      }
      updateBlockReferrer(this._block, this)
    }
    transaction.storeTransaction.blockRefsAdded.add(this)
  }

  /**
   * @param {Transaction} transaction
   */
  delete (transaction) {
    if (this._block && this._block._referrer && this._block._referrer === this._item) {
      updateBlockReferrer(this._block, null)
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
  }

  getRef () {
    return 11
  }
}

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
    this.client = opts.client

    /**
     * Clock of the ref item
     * @type {number}
     */
    this.clock = opts.clock

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
      client: this.client,
      clock: this.clock
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
    encoder.writeAny({
      blockId: this.blockId,
      client: this.client,
      clock: this.clock
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
  return decoder.readAny()
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

/**
 * @param {NanoStore} store
 * @param {ContentBlockRef} ref The ref conflicted
 */
export function resolveRefConflict (store, ref) {
  if (ref._item?.deleted) return
  // Clone conflicted item
  // if the conflicted item is in map, delete it
  if (ref._item && ref._item.parentSub) {
    const key = ref._item.parentSub
    const map = /** @type {YMap<any>} */ (ref._item.parent)
    map.delete(key)
    map.set(key, cloneRef(store, ref))
  } else if (ref._item && ref._item.parentSub == null) {
    // if the conflicted item is in array, delete it
    const array = /** @type {YArray<any>} */ (ref._item.parent)
    /** @type {Item | null} */
    let item = ref._item.left
    let index = 0
    while (item !== null) {
      if (!item.deleted && item.countable) {
        index++
      }
      item = item.left
    }
    array.delete(index)
    array.insert(index, [cloneRef(store, ref)])
  }
}

/**
 * @param {NanoStore} store
 * @param {ContentBlockRef} ref
 * @return {AbstractType<any>}
 */
function cloneRef (store, ref) {
  const block = store.getBlock(ref.blockId)
  if (!block) throw new Error('Block not found')
  const type = block.getType()

  if (type instanceof YArray) {
    const newType = new YArray()
    newType.createRef = true
    let item = type._start
    while (item != null) {
      if (item.countable && !item.deleted) {
        if (item.content instanceof ContentBlockRef) {
          if (item.content._block?._referrer) {
            newType.push([cloneRef(store, item.content)])
          } else {
            const c = item.content.getContent()
            newType.push(c)
          }
        } else {
          newType.push(item.content.getContent().map(c => c instanceof AbstractType ? c.clone() : c))
        }
      }
      item = item.right
    }
    return newType
  } else if (type instanceof YMap) {
    const newType = new YMap()
    newType.createRef = true
    type._map.forEach((item, key) => {
      if (item.countable && !item.deleted) {
        if (item.content instanceof ContentBlockRef) {
          if (item.content._block?._referrer) {
            newType.set(key, cloneRef(store, item.content))
          } else {
            const c = item.content.getContent()
            newType.set(key, c[c.length - 1])
          }
        } else {
          const c = item.content.getContent()
          newType.set(key, c[c.length - 1] instanceof AbstractType ? c[c.length - 1].clone() : c[c.length - 1])
        }
      }
    })
    return newType
  } else {
    return type.clone()
  }
}
