import { Renderer } from './Renderer.js';

export class CPURenderer extends Renderer {
    constructor(canvas, options = {}) {
        super(canvas, options);
    }

    async render(params) {
        const { token, imageData, width, height, centerX, centerY, zoom, maxIterations, fractalType, getPaletteColor } = params;
        const data = imageData.data;
        const scale = 4 / (params.canvasWidth * zoom);
        const halfWidth = width / 2;
        const halfHeight = height / 2;
        const startX = centerX - halfWidth * scale;
        const startY = centerY + halfHeight * scale;

        const yCoords = this.buildCoordinateArray(startY, -scale, height);
        const xCoords = this.buildCoordinateArray(startX, scale, width);
        const rowOrder = this.buildCenterOutOrder(height);
        const colOrder = this.buildCenterOutOrder(width);

        let lastYieldTime = performance.now();
        const yieldInterval = 16;

        for (let rIdx = 0; rIdx < rowOrder.length; rIdx++) {
            if (params.isCancelled()) return false;
            const y = rowOrder[rIdx];
            const cy = yCoords[y];
            for (let cIdx = 0; cIdx < colOrder.length; cIdx++) {
                if (params.isCancelled()) return false;
                const x = colOrder[cIdx];
                const cx = xCoords[x];
                let zx = 0;
                let zy = 0;
                let escaped = false;
                let iter = 0;
                for (; iter < maxIterations; iter++) {
                    if (fractalType === 'burningship') {
                        zx = Math.abs(zx);
                        zy = Math.abs(zy);
                    }
                    const x2 = zx * zx;
                    const y2 = zy * zy;
                    
                    if (x2 + y2 > 4.0) {
                        escaped = true;
                        break;
                    }
                    
                    const new_zx = x2 - y2 + cx;
                    const new_zy = fractalType === 'burningship' ? -2.0 * zx * zy + cy : 2.0 * zx * zy + cy;
                    zx = new_zx;
                    zy = new_zy;
                }
                let r = 0, g = 0, b = 0;
                if (escaped) {
                    const t = iter / maxIterations;
                    const color = getPaletteColor(t);
                    r = color.r; g = color.g; b = color.b;
                }
                const offset = (y * width + x) * 4;
                data[offset] = r;
                data[offset + 1] = g;
                data[offset + 2] = b;
                data[offset + 3] = 255;
            }
            
            if (performance.now() - lastYieldTime > yieldInterval) {
                const totalPixels = width * height;
                const pixelsDone = (rIdx + 1) * width;
                params.onProgress((pixelsDone / totalPixels) * 100, pixelsDone, totalPixels);
                params.onFrameUpdate(imageData);
                await new Promise(resolve => requestAnimationFrame(resolve));
                lastYieldTime = performance.now();
            }
        }
        return true;
    }

    createKahanStepper(initialValue, delta) {
        return {
            value: initialValue,
            compensation: 0,
            delta,
            current() {
                return this.value;
            },
            advance() {
                const y = this.delta - this.compensation;
                const t = this.value + y;
                this.compensation = (t - this.value) - y;
                this.value = t;
            }
        };
    }

    buildCoordinateArray(start, delta, length) {
        const coords = new Array(length);
        const stepper = this.createKahanStepper(start, delta);
        for (let i = 0; i < length; i++) {
            coords[i] = stepper.current();
            stepper.advance();
        }
        return coords;
    }

    buildCenterOutOrder(length) {
        const order = [];
        const center = Math.floor(length / 2);
        order.push(center);
        for (let offset = 1; offset < length; offset++) {
            const up = center - offset;
            const down = center + offset;
            if (up >= 0) order.push(up);
            if (down < length) order.push(down);
        }
        return order;
    }
}
