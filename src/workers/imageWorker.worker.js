self.onmessage = function (e) {
    const { imageData, colormap } = e.data;
    const pixels = imageData.data;

    // 只有两个颜色的特殊处理（不变）
    if (colormap.length === 2) {
        const transparentColor = [0, 0, 0, 0]; // 透明
        const solidColor = colormap[1]; // 直接使用第二个颜色

        for (let i = 0; i < pixels.length; i += 4) {
            let r = pixels[i]; // 取 R 通道
            let color = r === 0 ? transparentColor : solidColor;

            pixels[i] = color[0]; // R
            pixels[i + 1] = color[1]; // G
            pixels[i + 2] = color[2]; // B
            pixels[i + 3] = color[3]; // A
        }
    } else {
        // 计算颜色映射（默认逻辑）
        function getColormapColor(value) {
            let index = Math.min(
                Math.floor(value * (colormap.length - 1)),
                colormap.length - 2
            );
            let t = value * (colormap.length - 1) - index;
            return [
                Math.round(colormap[index][0] * (1 - t) + colormap[index + 1][0] * t), // R
                Math.round(colormap[index][1] * (1 - t) + colormap[index + 1][1] * t), // G
                Math.round(colormap[index][2] * (1 - t) + colormap[index + 1][2] * t), // B
                Math.round(colormap[index][3] * (1 - t) + colormap[index + 1][3] * t), // A
            ];
        }

        for (let i = 0; i < pixels.length; i += 4) {
            let r = pixels[i]; // 只使用 R 通道

            // 如果 R 通道为 0，设置透明
            if (r === 0) {
                pixels[i] = 0;   // R
                pixels[i + 1] = 0; // G
                pixels[i + 2] = 0; // B
                pixels[i + 3] = 0; // A（完全透明）
            } else {
                let color = getColormapColor(r / 255);
                pixels[i] = color[0]; // R
                pixels[i + 1] = color[1]; // G
                pixels[i + 2] = color[2]; // B
                pixels[i + 3] = color[3]; // A
            }
        }
    }

    // 发送处理后的数据
    self.postMessage(imageData);
};
