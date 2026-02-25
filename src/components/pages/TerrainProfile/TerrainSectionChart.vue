<template>
  <MoveBox
    class="section-chart-box"
    :width="1300"
    :height="750"
    :initial-left="400"
    :initial-top="120"
    title="剖面分析"
  >
    <div class="section-chart-close" title="关闭" @click="cesiumStore.closeSectionChart" />
    <div class="section-chart-content">
      <div class="terrain-section-chart">
        <div class="chart-group">
      <div class="chart-div">
        <div class="chart-title">地形剖面</div>
        <div ref="chartTerrainRef" class="chart-dom"></div>
      </div>
      <div v-if="hasTem" class="chart-div">
        <div class="chart-title">温度剖面</div>
        <div ref="chartTemRef" class="chart-dom"></div>
      </div>
      <div v-if="hasRho" class="chart-div">
        <div class="chart-title">密度剖面</div>
        <div ref="chartRhoRef" class="chart-dom"></div>
      </div>
      <div v-if="hasSalt" class="chart-div">
        <div class="chart-title">盐度剖面</div>
        <div ref="chartSaltRef" class="chart-dom"></div>
      </div>
    </div>
      </div>
    </div>
  </MoveBox>
</template>

<script setup lang="ts">
import { ref, watch, onBeforeUnmount, nextTick } from 'vue'
import * as echarts from 'echarts'
import MoveBox from '@/components/MoveBox/MoveBox.vue'
import { useCesiumStore } from '@/stores/cesium'

const cesiumStore = useCesiumStore()

interface LevelItem {
  level: number
  value: number[]
}

interface DataBlock {
  lat: number[]
  lon: number[]
  levelList?: LevelItem[]
  value?: number[]
}

interface SectionData {
  terrain?: DataBlock
  rho?: DataBlock
  tem?: DataBlock
  salt?: DataBlock
}

const props = defineProps<{
  data: SectionData | null
}>()

const chartTerrainRef = ref<HTMLElement | null>(null)
const chartTemRef = ref<HTMLElement | null>(null)
const chartRhoRef = ref<HTMLElement | null>(null)
const chartSaltRef = ref<HTMLElement | null>(null)

let chartTerrain: echarts.ECharts | null = null
let chartTem: echarts.ECharts | null = null
let chartRho: echarts.ECharts | null = null
let chartSalt: echarts.ECharts | null = null

const hasTem = ref(false)
const hasRho = ref(false)
const hasSalt = ref(false)

function retCoordOfStandard(lat: number, lng: number): string {
  const tmpLng = lng >= 0 ? lng.toFixed(2) + 'E' : (Math.abs(lng)).toFixed(2) + 'W'
  const tmpLat = lat >= 0 ? lat.toFixed(2) + 'N' : (Math.abs(lat)).toFixed(2) + 'S'
  return tmpLng + ',' + tmpLat
}

function getLevelList(data: DataBlock): number[] {
  if (!data.levelList) return []
  return data.levelList.map((item) => item.level)
}

function dealWithData(dataChart: DataBlock): {
  seriesData: [number, number, number | null][]
  xLabels: string[]
  yLabels: number[]
} {
  const retValue: [number, number, number | null][] = []
  const yLabels: number[] = []
  const xLabels: string[] = []
  const levelListRaw = dataChart.levelList || []
  const levelList = levelListRaw.map((item) => ({ level: item.level, value: item.value }))
  for (let i = 0; i < levelList.length; i++) {
    const level = levelList[i].level
    yLabels.push(level < 0 ? -level : level)
  }
  if (yLabels.length && yLabels[0] > yLabels[yLabels.length - 1]) {
    yLabels.reverse()
    levelList.reverse()
  }
  const lat = dataChart.lat || []
  const lon = dataChart.lon || []
  for (let i = 0; i < lat.length; i++) {
    xLabels.push(retCoordOfStandard(lat[i], lon[i]))
  }
  for (let i = 0; i < yLabels.length; i++) {
    for (let j = 0; j < xLabels.length; j++) {
      const raw = levelList[i].value[j]
      const v = raw === -9999 || raw == null ? null : Number(Number(raw).toFixed(2))
      retValue.push([j, i, v])
    }
  }
  return { seriesData: retValue, xLabels, yLabels }
}

