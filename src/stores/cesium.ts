import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import * as Cesium from 'cesium'
import {
  Viewer,
  type Entity,
  type Cartesian3,
  Cartesian2,
  ScreenSpaceEventHandler,
  ScreenSpaceEventType,
  Color,
  CallbackProperty,
  ConstantProperty,
  type ImageryLayer,
} from 'cesium'
import kriging from '@/utils/Kring/kriging.js'
import {
  krigingCord,
  krigingCoords,
  krigingLats,
  krigingLngs,
  krigingValues,
  krigingColors,
} from '@/assets/data/krigingSample'
import { retImg, type HHTItem } from '@/utils/imageProcessor'

/** Viewer 构造选项类型（从 Cesium 推断） */
export type CesiumViewerOptions = ConstructorParameters<typeof Viewer>[1]

export const useCesiumStore = defineStore('cesium', () => {
  const viewer = ref<Viewer | null>(null)

  const isReady = computed(() => viewer.value !== null)

  /** 剖面分析面板是否显示 */
  const showTerrainProfile = ref(false)
  function openTerrainProfile(): void {
    showTerrainProfile.value = true
  }
  function closeTerrainProfile(): void {
    showTerrainProfile.value = false
  }

  /** 剖面分析图表弹窗：是否显示、数据 */
  const showSectionChart = ref(false)
  const sectionChartData = ref<Record<string, unknown> | null>(null)
  function openSectionChart(data: Record<string, unknown>): void {
    sectionChartData.value = data
    showSectionChart.value = true
  }
  function closeSectionChart(): void {
    showSectionChart.value = false
    sectionChartData.value = null
  }

  /** 海洋剖面 Three 弹窗：矩形绘制完成后打开 */
  const showOceanProfile = ref(false)
  function openOceanProfile(): void {
    showOceanProfile.value = true
  }
  function closeOceanProfile(): void {
    showOceanProfile.value = false
  }

  // ---------- 绘制线 ----------
  const isDrawingLine = ref(false)
  const drawLinePoints = ref<Cartesian3[]>([])
  const drawLinePointEntities: Entity[] = []
  /** 当前正在绘制的线（动态跟随鼠标） */
  let drawLineEntity: Entity | null = null
  /** 结束绘制后固定的线实体引用，再次开始绘制时移除 */
  let fixedLineEntity: Entity | null = null
  /** 所有已添加的线实体（含当前绘制 + 已固定），清空时统一移除 */
  const drawLineEntities: Entity[] = []
  let drawLineHandler: ScreenSpaceEventHandler | null = null
  const currentMouseCartesian = ref<Cartesian3 | null>(null)

  /** 克里金插值面实体，清除时一并移除 */
  let krigingEntity: Entity | null = null

  /** 栅格填值面实体（canvas：彩色底图 + 等经纬度权重黑色文字，按视角高度 5 级 LOD） */
  let fillGridEntity: Entity | null = null
  const showFillGrid = ref(false)
  /** 填值 LOD 用：边界、variogram、当前档位、preRender 移除函数 */
  let fillGridBounds: { minx: number; maxx: number; miny: number; maxy: number } | null = null
  let fillGridVariogram: ReturnType<typeof kriging.train> | null = null
  let fillGridLodLevel = -1
  let fillGridPreRenderRemover: (() => void) | null = null

  /** 海洋剖面矩形：第一次点击落点+预览线跟随鼠标，第二次点击固定矩形框 */
  let profileRectangleEntity: Entity | null = null
  /** 矩形黄色边框（折线，因 rectangle outline 可能不显示） */
  let profileRectangleOutlineEntity: Entity | null = null
  let drawRectangleHandler: ScreenSpaceEventHandler | null = null
  let rectangleCorner1: Cartesian3 | null = null
  const rectangleMouseCartesian = ref<Cartesian3 | null>(null)
  let rectangleCorner1PointEntity: Entity | null = null
  let rectanglePreviewPolyline: Entity | null = null
  const isDrawingRectangle = ref(false)

  /** 海量点 Primitive（PointPrimitiveCollection），清除时一并移除 */
  let massPointsPrimitive: Cesium.PointPrimitiveCollection | null = null

  /** 等值线 Primitive（PolylineCollection），解析 GeoJSON 后批量添加，清除时一并移除 */
  let contourPolylineCollection: Cesium.PolylineCollection | null = null
  /** 等值线高度标签（LabelCollection），与等值线一并清除 */
  let contourLabelCollection: Cesium.LabelCollection | null = null
  /** 等值线标签按相机高度显隐的 preRender 移除函数，清除等值线时一并移除监听 */
  let contourLabelPreRenderRemover: (() => void) | null = null

  /** 红黑图/渐变图 ImageryLayer，清除时一并移除 */
  let hhtImageryLayer: ImageryLayer | null = null

  /** 水温图图例是否显示（与 addHHT/removeHHT 同步） */
  const showHHTLegend = ref(false)

  /** 工具栏按钮 active 状态：对应功能已开启时高亮 */
  const showKriging = ref(false)
  const showContourLines = ref(false)
  const showMassPoints = ref(false)
  const showProfileRectangle = ref(false)
  const customTerrainLoaded = ref(false)
  const showWhiteModel = ref(false)
  const showBuildingTileset = ref(false)
  /** 无人机/救援船（rescueShip.glb）是否已加载并显示在地面 */
  const showDrone = ref(false)

  /** 无人机地面放置位置（仅加载测试用）：经度、纬度、高度(米) */
  let droneModel: Cesium.Model | null = null
  const DRONE_GROUND_POSITION = { longitude: 116.4, latitude: 39.9, height: 100 }

  /** 白模 GLB（public/chognqing/NoLod_0.glb），清除时可选移除 */
  let whiteModel: Cesium.Model | null = null
  /** 建筑 3D Tiles（public/building），清除时可选移除 */
  let buildingTileset: Cesium.Cesium3DTileset | null = null

  /** 拾取当前角度和坐标：右键时在 console 输出视角与经纬度 */
  const isPickingAngleAndCoord = ref(false)
  let pickAngleHandler: ScreenSpaceEventHandler | null = null

  const hhtColorList: number[][] = [
    [0, 0, 0, 0],
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
  const hhtItem: HHTItem = {
    pngUrl: '/hht/341880.0_-5.0_THETA.png',
    processedPngUrl: null,
  }

  /** 开启拾取视角与坐标：右键点击时在 console 输出相机位置、朝向及点击处经纬度 */
  function startPickingAngleAndCoord(): void {
    const v = viewer.value
    if (!v) return
    stopPickingAngleAndCoord()
    isPickingAngleAndCoord.value = true
    pickAngleHandler = new ScreenSpaceEventHandler(v.canvas)
    pickAngleHandler.setInputAction(
      (click: { position: { x: number; y: number } }) => {
        const camera = v.camera
        const pos = camera.position
        const carto = Cesium.Cartographic.fromCartesian(pos)
        const lon = Cesium.Math.toDegrees(carto.longitude)
        const lat = Cesium.Math.toDegrees(carto.latitude)
        const height = carto.height
        const heading = Cesium.Math.toDegrees(camera.heading)
        const pitch = Cesium.Math.toDegrees(camera.pitch)
        const roll = Cesium.Math.toDegrees(camera.roll)
        const ground = getCartesianFromScreen(v, click.position)
        let groundLon = ''
        let groundLat = ''
        if (ground) {
          const gCarto = Cesium.Cartographic.fromCartesian(ground)
          groundLon = Cesium.Math.toDegrees(gCarto.longitude).toFixed(6)
          groundLat = Cesium.Math.toDegrees(gCarto.latitude).toFixed(6)
        }
        console.log('=== 拾取视角与坐标 ===')
        console.log('相机位置 经度(lon):', lon, '纬度(lat):', lat, '高度(height):', height)
        console.log('视角  heading(度):', heading, 'pitch(度):', pitch, 'roll(度):', roll)
        if (groundLon && groundLat) {
          console.log('右键点击处 经度:', groundLon, '纬度:', groundLat)
        }
        console.log('可复制的初始化参数:', {
          longitude: lon,
          latitude: lat,
          height,
          heading: heading * (Math.PI / 180),
          pitch: pitch * (Math.PI / 180),
          roll: roll * (Math.PI / 180),
          groundLon: groundLon || undefined,
          groundLat: groundLat || undefined,
        })
        console.log('========================')
      },
      ScreenSpaceEventType.RIGHT_CLICK
    )
  }

  /** 关闭拾取视角与坐标 */
  function stopPickingAngleAndCoord(): void {
    const v = viewer.value
    if (pickAngleHandler && v) {
      pickAngleHandler.destroy()
      pickAngleHandler = null
    }
    isPickingAngleAndCoord.value = false
  }

  /** 从屏幕坐标获取场景中的笛卡尔坐标（地表） */
  function getCartesianFromScreen(
    v: Viewer,
    screenPosition: { x: number; y: number }
  ): Cartesian3 | null {
    const scene = v.scene
    const camera = v.camera
    const cartesian2 = new Cartesian2(screenPosition.x, screenPosition.y)
    if (scene.pickPositionSupported) {
      const cartesian = scene.pickPosition(cartesian2)
      if (cartesian) return cartesian
    }
    const ray = camera.getPickRay(cartesian2)
    if (!ray) return null
    const cartesian = scene.globe.pick(ray, scene)
    return cartesian ?? null
  }

  /** 开始绘制线：左键加点（黄色）、线跟随鼠标，右键结束；再次开始绘制时保留已有点位 */
  function startDrawLine(): void {
    const v = viewer.value
    if (!v) return
    if (fixedLineEntity) {
      v.entities.remove(fixedLineEntity)
      const idx = drawLineEntities.indexOf(fixedLineEntity)
      if (idx !== -1) drawLineEntities.splice(idx, 1)
      fixedLineEntity = null
    }
    const prevLineEntity = drawLineEntity
    endDrawLine()
    if (prevLineEntity) {
      v.entities.remove(prevLineEntity)
      const idx = drawLineEntities.indexOf(prevLineEntity)
      if (idx !== -1) drawLineEntities.splice(idx, 1)
    }
    isDrawingLine.value = true
    currentMouseCartesian.value = null

    const positionsProperty = new CallbackProperty(() => {
      const points = [...drawLinePoints.value]
      const mouse = currentMouseCartesian.value
      if (mouse) points.push(mouse)
      return points.length >= 2 ? points : []
    }, false)

    drawLineEntity = v.entities.add({
      polyline: {
        positions: positionsProperty,
        width: 3,
        material: Color.CYAN,
      },
    })
    drawLineEntities.push(drawLineEntity)

    drawLineHandler = new ScreenSpaceEventHandler(v.canvas)
    drawLineHandler.setInputAction((click: { position: { x: number; y: number } }) => {
      const cartesian = getCartesianFromScreen(v, click.position)
      if (!cartesian) return
      drawLinePoints.value.push(cartesian)
      const pointEntity = v.entities.add({
        position: cartesian,
        point: {
          pixelSize: 12,
          color: Color.YELLOW,
          outlineColor: Color.WHITE,
          outlineWidth: 2,
        },
      })
      drawLinePointEntities.push(pointEntity)
    }, ScreenSpaceEventType.LEFT_CLICK)

    drawLineHandler.setInputAction((movement: { endPosition: { x: number; y: number } }) => {
      const cartesian = getCartesianFromScreen(v, movement.endPosition)
      currentMouseCartesian.value = cartesian
    }, ScreenSpaceEventType.MOUSE_MOVE)

    drawLineHandler.setInputAction(() => {
      endDrawLine()
    }, ScreenSpaceEventType.RIGHT_CLICK)
  }

  /** 开始绘制海洋剖面矩形：左键第一次落点并显示该点，鼠标移动时矩形连线跟随，左键第二次固定矩形框 */
  function startDrawRectangle(): void {
    const v = viewer.value
    if (!v) return
    clearRectangle()
    isDrawingRectangle.value = true
    rectangleCorner1 = null
    rectangleMouseCartesian.value = null

    drawRectangleHandler = new ScreenSpaceEventHandler(v.canvas)
    drawRectangleHandler.setInputAction(
      (click: { position: { x: number; y: number } }) => {
        const cartesian = getCartesianFromScreen(v, click.position)
        if (!cartesian) return
        if (!rectangleCorner1) {
          rectangleCorner1 = cartesian
          rectangleCorner1PointEntity = v.entities.add({
            position: cartesian,
            point: {
              pixelSize: 10,
              color: Color.CYAN,
              outlineColor: Color.WHITE,
              outlineWidth: 2,
            },
          })
          rectanglePreviewPolyline = v.entities.add({
            polyline: {
              positions: new CallbackProperty(() => {
                if (!rectangleCorner1 || !rectangleMouseCartesian.value) return []
                const carto1 = Cesium.Cartographic.fromCartesian(rectangleCorner1)
                const carto2 = Cesium.Cartographic.fromCartesian(rectangleMouseCartesian.value)
                const lon1 = Cesium.Math.toDegrees(carto1.longitude)
                const lat1 = Cesium.Math.toDegrees(carto1.latitude)
                const lon2 = Cesium.Math.toDegrees(carto2.longitude)
                const lat2 = Cesium.Math.toDegrees(carto2.latitude)
                return [
                  rectangleCorner1!,
                  Cesium.Cartesian3.fromDegrees(lon2, lat1),
                  rectangleMouseCartesian.value!,
                  Cesium.Cartesian3.fromDegrees(lon1, lat2),
                  rectangleCorner1!,
                ]
              }, false),
              width: 2,
              material: Color.CYAN,
            },
          })
          return
        }
        const carto1 = Cesium.Cartographic.fromCartesian(rectangleCorner1)
        const carto2 = Cesium.Cartographic.fromCartesian(cartesian)
        const lon1 = Cesium.Math.toDegrees(carto1.longitude)
        const lat1 = Cesium.Math.toDegrees(carto1.latitude)
        const lon2 = Cesium.Math.toDegrees(carto2.longitude)
        const lat2 = Cesium.Math.toDegrees(carto2.latitude)
        const west = Math.min(lon1, lon2)
        const east = Math.max(lon1, lon2)
        const south = Math.min(lat1, lat2)
        const north = Math.max(lat1, lat2)
        if (profileRectangleEntity) {
          v.entities.remove(profileRectangleEntity)
          profileRectangleEntity = null
        }
        if (profileRectangleOutlineEntity) {
          v.entities.remove(profileRectangleOutlineEntity)
          profileRectangleOutlineEntity = null
        }
        profileRectangleEntity = v.entities.add({
          rectangle: {
            coordinates: Cesium.Rectangle.fromDegrees(west, south, east, north),
            material: Color.CYAN.withAlpha(0.2),
          },
        })
        showProfileRectangle.value = true
        const sw = Cesium.Cartesian3.fromDegrees(west, south)
        const se = Cesium.Cartesian3.fromDegrees(east, south)
        const ne = Cesium.Cartesian3.fromDegrees(east, north)
        const nw = Cesium.Cartesian3.fromDegrees(west, north)
        profileRectangleOutlineEntity = v.entities.add({
          polyline: {
            positions: [sw, se, ne, nw, sw],
            width: 3,
            material: Color.YELLOW,
          },
        })
        if (rectanglePreviewPolyline) {
          v.entities.remove(rectanglePreviewPolyline)
          rectanglePreviewPolyline = null
        }
        if (rectangleCorner1PointEntity) {
          v.entities.remove(rectangleCorner1PointEntity)
          rectangleCorner1PointEntity = null
        }
        endDrawRectangle()
        openOceanProfile()
      },
      ScreenSpaceEventType.LEFT_CLICK
    )
    drawRectangleHandler.setInputAction(
      (movement: { endPosition: { x: number; y: number } }) => {
        if (rectangleCorner1) {
          const cartesian = getCartesianFromScreen(v, movement.endPosition)
          rectangleMouseCartesian.value = cartesian
        }
      },
      ScreenSpaceEventType.MOUSE_MOVE
    )
  }

  /** 结束绘制矩形：移除事件与预览/角点，保留已固定的矩形实体 */
  function endDrawRectangle(): void {
    const v = viewer.value
    if (drawRectangleHandler && v) {
      drawRectangleHandler.destroy()
      drawRectangleHandler = null
    }
    if (rectanglePreviewPolyline && v) {
      v.entities.remove(rectanglePreviewPolyline)
      rectanglePreviewPolyline = null
    }
    if (rectangleCorner1PointEntity && v) {
      v.entities.remove(rectangleCorner1PointEntity)
      rectangleCorner1PointEntity = null
    }
    rectangleCorner1 = null
    rectangleMouseCartesian.value = null
    isDrawingRectangle.value = false
  }

  /** 移除海洋剖面矩形并结束绘制状态 */
  function clearRectangle(): void {
    const v = viewer.value
    if (!v) return
    endDrawRectangle()
    if (profileRectangleEntity) {
      v.entities.remove(profileRectangleEntity)
      profileRectangleEntity = null
    }
    if (profileRectangleOutlineEntity) {
      v.entities.remove(profileRectangleOutlineEntity)
      profileRectangleOutlineEntity = null
    }
    showProfileRectangle.value = false
  }

  /** 解析后的等值线：坐标数组 + 可选的 Contour 高度值（来自 properties.Contour） */
  type ParsedContourLine = { coords: number[][]; contour?: number }

  /** 从 GeoJSON 中提取所有 LineString 的坐标及 Contour 属性（支持 GeometryCollection / FeatureCollection） */
  function parseGeoJsonContourLineStrings(geoJson: {
    type?: string
    geometries?: { type: string; coordinates: number[][] }[]
    features?: {
      geometry?: { type: string; coordinates: number[][] }
      type?: string
      properties?: { Contour?: number }
    }[]
  }): ParsedContourLine[] {
    const lines: ParsedContourLine[] = []
    if (geoJson.type === 'GeometryCollection' && Array.isArray(geoJson.geometries)) {
      for (const g of geoJson.geometries) {
        if (g.type === 'LineString' && Array.isArray(g.coordinates) && g.coordinates.length >= 2) {
          lines.push({ coords: g.coordinates })
        }
      }
    } else if (geoJson.type === 'FeatureCollection' && Array.isArray(geoJson.features)) {
      for (const f of geoJson.features) {
        const geom = f.geometry
        if (geom?.type === 'LineString' && Array.isArray(geom.coordinates) && geom.coordinates.length >= 2) {
          const contour = f.properties?.Contour
          lines.push({
            coords: geom.coordinates,
            contour: typeof contour === 'number' ? contour : undefined,
          })
        }
      }
    }
    return lines
  }

  /** 添加等值线：解析 GeoJSON，用 PolylineCollection 绘制黄色等值线，LabelCollection 标注 Contour 高度值 */
  async function addContourLines(): Promise<void> {
    const v = viewer.value
    if (!v) return
    clearContourLines()
    try {
      const res = await fetch('/counter/Export_Output2.json')
      const geoJson = (await res.json()) as Parameters<typeof parseGeoJsonContourLineStrings>[0]
      const lines = parseGeoJsonContourLineStrings(geoJson)
      if (lines.length === 0) return
      const collection = new Cesium.PolylineCollection()
      v.scene.primitives.add(collection)
      contourPolylineCollection = collection
      const labelCollection = new Cesium.LabelCollection()
      v.scene.primitives.add(labelCollection)
      contourLabelCollection = labelCollection
      const updateLabelVisibility = () => {
        if (!contourLabelCollection) return
        const carto = Cesium.Cartographic.fromCartesian(v.camera.position)
        contourLabelCollection.show = carto.height <= 30000
      }
      updateLabelVisibility()
      contourLabelPreRenderRemover = v.scene.preRender.addEventListener(updateLabelVisibility) as () => void
      const lineMaterial = Cesium.Material.fromType('Color', { color: Cesium.Color.WHITE })
      const batchSize = 2000
      let index = 0
      const addBatch = () => {
        const end = Math.min(index + batchSize, lines.length)
        for (; index < end; index++) {
          const { coords, contour } = lines[index]
          const flat: number[] = []
          for (const c of coords) {
            flat.push(c[0], c[1], c.length > 2 ? (c[2] as number) : 0)
          }
          if (flat.length < 6) continue
          const positions = Cesium.Cartesian3.fromDegreesArrayHeights(flat)
          if (positions.length >= 2) {
            collection.add({
              positions,
              width: 2,
              material: lineMaterial,
            })
            if (contour != null) {
              const mid = Math.floor(coords.length / 2)
              const p = coords[mid]
              const labelPosition = Cesium.Cartesian3.fromDegrees(p[0], p[1], p.length > 2 ? (p[2] as number) : 0)
              labelCollection.add({
                position: labelPosition,
                text: String(contour),
                fillColor: Cesium.Color.YELLOW,
                outlineColor: Cesium.Color.BLACK,
                outlineWidth: 2,
                style: Cesium.LabelStyle.FILL_AND_OUTLINE,
                verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
                pixelOffset: new Cesium.Cartesian2(0, -20),
                scaleByDistance: new Cesium.NearFarScalar(1000, 1, 120000, 0),
              })
            }
          }
        }
        if (index < lines.length) {
          requestAnimationFrame(addBatch)
        } else {
          showContourLines.value = true
        }
      }
      addBatch()
    } catch (e) {
      console.error('加载等值线失败:', e)
    }
  }

  /** 移除等值线 PolylineCollection 及高度标签 LabelCollection */
  function clearContourLines(): void {
    const v = viewer.value
    if (!v) return
    if (contourLabelPreRenderRemover) {
      contourLabelPreRenderRemover()
      contourLabelPreRenderRemover = null
    }
    if (contourPolylineCollection) {
      v.scene.primitives.remove(contourPolylineCollection)
      contourPolylineCollection = null
    }
    if (contourLabelCollection) {
      v.scene.primitives.remove(contourLabelCollection)
      contourLabelCollection = null
    }
    showContourLines.value = false
  }

  /** 清空绘制：移除所有点、线、克里金面、海量点、红黑图、海洋剖面矩形、等值线并结束绘制，表格数据同步清空 */
  function clearDrawLine(): void {
    const v = viewer.value
    if (!v) return
    removeHHT()
    clearMassPoints()
    clearContourLines()
    clearRectangle()
    if (krigingEntity) {
      v.entities.remove(krigingEntity)
      krigingEntity = null
    }
    clearFillGrid()
    drawLineEntity = null
    fixedLineEntity = null
    endDrawLine()
    for (const e of drawLineEntities) {
      v.entities.remove(e)
    }
    drawLineEntities.length = 0
    for (const e of drawLinePointEntities) {
      v.entities.remove(e)
    }
    drawLinePointEntities.length = 0
    drawLinePoints.value = []
    showKriging.value = false
    showMassPoints.value = false
    showProfileRectangle.value = false
    showContourLines.value = false
  }

  /** 结束绘制线：移除事件，固定线（不再跟随鼠标） */
  function endDrawLine(): void {
    const v = viewer.value
    if (drawLineHandler && v) {
      drawLineHandler.destroy()
      drawLineHandler = null
    }
    if (drawLineEntity && v) {
      const fixedPositions = [...drawLinePoints.value]
      if (fixedPositions.length >= 2) {
        ;(drawLineEntity.polyline as { positions: unknown }).positions =
          new ConstantProperty(fixedPositions)
        fixedLineEntity = drawLineEntity
      } else {
        v.entities.remove(drawLineEntity)
      }
      drawLineEntity = null
    }
    currentMouseCartesian.value = null
    isDrawingLine.value = false
  }

  /**
   * 绘制克里金插值面（数据来自 @/assets/data/krigingSample）
   * 点击清除会一并移除该面
   */
  function drawKriging(): void {
    const v = viewer.value
    if (!v) return
    if (krigingValues.length < 4) return
    if (krigingEntity) {
      v.entities.remove(krigingEntity)
      krigingEntity = null
    }
    const positions = Cesium.Cartesian3.fromDegreesArray(krigingCoords)
    const poly = Cesium.Rectangle.fromCartesianArray(positions)
    const minx = Cesium.Math.toDegrees(poly.west)
    const miny = Cesium.Math.toDegrees(poly.south)
    const maxx = Cesium.Math.toDegrees(poly.east)
    const maxy = Cesium.Math.toDegrees(poly.north)
    const variogram = kriging.train(krigingValues, krigingLngs, krigingLats, 'exponential', 0, 100)
    const grid = kriging.grid(krigingCord, variogram, (maxy - miny) / 1000)
    const canvas = document.createElement('canvas')
    canvas.width = 1024
    canvas.height = 1024
    canvas.style.display = 'block'
    const ctx = canvas.getContext('2d')
    if (ctx) ctx.globalAlpha = 0.75
    kriging.plot(canvas, grid, [minx, maxx], [miny, maxy], krigingColors)
    krigingEntity = v.entities.add({
      polygon: {
        hierarchy: new Cesium.PolygonHierarchy(Cesium.Cartesian3.fromDegreesArray(krigingCoords)),
        material: new Cesium.ImageMaterialProperty({ image: canvas }),
      },
    })
    showKriging.value = true
    v.zoomTo(krigingEntity, new Cesium.HeadingPitchRange(0, Cesium.Math.toRadians(-45), 0))
  }

  /** 仅清除克里金插值面（绘制线、点不受影响） */
  function clearKriging(): void {
    const v = viewer.value
    if (!v) return
    if (krigingEntity) {
      v.entities.remove(krigingEntity)
      krigingEntity = null
    }
    showKriging.value = false
  }

  /** 根据相机高度（米）返回栅格填值 LOD 档位 0～4，越高视角值越少（越粗） */
  function getFillGridLodLevel(cameraHeight: number): number {
    if (cameraHeight > 400000) return 0
    if (cameraHeight > 200000) return 1
    if (cameraHeight > 100000) return 2
    return 3
  }

  /**
   * 第 level 档对应的格网间隔：以「纬度方向跨度 rangeY 的等分分母」为间隔依据。
   * 间隔 = rangeY / div。分母越小间隔越大、文字越疏。整体缩小分母使放大后仍不致过密。
   */
  const FILL_GRID_LOD_DIVISORS = [5, 10, 18, 26, 34]

  function getFillGridWidthForLevel(level: number, rangeY: number): number {
    const div = FILL_GRID_LOD_DIVISORS[Math.min(level, FILL_GRID_LOD_DIVISORS.length - 1)]
    return rangeY / div
  }

  /** 各 LOD 档位对应的文字字号：放大（档位高）稍小，缩小（档位低）稍大便于远看 */
  const FILL_GRID_FONT_SIZES = [22, 20, 17, 15, 13]

  /**
   * 在已有 kriging 底图的 canvas 上，在栅格中心填入黑色文字（权重值）
   * 每个格子取中心点 (i+0.5, j+0.5)*width 作为文字位置；lodLevel 用于选字号（放大时稍小）
   */
  function drawGridValueLabels(
    ctx: CanvasRenderingContext2D,
    grid: number[][] & { xlim: [number, number]; ylim: [number, number]; width: number },
    xlim: [number, number],
    ylim: [number, number],
    w: number,
    h: number,
    lodLevel: number
  ): void {
    const rangeX = xlim[1] - xlim[0]
    const rangeY = ylim[1] - ylim[0]
    const n = grid.length
    const m = grid[0]?.length ?? 0
    if (n === 0 || m === 0) return
    const maxLabels = 14
    const stepI = Math.max(1, Math.floor(n / maxLabels))
    const stepJ = Math.max(1, Math.floor(m / maxLabels))
    const fontSize = FILL_GRID_FONT_SIZES[Math.min(lodLevel, FILL_GRID_FONT_SIZES.length - 1)]
    ctx.fillStyle = '#000000'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.font = `${fontSize}px sans-serif`
    for (let i = 0; i < n; i += stepI) {
      for (let j = 0; j < m; j += stepJ) {
        const val = grid[i][j]
        if (val === undefined || typeof val !== 'number') continue
        // 画在栅格单元中心：(i+0.5, j+0.5) 对应的经纬度
        const lng = grid.xlim[0] + (i + 0.5) * grid.width
        const lat = grid.ylim[0] + (j + 0.5) * grid.width
        const px = ((lng - xlim[0]) / rangeX) * w
        const py = ((ylim[1] - lat) / rangeY) * h
        if (px < 0 || px > w || py < 0 || py > h) continue
        ctx.fillText(Number(val).toFixed(1), px, py)
      }
    }
  }

  /**
   * 绘制指定 LOD 档位的栅格填值 canvas（彩色底图 + 黑色权重文字）
   */
  function drawFillGridCanvas(lodLevel: number): HTMLCanvasElement | null {
    if (!fillGridBounds || !fillGridVariogram) return null
    const { minx, maxx, miny, maxy } = fillGridBounds
    const xlim: [number, number] = [minx, maxx]
    const ylim: [number, number] = [miny, maxy]
    const rangeY = maxy - miny
    const width = getFillGridWidthForLevel(lodLevel, rangeY)
    const grid = kriging.grid(krigingCord, fillGridVariogram, width) as number[][] & {
      xlim: [number, number]
      ylim: [number, number]
      width: number
    }
    if (!grid || !grid.xlim || !grid.ylim) return null
    const canvas = document.createElement('canvas')
    const cw = 1024
    const ch = 1024
    canvas.width = cw
    canvas.height = ch
    canvas.style.display = 'block'
    const ctx = canvas.getContext('2d')
    if (!ctx) return null
    ctx.globalAlpha = 0.85
    kriging.plot(canvas, grid, xlim, ylim, krigingColors)
    ctx.globalAlpha = 1
    drawGridValueLabels(ctx, grid, xlim, ylim, cw, ch, lodLevel)
    return canvas
  }

  /**
   * 栅格填值：根据克里金 grid 反算等经度纬度的权重值，在 canvas 上先绘彩色底图再填入黑色文字，渲染到地图
   * 按视角高度分 5 级 LOD：高度越高加载的值越少，高度越低加载的值越多
   */
  function fillGrid(): void {
    const v = viewer.value
    if (!v) return
    if (krigingValues.length < 4) return
    clearFillGrid()
    const positions = Cesium.Cartesian3.fromDegreesArray(krigingCoords)
    const poly = Cesium.Rectangle.fromCartesianArray(positions)
    const minx = Cesium.Math.toDegrees(poly.west)
    const miny = Cesium.Math.toDegrees(poly.south)
    const maxx = Cesium.Math.toDegrees(poly.east)
    const maxy = Cesium.Math.toDegrees(poly.north)
    fillGridBounds = { minx, maxx, miny, maxy }
    fillGridVariogram = kriging.train(krigingValues, krigingLngs, krigingLats, 'exponential', 0, 100)
    const cam = v.camera
    const height = cam.positionCartographic.height
    fillGridLodLevel = getFillGridLodLevel(height)
    const canvas = drawFillGridCanvas(fillGridLodLevel)
    if (!canvas) return
    fillGridEntity = v.entities.add({
      polygon: {
        hierarchy: new Cesium.PolygonHierarchy(Cesium.Cartesian3.fromDegreesArray(krigingCoords)),
        material: new Cesium.ImageMaterialProperty({ image: canvas }),
      },
    })
    showFillGrid.value = true
    v.zoomTo(fillGridEntity, new Cesium.HeadingPitchRange(0, Cesium.Math.toRadians(-45), 0))

    const removeListener = v.scene.preRender.addEventListener(() => {
      if (!fillGridEntity || !fillGridBounds || !fillGridVariogram) return
      const h = v.camera.positionCartographic.height
      const level = getFillGridLodLevel(h)
      if (level === fillGridLodLevel) return
      fillGridLodLevel = level
      const newCanvas = drawFillGridCanvas(level)
      if (!newCanvas) return
      ;(fillGridEntity.polygon!.material as Cesium.ImageMaterialProperty).image =
        new ConstantProperty(newCanvas)
    })
    fillGridPreRenderRemover = () => {
      ;(removeListener as () => void)()
      fillGridPreRenderRemover = null
    }
  }

  function clearFillGrid(): void {
    const v = viewer.value
    if (fillGridPreRenderRemover) {
      fillGridPreRenderRemover()
      fillGridPreRenderRemover = null
    }
    if (v && fillGridEntity) {
      v.entities.remove(fillGridEntity)
      fillGridEntity = null
    }
    fillGridBounds = null
    fillGridVariogram = null
    fillGridLodLevel = -1
    showFillGrid.value = false
  }

  /** 海量点 JSON 单条数据 */
  interface GlobalPointItem {
    lat: number
    lng: number
    value: number
  }

  /** value 0-100 映射到 hhtColorList 索引 1～20（跳过 0 的黑色），返回 Cesium.Color */
  function valueToColor(value: number): Cesium.Color {
    const t = Math.max(0, Math.min(100, value)) / 100
    const idx = Math.min(Math.floor(t * 20), 19)
    const [r, g, b, a] = hhtColorList[idx + 1]
    return Cesium.Color.fromBytes(r, g, b, a)
  }

  /**
   * 加载海量点：从 /json/global_points.json 读取约 10 万点，用 PointPrimitiveCollection 加载
   * 根据 value 0-100 用 hhtColorList 色带着色（不含黑色）
   */
  async function addMassPoints(): Promise<void> {
    const v = viewer.value
    if (!v) return
    clearMassPoints()
    try {
      const res = await fetch('/json/global_points.json')
      const points = (await res.json()) as GlobalPointItem[]
      if (!Array.isArray(points) || points.length === 0) return
      const collection = new Cesium.PointPrimitiveCollection()
      v.scene.primitives.add(collection)
      massPointsPrimitive = collection
      showMassPoints.value = true
      let minLon = Infinity
      let maxLon = -Infinity
      let minLat = Infinity
      let maxLat = -Infinity
      for (const p of points) {
        if (p.lng < minLon) minLon = p.lng
        if (p.lng > maxLon) maxLon = p.lng
        if (p.lat < minLat) minLat = p.lat
        if (p.lat > maxLat) maxLat = p.lat
        collection.add({
          position: Cesium.Cartesian3.fromDegrees(p.lng, p.lat),
          pixelSize: 4,
          color: valueToColor(p.value),
          outlineColor: Color.WHITE,
          outlineWidth: 1,
        })
      }
      const centerLon = (minLon + maxLon) / 2
      const centerLat = (minLat + maxLat) / 2
      const radius = Math.max(
        Cesium.Cartesian3.distance(
          Cesium.Cartesian3.fromDegrees(minLon, centerLat),
          Cesium.Cartesian3.fromDegrees(maxLon, centerLat)
        ),
        Cesium.Cartesian3.distance(
          Cesium.Cartesian3.fromDegrees(centerLon, minLat),
          Cesium.Cartesian3.fromDegrees(centerLon, maxLat)
        )
      ) / 2
      const boundingSphere = new Cesium.BoundingSphere(
        Cesium.Cartesian3.fromDegrees(centerLon, centerLat),
        radius
      )
      v.camera.flyToBoundingSphere(boundingSphere, { duration: 0.5 })
    } catch (e) {
      console.error('加载海量点失败:', e)
    }
  }

  /** 移除海量点 PointPrimitiveCollection */
  function clearMassPoints(): void {
    const v = viewer.value
    if (!v || !massPointsPrimitive) return
    v.scene.primitives.remove(massPointsPrimitive)
    massPointsPrimitive = null
    showMassPoints.value = false
  }

  /** 添加渐变图图层（SingleTileImageryProvider） */
  async function addHHT(): Promise<void> {
    const v = viewer.value
    if (!v) return
    removeHHT()
    const rectangle = Cesium.Rectangle.fromDegrees(
      -180,
      -85.0511 + 5,
      180,
      85.0511 + 5
    )
    const result = await retImg(hhtItem, hhtColorList)
    if (!result) return
    const redBlackImagery = new Cesium.SingleTileImageryProvider({
      url: result.url,
      rectangle,
      tileWidth: result.width,
      tileHeight: result.height,
    })
    hhtImageryLayer = v.imageryLayers.addImageryProvider(redBlackImagery)
    showHHTLegend.value = true
  }

  /** 移除渐变图图层，并隐藏图例（无论是否有图层都隐藏图例） */
  function removeHHT(): void {
    showHHTLegend.value = false
    const v = viewer.value
    if (!v) return
    const layers = v.scene.globe.imageryLayers
    console.log("layers", layers)
    // 1. 有引用时先按引用移除
    // if (hhtImageryLayer) {
    //   const removed = layers.remove(hhtImageryLayer)
    //   hhtImageryLayer = null
    //   if (removed) return
    // }
    // 2. 引用丢失或 remove 未生效时：遍历移除 SingleTileImageryProvider（水温图）图层
    for (let i = layers.length - 1; i >= 0; i--) {
      const layer = layers.get(i)
      const provider = layer?.imageryProvider
      if (provider && provider instanceof Cesium.SingleTileImageryProvider) {
        layers.remove(layer)
        break
      }
    }
  }

  /** 地形加载后的默认视角（拾取得到的初始化参数） */
  const terrainInitView = {
    longitude: 99.34649252697416,
    latitude: 28.189871074182598,
    height: 3366.8346893664807,
    heading: 1.8864740459361062,
    pitch: -0.0947428640968444,
    roll: 0.00011163176638806505,
  }

  /** 使用 CesiumTerrainProvider 加载本地地形，并 flyTo 到指定视角 */
  async function loadTerrain(): Promise<void> {
    const v = viewer.value
    if (!v) return
    try {
      const provider = await Cesium.CesiumTerrainProvider.fromUrl('/yn4/', {
        requestVertexNormals: true,
      })
      v.scene.terrainProvider = provider
      customTerrainLoaded.value = true
      const dest = Cesium.Cartesian3.fromDegrees(
        terrainInitView.longitude,
        terrainInitView.latitude,
        terrainInitView.height
      )
      v.camera.flyTo({
        destination: dest,
        orientation: {
          heading: terrainInitView.heading,
          pitch: terrainInitView.pitch,
          roll: terrainInitView.roll,
        },
        duration: 1.5,
      })
    } catch (e) {
      console.error('加载地形失败:', e)
    }
  }

  /** 重庆白模在 tileset 中的根变换（列主序 4×4），用于定位 GLB */
  const whiteModelRootTransform: number[] = [
    -0.9584426947127195, -0.2852851222055242, 0, 0,
    0.140742360806828, -0.472837442447302, 0.8698369622489122, 0,
    -0.24815154407406284, 0.8336888820585733, 0.4933392941025324, 0,
    -1584035.221408833, 5321718.056622663, 3128069.9261036036, 1,
  ]

  /** 添加白模：加载 public/chognqing/NoLod_0.glb，白模显示并 flyTo */
  async function addWhiteModel(): Promise<void> {
    const v = viewer.value
    if (!v) return
    if (whiteModel) {
      if (whiteModel.ready) {
        v.camera.flyToBoundingSphere(whiteModel.boundingSphere, { duration: 1.5 })
      }
      return
    }
    try {
      const baseMatrix = Cesium.Matrix4.fromArray(whiteModelRootTransform)
      const translation = new Cesium.Cartesian3(
        whiteModelRootTransform[12],
        whiteModelRootTransform[13],
        whiteModelRootTransform[14]
      )
      const upAxis = Cesium.Cartesian3.normalize(translation, new Cesium.Cartesian3())
      const quat = Cesium.Quaternion.fromAxisAngle(upAxis, -Math.PI / 2)
      const rotate90CW = Cesium.Matrix4.fromRotationTranslation(
        Cesium.Matrix3.fromQuaternion(quat),
        Cesium.Cartesian3.ZERO
      )
      const modelMatrix = Cesium.Matrix4.multiply(rotate90CW, baseMatrix, new Cesium.Matrix4())
      const model = await Cesium.Model.fromGltfAsync({
        url: '/chongqing/NoLod_0.glb',
        modelMatrix,
        color: Cesium.Color.WHITE,
        colorBlendMode: Cesium.ColorBlendMode.REPLACE,
      })
      v.scene.primitives.add(model)
      whiteModel = model
      showWhiteModel.value = true
      const flyWhenReady = () => {
        v.camera.flyToBoundingSphere(model.boundingSphere, { duration: 1.5 })
      }
      if (model.ready) {
        flyWhenReady()
      } else {
        model.readyEvent.addEventListener(flyWhenReady)
      }
    } catch (e) {
      console.error('加载白模失败:', e)
    }
  }

  /** 移除白模 */
  function removeWhiteModel(): void {
    const v = viewer.value
    if (!v || !whiteModel) return
    v.scene.primitives.remove(whiteModel)
    whiteModel = null
    showWhiteModel.value = false
  }

  /** 建筑加载后的初始视角（含 heading/pitch/roll） */
  const buildingInitView = {
    longitude: 109.51398472532216,
    latitude: -0.00016921790447022985,
    height: 17.77340213142646,
    heading: 4.895188977826655,
    pitch: -0.2548281261563783,
    roll: 0.0000012519929777354832,
  }

  /** 飞到建筑初始视角 */
  function flyToBuildingView(): void {
    const v = viewer.value
    if (!v) return
    const dest = Cesium.Cartesian3.fromDegrees(
      buildingInitView.longitude,
      buildingInitView.latitude,
      buildingInitView.height
    )
    v.camera.flyTo({
      destination: dest,
      orientation: {
        heading: buildingInitView.heading,
        pitch: buildingInitView.pitch,
        roll: buildingInitView.roll,
      },
      duration: 1.5,
    })
  }

  /** 添加建筑：加载 public/building 的 3D Tiles，并 flyTo 到建筑初始视角 */
  async function addBuildingTileset(): Promise<void> {
    const v = viewer.value
    if (!v) return
    if (buildingTileset) {
      flyToBuildingView()
      return
    }
    try {
      const tileset = await Cesium.Cesium3DTileset.fromUrl('/building/tileset.json')
      v.scene.primitives.add(tileset)
      buildingTileset = tileset
      showBuildingTileset.value = true
      flyToBuildingView()
    } catch (e) {
      console.error('加载建筑 3D Tiles 失败:', e)
    }
  }

  /** 移除建筑 3D Tiles */
  function removeBuildingTileset(): void {
    const v = viewer.value
    if (!v || !buildingTileset) return
    v.scene.primitives.remove(buildingTileset)
    buildingTileset = null
    showBuildingTileset.value = false
  }

  /**
   * 加载 rescueShip.glb 并固定放在地面位置，相机定位过去（用于验证模型能否正常加载）
   */
  async function loadDroneOnGround(): Promise<void> {
    const v = viewer.value
    if (!v) return
    const pos = Cesium.Cartesian3.fromDegrees(
      DRONE_GROUND_POSITION.longitude,
      DRONE_GROUND_POSITION.latitude,
      DRONE_GROUND_POSITION.height
    )
    if (droneModel) {
      v.camera.flyToBoundingSphere(new Cesium.BoundingSphere(pos, 500), {
        duration: 1.5,
        offset: new Cesium.HeadingPitchRange(0, Cesium.Math.toRadians(-30), 800),
      })
      return
    }
    try {
      const model = await Cesium.Model.fromGltfAsync({
        url: '/models/Duck.glb',
        minimumPixelSize: 128,
        maximumScale: 500,
      })
      model.modelMatrix = Cesium.Matrix4.fromTranslation(pos)
      v.scene.primitives.add(model)
      droneModel = model
      showDrone.value = true
      v.camera.flyToBoundingSphere(new Cesium.BoundingSphere(pos, 500), {
        duration: 1.5,
        offset: new Cesium.HeadingPitchRange(0, Cesium.Math.toRadians(-30), 800),
      })
    } catch (e) {
      console.error('rescueShip.glb 加载失败:', e)
    }
  }

  function removeDrone(): void {
    const v = viewer.value
    if (v && droneModel) {
      v.scene.primitives.remove(droneModel)
      droneModel = null
    }
    showDrone.value = false
  }

  // ---------- 热力图 ----------
  const showHeatmap = ref(false)
  let heatmapImageryLayer: ImageryLayer | null = null

  /** 热力图示例数据：经度、纬度、权重（如人口/密度），可替换为真实数据 */
  const HEATMAP_BOUNDS = { west: 100, south: 20, east: 120, north: 45 }
  const HEATMAP_DATA: { lon: number; lat: number; value: number }[] = [
    { lon: 116.4, lat: 39.9, value: 95 },
    { lon: 121.5, lat: 31.2, value: 98 },
    { lon: 113.3, lat: 23.1, value: 88 },
    { lon: 114.1, lat: 22.5, value: 82 },
    { lon: 108.9, lat: 34.3, value: 65 },
    { lon: 104.1, lat: 30.7, value: 72 },
    { lon: 118.8, lat: 32.0, value: 78 },
    { lon: 112.9, lat: 28.2, value: 58 },
    { lon: 117.2, lat: 31.8, value: 68 },
    { lon: 106.5, lat: 29.6, value: 75 },
    { lon: 115.9, lat: 28.7, value: 62 },
    { lon: 119.3, lat: 26.1, value: 55 },
    { lon: 110.3, lat: 20.0, value: 48 },
    { lon: 102.7, lat: 25.0, value: 52 },
    { lon: 117.0, lat: 36.7, value: 70 },
    { lon: 113.6, lat: 34.7, value: 60 },
    { lon: 108.4, lat: 22.8, value: 45 },
    { lon: 103.8, lat: 36.0, value: 58 },
    { lon: 116.0, lat: 38.0, value: 85 },
    { lon: 120.2, lat: 30.3, value: 90 },
    { lon: 109.5, lat: 18.2, value: 42 },
    { lon: 114.3, lat: 30.6, value: 76 },
    { lon: 106.9, lat: 27.7, value: 54 },
    { lon: 101.7, lat: 26.6, value: 50 },
    { lon: 117.8, lat: 33.6, value: 72 },
    { lon: 115.0, lat: 32.5, value: 68 },
    { lon: 111.0, lat: 34.5, value: 55 },
    { lon: 105.9, lat: 21.0, value: 38 },
    { lon: 119.5, lat: 26.5, value: 65 },
    { lon: 113.0, lat: 28.2, value: 70 },
    { lon: 116.5, lat: 40.2, value: 60 },
    { lon: 121.0, lat: 31.5, value: 92 },
    { lon: 109.0, lat: 34.2, value: 52 },
    { lon: 104.6, lat: 31.0, value: 66 },
    { lon: 117.5, lat: 39.0, value: 78 },
    { lon: 112.5, lat: 37.8, value: 58 },
    { lon: 118.0, lat: 24.5, value: 48 },
    { lon: 106.0, lat: 26.5, value: 55 },
    { lon: 115.5, lat: 38.9, value: 72 },
    { lon: 110.8, lat: 32.0, value: 62 },
  ]

  /** 将强度 0~1 映射为半透明蓝-绿-红渐变；无数据（t≈0）为完全透明 */
  function heatmapColor(t: number): { r: number; g: number; b: number; a: number } {
    if (t <= 0) return { r: 0, g: 0, b: 0, a: 0 }
    const a = 0.7
    if (t <= 0.33) {
      const s = t / 0.33
      return { r: 0, g: Math.round(s * 255), b: 255, a }
    }
    if (t <= 0.66) {
      const s = (t - 0.33) / 0.33
      return { r: Math.round(s * 255), g: 255, b: Math.round((1 - s) * 255), a }
    }
    const s = (t - 0.66) / 0.34
    return { r: 255, g: Math.round((1 - s) * 255), b: 0, a }
  }

  const HEATMAP_SIZE = 1024
  function createHeatmapCanvas(): string {
    const w = HEATMAP_SIZE
    const h = HEATMAP_SIZE
    const { west, south, east, north } = HEATMAP_BOUNDS
    const intensity = new Float32Array(w * h)
    const radius = 36
    const maxVal = Math.max(...HEATMAP_DATA.map((d) => d.value), 1)

    for (const p of HEATMAP_DATA) {
      const x = ((p.lon - west) / (east - west)) * (w - 1)
      const y = (1 - (p.lat - south) / (north - south)) * (h - 1)
      const v = p.value / maxVal
      for (let dy = -radius; dy <= radius; dy++) {
        for (let dx = -radius; dx <= radius; dx++) {
          const dist = Math.sqrt(dx * dx + dy * dy)
          if (dist > radius) continue
          const g = Math.exp(-(dist * dist) / (2 * (radius / 2) ** 2)) * v
          const px = Math.round(x + dx)
          const py = Math.round(y + dy)
          if (px >= 0 && px < w && py >= 0 && py < h) {
            intensity[py * w + px] += g
          }
        }
      }
    }
    let maxI = 0
    for (let i = 0; i < intensity.length; i++) {
      if (intensity[i] > maxI) maxI = intensity[i]
    }
    if (maxI <= 0) maxI = 1
    const canvas = document.createElement('canvas')
    canvas.width = w
    canvas.height = h
    const ctx = canvas.getContext('2d')!
    const imgData = ctx.createImageData(w, h)
    const opacityThreshold = 0.02
    for (let i = 0; i < w * h; i++) {
      const raw = intensity[i] / maxI
      const t = raw < opacityThreshold ? 0 : Math.min(1, raw)
      const c = heatmapColor(t)
      imgData.data[i * 4] = c.r
      imgData.data[i * 4 + 1] = c.g
      imgData.data[i * 4 + 2] = c.b
      imgData.data[i * 4 + 3] = Math.round(c.a * 255)
    }
    ctx.putImageData(imgData, 0, 0)
    return canvas.toDataURL('image/png')
  }

  function addHeatmap(): void {
    const v = viewer.value
    if (!v) return
    if (heatmapImageryLayer) {
      v.imageryLayers.remove(heatmapImageryLayer)
      heatmapImageryLayer = null
    }
    const { west, south, east, north } = HEATMAP_BOUNDS
    const dataUrl = createHeatmapCanvas()
    const provider = new Cesium.SingleTileImageryProvider({
      url: dataUrl,
      rectangle: Cesium.Rectangle.fromDegrees(west, south, east, north),
      tileWidth: HEATMAP_SIZE,
      tileHeight: HEATMAP_SIZE,
    })
    heatmapImageryLayer = v.imageryLayers.addImageryProvider(provider)
    showHeatmap.value = true
  }

  function removeHeatmap(): void {
    const v = viewer.value
    if (!v || !heatmapImageryLayer) return
    v.imageryLayers.remove(heatmapImageryLayer)
    heatmapImageryLayer = null
    showHeatmap.value = false
  }

  /** 水温图图例：颜色条对应的色板（不含透明 [0,0,0,0]），与 worker 一致，索引 1..20 */
  const hhtLegendColors = computed(() => hhtColorList.slice(1))

  /** 水温图图例：温度范围（与 PNG 数据 min/max 对应，显示用 -5～35） */
  const hhtLegendTempRange = { min: -5, max: 35 }

  /** 专题图：保存的相机视口（关闭时恢复） */
  let savedThematicView: { west: number; south: number; east: number; north: number } | null = null
  /** 专题图：原始 Cesium 容器，用于关闭时把 canvas 移回 */
  let originalCesiumContainer: HTMLElement | null = null
  /** 专题图：经纬网实体与标签，关闭时移除 */
  const thematicGridEntities: Entity[] = []
  const thematicGridLabels: Entity[] = []
  let thematicGridDegree = 0
  let thematicGridRemoveListener: (() => void) | null = null
  let thematicGridLabelRemoveListener: (() => void) | null = null

  /** 初始化 Cesium Viewer，传入容器元素或容器 id */
  function init(
    container: HTMLElement | string,
    options?: CesiumViewerOptions
  ): Viewer {
    if (viewer.value) {
      destroy()
    }
    const containerEl = typeof container === 'string' ? document.getElementById(container)! : container
    originalCesiumContainer = containerEl
    const CesiumIonDefaultAccessToken = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJqdGkiOiJiNjkzYTRmNy04NDhiLTQyZTMtYThmNi1jOWY4ODZjNDgxNTQiLCJpZCI6MzYyOTgzLCJpYXQiOjE3NjM4ODQwMjN9.ilfgQf4D7uhqWvA2C3dSbOduhYDbG1MFiEGMmJ5_rYI'
    Cesium.Ion.defaultAccessToken = CesiumIonDefaultAccessToken

    // 使用 OSM 底图 + 椭球地形，不依赖 Cesium Ion 请求，避免 ERR_CONNECTION_RESET
    const imageryProvider = new Cesium.UrlTemplateImageryProvider({
      url: 'https://a.tile.openstreetmap.org/{z}/{x}/{y}.png',
      credit: '© OpenStreetMap contributors',
    })
    const terrainProvider = new Cesium.EllipsoidTerrainProvider()

    viewer.value = new Viewer(
      containerEl,
      {
        animation: false,
        baseLayerPicker: true,
        fullscreenButton: true,
        geocoder: true,
        homeButton: true,
        infoBox: true,
        sceneModePicker: true,
        selectionIndicator: true,
        timeline: false,
        useDefaultRenderLoop: true,
        imageryProvider,
        terrainProvider,
        // 保留绘图缓冲区，便于专题图导出时能正确截取到地图内容（否则 canvas 会导出为黑图）
        contextOptions: { preserveDrawingBuffer: true },
        ...options,
      }
    )
    return viewer.value
  }

  /** 销毁 Viewer 并释放资源 */
  function destroy(): void {
    endDrawLine()
    if (viewer.value) {
      viewer.value.destroy()
      viewer.value = null
    }
  }

  /** 获取当前 Viewer，未初始化时抛错，便于在需要强依赖 viewer 的地方使用 */
  function getViewer(): Viewer {
    if (!viewer.value) {
      throw new Error('[CesiumStore] Viewer 尚未初始化，请先挂载地图组件或调用 init()')
    }
    return viewer.value
  }

  /** 专题图面板是否显示 */
  const showThematicMap = ref(false)

  const THEMATIC_MAP_CANVAS_WIDTH = 1350
  const THEMATIC_MAP_CANVAS_HEIGHT = 740

  function getViewRectangle2D(v: Viewer): { west: number; south: number; east: number; north: number } | null {
    const scene = v.scene
    const camera = v.camera
    const canvas = scene.canvas
    const width = canvas.clientWidth
    const height = canvas.clientHeight
    const corners = [
      new Cesium.Cartesian2(0, 0),
      new Cesium.Cartesian2(width, 0),
      new Cesium.Cartesian2(0, height),
      new Cesium.Cartesian2(width, height),
    ]
    const positions = corners.map((corner) => {
      const pickRay = camera.getPickRay(corner)
      if (!pickRay) return null
      const pickPosition = scene.globe.pick(pickRay, scene)
      if (pickPosition) {
        const cartographic = Cesium.Cartographic.fromCartesian(pickPosition)
        return {
          lon: Cesium.Math.toDegrees(cartographic.longitude),
          lat: Cesium.Math.toDegrees(cartographic.latitude),
        }
      }
      return null
    })
    const valid = positions.filter((p): p is { lon: number; lat: number } => p !== null)
    if (valid.length === 0) return null
    const west = Math.min(...valid.map((p) => p.lon))
    const south = Math.min(...valid.map((p) => p.lat))
    const east = Math.max(...valid.map((p) => p.lon))
    const north = Math.max(...valid.map((p) => p.lat))
    return { west, south, east, north }
  }

  function drawThematicGrid(v: Viewer, degree: number): void {
    thematicGridEntities.length = 0
    const entities = v.entities
    for (let lat = -90; lat <= 90; lat += degree) {
      const positions = []
      for (let lon = -180; lon <= 180; lon += degree) {
        positions.push(Cesium.Cartesian3.fromDegrees(lon, lat))
      }
      thematicGridEntities.push(
        entities.add({
          polyline: {
            positions,
            width: 1.0,
            material: Cesium.Color.WHITE.withAlpha(0.5),
          },
        })
      )
    }
    for (let lon = -180; lon <= 180; lon += degree) {
      const positions = []
      for (let lat = -90; lat <= 90; lat += degree) {
        positions.push(Cesium.Cartesian3.fromDegrees(lon, lat))
      }
      thematicGridEntities.push(
        entities.add({
          polyline: {
            positions,
            width: 1.0,
            material: Cesium.Color.WHITE.withAlpha(0.5),
          },
        })
      )
    }
  }

  function drawThematicGridLabel(v: Viewer, _degree: number, labelsDegree: number): void {
    thematicGridLabels.length = 0
    const rect = getViewRectangle2D(v)
    if (!rect) return
    const entities = v.entities
    for (let lat = -90; lat <= 90; lat += labelsDegree) {
      thematicGridLabels.push(
        entities.add({
          position: Cesium.Cartesian3.fromDegrees(rect.east, lat, 0),
          label: {
            text: `${lat < 0 ? `${Math.abs(lat)}°S` : `${lat}°N`}`,
            font: '12px sans-serif',
            style: Cesium.LabelStyle.FILL_AND_OUTLINE,
            outlineWidth: 2,
            outlineColor: Cesium.Color.WHITE,
            fillColor: Cesium.Color.YELLOW,
            pixelOffset: new Cesium.Cartesian2(-20, 0),
          },
        })
      )
      thematicGridLabels.push(
        entities.add({
          position: Cesium.Cartesian3.fromDegrees(rect.west, lat, 0),
          label: {
            text: `${lat < 0 ? `${Math.abs(lat)}°S` : `${lat}°N`}`,
            font: '12px sans-serif',
            style: Cesium.LabelStyle.FILL_AND_OUTLINE,
            outlineWidth: 2,
            outlineColor: Cesium.Color.WHITE,
            fillColor: Cesium.Color.YELLOW,
            pixelOffset: new Cesium.Cartesian2(20, 0),
          },
        })
      )
    }
    for (let lon = -180; lon <= 180; lon += labelsDegree) {
      thematicGridLabels.push(
        entities.add({
          position: Cesium.Cartesian3.fromDegrees(lon, rect.north, 0),
          label: {
            text: `${lon < 0 ? `${Math.abs(lon)}°W` : `${lon}°E`}`,
            font: '12px sans-serif',
            style: Cesium.LabelStyle.FILL_AND_OUTLINE,
            outlineWidth: 2,
            outlineColor: Cesium.Color.WHITE,
            fillColor: Cesium.Color.YELLOW,
            pixelOffset: new Cesium.Cartesian2(0, 10),
          },
        })
      )
      thematicGridLabels.push(
        entities.add({
          position: Cesium.Cartesian3.fromDegrees(lon, rect.south, 0),
          label: {
            text: `${lon < 0 ? `${Math.abs(lon)}°W` : `${lon}°E`}`,
            font: '12px sans-serif',
            style: Cesium.LabelStyle.FILL_AND_OUTLINE,
            outlineWidth: 2,
            outlineColor: Cesium.Color.WHITE,
            fillColor: Cesium.Color.YELLOW,
            pixelOffset: new Cesium.Cartesian2(0, -10),
          },
        })
      )
    }
  }

  function runThematicGrid(): void {
    const v = viewer.value
    if (!v) return
    const height = v.camera.positionCartographic.height
    let degree: number
    if (height > 20000000) {
      degree = 40
    } else if (height > 5000000) {
      degree = 10
    } else if (height > 2039144) {
      degree = 5
    } else if (height > 100000) {
      degree = 2
    } else {
      degree = 1
    }
    if (degree !== thematicGridDegree) {
      thematicGridDegree = degree
      drawThematicGrid(v, degree)
    }
  }

  function runThematicGridLabel(): void {
    const v = viewer.value
    if (!v) return
    const height = v.camera.positionCartographic.height
    let labelsDegree = 10
    let degree: number
    if (height > 20000000) {
      degree = 40
      labelsDegree = 40
    } else if (height > 5000000) {
      degree = 10
    } else if (height > 2039144) {
      degree = 5
      labelsDegree = 5
    } else if (height > 100000) {
      degree = 2
      labelsDegree = 4
    } else {
      degree = 1
      labelsDegree = 2
    }
    drawThematicGridLabel(v, degree, labelsDegree)
  }

  function removeThematicGridListeners(): void {
    if (thematicGridRemoveListener) {
      thematicGridRemoveListener()
      thematicGridRemoveListener = null
    }
    if (thematicGridLabelRemoveListener) {
      thematicGridLabelRemoveListener()
      thematicGridLabelRemoveListener = null
    }
  }

  function clearThematicGrid(): void {
    const v = viewer.value
    if (!v) return
    removeThematicGridListeners()
    thematicGridEntities.forEach((e) => v.entities.remove(e))
    thematicGridEntities.length = 0
    thematicGridLabels.forEach((e) => v.entities.remove(e))
    thematicGridLabels.length = 0
    thematicGridDegree = 0
  }

  /** 打开专题图：保存视口、切 2D、将 canvas 挂到面板容器 */
  function openThematicMap(panelMapContainer: HTMLElement): void {
    const v = viewer.value
    if (!v || !originalCesiumContainer) return
    const rect = v.camera.computeViewRectangle()
    if (!rect) return
    savedThematicView = {
      west: Cesium.Math.toDegrees(rect.west),
      south: Cesium.Math.toDegrees(rect.south),
      east: Cesium.Math.toDegrees(rect.east),
      north: Cesium.Math.toDegrees(rect.north),
    }
    v.scene.morphTo2D(2)
    v.camera.setView({ destination: rect })
    const canvas = v.scene.canvas
    if (canvas.parentElement) canvas.parentElement.removeChild(canvas)
    ;(canvas as HTMLCanvasElement).width = THEMATIC_MAP_CANVAS_WIDTH
    ;(canvas as HTMLCanvasElement).height = THEMATIC_MAP_CANVAS_HEIGHT
    panelMapContainer.appendChild(canvas)
    showThematicMap.value = true
  }

  /** 关闭专题图：canvas 归位、恢复 3D 与视口 */
  function closeThematicMap(): void {
    if (!showThematicMap.value) return
    const v = viewer.value
    if (!v || !originalCesiumContainer) return
    clearThematicGrid()
    const canvas = v.scene.canvas as HTMLCanvasElement
    if (canvas.parentElement) canvas.parentElement.removeChild(canvas)
    originalCesiumContainer.appendChild(canvas)
    canvas.style.width = '100%'
    canvas.style.height = '100%'
    canvas.style.display = ''
    v.scene.morphTo3D(0)
    if (savedThematicView) {
      v.camera.setView({
        destination: Cesium.Rectangle.fromDegrees(
          savedThematicView.west,
          savedThematicView.south,
          savedThematicView.east,
          savedThematicView.north
        ),
      })
      savedThematicView = null
    }
    const doResize = () => {
      const cw = originalCesiumContainer!.clientWidth
      const ch = originalCesiumContainer!.clientHeight
      if (cw && ch) {
        canvas.width = cw
        canvas.height = ch
      }
      if (typeof (v as any).resize === 'function') {
        ;(v as any).resize()
      }
      v.scene.requestRender()
    }
    doResize()
    requestAnimationFrame(() => {
      doResize()
      showThematicMap.value = false
    })
  }

  /** 专题图：开启经纬网（并监听相机更新） */
  function addThematicGrid(): void {
    const v = viewer.value
    if (!v) return
    v.camera.changed.addEventListener(runThematicGrid)
    thematicGridRemoveListener = () => v.camera.changed.removeEventListener(runThematicGrid)
    v.camera.moveEnd.addEventListener(runThematicGridLabel)
    thematicGridLabelRemoveListener = () => v.camera.moveEnd.removeEventListener(runThematicGridLabel)
    runThematicGrid()
    runThematicGridLabel()
  }

  return {
    viewer,
    isReady,
    isDrawingLine,
    isDrawingRectangle,
    showTerrainProfile,
    showSectionChart,
    sectionChartData,
    drawLinePoints,
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
    showHeatmap,
    hhtLegendColors,
    hhtLegendTempRange,
    init,
    destroy,
    getViewer,
    startDrawLine,
    endDrawLine,
    clearDrawLine,
    startDrawRectangle,
    clearRectangle,
    drawKriging,
    clearKriging,
    fillGrid,
    clearFillGrid,
    addMassPoints,
    clearMassPoints,
    addContourLines,
    clearContourLines,
    addHHT,
    removeHHT,
    loadTerrain,
    addWhiteModel,
    removeWhiteModel,
    addBuildingTileset,
    removeBuildingTileset,
    loadDroneOnGround,
    removeDrone,
    addHeatmap,
    removeHeatmap,
    openTerrainProfile,
    closeTerrainProfile,
    openSectionChart,
    closeSectionChart,
    showOceanProfile,
    openOceanProfile,
    closeOceanProfile,
    isPickingAngleAndCoord,
    startPickingAngleAndCoord,
    stopPickingAngleAndCoord,
    showThematicMap,
    openThematicMap,
    closeThematicMap,
    clearThematicGrid,
    addThematicGrid,
  }
})
