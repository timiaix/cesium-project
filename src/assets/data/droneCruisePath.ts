/**
 * 无人机巡航路线配置（中国上空）
 * 调试时直接改 WAYPOINTS 或 LOOP_DURATION_SECONDS 即可
 */

/** 单个航点：经度(°)、纬度(°)、高度(米，椭球高)、可选名称便于调试 */
export interface DroneWaypoint {
  longitude: number
  latitude: number
  height: number
  /** 调试用，如 "北京西" "华东" */
  name?: string
}

/**
 * 巡航航点列表（逆时针绕中国中东部上空一圈）
 * 顺序即飞行顺序，首尾会在逻辑上闭合循环
 */
export const DRONE_CRUISE_WAYPOINTS: DroneWaypoint[] = [
  { longitude: 100.0, latitude: 30.0, height: 8000, name: '西南' },
  { longitude: 115.0, latitude: 30.0, height: 8000, name: '东南' },
  { longitude: 115.0, latitude: 40.0, height: 8000, name: '东北' },
  { longitude: 100.0, latitude: 40.0, height: 8000, name: '西北' },
]

/** 完整飞完一圈的时长（秒），改大飞得慢、改小飞得快 */
export const DRONE_CRUISE_LOOP_DURATION_SECONDS = 90
