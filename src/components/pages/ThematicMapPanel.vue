<script setup lang="ts">
import { ref, onMounted, onUnmounted, nextTick } from 'vue'
import MoveBox from '@/components/MoveBox/MoveBox.vue'
import { useCesiumStore } from '@/stores/cesium'

const cesiumStore = useCesiumStore()

const mapViewerRef = ref<HTMLElement | null>(null)
const thematicTitle = ref(true)
const thematicCompass = ref(true)
const thematicGrid = ref(false)
/** 标题文字，双击可编辑 */
const titleText = ref('专题图')
const titleEditing = ref(false)
const titleInputRef = ref<HTMLInputElement | null>(null)

function startEditTitle() {
  titleEditing.value = true
  nextTick(() => titleInputRef.value?.focus())
}

function stopEditTitle() {
  titleEditing.value = false
  if (!titleText.value.trim()) titleText.value = '专题图'
}

function onClearElements() {
  cesiumStore.clearThematicGrid()
  thematicGrid.value = false
}

function onGridChange() {
  if (thematicGrid.value) {
    cesiumStore.addThematicGrid()
  } else {
    cesiumStore.clearThematicGrid()
  }
}

function exportThematicPng() {
  if (!mapViewerRef.value) return
  let v
  try {
    v = cesiumStore.getViewer()
  } catch {
    return
  }
  const glCanvas = v.scene.canvas as HTMLCanvasElement
  if (!glCanvas) return
  // 先请求一帧渲染，下一帧再截取，确保画布内容已绘制（需配合 contextOptions.preserveDrawingBuffer）
  v.scene.requestRender()
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      doExportCapture(glCanvas)
    })
  })
}

function doExportCapture(glCanvas: HTMLCanvasElement) {
  try {
    const w = 1350
    const h = 740
    const out = document.createElement('canvas')
    out.width = w
    out.height = h
    const ctx = out.getContext('2d')
    if (!ctx) return
    // 先绘制 Cesium 地图（WebGL 画布）
    ctx.drawImage(glCanvas, 0, 0, w, h)
    // 叠加标题
    if (thematicTitle.value && titleText.value) {
      ctx.fillStyle = '#fff'
      ctx.strokeStyle = 'rgba(0,0,0,0.8)'
      ctx.lineWidth = 2
      ctx.font = '600 20px sans-serif'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'top'
      const x = w / 2
      const y = 16
      ctx.strokeText(titleText.value, x, y)
      ctx.fillText(titleText.value, x, y)
    }
    // 叠加指北针
    if (thematicCompass.value) {
      const cx = w - 24 - 16
      const cy = 16 + 16
      const r = 16
      ctx.fillStyle = 'rgba(0,0,0,0.5)'
      ctx.strokeStyle = 'rgba(255,255,255,0.8)'
      ctx.lineWidth = 2
      ctx.beginPath()
      ctx.arc(cx, cy, r, 0, Math.PI * 2)
      ctx.fill()
      ctx.stroke()
      ctx.fillStyle = '#fff'
      ctx.font = '700 18px sans-serif'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText('N', cx, cy)
    }
    const link = document.createElement('a')
    link.download = `专题图_${Date.now()}.png`
    link.href = out.toDataURL('image/png')
    link.click()
  } catch (e) {
    console.error('导出专题图失败', e)
  }
}

function closePanel() {
  cesiumStore.closeThematicMap()
  // 关闭后强制刷新页面，确保三维地图容器与 Cesium 状态完全恢复
  setTimeout(() => {
    window.location.reload()
  }, 300)
}

onMounted(() => {
  nextTick(() => {
    if (mapViewerRef.value) {
      cesiumStore.openThematicMap(mapViewerRef.value)
    }
  })
})

onUnmounted(() => {
  cesiumStore.closeThematicMap()
})
</script>

