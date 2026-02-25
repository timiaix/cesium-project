<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue'
import { useCesiumStore } from '@/stores/cesium'

const containerRef = ref<HTMLElement | null>(null)
const store = useCesiumStore()

onMounted(() => {
  if (containerRef.value) {
    store.init(containerRef.value)
  }
})

onUnmounted(() => {
  store.destroy()
})
</script>

<template>
  <div ref="containerRef" class="cesium-container" />
</template>

<style scoped>
.cesium-container {
  width: 100%;
  height: 100%;
  margin: 0;
  padding: 0;
  overflow: hidden;
}
</style>
