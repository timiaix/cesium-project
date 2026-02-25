<script setup lang="ts">
import { storeToRefs } from 'pinia'
import CesiumMap from '@/components/CesiumMap.vue'
import Toolbar from '@/components/pages/Toolbar.vue'
import TerrainProfile from '@/components/pages/TerrainProfile/TerrainProfile.vue'
import TerrainSectionChart from '@/components/pages/TerrainProfile/TerrainSectionChart.vue'
import TemperatureLegend from '@/components/pages/TemperatureLegend.vue'
import TreeTerrain from '@/components/pages/ThreeTerrain/TreeTerrain.vue'
import { useCesiumStore } from '@/stores/cesium'

const cesiumStore = useCesiumStore()
const { showTerrainProfile, showSectionChart, sectionChartData, showHHTLegend, showOceanProfile } =
  storeToRefs(cesiumStore)
</script>

<template>
  <div class="app">
    <CesiumMap class="cesium-map" />
    <Toolbar />
    <TemperatureLegend v-if="showHHTLegend" />
    <TerrainProfile v-if="showTerrainProfile" />
    <TerrainSectionChart v-if="showSectionChart" :data="sectionChartData" />
    <TreeTerrain v-if="showOceanProfile" />
  </div>
</template>

<style scoped>
.app {
  width: 100vw;
  height: 100vh;
  margin: 0;
  padding: 0;
  position: relative;
}

.cesium-map {
  width: 100%;
  height: 100%;
}
</style>