function dealWithTerrainData(
  dataChart: DataBlock,
  levelList: number[]
): {
  seriesData: [number, number, number][]
  xLabels: string[]
  yLabels: number[]
  maxNumber: number
  minNumber: number
} {
  const retValue: [number, number, number][] = []
  const yLabels: number[] = levelList.map((l) => (l < 0 ? -l : l))
  if (yLabels[0] > yLabels[yLabels.length - 1]) yLabels.reverse()
  const lat = dataChart.lat || []
  const lon = dataChart.lon || []
  const values = dataChart.value || []
  const xLabels: string[] = []
  for (let i = 0; i < lat.length; i++) {
    xLabels.push(retCoordOfStandard(lat[i], lon[i]))
  }
  let max = 0
  for (let i = 0; i < yLabels.length; i++) {
    for (let j = 0; j < xLabels.length; j++) {
      const depthVal = values[j] != null ? Number(values[j]) : 0
      const levelVal = levelList[i] != null ? Number(levelList[i]) : 0
      const tmpV = -levelVal <= -depthVal ? i : 999
      if (tmpV !== 999 && i > max) max = i
      retValue.push([j, i, tmpV])
    }
  }
  return {
    seriesData: retValue,
    xLabels,
    yLabels,
    maxNumber: max,
    minNumber: 0,
  }
}

const COLOR_LISTS = {
  section: [
    '#4DB2F3', '#46A0E6', '#3F8ED9', '#387CCD', '#316AC0', '#2A58B3',
    '#2346A6', '#1C3499', '#15228D', '#0E107F', '#070072', '#663333',
  ],
  tem: [
    '#FFFFFF', '#006fff', '#00afff', '#00efff', '#2fffcf', '#6fff8f',
    '#afff4f', '#efff0f', '#ffcf00', '#ff8f00', '#ff4f00', '#ff0f00',
  ],
  salt: [
    '#663333', '#003eff', '#040095', '#0202f0', '#0244fa', '#018efa',
    '#04eaf7', '#05fec5', '#8cfe75', '#e7fd1f', '#ffc509', '#ff7007',
  ],
  rho: [
    '#663333', '#05cc5f', '#08b30f', '#58cc0a', '#a8e405', '#f8fd00',
    '#ffe400', '#ffc600', '#ffa800', '#ff7300', '#ff3c00', '#ff0500',
  ],
} as const

const TOOLTIP_STYLE = {
  position: 'top' as const,
  backgroundColor: '#00000090',
  textStyle: { color: '#fff' },
}

const AXIS_COMMON = {
  nameTextStyle: { color: '#ffffff', fontSize: 15 },
  axisLine: { lineStyle: { color: '#fff' } },
}

const Y_AXIS_LABEL = {
  interval: 5,
  formatter: (value: number) => Math.floor(value / 50) * 50,
  showMaxLabel: true,
}

function createHeatMapOption(
  yData: number[],
  xData: string[],
  seriesData: [number, number, number | null][] | [number, number, number][],
  valueMin: number,
  valueMax: number,
  colorList: readonly string[],
  nameStr: string,
  tooltipFormatter: (params: unknown) => string
): echarts.EChartsOption {
  return {
    tooltip: { ...TOOLTIP_STYLE, formatter: tooltipFormatter },
    grid: { height: '50%', top: '10%' },
    xAxis: {
      type: 'category',
      data: xData,
      splitArea: { show: true },
      nameLocation: 'middle',
      name: '经纬度',
      nameGap: 32,
      ...AXIS_COMMON,
      axisLabel: { showMaxLabel: true },
    },
    yAxis: {
      type: 'category',
      data: yData,
      splitArea: { show: true },
      inverse: true,
      name: '深度(m)',
      nameGap: 40,
      nameLocation: 'middle',
      ...AXIS_COMMON,
      axisLabel: Y_AXIS_LABEL,
    },
    visualMap: {
      min: valueMin,
      max: valueMax,
      calculable: true,
      realtime: false,
      left: 'right',
      bottom: 30,
      align: 'right',
      hoverLink: false,
      inRange: { color: [...colorList] },
      text: ['', 'dB(分贝)'],
      textStyle: { color: '#fff' },
      show: false,
    },
    series: [{ name: nameStr, type: 'heatmap', data: seriesData }],
  }
}

function initHeatMap(
  chart: echarts.ECharts,
  yData: number[],
  xData: string[],
  seriesData: [number, number, number | null][],
  valueMax: number,
  valueMin: number,
  colorList: readonly string[],
  nameStr: string,
  unit: string
) {
  const option = createHeatMapOption(
    yData, xData, seriesData, valueMin, valueMax, colorList, nameStr,
    (params: unknown) => {
      const p = params as { seriesName: string; data: [number, number, number | null]; name: string }
      const yIdx = p.data[1]
      const val = p.data[2]
      return (
        p.seriesName + '：' + (val != null ? val + unit : '—') + '<br/>' +
        '深度：' + (yData[yIdx] != null ? Number(yData[yIdx]).toFixed(2) : '') + 'm<br/>' +
        '经纬度：' + p.name + '<br/>'
      )
    }
  )
  chart.setOption(option, { notMerge: true })
}

