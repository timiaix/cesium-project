/// <reference types="vite/client" />

declare module '*.vue' {
  import type { DefineComponent } from 'vue'
  const component: DefineComponent<object, object, unknown>
  export default component
}

declare module '@/utils/Kring/kriging.js' {
  const kriging: {
    train: (t: number[], x: number[], y: number[], model: string, sigma2: number, alpha: number) => unknown
    grid: (polygons: number[][][], variogram: unknown, width: number) => unknown
    plot: (canvas: HTMLCanvasElement, grid: unknown, xlim: [number, number], ylim: [number, number], colors: string[]) => void
  }
  export default kriging
}