<template>
  <MoveBox
    title="专题制图"
    :width="1600"
    :height="820"
    :initial-left="40"
    :initial-top="40"
  >
    <template #headerRight>
      <button
        type="button"
        class="thematic-header-close"
        aria-label="关闭"
        @click="closePanel"
      >
        ×
      </button>
    </template>
    <div class="thematic-panel">
      <div class="thematic-side">
        <div class="thematic-group">
          <div class="thematic-group-title">地图设置</div>
          <div class="thematic-actions">
            <button type="button" class="thematic-btn" @click="onClearElements">清空要素</button>
            <button type="button" class="thematic-btn" @click="exportThematicPng">导出专题图</button>
          </div>
        </div>
        <div class="thematic-group">
          <div class="thematic-group-title">要素添加</div>
          <label class="thematic-check">
            <input v-model="thematicTitle" type="checkbox" /> 标题
          </label>
          <label class="thematic-check">
            <input v-model="thematicCompass" type="checkbox" /> 指北针
          </label>
          <label class="thematic-check">
            <input v-model="thematicGrid" type="checkbox" @change="onGridChange" /> 经纬网
          </label>
        </div>
      </div>
      <div ref="mapViewerRef" class="thematic-map-viewer">
        <div
          v-show="thematicTitle"
          class="thematic-overlay thematic-title"
          @dblclick="startEditTitle"
        >
          <input
            v-if="titleEditing"
            ref="titleInputRef"
            v-model="titleText"
            type="text"
            class="thematic-title-input"
            @blur="stopEditTitle"
            @keydown.enter="stopEditTitle"
          />
          <span v-else class="thematic-title-text">{{ titleText }}</span>
        </div>
        <div v-show="thematicCompass" class="thematic-overlay thematic-compass">N</div>
      </div>
    </div>
  </MoveBox>
</template>

<style scoped>
.thematic-panel {
  display: flex;
  gap: 12px;
  height: 100%;
  min-height: 0;
}

.thematic-side {
  flex-shrink: 0;
  width: 120px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.thematic-group-title {
  font-size: 13px;
  font-weight: 600;
  color: #303133;
  margin-bottom: 8px;
}

.thematic-actions {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.thematic-check {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  cursor: pointer;
  margin-bottom: 6px;
}

.thematic-btn {
  padding: 6px 12px;
  font-size: 12px;
  border: 1px solid #dcdfe6;
  border-radius: 4px;
  background: #fff;
  cursor: pointer;
}

.thematic-btn:hover {
  background: #f5f7fa;
  border-color: #c0c4cc;
}

/* 右上角 X 关闭按钮，与 MoveBox headerRight 插槽配合 */
.thematic-header-close {
  width: 32px;
  height: 32px;
  padding: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 24px;
  line-height: 1;
  color: #606266;
  background: transparent;
  border: 1px solid #dcdfe6;
  border-radius: 4px;
  cursor: pointer;
  transition: color 0.2s, background 0.2s, border-color 0.2s;
}

.thematic-header-close:hover {
  color: #f56c6c;
  background: #fef0f0;
  border-color: #f56c6c;
}

.thematic-map-viewer {
  position: relative;
  width: 1350px;
  height: 740px;
  flex-shrink: 0;
  background: #1a1a2e;
  overflow: hidden;
}

.thematic-overlay {
  position: absolute;
  pointer-events: none;
}

.thematic-title {
  top: 16px;
  left: 50%;
  transform: translateX(-50%);
  font-size: 20px;
  font-weight: 600;
  color: #fff;
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.8);
  pointer-events: auto;
  cursor: text;
  min-width: 80px;
  text-align: center;
}

.thematic-title-text {
  user-select: none;
}

.thematic-title-input {
  width: 200px;
  padding: 2px 8px;
  font-size: 20px;
  font-weight: 600;
  color: #fff;
  background: rgba(0, 0, 0, 0.5);
  border: 1px solid rgba(255, 255, 255, 0.6);
  border-radius: 4px;
  outline: none;
  text-align: center;
}

.thematic-title-input::placeholder {
  color: rgba(255, 255, 255, 0.6);
}

.thematic-compass {
  top: 16px;
  right: 24px;
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 18px;
  font-weight: 700;
  color: #fff;
  background: rgba(0, 0, 0, 0.5);
  border-radius: 50%;
  border: 2px solid rgba(255, 255, 255, 0.8);
}
</style>
