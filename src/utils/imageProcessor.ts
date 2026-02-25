const worker = new Worker(
  new URL('../workers/imageWorker.worker.js', import.meta.url),
  { type: 'classic' }
)

export interface HHTItem {
  pngUrl: string
  processedPngUrl: string | null
  element?: string
}

export interface RetImgResult {
  url: string
  width: number
  height: number
}

/** 根据 colormap 处理 PNG，返回 base64 URL 与宽高（供 SingleTileImageryProvider 的 tileWidth/tileHeight 使用） */
export async function retImg(
  item: HHTItem,
  colormap: number[][]
): Promise<RetImgResult | null> {
  if (item.element === 'CLOUD') {
    return { url: item.pngUrl, width: 256, height: 256 }
  }
  if (item.processedPngUrl) {
    const img = await loadImageDimensions(item.processedPngUrl)
    return img ? { url: item.processedPngUrl, width: img.width, height: img.height } : null
  }

  try {
    const response = await fetch(item.pngUrl)
    const blob = await response.blob()
    const imageUrl = URL.createObjectURL(blob)
    const img = new Image()
    img.src = imageUrl
    img.crossOrigin = 'Anonymous'

    return new Promise((resolve) => {
      img.onload = () => {
        const canvas = document.createElement('canvas')
        const ctx = canvas.getContext('2d')

        canvas.width = img.width
        canvas.height = img.height
        ctx?.drawImage(img, 0, 0)

        const imageData = ctx?.getImageData(0, 0, img.width, img.height)
        if (!ctx || !imageData) {
          URL.revokeObjectURL(imageUrl)
          return resolve(null)
        }

        worker.postMessage({ imageData, colormap })

        const onMessage = (e: MessageEvent) => {
          worker.removeEventListener('message', onMessage)
          ctx.putImageData(e.data, 0, 0)
          const base64 = canvas.toDataURL('image/png')
          item.processedPngUrl = base64
          URL.revokeObjectURL(imageUrl)
          resolve({ url: base64, width: img.width, height: img.height })
        }
        worker.addEventListener('message', onMessage)
      }
      img.onerror = () => {
        URL.revokeObjectURL(imageUrl)
        resolve(null)
      }
    })
  } catch (error) {
    console.error('Error loading image:', error)
    return null
  }
}

function loadImageDimensions(src: string): Promise<{ width: number; height: number } | null> {
  return new Promise((resolve) => {
    const img = new Image()
    img.onload = () => resolve({ width: img.width, height: img.height })
    img.onerror = () => resolve(null)
    img.src = src
  })
}
