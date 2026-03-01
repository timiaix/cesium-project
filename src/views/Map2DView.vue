<script setup lang="ts">
import { ref, onMounted, onUnmounted, nextTick } from 'vue'
import Map from 'ol/Map'
import View from 'ol/View'
import TileLayer from 'ol/layer/Tile'
import XYZ from 'ol/source/XYZ'
import { fromLonLat } from 'ol/proj'

// 不显示默认的放大缩小、旋转、版权等控件，只保留左上角「返回三维地图」

const mapContainerRef = ref<HTMLElement | null>(null)
let map: Map | null = null

// ArcGIS Online 世界街道图，国内一般可访问；若不可用可改为天地图等
const ARCGIS_STREET_URL =
  'https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}'

onMounted(() => {
  nextTick(() => {
    if (!mapContainerRef.value) return
    map = new Map({
      target: mapContainerRef.value,
      controls: [],
      layers: [
        new TileLayer({
          source: new XYZ({
            url: ARCGIS_STREET_URL,
            crossOrigin: 'anonymous',
          }),
        }),
      ],
      view: new View({
        center: fromLonLat([116.4, 39.9]),
        zoom: 4,
      }),
    })
  })
})

onUnmounted(() => {
  if (map && mapContainerRef.value) {
    map.setTarget(undefined)
    map = null
  }
})
</script>

<template>
  <div class="map2d-view">
    <div ref="mapContainerRef" class="map2d-container" />
    <router-link class="map2d-link" to="/">返回三维地图</router-link>
  </div>
</template>

<style scoped>
.map2d-view {
  width: 100vw;
  height: 100vh;
  position: relative;
}

.map2d-container {
  width: 100%;
  height: 100%;
  min-height: 400px;
}

.map2d-link {
  position: absolute;
  top: 16px;
  left: 16px;
  z-index: 1000;
  padding: 8px 16px;
  background: rgba(255, 255, 255, 0.95);
  border-radius: 6px;
  color: #303133;
  text-decoration: none;
  font-size: 14px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
}

.map2d-link:hover {
  background: #fff;
  color: #409eff;
}
</style>
