import { Renderer } from './Renderer.js';

export class DoubleCPURenderer extends Renderer {
    constructor(canvas, options = {}) {
        super(canvas, options);
    }

    async render(params) {
        if (typeof DoubleDouble === 'undefined') {
            throw new Error('DoubleDouble is required for DoubleCPURenderer');
        }

        const { token, imageData, width, height, centerX, centerY, zoom, maxIterations, fractalType, getPaletteColor } = params;
        const data = imageData.data;
        const scale = 4 / (params.canvasWidth * zoom);
        const scaleDD = DoubleDouble.fromNumber(scale);
        const negScaleDD = scaleDD.neg();
        const halfWidth = DoubleDouble.fromNumber(width / 2);
        const halfHeight = DoubleDouble.fromNumber(height / 2);
        const centerXDD = DoubleDouble.fromNumber(centerX);
        const centerYDD = DoubleDouble.fromNumber(centerY);
        const startX = centerXDD.sub(halfWidth.mul(scaleDD));
        const startY = centerYDD.add(halfHeight.mul(scaleDD));

        const yCoords = await this.buildDoubleDoubleCoordinateArrayAsync(startY, negScaleDD, height, params);
        if (params.isCancelled()) return false;
        const xCoords = await this.buildDoubleDoubleCoordinateArrayAsync(startX, scaleDD, width, params);
        if (params.isCancelled()) return false;

        const rowOrder = this.buildCenterOutOrder(height);
        const colOrder = this.buildCenterOutOrder(width);
        const escapeThreshold = 4.0;

        const zx = DoubleDouble.zero();
        const zy = DoubleDouble.zero();
        const zx2 = DoubleDouble.zero();
        const zy2 = DoubleDouble.zero();
        const tmp = DoubleDouble.zero();
        const twoZxZy = DoubleDouble.zero();

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

                zx.hi = 0; zx.lo = 0;
                zy.hi = 0; zy.lo = 0;

                let escaped = false;
                let iter = 0;
                for (; iter < maxIterations; iter++) {
                    if (fractalType === 'burningship') {
                        if (zx.hi < 0 || (zx.hi === 0 && zx.lo < 0)) { zx.hi = -zx.hi; zx.lo = -zx.lo; }
                        if (zy.hi < 0 || (zy.hi === 0 && zy.lo < 0)) { zy.hi = -zy.hi; zy.lo = -zy.lo; }
                    }

                    DoubleDouble.square(zx.hi, zx.lo, zx2);
                    DoubleDouble.square(zy.hi, zy.lo, zy2);

                    if (zx2.hi + zy2.hi > escapeThreshold) {
                        escaped = true;
                        break;
                    }

                    // twoZxZy = 2 * zx * zy
                    DoubleDouble.mul(zx.hi, zx.lo, zy.hi, zy.lo, twoZxZy);
                    if (fractalType === 'burningship') {
                        twoZxZy.hi = -twoZxZy.hi;
                        twoZxZy.lo = -twoZxZy.lo;
                    }
                    twoZxZy.hi *= 2; twoZxZy.lo *= 2;

                    // zx = zx2 - zy2 + cx
                    DoubleDouble.sub(zx2.hi, zx2.lo, zy2.hi, zy2.lo, tmp);
                    DoubleDouble.add(tmp.hi, tmp.lo, cx.hi, cx.lo, zx);

                    // zy = twoZxZy + cy
                    DoubleDouble.add(twoZxZy.hi, twoZxZy.lo, cy.hi, cy.lo, zy);

                    if (iter > 0 && iter % 1000 === 0) {
                        if (performance.now() - lastYieldTime > yieldInterval) {
                            await new Promise(resolve => requestAnimationFrame(resolve));
                            lastYieldTime = performance.now();
                            if (params.isCancelled()) return false;
                        }
                    }
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

                if (performance.now() - lastYieldTime > yieldInterval) {
                    const totalPixels = width * height;
                    const pixelsDone = rIdx * width + cIdx;
                    params.onProgress((pixelsDone / totalPixels) * 100, pixelsDone, totalPixels);
                    params.onFrameUpdate(imageData);
                    await new Promise(resolve => requestAnimationFrame(resolve));
                    lastYieldTime = performance.now();
                }
            }
        }
        return true;
    }

    async buildDoubleDoubleCoordinateArrayAsync(startDD, deltaDD, length, params) {
        const coords = new Array(length);
        let current = startDD.clone();
        for (let i = 0; i < length; i++) {
            if (params.isCancelled()) return [];
            coords[i] = current.clone();
            current = current.add(deltaDD);
            if (i % 200 === 0) {
                params.onStatusUpdate(`Setting up coordinates: ${Math.round((i / length) * 100)}%`);
                await new Promise(resolve => requestAnimationFrame(resolve));
            }
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
