import { ref, watch, nextTick } from 'vue'

export function useAutoScrollToBottom({
  containerRef,
  anchorRef,
  itemsRef,
  streamingTextRef,
  isStreamingRef,
  bottomThreshold = 60,
  scrollThrottleMs = 100
}) {
  const userAtBottom = ref(true)
  let scrollMutationObserver = null
  let pendingScrollFrame = null
  let lastScrollTime = 0

  const checkIfAtBottom = () => {
    const el = containerRef.value
    if (!el) return true
    return el.scrollHeight - el.scrollTop - el.clientHeight < bottomThreshold
  }

  const onContainerScroll = () => {
    userAtBottom.value = checkIfAtBottom()
  }

  const scrollToBottom = (instant = false, force = false) => {
    if (!force && !userAtBottom.value) return

    if (pendingScrollFrame !== null) {
      cancelAnimationFrame(pendingScrollFrame)
      pendingScrollFrame = null
    }

    nextTick(() => {
      pendingScrollFrame = requestAnimationFrame(() => {
        if (anchorRef.value) {
          anchorRef.value.scrollIntoView({ behavior: instant ? 'auto' : 'smooth', block: 'end' })
        } else if (containerRef.value) {
          containerRef.value.scrollTo({
            top: containerRef.value.scrollHeight,
            behavior: instant ? 'auto' : 'smooth'
          })
        }
        userAtBottom.value = true
        pendingScrollFrame = null
      })
    })
  }

  const handleDeferredContentLoad = () => {
    scrollToBottom(true)
  }

  const startAutoScrollObservers = () => {
    const el = containerRef.value
    if (!el) return

    if (typeof MutationObserver !== 'undefined') {
      scrollMutationObserver?.disconnect()
      scrollMutationObserver = new MutationObserver(() => {
        scrollToBottom(true)
      })
      scrollMutationObserver.observe(el, {
        childList: true,
        subtree: true,
        characterData: true
      })
    }

    el.addEventListener('load', handleDeferredContentLoad, true)
  }

  const stopAutoScrollObservers = () => {
    if (pendingScrollFrame !== null) {
      cancelAnimationFrame(pendingScrollFrame)
      pendingScrollFrame = null
    }

    scrollMutationObserver?.disconnect()
    scrollMutationObserver = null

    containerRef.value?.removeEventListener('load', handleDeferredContentLoad, true)
  }

  watch(() => itemsRef.value.length, () => {
    scrollToBottom(Boolean(isStreamingRef?.value))
  })

  if (streamingTextRef) {
    watch(streamingTextRef, () => {
      if (!userAtBottom.value) return

      const now = Date.now()
      if (now - lastScrollTime >= scrollThrottleMs) {
        lastScrollTime = now
        scrollToBottom(true)
      }
    })
  }

  return {
    userAtBottom,
    checkIfAtBottom,
    onContainerScroll,
    scrollToBottom,
    startAutoScrollObservers,
    stopAutoScrollObservers
  }
}
