<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'

interface Props {
  /** 初始 x，单位 px */
  initialLeft?: number
  /** 初始 y，单位 px */
  initialTop?: number
  /** 宽度，单位 px */
  width?: number | string
  /** 高度，单位 px */
  height?: number | string
  /** 标题（可选，作为拖拽把手） */
  title?: string
}

const props = withDefaults(defineProps<Props>(), {
  initialLeft: 100,
  initialTop: 100,
  width: 280,
  height: 200,
  title: '',
})

const left = ref(props.initialLeft)
const top = ref(props.initialTop)
const isDragging = ref(false)
const dragStartX = ref(0)
const dragStartY = ref(0)
const boxStartLeft = ref(0)
const boxStartTop = ref(0)

function onPointerDown(e: MouseEvent | TouchEvent) {
  isDragging.value = true
  const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX
  const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY
  dragStartX.value = clientX
  dragStartY.value = clientY
  boxStartLeft.value = left.value
  boxStartTop.value = top.value
}

function onPointerMove(e: MouseEvent | TouchEvent) {
  if (!isDragging.value) return
  const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX
  const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY
  const dx = clientX - dragStartX.value
  const dy = clientY - dragStartY.value
  left.value = Math.max(0, boxStartLeft.value + dx)
  top.value = Math.max(0, boxStartTop.value + dy)
}

function onPointerUp() {
  isDragging.value = false
}

onMounted(() => {
  window.addEventListener('mousemove', onPointerMove)
  window.addEventListener('mouseup', onPointerUp)
  window.addEventListener('touchmove', onPointerMove, { passive: true })
  window.addEventListener('touchend', onPointerUp)
})

onUnmounted(() => {
  window.removeEventListener('mousemove', onPointerMove)
  window.removeEventListener('mouseup', onPointerUp)
  window.removeEventListener('touchmove', onPointerMove)
  window.removeEventListener('touchend', onPointerUp)
})
</script>

<template>
  <div
    class="move-box"
    :style="{
      left: `${left}px`,
      top: `${top}px`,
      width: typeof width === 'number' ? `${width}px` : width,
      height: typeof height === 'number' ? `${height}px` : height,
    }"
  >
    <div
      class="move-box__header"
      :class="{ 'move-box__header--dragging': isDragging }"
      @mousedown="onPointerDown"
      @touchstart.prevent="onPointerDown"
    >
      <span v-if="title" class="move-box__title">{{ title }}</span>
      <span v-else class="move-box__title">拖拽移动</span>
      <div class="move-box__header-right" @mousedown.stop @touchstart.stop>
        <slot name="headerRight" />
      </div>
    </div>
    <div class="move-box__body">
      <slot />
    </div>
  </div>
</template>

<style scoped>
.move-box {
  position: fixed;
  z-index: 1000;
  background: rgba(255, 255, 255, 0.96);
  border-radius: 8px;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.15);
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.move-box__header {
  padding: 10px 12px;
  background: #f5f7fa;
  border-bottom: 1px solid #e4e7ed;
  cursor: move;
  user-select: none;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.move-box__header-right {
  flex-shrink: 0;
  cursor: default;
}

.move-box__header--dragging {
  cursor: grabbing;
  background: #eef1f6;
}

.move-box__title {
  font-size: 14px;
  color: #303133;
  font-weight: 500;
}

.move-box__body {
  flex: 1;
  overflow: auto;
  padding: 12px;
}
</style>