function initHeatMapSection(
  chart: echarts.ECharts,
  yData: number[],
  xData: string[],
  seriesData: [number, number, number][],
  valueMax: number,
  valueMin: number,
  colorList: readonly string[],
  nameStr: string,
  _unit: string
) {
  const option = createHeatMapOption(
    yData, xData, seriesData, valueMin, valueMax, colorList, nameStr,
    (params: unknown) => {
      const p = params as { data: [number, number, number]; name: string }
      const yIdx = p.data[1]
      const isSection = p.data[2] === 999 ? '底质' : '海水'
      return (
        '类型：' + isSection + '<br/>' +
        '深度：' + (yData[yIdx] != null ? Number(yData[yIdx]).toFixed(2) : '') + 'm<br/>' +
        '经纬度：' + p.name + '<br/>'
      )
    }
  )
  chart.setOption(option, { notMerge: true })
}

function renderCharts(data: SectionData) {
  const d = data as Record<string, DataBlock>
  let tmpItem: DataBlock | null = null
  for (const key of ['rho', 'tem', 'salt']) {
    if (d[key]) {
      tmpItem = d[key]
      break
    }
  }
  const levelList = tmpItem ? getLevelList(tmpItem) : []
  const terrain = d.terrain

  const initChart = (el: HTMLElement | null, instance: echarts.ECharts | null, set: (c: echarts.ECharts) => void): echarts.ECharts | null => {
    if (!el) return null
    if (instance) instance.dispose()
    const ch = echarts.init(el)
    set(ch)
    return ch
  }

  if (terrain && chartTerrainRef.value) {
    const ch = initChart(chartTerrainRef.value, chartTerrain, (c) => { chartTerrain = c })
    if (ch) {
      const ret = dealWithTerrainData(terrain, levelList)
      initHeatMapSection(ch, ret.yLabels, ret.xLabels, ret.seriesData, ret.maxNumber, ret.minNumber, COLOR_LISTS.section, '深度', 'm')
    }
  }

  if (d.tem && chartTemRef.value) {
    const ch = initChart(chartTemRef.value, chartTem, (c) => { chartTem = c })
    if (ch) {
      const ret = dealWithData(d.tem)
      initHeatMap(ch, ret.yLabels, ret.xLabels, ret.seriesData, 36, -2, COLOR_LISTS.tem, '温度', ' ℃')
    }
  }
  if (d.salt && chartSaltRef.value) {
    const ch = initChart(chartSaltRef.value, chartSalt, (c) => { chartSalt = c })
    if (ch) {
      const ret = dealWithData(d.salt)
      initHeatMap(ch, ret.yLabels, ret.xLabels, ret.seriesData, 40, 30, COLOR_LISTS.salt, '盐度', ' PSU')
    }
  }
  if (d.rho && chartRhoRef.value) {
    const ch = initChart(chartRhoRef.value, chartRho, (c) => { chartRho = c })
    if (ch) {
      const ret = dealWithData(d.rho)
      initHeatMap(ch, ret.yLabels, ret.xLabels, ret.seriesData, 1030, 1020, COLOR_LISTS.rho, '密度', ' ρ')
    }
  }
}

watch(
  () => props.data,
  async (data: SectionData | null) => {
    if (!data) return
    const d = data as Record<string, DataBlock>
    hasTem.value = !!d.tem
    hasRho.value = !!d.rho
    hasSalt.value = !!d.salt
    await nextTick()
    renderCharts(data)
  },
  { immediate: true }
)

onBeforeUnmount(() => {
  ;[chartTerrain, chartTem, chartRho, chartSalt].forEach((c) => {
    if (c) {
      c.dispose()
    }
  })
})
</script>

<style scoped>
.section-chart-box {
  --section-bg: #1a1a2e;
  --section-close: #e0e0e0;
  --section-close-hover: #fff;
}

.section-chart-box .section-chart-content {
  height: 100%;
  overflow: hidden;
  background-color: var(--section-bg);
}

.section-chart-box :deep(.move-box__body) {
  padding: 0;
}

.section-chart-box .section-chart-close {
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
  color: var(--section-close);
  font-size: 18px;
  line-height: 1;
}
.section-chart-box .section-chart-close:hover {
  color: var(--section-close-hover);
}
.section-chart-box .section-chart-close::after {
  content: '×';
}

.terrain-section-chart {
  --section-bg: #1a1a2e;
  --section-text: #fff;
  --block-w: 600px;
  --block-h: 350px;
  --title-h: 30px;
  --dom-h: 400px;

  width: 1230px;
  min-height: 600px;
  padding: 5px;
  background-color: var(--section-bg);
}

.chart-group {
  width: 1200px;
  min-height: 600px;
  overflow: hidden;
}

.chart-div {
  width: var(--block-w);
  height: var(--block-h);
  float: left;
}

.chart-title {
  width: 100%;
  height: var(--title-h);
  float: left;
  color: var(--section-text);
  font-size: 20px;
  text-align: center;
  line-height: var(--title-h);
}

.chart-dom {
  width: var(--block-w);
  height: var(--dom-h);
}
</style>
