<script setup lang="ts">
import { computed } from 'vue'
import MoveBox from '@/components/MoveBox/MoveBox.vue'
import { useCesiumStore } from '@/stores/cesium'
import { storeToRefs } from 'pinia'
import * as Cesium from 'cesium'
import sectionDataJson from './sectionData.json'

const cesiumStore = useCesiumStore()
const { drawLinePoints, isDrawingLine } = storeToRefs(cesiumStore)

const sectionData = sectionDataJson as { code?: number; data?: Record<string, unknown> }

const tableData = computed(() => {
  const points = drawLinePoints.value
  return points.map((cartesian, i) => {
    const carto = Cesium.Cartographic.fromCartesian(cartesian)
    const lon = Cesium.Math.toDegrees(carto.longitude)
    const lat = Cesium.Math.toDegrees(carto.latitude)
    return { index: i + 1, longitude: lon.toFixed(6), latitude: lat.toFixed(6) }
  })
})

function close() {
  cesiumStore.closeTerrainProfile()
}

function calculate() {
  const data = sectionData?.data
  if (data) {
    cesiumStore.openSectionChart(data)
  }
}

function toggleDraw() {
  if (isDrawingLine.value) {
    cesiumStore.endDrawLine()
  } else {
    cesiumStore.startDrawLine()
  }
}

function clear() {
  cesiumStore.clearDrawLine()
}
</script>

<template>
  <MoveBox
    :width="360"
    :height="320"
    title="剖面分析"
  >
    <div class="terrain-profile__close" title="关闭" @click="close" />
    <div class="terrain-profile">
      <div class="terrain-profile__table-wrap">
        <el-table :data="tableData" border size="small">
          <el-table-column prop="index" label="序号" width="60" align="center" />
          <el-table-column prop="longitude" label="经度" min-width="100" align="center" />
          <el-table-column prop="latitude" label="纬度" min-width="100" align="center" />
        </el-table>
      </div>
      <div class="terrain-profile__actions">
        <el-button
          :type="isDrawingLine ? 'warning' : 'primary'"
          size="small"
          @click="toggleDraw"
        >
          {{ isDrawingLine ? '结束绘制' : '开始绘制' }}
        </el-button>
        <el-button size="small" type="success" @click="calculate">计算</el-button>
        <el-button size="small" @click="clear">清空</el-button>
      </div>
    </div>
  </MoveBox>
</template>

<style scoped>
.terrain-profile__close {
  position: absolute;
  top: 0;
  right: 0;
  width: 30px;
  height: 30px;
  z-index: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  color: #909399;
  font-size: 18px;
  line-height: 1;
}
.terrain-profile__close:hover {
  color: #303133;
}
.terrain-profile__close::after {
  content: '×';
}

.terrain-profile {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
}

.terrain-profile__table-wrap {
  flex: 1;
  min-height: 0;
  overflow: auto;
}

.terrain-profile__actions {
  flex-shrink: 0;
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  justify-content: center;
  padding-bottom: 5px;
  margin-top: auto;
}
</style>
