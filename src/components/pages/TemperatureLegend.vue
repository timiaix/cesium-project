<script setup lang="ts">
/** 颜色 [r,g,b,a] 转 CSS rgba */
function toRgba(c: number[]): string {
  const [r, g, b, a] = c
  return `rgba(${r},${g},${b},${a / 255})`
}

/** 图例色条：20 个颜色，与 store/worker 的 hhtColorList 索引 1～20 一致（不含 [0,0,0,0]） */
const LEGEND_COLORS: number[][] = [
  [0, 0, 239, 255],
  [0, 64, 255, 255],
  [0, 96, 255, 255],
  [0, 128, 255, 255],
  [0, 160, 255, 255],
  [0, 192, 255, 255],
  [0, 224, 255, 255],
  [0, 255, 255, 255],
  [0, 255, 192, 255],
  [0, 255, 128, 255],
  [0, 255, 64, 255],
  [64, 255, 0, 255],
  [128, 255, 0, 255],
  [192, 255, 0, 255],
  [255, 224, 0, 255],
  [255, 192, 0, 255],
  [255, 128, 0, 255],
  [255, 64, 0, 255],
  [255, 32, 0, 255],
  [143, 0, 0, 255],
]

/** 刻度：从 -5 到 35，间隔 5 */
const tickLabels = [-5, 0, 5, 10, 15, 20, 25, 30, 35]

/** 刻度在色条下的位置：-5 最左，35 最右 */
function tickStyle(index: number): Record<string, string> {
  const n = tickLabels.length - 1
  const pct = index === 0 ? 0 : index === n ? 100 : (index / n) * 100
  const transform =
    index === 0 ? 'translateX(0)' : index === n ? 'translateX(-100%)' : 'translateX(-50%)'
  return { left: `${pct}%`, transform }
}
</script>

<template>
  <div class="temperature-legend">
    <div class="legend-row legend-title">水温 (°C)</div>
    <div class="legend-row color-bar">
      <div
        v-for="(color, i) in LEGEND_COLORS"
        :key="i"
        class="color-segment"
        :style="{ backgroundColor: toRgba(color) }"
      />
    </div>
    <div class="legend-row labels">
      <span
        v-for="(label, i) in tickLabels"
        :key="i"
        class="tick-label"
        :style="tickStyle(i)"
      >{{ label }}</span>
    </div>
  </div>
</template>

<style scoped>
.temperature-legend {
  position: fixed;
  bottom: 24px;
  left: 24px;
  z-index: 1000;
  padding: 10px 12px;
  background: rgba(255, 255, 255, 0.95);
  border-radius: 8px;
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.15);
  min-width: 250px;
}

.legend-row {
  display: flex;
  align-items: center;
}

.legend-title {
  font-size: 12px;
  color: #333;
  margin-bottom: 6px;
  font-weight: 600;
}

.color-bar {
  height: 16px;
  border-radius: 4px;
  overflow: hidden;
  display: flex;
  flex-direction: row;
  width: 100%;
}

.color-segment {
  flex: 1;
  min-width: 4px;
  height: 100%;
}

.labels {
  position: relative;
  height: 18px;
  margin-top: 4px;
}

.tick-label {
  position: absolute;
  font-size: 11px;
  color: #555;
}
</style>
