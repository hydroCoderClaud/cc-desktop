/**
 * 消息队列管理组合式函数
 */
import { ref, computed, watch } from 'vue'

export function useMessageQueue(sessionUuidRef) {
  // API
  const {
    getQueue,
    addToQueue,
    updateQueueItem,
    deleteQueueItem,
    swapQueueOrder,
    clearQueue
  } = window.electronAPI

  // 状态
  const items = ref([])
  const loading = ref(false)
  const error = ref(null)

  // 搜索和分页
  const searchKeyword = ref('')
  const currentPage = ref(1)
  const pageSize = 10

  // 拖拽状态
  const dragItem = ref(null)
  const dragOverId = ref(null)

  // ========================================
  // Computed
  // ========================================

  /**
   * 搜索过滤后的列表
   */
  const filteredItems = computed(() => {
    if (!searchKeyword.value.trim()) {
      return items.value
    }
    const keyword = searchKeyword.value.toLowerCase()
    return items.value.filter(item =>
      item.content.toLowerCase().includes(keyword)
    )
  })

  /**
   * 总页数
   */
  const totalPages = computed(() => Math.ceil(filteredItems.value.length / pageSize) || 1)

  /**
   * 当前页的数据
   */
  const pagedItems = computed(() => {
    const start = (currentPage.value - 1) * pageSize
    const end = start + pageSize
    return filteredItems.value.slice(start, end)
  })

  // ========================================
  // 核心方法
  // ========================================

  /**
   * 加载队列
   */
  const loadQueue = async () => {
    const sessionUuid = sessionUuidRef?.value || sessionUuidRef
    if (!sessionUuid) {
      items.value = []
      return
    }

    loading.value = true
    error.value = null

    try {
      const result = await getQueue(sessionUuid)
      items.value = result || []
    } catch (err) {
      error.value = err.message
      console.error('Failed to load queue:', err)
      items.value = []
    } finally {
      loading.value = false
    }
  }

  /**
   * 添加到队列
   */
  const add = async (content) => {
    const sessionUuid = sessionUuidRef?.value || sessionUuidRef
    if (!sessionUuid || !content?.trim()) return null

    try {
      const result = await addToQueue({ sessionUuid, content: content.trim() })
      await loadQueue()
      // 跳转到最后一页
      currentPage.value = totalPages.value
      return result
    } catch (err) {
      console.error('Failed to add to queue:', err)
      throw err
    }
  }

  /**
   * 更新队列项
   */
  const update = async (id, content) => {
    if (!id || !content?.trim()) return null

    try {
      const result = await updateQueueItem({ id, content: content.trim() })
      await loadQueue()
      return result
    } catch (err) {
      console.error('Failed to update queue item:', err)
      throw err
    }
  }

  /**
   * 删除队列项
   */
  const remove = async (id) => {
    if (!id) return null

    try {
      const result = await deleteQueueItem(id)
      await loadQueue()
      // 如果当前页为空且不是第一页，回到上一页
      if (pagedItems.value.length === 0 && currentPage.value > 1) {
        currentPage.value = currentPage.value - 1
      }
      return result
    } catch (err) {
      console.error('Failed to delete queue item:', err)
      throw err
    }
  }

  /**
   * 交换顺序
   */
  const swap = async (id1, id2) => {
    if (!id1 || !id2) return null

    try {
      const result = await swapQueueOrder({ id1, id2 })
      await loadQueue()
      return result
    } catch (err) {
      console.error('Failed to swap queue order:', err)
      throw err
    }
  }

  /**
   * 清空队列
   */
  const clear = async () => {
    const sessionUuid = sessionUuidRef?.value || sessionUuidRef
    if (!sessionUuid) return null

    try {
      const result = await clearQueue(sessionUuid)
      await loadQueue()
      currentPage.value = 1
      return result
    } catch (err) {
      console.error('Failed to clear queue:', err)
      throw err
    }
  }

  // ========================================
  // 分页方法
  // ========================================

  /**
   * 跳转到指定页
   */
  const goToPage = (page) => {
    if (page >= 1 && page <= totalPages.value) {
      currentPage.value = page
    }
  }

  /**
   * 获取全局索引（用于显示序号）
   */
  const getGlobalIndex = (localIdx) => {
    return (currentPage.value - 1) * pageSize + localIdx + 1
  }

  /**
   * 刷新并跳转到最后一页
   */
  const refreshAndGoToLast = async () => {
    await loadQueue()
    currentPage.value = totalPages.value
  }

  // ========================================
  // 移动方法
  // ========================================

  /**
   * 上移
   */
  const moveUp = async (item, globalIndex) => {
    if (globalIndex <= 0) return
    const prevItem = filteredItems.value[globalIndex - 1]
    if (prevItem) {
      await swap(item.id, prevItem.id)
    }
  }

  /**
   * 下移
   */
  const moveDown = async (item, globalIndex) => {
    if (globalIndex >= filteredItems.value.length - 1) return
    const nextItem = filteredItems.value[globalIndex + 1]
    if (nextItem) {
      await swap(item.id, nextItem.id)
    }
  }

  // ========================================
  // 拖拽方法
  // ========================================

  const startDrag = (e, item, localIdx) => {
    dragItem.value = { item, globalIndex: getGlobalIndex(localIdx) - 1 }
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', item.id)
  }

  const enterDrag = (item) => {
    if (dragItem.value && dragItem.value.item.id !== item.id) {
      dragOverId.value = item.id
    }
  }

  const leaveDrag = (item) => {
    if (dragOverId.value === item.id) {
      dragOverId.value = null
    }
  }

  const drop = async (targetItem) => {
    dragOverId.value = null
    if (!dragItem.value || dragItem.value.item.id === targetItem.id) return

    await swap(dragItem.value.item.id, targetItem.id)
    dragItem.value = null
  }

  const endDrag = () => {
    dragItem.value = null
    dragOverId.value = null
  }

  // ========================================
  // Watchers
  // ========================================

  // 搜索时重置页码
  watch(searchKeyword, () => {
    currentPage.value = 1
  })

  // sessionUuid 变化时重新加载
  if (sessionUuidRef && typeof sessionUuidRef === 'object' && 'value' in sessionUuidRef) {
    watch(sessionUuidRef, async (newUuid) => {
      if (newUuid) {
        await loadQueue()
      } else {
        items.value = []
      }
    })
  }

  return {
    // 状态
    items,
    loading,
    error,
    searchKeyword,
    currentPage,
    pageSize,

    // 计算属性
    filteredItems,
    totalPages,
    pagedItems,

    // 拖拽状态
    dragItem,
    dragOverId,

    // 核心方法
    loadQueue,
    add,
    update,
    remove,
    swap,
    clear,

    // 分页方法
    goToPage,
    getGlobalIndex,
    refreshAndGoToLast,

    // 移动方法
    moveUp,
    moveDown,

    // 拖拽方法
    startDrag,
    enterDrag,
    leaveDrag,
    drop,
    endDrag
  }
}
