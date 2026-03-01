<script setup lang="ts">
import { storeToRefs } from 'pinia'
import { useCesiumStore } from '@/stores/cesium'

const cesiumStore = useCesiumStore()
const {
  showTerrainProfile,
  isDrawingRectangle,
  showHHTLegend,
  showKriging,
  showFillGrid,
  showContourLines,
  showMassPoints,
  showProfileRectangle,
  customTerrainLoaded,
  showWhiteModel,
  showBuildingTileset,
  showDrone,
  showThematicMap,
  isPickingAngleAndCoord,
} = storeToRefs(cesiumStore)

function toggleThematicMap() {
  if (showThematicMap.value) {
    cesiumStore.closeThematicMap()
  } else {
    showThematicMap.value = true
  }
}

function togglePickingAngleAndCoord() {
  if (isPickingAngleAndCoord.value) {
    cesiumStore.stopPickingAngleAndCoord()
  } else {
    cesiumStore.startPickingAngleAndCoord()
  }
}

function toggleTerrainProfile() {
  if (showTerrainProfile.value) {
    cesiumStore.closeTerrainProfile()
  } else {
    cesiumStore.openTerrainProfile()
  }
}

function onClear() {
  cesiumStore.removeHHT()
  cesiumStore.clearDrawLine()
  cesiumStore.removeWhiteModel()
  cesiumStore.removeBuildingTileset()
}
</script>

<template>
  <div class="toolbar">
    <el-button class="toolbar-btn" :type="showKriging ? 'primary' : 'default'" size="small"
      @click="cesiumStore.drawKriging">
      克里金
    </el-button>

    <el-button class="toolbar-btn" :type="showFillGrid ? 'primary' : 'default'" size="small"
      @click="showFillGrid ? cesiumStore.clearFillGrid() : cesiumStore.fillGrid()">
      栅格填值
    </el-button>
    
    <el-button class="toolbar-btn" :type="showHHTLegend ? 'primary' : 'default'" size="small"
      @click="cesiumStore.addHHT">
      水温图
    </el-button>

    <el-button
      class="toolbar-btn"
      :type="showContourLines ? 'primary' : 'default'"
      size="small"
      @click="cesiumStore.addContourLines"
    >
      等值线
    </el-button>

    <el-button class="toolbar-btn" :type="showMassPoints ? 'primary' : 'default'" size="small"
      @click="cesiumStore.addMassPoints">
      海量点
    </el-button>

    <el-button class="toolbar-btn" :type="showTerrainProfile ? 'primary' : 'default'" size="small"
      @click="toggleTerrainProfile">
      剖面分析
    </el-button>

    <el-button class="toolbar-btn" :type="isDrawingRectangle || showProfileRectangle ? 'primary' : 'default'"
      size="small" @click="cesiumStore.startDrawRectangle">
      海洋剖面
    </el-button>

    <el-button
      class="toolbar-btn"
      :type="isPickingAngleAndCoord ? 'primary' : 'default'"
      size="small"
      @click="togglePickingAngleAndCoord"
    >
      拾取当前角度和坐标
    </el-button>

    <el-button class="toolbar-btn" :type="customTerrainLoaded ? 'primary' : 'default'" size="small"
      @click="cesiumStore.loadTerrain">
      地形
    </el-button>
    <el-button
      class="toolbar-btn"
      :type="showWhiteModel ? 'primary' : 'default'"
      size="small"
      @click="cesiumStore.addWhiteModel"
    >
      添加白模
    </el-button>
    <el-button
      class="toolbar-btn"
      :type="showBuildingTileset ? 'primary' : 'default'"
      size="small"
      title="建筑位置：经度 109.51°，纬度 0°（赤道附近）"
      @click="cesiumStore.addBuildingTileset"
    >
      添加建筑
    </el-button>

    <el-button class="toolbar-btn" :type="showDrone ? 'primary' : 'default'" size="small"
      @click="showDrone ? cesiumStore.removeDrone() : cesiumStore.loadDroneOnGround()">
      无人机
    </el-button>


    <el-button
      class="toolbar-btn"
      :type="showThematicMap ? 'primary' : 'default'"
      size="small"
      @click="toggleThematicMap">
      专题地图
    </el-button>
    <el-button class="toolbar-btn" size="small" @click="onClear">清除</el-button>
  </div>
</template>

<style scoped>
.toolbar {
  position: fixed;
  top: 100px;
  right: 25px;
  width: 120px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 10px 8px;
  background: rgba(255, 255, 255, 0.95);
  border-radius: 8px;
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.15);
  z-index: 1000;

}

.toolbar-btn {
  width: 100%;
  min-width: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 36px;
  padding: 8px 12px;
  white-space: nowrap;
}

/* 覆盖 Element Plus 相邻按钮的 margin-left，工具栏为纵向排列不需要 */
.toolbar :deep(.el-button + .el-button) {
  margin-left: 0;
}
</style>
