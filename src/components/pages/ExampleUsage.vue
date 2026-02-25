<script setup lang="ts">
/**
 * 示例：在任意组件中通过 Pinia 使用 Cesium Viewer
 * 使用前需确保 CesiumMap 已挂载（viewer 已初始化）
 */
import { storeToRefs } from 'pinia'
import { useCesiumStore } from '@/stores/cesium'
import * as Cesium from 'cesium'

const cesiumStore = useCesiumStore()
const { isReady } = storeToRefs(cesiumStore)

// 通过 store.viewer 判空后使用，或使用 getViewer() 在未初始化时抛错
function flyToBeijing() {
  if (!cesiumStore.viewer) return
  cesiumStore.viewer.camera.flyTo({
    destination: Cesium.Cartesian3.fromDegrees(116.4, 39.9, 50000),
    duration: 1.5,
  })
}

function flyToShanghai() {
  const v = cesiumStore.getViewer() // 未初始化会抛错
  v.camera.flyTo({
    destination: Cesium.Cartesian3.fromDegrees(121.5, 31.2, 80000),
    duration: 1.5,
  })
}
</script>

<template>
  <div v-if="isReady" class="toolbar">
    <button type="button" @click="flyToBeijing">飞到北京</button>
    <button type="button" @click="flyToShanghai">飞到上海</button>
  </div>
</template>

<style scoped>
.toolbar {
  position: absolute;
  top: 10px;
  left: 10px;
  z-index: 1000;
}
.toolbar button {
  padding: 8px 12px;
  cursor: pointer;
  background: #fff;
  border: 1px solid #ccc;
  border-radius: 4px;
}
.toolbar button:hover {
  background: #f0f0f0;
}
</style>
