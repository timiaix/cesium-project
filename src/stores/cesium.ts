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

  /** 栅格填值面实体（canvas：彩色底图 + 等经纬度权重黑色文字） */
  let fillGridEntity: Entity | null = null
  const showFillGrid = ref(false)

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

  /**
   * 在已有 kriging 底图的 canvas 上，按等经度纬度格点填入黑色文字（权重值）
   * grid 来自 kriging.grid，带有 xlim/ylim/width
   */
  function drawGridValueLabels(
    ctx: CanvasRenderingContext2D,
    grid: number[][] & { xlim: [number, number]; ylim: [number, number]; width: number },
    xlim: [number, number],
    ylim: [number, number],
    w: number,
    h: number
  ): void {
    const rangeX = xlim[1] - xlim[0]
    const rangeY = ylim[1] - ylim[0]
    const n = grid.length
    const m = grid[0]?.length ?? 0
    if (n === 0 || m === 0) return
    // 格点过密时抽样绘制，避免文字叠在一起
    const maxLabels = 35
    const stepI = Math.max(1, Math.floor(n / maxLabels))
    const stepJ = Math.max(1, Math.floor(m / maxLabels))
    ctx.fillStyle = '#000000'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.font = '11px sans-serif'
    for (let i = 0; i < n; i += stepI) {
      for (let j = 0; j < m; j += stepJ) {
        const val = grid[i][j]
        if (val === undefined || typeof val !== 'number') continue
        const lng = grid.xlim[0] + i * grid.width
        const lat = grid.ylim[0] + j * grid.width
        const px = ((lng - xlim[0]) / rangeX) * w
        const py = ((ylim[1] - lat) / rangeY) * h
        if (px < 0 || px > w || py < 0 || py > h) continue
        ctx.fillText(Number(val).toFixed(1), px, py)
      }
    }
  }

  /**
   * 栅格填值：根据克里金 grid 反算等经度纬度的权重值，在 canvas 上先绘彩色底图再填入黑色文字，渲染到地图
   */
  function fillGrid(): void {
    const v = viewer.value
    if (!v) return
    if (krigingValues.length < 4) return
    if (fillGridEntity) {
      v.entities.remove(fillGridEntity)
      fillGridEntity = null
    }
    const positions = Cesium.Cartesian3.fromDegreesArray(krigingCoords)
    const poly = Cesium.Rectangle.fromCartesianArray(positions)
    const minx = Cesium.Math.toDegrees(poly.west)
    const miny = Cesium.Math.toDegrees(poly.south)
    const maxx = Cesium.Math.toDegrees(poly.east)
    const maxy = Cesium.Math.toDegrees(poly.north)
    const xlim: [number, number] = [minx, maxx]
    const ylim: [number, number] = [miny, maxy]
    const variogram = kriging.train(krigingValues, krigingLngs, krigingLats, 'exponential', 0, 100)
    const grid = kriging.grid(krigingCord, variogram, (maxy - miny) / 1000) as number[][] & {
      xlim: [number, number]
      ylim: [number, number]
      width: number
    }
    if (!grid || !grid.xlim || !grid.ylim) return
    const canvas = document.createElement('canvas')
    const cw = 1024
    const ch = 1024
    canvas.width = cw
    canvas.height = ch
    canvas.style.display = 'block'
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.globalAlpha = 0.85
    kriging.plot(canvas, grid, xlim, ylim, krigingColors)
    ctx.globalAlpha = 1
    drawGridValueLabels(ctx, grid, xlim, ylim, cw, ch)
    fillGridEntity = v.entities.add({
      polygon: {
        hierarchy: new Cesium.PolygonHierarchy(Cesium.Cartesian3.fromDegreesArray(krigingCoords)),
        material: new Cesium.ImageMaterialProperty({ image: canvas }),
      },
    })
    showFillGrid.value = true
    v.zoomTo(fillGridEntity, new Cesium.HeadingPitchRange(0, Cesium.Math.toRadians(-45), 0))
  }

  function clearFillGrid(): void {
    const v = viewer.value
    if (v && fillGridEntity) {
      v.entities.remove(fillGridEntity)
      fillGridEntity = null
    }
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

  /** 水温图图例：颜色条对应的色板（不含透明 [0,0,0,0]），与 worker 一致，索引 1..20 */
  const hhtLegendColors = computed(() => hhtColorList.slice(1))

  /** 水温图图例：温度范围（与 PNG 数据 min/max 对应，显示用 -5～35） */
  const hhtLegendTempRange = { min: -5, max: 35 }

  /** 初始化 Cesium Viewer，传入容器元素或容器 id */
  function init(
    container: HTMLElement | string,
    options?: CesiumViewerOptions
  ): Viewer {
    if (viewer.value) {
      destroy()
    }
    const CesiumIonDefaultAccessToken = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJqdGkiOiJiNjkzYTRmNy04NDhiLTQyZTMtYThmNi1jOWY4ODZjNDgxNTQiLCJpZCI6MzYyOTgzLCJpYXQiOjE3NjM4ODQwMjN9.ilfgQf4D7uhqWvA2C3dSbOduhYDbG1MFiEGMmJ5_rYI'

    Cesium.Ion.defaultAccessToken = CesiumIonDefaultAccessToken;
    // 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJqdGkiOiI2YmRiNjM4MC1kMDZkLTQ2NDQtYjQ3My0xZDI4MDU0MGJhZDciLCJpZCI6MzIxMzAsInNjb3BlcyI6WyJhc3IiLCJnYyJdLCJpYXQiOjE1OTY1MjM4NzZ9.A3FBZ6HjKkTsOGnjwWWeO9L10HQ9c-wcF4c3dtTc4gQ'
     viewer.value = new Viewer(
      typeof container === 'string' ? document.getElementById(container)! : container,
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
  }
})
