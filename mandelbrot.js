import { WebGLRenderer } from './renderers/WebGLRenderer.js';
import { CPURenderer } from './renderers/CPURenderer.js';
import { DoubleCPURenderer } from './renderers/DoubleCPURenderer.js';

class MandelbrotViewer {
    constructor() {
        this.canvas = document.getElementById('canvas');
        this.cpuCanvas = document.getElementById('cpuCanvas');
        this.cpuCtx = this.cpuCanvas?.getContext('2d');
        this.cpuCanvasProgress = document.getElementById('cpuCanvasProgress');
        this.cpuCtxProgress = this.cpuCanvasProgress?.getContext('2d');
        this.cpuBuffer = document.createElement('canvas');
        this.cpuBufferCtx = this.cpuBuffer.getContext('2d');
        this.zoomValueEl = document.getElementById('zoomValue');
        this.cpuIndicatorEl = document.getElementById('cpuIndicator');
        this.progressContainerEl = document.getElementById('progressContainer');
        this.progressBarEl = document.getElementById('progressBar');
        this.progressTextEl = document.getElementById('progressText');
        this.cpuRenderToken = 0;
        this.cpuRenderHandle = null;
        this.isCpuRendering = false;
        this.hasCpuFrame = false;
        this.dpr = window.devicePixelRatio || 1;
        this.debugEnabled = false;
        this._debugSeq = 0;
        
        // View parameters
        this.centerX = -0.5;
        this.centerY = 0;
        this.zoom = 1;
        this.cpuFrameCenterX = this.centerX;
        this.cpuFrameCenterY = this.centerY;
        this.cpuFrameZoom = this.zoom;
        this.cpuFramePivotScreen = { x: this.canvas.width / 2, y: this.canvas.height / 2 };
        this.baseIterations = 100;
        this.maxIterations = 100;
        this.adaptiveIterations = true;
        this.fractalType = 'mandelbrot';
        
        // Touch state
        this.isDragging = false;
        this.dragStartX = 0;
        this.dragStartY = 0;
        this.isPinching = false;
        this.initialPinchDistance = 0;
        this.initialZoom = 1;
        this.pinchCenter = { x: 0, y: 0 };
        
        // Renderers
        this.webglRenderer = new WebGLRenderer(this.canvas);
        this.cpuRenderer = new CPURenderer(this.cpuBuffer);
        this.doubleCpuRenderer = new DoubleCPURenderer(this.cpuBuffer);

        this.cpuFallbackZoom = 100000;
        this.highPrecisionCpuThreshold = 1000000;
        this.isHighPrecisionCpuActive = false;
        this.isCpuMode = false;
        this.isInteracting = false;
        this.renderTimer = null;
        this.interactionCooldownMs = 500;
        
        // Tour state
        this.isTouring = false;
        this.tourIndex = 0;
        this.tourLocations = [
            {
                name: "Main Cardioid",
                type: "mandelbrot",
                x: -0.5,
                y: 0,
                zoom: 1,
                description: "The main heart-shaped region of the Mandelbrot set"
            },
            {
                name: "Seahorse Valley",
                type: "mandelbrot",
                x: -0.75,
                y: 0.1,
                zoom: 50,
                description: "Beautiful spiral patterns resembling seahorses"
            },
            {
                name: "Mini-Mandelbrot",
                type: "mandelbrot",
                x: -0.16,
                y: 1.0407,
                zoom: 100,
                description: "A smaller copy of the entire Mandelbrot set"
            },
            {
                name: "The Burning Ship",
                type: "burningship",
                x: -1.75,
                y: -0.03,
                zoom: 1,
                description: "The Burning Ship fractal, rendered using absolute value dynamics."
            },
            {
                name: "Spiral Galaxy",
                type: "mandelbrot",
                x: -0.7269,
                y: 0.1889,
                zoom: 500,
                description: "Galaxy-like spiral formations"
            },
            {
                name: "Triple Spiral Valley",
                type: "mandelbrot",
                x: -0.088,
                y: 0.654,
                zoom: 1000,
                description: "A rare region where three spirals meet"
            },
            {
                name: "Dragon Valley",
                type: "mandelbrot",
                x: -0.8,
                y: 0.156,
                zoom: 1000,
                description: "Dragon-shaped formations in the boundary"
            },
            {
                name: "Elephant Valley",
                type: "mandelbrot",
                x: 0.274,
                y: 0.482,
                zoom: 2000,
                description: "Structures resembling elephant trunks"
            },
            {
                name: "Scepter Valley",
                type: "mandelbrot",
                x: -1.368,
                y: 0,
                zoom: 5000,
                description: "High-symmetry valley between the main cardioid and the bulb"
            },
            {
                name: "Lightning Bolts",
                type: "mandelbrot",
                x: -1.25066,
                y: 0.02012,
                zoom: 5000,
                description: "Lightning-like branching patterns"
            },
            {
                name: "Microscopic Detail",
                type: "mandelbrot",
                x: -0.7463,
                y: 0.1102,
                zoom: 10000,
                description: "Extreme zoom showing infinite detail"
            },
            {
                name: "Turtle Cove",
                type: "mandelbrot",
                x: -0.10155,
                y: 0.95632,
                zoom: 750000,
                description: "Mini-Mandelbrot region whose outline forms a turtle shell"
            }
        ];
        
        this.colorScheme = 'classic';
        
        // Initialization
        this.setupWebGLEvents();
        this.setupEventListeners();
        this.setupCollapsiblePanels();
        this.resizeCanvas(false);
        this.render();
    }

    setupWebGLEvents() {
        this.canvas.addEventListener('webglcontextlost', (event) => {
            event.preventDefault();
            this.webglRenderer.gl = null;
            this.webglRenderer.program = null;
        });
        this.canvas.addEventListener('webglcontextrestored', () => {
            this.webglRenderer.init();
            this.render();
        });
    }

    showWebGLError() {
        const loading = document.getElementById('loading');
        if (loading) {
            loading.style.display = 'block';
            loading.style.color = '#ff4444';
            loading.textContent = 'WebGL initialization failed. This viewer requires WebGL.';
        }
        alert('WebGL is not supported or is blocked in your browser. This application requires WebGL to function.');
    }

    resizeCanvas(shouldRender = true) {
        if (this.canvas) {
            const nextDpr = window.devicePixelRatio || 1;
            this.dpr = nextDpr;
            const cssWidth = this.canvas.clientWidth;
            const cssHeight = this.canvas.clientHeight;

            this.canvas.width = Math.max(1, Math.floor(cssWidth * this.dpr));
            this.canvas.height = Math.max(1, Math.floor(cssHeight * this.dpr));

            if (this.cpuCanvas) {
                this.cpuCanvas.width = this.canvas.width;
                this.cpuCanvas.height = this.canvas.height;
            }
            if (this.cpuCanvasProgress) {
                this.cpuCanvasProgress.width = this.canvas.width;
                this.cpuCanvasProgress.height = this.canvas.height;
            }
            if (this.cpuBuffer) {
                this.cpuBuffer.width = this.canvas.width;
                this.cpuBuffer.height = this.canvas.height;
            }

            this.webglRenderer.resize(this.canvas.width, this.canvas.height);
            if (shouldRender) this.render();
        }
    }

    clientToCanvasPoint(clientX, clientY) {
        const rect = this.canvas.getBoundingClientRect();
        const scaleX = rect.width > 0 ? (this.canvas.width / rect.width) : 1;
        const scaleY = rect.height > 0 ? (this.canvas.height / rect.height) : 1;
        return {
            x: (clientX - rect.left) * scaleX,
            y: (clientY - rect.top) * scaleY
        };
    }

    debugLogZoom(label, payload) {
        if (!this.debugEnabled) return;
        const seq = ++this._debugSeq;
        const rect = this.canvas.getBoundingClientRect();
        const canvasMeta = {
            canvasWidth: this.canvas.width,
            canvasHeight: this.canvas.height,
            rectLeft: rect.left,
            rectTop: rect.top,
            rectWidth: rect.width,
            rectHeight: rect.height,
            dpr: window.devicePixelRatio || 1,
        };
        const layer = {
            isCpuMode: this.isCpuMode,
            isCpuRendering: this.isCpuRendering,
            hasCpuFrame: this.hasCpuFrame,
            webglOpacity: this.canvas?.style?.opacity,
            cpuOpacity: this.cpuCanvas?.style?.opacity,
            cpuVisible: this.cpuCanvas?.classList?.contains('visible'),
            cpuTransform: this.cpuCanvas?.style?.transform,
            progressVisible: this.cpuCanvasProgress?.classList?.contains('visible'),
            progressTransform: this.cpuCanvasProgress?.style?.transform,
        };
        console.groupCollapsed(`[ZoomDebug #${seq}] ${label}`);
        console.log('view', { centerX: this.centerX, centerY: this.centerY, zoom: this.zoom, maxIterations: this.maxIterations, fractalType: this.fractalType });
        console.log('canvas', canvasMeta);
        console.log('layer', layer);
        console.log('payload', payload);
        console.groupEnd();
    }

    setupEventListeners() {
        this.canvas.addEventListener('mousedown', (e) => this.handleMouseDown(e));
        this.canvas.addEventListener('mousemove', (e) => this.handleMouseMove(e));
        this.canvas.addEventListener('mouseup', (e) => this.handleMouseUp(e));
        this.canvas.addEventListener('wheel', (e) => this.handleWheel(e));
        this.canvas.addEventListener('contextmenu', (e) => e.preventDefault());

        window.addEventListener('resize', () => this.resizeCanvas(true));

        window.addEventListener('keydown', (e) => {
            if (e.key === 'd' || e.key === 'D') {
                const tag = (e.target && e.target.tagName) ? e.target.tagName.toLowerCase() : '';
                if (tag === 'input' || tag === 'textarea' || tag === 'select') return;
                this.debugEnabled = !this.debugEnabled;
                console.log(`[Debug] debugEnabled=${this.debugEnabled}`);
                return;
            }
            if (e.key !== 't' && e.key !== 'T') return;
            const tag = (e.target && e.target.tagName) ? e.target.tagName.toLowerCase() : '';
            if (tag === 'input' || tag === 'textarea' || tag === 'select') return;
            this.runZoomAnchorTest();
        });
        
        this.canvas.addEventListener('touchstart', (e) => this.handleTouchStart(e));
        this.canvas.addEventListener('touchmove', (e) => this.handleTouchMove(e));
        this.canvas.addEventListener('touchend', (e) => this.handleTouchEnd(e));
        
        document.getElementById('iterations').addEventListener('input', (e) => {
            this.baseIterations = parseInt(e.target.value);
            this.render();
        });
        
        document.getElementById('adaptiveToggle').addEventListener('change', (e) => {
            this.adaptiveIterations = e.target.checked;
            this.render();
        });
        
        document.getElementById('colorScheme').addEventListener('change', (e) => {
            this.colorScheme = e.target.value;
            this.render();
        });

        document.getElementById('fractalType').addEventListener('change', (e) => {
            this.fractalType = e.target.value;
            this.render();
        });
        
        document.getElementById('reset').addEventListener('click', () => this.resetView());
        document.getElementById('screenshot').addEventListener('click', () => this.saveScreenshot());
        
        document.getElementById('theme').addEventListener('change', (e) => {
            document.body.setAttribute('data-theme', e.target.value);
        });
        
        document.getElementById('tourStart').addEventListener('click', () => this.startTour());
        document.getElementById('tourStop').addEventListener('click', () => this.stopTour());
        document.getElementById('tourNext').addEventListener('click', () => this.nextTourLocation());
        document.getElementById('tourPrev').addEventListener('click', () => this.prevTourLocation());

        const hudPanel = document.getElementById('commandPanel');
        const hudCollapseBtn = document.getElementById('hudCollapseBtn');
        if (hudPanel && hudCollapseBtn) {
            hudCollapseBtn.addEventListener('click', (e) => {
                console.log('HUD collapse button clicked');
                e.stopPropagation();
                const isCollapsed = hudPanel.classList.toggle('hud-collapsed');
                hudCollapseBtn.setAttribute('aria-expanded', (!isCollapsed).toString());
                hudCollapseBtn.textContent = isCollapsed ? 'HUD' : '−';
            });
        }
    }

    setupCollapsiblePanels() {
        document.querySelectorAll('.collapse-btn').forEach((btn) => {
            const panelId = btn.dataset.target;
            const panel = document.getElementById(panelId);
            if (!panel) {
                console.warn(`Collapsible panel target not found: ${panelId}`);
                return;
            }
            btn.addEventListener('click', (e) => {
                console.log(`Collapsible section button clicked: ${panelId}`);
                e.stopPropagation();
                const isCollapsed = panel.classList.toggle('collapsed');
                btn.setAttribute('aria-expanded', (!isCollapsed).toString());
                btn.textContent = isCollapsed ? '+' : '−';
            });
        });
    }

    cancelCpuRender() {
        this.cpuRenderToken++;
        if (this.cpuRenderHandle) {
            clearTimeout(this.cpuRenderHandle);
            this.cpuRenderHandle = null;
        }
        if (this.isCpuMode && !this.hasCpuFrame) {
            this.setCpuCanvasVisibility(false);
        }
        if (this.isCpuRendering) {
            this.isCpuRendering = false;
            this.updateZoomIndicator();
        }
    }

    handleMouseDown(e) {
        if (e.button === 0) {
            this.isDragging = true;
            this.dragged = false;
            this.isInteracting = true;
            this.cancelCpuRender();
            const p = this.clientToCanvasPoint(e.clientX, e.clientY);
            this.dragStartX = p.x;
            this.dragStartY = p.y;
        } else if (e.button === 2) {
            this.cancelCpuRender();
            const p = this.clientToCanvasPoint(e.clientX, e.clientY);
            const a = p;
            const complexBefore = this.screenToComplex(a.x, a.y);
            this.debugLogZoom('right-click zoom (pre)', {
                client: { x: e.clientX, y: e.clientY },
                canvasPoint: p,
                anchor: a,
                factor: 0.5,
                complexBefore
            });
            this.zoomAt(a.x, a.y, 0.5);
        }
    }

    handleMouseMove(e) {
        const p = this.clientToCanvasPoint(e.clientX, e.clientY);
        const coords = this.screenToComplex(p.x, p.y);
        this.updateCoordinates(coords.x, coords.y);
        if (this.isDragging) {
            const scale = 4 / (this.canvas.width * this.zoom);
            if (p.x !== this.dragStartX || p.y !== this.dragStartY) this.dragged = true;
            const dx = p.x - this.dragStartX;
            const dy = p.y - this.dragStartY;
            this.centerX -= dx * scale;
            this.centerY -= dy * scale;
            
            if (this.debugEnabled) {
                console.log(`[Drag] dx=${dx.toFixed(2)} dy=${dy.toFixed(2)} scale=${scale.toExponential(4)}`);
            }
            
            this.dragStartX = p.x;
            this.dragStartY = p.y;
            this.render();
        }
    }

    handleMouseUp(e) {
        const shouldClickZoom = e.button === 0 && this.isDragging && !this.dragged;
        if (shouldClickZoom) {
            const p = this.clientToCanvasPoint(e.clientX, e.clientY);
            const a = p;
            const complexBefore = this.screenToComplex(a.x, a.y);
            this.debugLogZoom('click zoom (pre)', {
                client: { x: e.clientX, y: e.clientY },
                canvasPoint: p,
                anchor: a,
                factor: 2,
                complexBefore
            });
            this.zoomAt(a.x, a.y, 2);
        }
        this.isDragging = false;
        this.dragged = false;
        this.isInteracting = false;
        this.render(); // Final render to potentially switch to CPU
    }

    handleWheel(e) {
        e.preventDefault();
        this.isInteracting = true;
        this.cancelCpuRender();
        const p = this.clientToCanvasPoint(e.clientX, e.clientY);
        const a = p;
        const factor = e.deltaY > 0 ? 0.9 : 1.1;
        const complexBefore = this.screenToComplex(a.x, a.y);
        this.debugLogZoom('wheel zoom (pre)', {
            client: { x: e.clientX, y: e.clientY, deltaY: e.deltaY },
            canvasPoint: p,
            anchor: a,
            factor,
            complexBefore
        });
        this.zoomAt(a.x, a.y, factor);
        
        // Clear previous timer and set a new one to detect end of wheeling
        if (this.renderTimer) clearTimeout(this.renderTimer);
        this.renderTimer = setTimeout(() => {
            this.isInteracting = false;
            this.render();
            this.renderTimer = null;
        }, this.interactionCooldownMs);
    }

    handleTouchStart(e) {
        this.cancelCpuRender();
        this.isInteracting = true;
        if (e.touches.length === 1 && !this.isPinching) {
            this.isDragging = true;
            const p = this.clientToCanvasPoint(e.touches[0].clientX, e.touches[0].clientY);
            this.dragStartX = p.x;
            this.dragStartY = p.y;
        } else if (e.touches.length === 2) {
            this.isDragging = false;
            this.isPinching = true;
            this.initialPinchDistance = this.getTouchDistance(e.touches);
            this.initialZoom = this.zoom;
            const center = this.getTouchCenter(e.touches);
            const p = this.clientToCanvasPoint(center.x, center.y);
            this.pinchCenter = p;
        }
        this.updateCenterCoordinates();
    }

    handleTouchMove(e) {
        e.preventDefault();
        if (this.isPinching && e.touches.length === 2) {
            const currentDistance = this.getTouchDistance(e.touches);
            if (this.initialPinchDistance === 0) return;
            const targetZoom = this.initialZoom * (currentDistance / this.initialPinchDistance);
            const center = this.getTouchCenter(e.touches);
            const p = this.clientToCanvasPoint(center.x, center.y);
            const a = p;
            this.zoomAt(a.x, a.y, targetZoom / this.zoom);
            this.updateCenterCoordinates();
        } else if (e.touches.length === 1 && this.isDragging) {
            const scale = 4 / (this.canvas.width * this.zoom);
            const p = this.clientToCanvasPoint(e.touches[0].clientX, e.touches[0].clientY);
            const dx = p.x - this.dragStartX;
            const dy = p.y - this.dragStartY;
            this.centerX -= dx * scale;
            this.centerY -= dy * scale;

            if (this.debugEnabled) {
                console.log(`[TouchDrag] dx=${dx.toFixed(2)} dy=${dy.toFixed(2)} scale=${scale.toExponential(4)}`);
            }

            this.dragStartX = p.x;
            this.dragStartY = p.y;
            this.render();
            this.updateCenterCoordinates();
        }
    }

    handleTouchEnd(e) {
        if (e.touches.length === 0) {
            this.isDragging = false;
            this.isPinching = false;
            this.isInteracting = false;
            this.render(); // Final render
        } else if (e.touches.length === 1) {
            this.isPinching = false;
            this.isDragging = true;
            const p = this.clientToCanvasPoint(e.touches[0].clientX, e.touches[0].clientY);
            this.dragStartX = p.x;
            this.dragStartY = p.y;
        }
        this.updateCenterCoordinates();
    }

    getTouchDistance(touches) {
        return Math.hypot(touches[0].clientX - touches[1].clientX, touches[0].clientY - touches[1].clientY);
    }

    getTouchCenter(touches) {
        return { x: (touches[0].clientX + touches[1].clientX) / 2, y: (touches[0].clientY + touches[1].clientY) / 2 };
    }

    zoomAt(screenX, screenY, factor) {
        const coords = this.screenToComplex(screenX, screenY);
        this.zoom *= factor;
        const newCoords = this.screenToComplex(screenX, screenY);
        this.centerX += coords.x - newCoords.x;
        this.centerY += coords.y - newCoords.y;
        this.render();
    }

    computeZoomAnchorDrift(screenX, screenY, factor) {
        const width = this.canvas.width;
        const height = this.canvas.height;
        if (!width || !height) return null;

        const zoom0 = this.zoom;
        const cx0 = this.centerX;
        const cy0 = this.centerY;

        const scale0 = 4 / (width * zoom0);
        const c0x = cx0 + (screenX - width / 2) * scale0;
        const c0y = cy0 - (screenY - height / 2) * scale0;

        const zoom1 = zoom0 * factor;
        const scale1 = 4 / (width * zoom1);
        const c1x_before = cx0 + (screenX - width / 2) * scale1;
        const c1y_before = cy0 - (screenY - height / 2) * scale1;

        const cx1 = cx0 + (c0x - c1x_before);
        const cy1 = cy0 + (c0y - c1y_before);

        const c1x_after = cx1 + (screenX - width / 2) * scale1;
        const c1y_after = cy1 - (screenY - height / 2) * scale1;

        const driftX = c1x_after - c0x;
        const driftY = c1y_after - c0y;

        const driftPxX = driftX / scale1;
        const driftPxY = -driftY / scale1;
        const driftPx = Math.hypot(driftPxX, driftPxY);

        return { driftX, driftY, driftPxX, driftPxY, driftPx };
    }

    runZoomAnchorTest() {
        const width = this.canvas.width;
        const height = this.canvas.height;
        if (!width || !height) return;

        const factor = 1.1;
        const samples = 9;
        const margin = 8;
        const results = [];

        for (let yi = 0; yi < samples; yi++) {
            for (let xi = 0; xi < samples; xi++) {
                const x = margin + (xi / (samples - 1)) * (width - 2 * margin);
                const y = margin + (yi / (samples - 1)) * (height - 2 * margin);
                const drift = this.computeZoomAnchorDrift(x, y, factor);
                if (drift) {
                    results.push({ x: Math.round(x), y: Math.round(y), ...drift });
                }
            }
        }

        let max = 0;
        let sum = 0;
        for (const r of results) {
            max = Math.max(max, r.driftPx);
            sum += r.driftPx;
        }
        const avg = results.length ? (sum / results.length) : 0;

        console.table(results.map(r => ({
            x: r.x,
            y: r.y,
            driftPx: Number(r.driftPx.toFixed(6)),
            driftPxX: Number(r.driftPxX.toFixed(6)),
            driftPxY: Number(r.driftPxY.toFixed(6))
        })));
        console.log(`[ZoomAnchorTest] samples=${results.length} factor=${factor} maxDriftPx=${max} avgDriftPx=${avg}`);
        alert(`ZoomAnchorTest (factor ${factor}):\nmax drift: ${max.toFixed(6)} px\navg drift: ${avg.toFixed(6)} px\n(see console for details)`);
    }

    screenToComplex(screenX, screenY) {
        const scale = 4 / (this.canvas.width * this.zoom);
        return {
            x: this.centerX + (screenX - this.canvas.width / 2) * scale,
            y: this.centerY - (screenY - this.canvas.height / 2) * scale
        };
    }

    updateIterations() {
        if (this.adaptiveIterations) {
            this.maxIterations = Math.round(this.baseIterations * (1 + Math.log10(Math.max(1, this.zoom)) * 0.8));
        } else {
            this.maxIterations = this.baseIterations;
        }
        document.getElementById('iterValue').textContent = this.maxIterations;
    }

    render() {
        this.updateIterations();
        const needsCpu = (this.zoom >= this.cpuFallbackZoom);
        this.isCpuMode = needsCpu;
        this.isHighPrecisionCpuActive = needsCpu && this.shouldUseHighPrecisionCpu();

        if (this.debugEnabled) {
            this.debugLogZoom('render()', {
                needsCpu,
                highPrecision: this.isHighPrecisionCpuActive,
                isInteracting: this.isInteracting,
            });
        }

        if (!needsCpu) {
            this.cancelCpuRender();
            this.hasCpuFrame = false;
            this.webglRenderer.render({
                centerX: this.centerX,
                centerY: this.centerY,
                zoom: this.zoom,
                maxIterations: this.maxIterations,
                colorSchemeIndex: this.getColorSchemeIndex(),
                fractalType: this.fractalType
            });
            this.setCpuCanvasVisibility(false);
            if (this.canvas) this.canvas.style.opacity = '1';
        } else {
            if (!this.hasCpuFrame) {
                this.webglRenderer.render({
                    centerX: this.centerX,
                    centerY: this.centerY,
                    zoom: this.zoom,
                    maxIterations: this.maxIterations,
                    colorSchemeIndex: this.getColorSchemeIndex(),
                    fractalType: this.fractalType
                });
                if (this.canvas) this.canvas.style.opacity = '1';
            } else {
                if (this.canvas) this.canvas.style.opacity = '0';
            }
            
            this.setCpuCanvasVisibility(this.hasCpuFrame);
            if (!this.isInteracting) {
                this.beginCpuRender();
            }
        }
        this.updateRenderModeBadge();
        this.updateZoomIndicator();
        this.updateCpuFrameTransform();
        this.updatePrecisionBadge();
    }

    beginCpuRender() {
        const token = ++this.cpuRenderToken;
        this.isCpuRendering = true;
        if (!this.hasCpuFrame) {
            this.setCpuCanvasVisibility(false);
        }
        this.updateZoomIndicator();
        if (this.cpuRenderHandle) {
            clearTimeout(this.cpuRenderHandle);
            this.cpuRenderHandle = null;
        }
        this.cpuRenderHandle = setTimeout(() => {
            this.cpuRenderHandle = null;
            this.renderCpu(token);
        }, 0);
    }

    async renderCpu(token) {
        if (!this.cpuCtx) return;
        
        const width = this.canvas.width;
        const height = this.canvas.height;
        if (width === 0 || height === 0) return;

        this.isCpuRendering = true;
        const totalPixels = width * height;
        
        this.updateProgressBar(0, 0, totalPixels);
        this.updateZoomIndicator();
        
        if (this.cpuCtxProgress) {
            this.cpuCtxProgress.clearRect(0, 0, this.cpuCanvasProgress.width, this.cpuCanvasProgress.height);
            this.cpuCanvasProgress.classList.remove('visible');
        }
        
        await new Promise(resolve => requestAnimationFrame(resolve));

        const imageData = this.cpuBufferCtx.createImageData(width, height);
        const useHighPrecision = this.shouldUseHighPrecisionCpu();
        
        const renderParams = {
            token,
            imageData,
            width,
            height,
            canvasWidth: this.canvas.width,
            centerX: this.centerX,
            centerY: this.centerY,
            zoom: this.zoom,
            maxIterations: this.maxIterations,
            fractalType: this.fractalType,
            getPaletteColor: (t) => this.getPaletteColor(t),
            isCancelled: () => token !== this.cpuRenderToken,
            onProgress: (percent, done, total) => this.updateProgressBar(percent, done, total),
            onFrameUpdate: (data) => this.updateProgressFrame(data, this.centerX, this.centerY, this.zoom),
            onStatusUpdate: (text) => {
                if (this.progressTextEl) this.progressTextEl.textContent = text;
            }
        };

        const renderer = useHighPrecision ? this.doubleCpuRenderer : this.cpuRenderer;
        
        try {
            const success = await renderer.render(renderParams);
            if (success && token === this.cpuRenderToken) {
                this.commitFinalCpuFrame(imageData, renderParams.centerX, renderParams.centerY, renderParams.zoom);
            }
        } catch (e) {
            console.error('[CPU Render] Error:', e);
        } finally {
            if (token === this.cpuRenderToken) {
                this.isCpuRendering = false;
                this.updateZoomIndicator();
                if (this.cpuCanvasProgress) {
                    this.cpuCanvasProgress.classList.remove('visible');
                }
            }
        }
    }

    shouldUseHighPrecisionCpu() {
        return typeof DoubleDouble !== 'undefined' && this.zoom >= this.highPrecisionCpuThreshold;
    }

    updateProgressFrame(imageData, centerX, centerY, zoom) {
        if (!this.cpuCtxProgress || !this.cpuCanvasProgress) return;
        
        if (this.cpuCanvasProgress.width !== imageData.width || this.cpuCanvasProgress.height !== imageData.height) {
            this.cpuCanvasProgress.width = imageData.width;
            this.cpuCanvasProgress.height = imageData.height;
        }

        this.cpuCtxProgress.putImageData(imageData, 0, 0);
        
        this.progressFrameCenterX = centerX;
        this.progressFrameCenterY = centerY;
        this.progressFrameZoom = zoom;
        
        this.cpuCanvasProgress.classList.add('visible');
        this.updateCpuFrameTransform();
    }

    commitFinalCpuFrame(imageData, centerX, centerY, zoom) {
        if (!this.cpuCtx || !this.cpuCanvas) return;
        
        if (this.cpuCanvas.width !== imageData.width || this.cpuCanvas.height !== imageData.height) {
            this.cpuCanvas.width = imageData.width;
            this.cpuCanvas.height = imageData.height;
        }

        this.cpuCtx.putImageData(imageData, 0, 0);
        
        this.cpuFrameCenterX = centerX;
        this.cpuFrameCenterY = centerY;
        this.cpuFrameZoom = zoom;
        this.hasCpuFrame = true;
        
        if (this.cpuCanvasProgress) {
            this.cpuCanvasProgress.classList.remove('visible');
        }
        
        this.cpuCanvas.classList.add('visible');
        this.updateCpuFrameTransform();
    }

    updateCpuFrameTransform() {
        const width = this.canvas.width;
        const height = this.canvas.height;

        const rect = this.canvas.getBoundingClientRect();
        const toCssX = rect.width > 0 ? (rect.width / width) : 1;
        const toCssY = rect.height > 0 ? (rect.height / height) : 1;

        if (this.cpuCanvas && this.hasCpuFrame) {
            const scaleRatio = this.zoom / this.cpuFrameZoom;
            const currentScale = 4 / (width * this.zoom);
            const tx = (1 - scaleRatio) * (width / 2) + (this.cpuFrameCenterX - this.centerX) / currentScale;
            const ty = (1 - scaleRatio) * (height / 2) + (this.centerY - this.cpuFrameCenterY) / currentScale;
            this.cpuCanvas.style.transformOrigin = '0 0';
            this.cpuCanvas.style.transform = `matrix(${scaleRatio}, 0, 0, ${scaleRatio}, ${tx * toCssX}, ${ty * toCssY})`;
        } else if (this.cpuCanvas) {
            this.cpuCanvas.style.transform = '';
        }

        if (this.cpuCanvasProgress && this.isCpuRendering && this.progressFrameZoom) {
            const scaleRatio = this.zoom / this.progressFrameZoom;
            const currentScale = 4 / (width * this.zoom);
            const tx = (1 - scaleRatio) * (width / 2) + (this.progressFrameCenterX - this.centerX) / currentScale;
            const ty = (1 - scaleRatio) * (height / 2) + (this.centerY - this.progressFrameCenterY) / currentScale;
            this.cpuCanvasProgress.style.transformOrigin = '0 0';
            this.cpuCanvasProgress.style.transform = `matrix(${scaleRatio}, 0, 0, ${scaleRatio}, ${tx * toCssX}, ${ty * toCssY})`;
        } else if (this.cpuCanvasProgress) {
            this.cpuCanvasProgress.style.transform = '';
        }
    }

    getColorSchemeIndex() {
        switch (this.colorScheme) {
            case 'fire': return 1;
            case 'ocean': return 2;
            case 'psychedelic': return 3;
            case 'eink_mono': return 4;
            case 'eink_color': return 5;
            default: return 0;
        }
    }

    updateCoordinates(x, y) {
        document.getElementById('coordinates').textContent = `X: ${x.toFixed(6)} | Y: ${y.toFixed(6)}`;
    }

    updateCenterCoordinates() {
        this.updateCoordinates(this.centerX, this.centerY);
    }

    updateZoomIndicator() {
        if (this.zoomValueEl) {
            this.zoomValueEl.textContent = `Zoom: ${this.zoom.toFixed(1)}x`;
        }
        if (this.cpuIndicatorEl) {
            const showCpu = this.isCpuRendering;
            this.cpuIndicatorEl.classList.toggle('visible', showCpu);
            this.cpuIndicatorEl.setAttribute('aria-hidden', (!showCpu).toString());
        }
        if (this.progressContainerEl) {
            this.progressContainerEl.classList.toggle('visible', this.isCpuRendering);
            if (!this.isCpuRendering) {
                this.updateProgressBar(0, 0, 0);
            }
        }
    }

    updateProgressBar(percent, done, total) {
        if (this.progressBarEl) {
            this.progressBarEl.style.width = `${percent}%`;
        }
        if (this.progressTextEl) {
            if (total > 0) {
                this.progressTextEl.textContent = `${percent.toFixed(1)}% (${done.toLocaleString()}/${total.toLocaleString()} pixels)`;
            } else {
                // Keep the current text or show "Preparing..." if total is 0
                if (!this.progressTextEl.textContent || this.progressTextEl.textContent.includes('pixels')) {
                    this.progressTextEl.textContent = 'Preparing render...';
                }
            }
        }
    }

    updateRenderModeBadge() {
        const badge = document.getElementById('renderMode');
        if (!badge) return;
        const mode = this.isCpuMode ? 'cpu' : 'webgl';
        badge.dataset.mode = mode;
        badge.textContent = this.isCpuMode ? 'CPU Renderer' : 'WebGL Renderer';
    }

    updatePrecisionBadge() {
        const badge = document.getElementById('precisionBadge');
        if (!badge) return;
        const active = this.isHighPrecisionCpuActive;
        badge.classList.toggle('visible', active);
        badge.setAttribute('aria-hidden', (!active).toString());
        if (active) {
            badge.dataset.state = 'active';
        } else {
            delete badge.dataset.state;
        }
    }

    setCpuCanvasVisibility(visible) {
        if (this.cpuCanvas) {
            this.cpuCanvas.classList.toggle('visible', visible);
        }
        if (this.cpuCanvasProgress) {
            // We usually only show progress if we are rendering
            this.cpuCanvasProgress.classList.toggle('visible', visible && this.isCpuRendering);
        }
    }

    getEinkColorPalette(t) {
        const clampedT = Math.max(0, Math.min(1, t));
        const stops = [
            { start: [15, 36, 46], end: [84, 77, 61] },
            { start: [84, 77, 61], end: [161, 120, 59] },
            { start: [161, 120, 59], end: [230, 219, 173] }
        ];
        let scaled = clampedT * stops.length;
        let segment = Math.floor(scaled);
        let localT = scaled - segment;
        if (segment >= stops.length) {
            segment = stops.length - 1;
            localT = 1;
        }
        const { start, end } = stops[segment];
        return {
            r: Math.round(start[0] + (end[0] - start[0]) * localT),
            g: Math.round(start[1] + (end[1] - start[1]) * localT),
            b: Math.round(start[2] + (end[2] - start[2]) * localT)
        };
    }

    getPaletteColor(t) {
        switch (this.getColorSchemeIndex()) {
            case 1: {
                return {
                    r: Math.round(Math.min(1, t * 2.0) * 255),
                    g: Math.round(Math.min(1, t * 1.0) * 255),
                    b: Math.round(Math.min(1, t * 0.5) * 255)
                };
            }
            case 2: {
                return {
                    r: Math.round(t * 0.3 * 255),
                    g: Math.round(t * 0.5 * 255),
                    b: Math.round((0.5 + t * 0.5) * 255)
                };
            }
            case 3: {
                return {
                    r: Math.round((Math.sin(t * 12.566) * 0.5 + 0.5) * 255),
                    g: Math.round((Math.sin(t * 18.849 + 2.0) * 0.5 + 0.5) * 255),
                    b: Math.round((Math.sin(t * 25.132 + 4.0) * 0.5 + 0.5) * 255)
                };
            }
            case 4: {
                const v = Math.round((1.0 - t) * 255);
                return { r: v, g: v, b: v };
            }
            case 5: {
                return this.getEinkColorPalette(t);
            }
            default: {
                const rgb = this.hsvToRgb(t, 1.0, 1.0);
                return {
                    r: Math.round(rgb.r * 255),
                    g: Math.round(rgb.g * 255),
                    b: Math.round(rgb.b * 255)
                };
            }
        }
    }

    hsvToRgb(h, s, v) {
        const i = Math.floor(h * 6);
        const f = h * 6 - i;
        const p = v * (1 - s);
        const q = v * (1 - f * s);
        const t = v * (1 - (1 - f) * s);
        switch (i % 6) {
            case 0: return { r: v, g: t, b: p };
            case 1: return { r: q, g: v, b: p };
            case 2: return { r: p, g: v, b: t };
            case 3: return { r: p, g: q, b: v };
            case 4: return { r: t, g: p, b: v };
            case 5: return { r: v, g: p, b: q };
            default: return { r: v, g: v, b: v };
        }
    }

    resetView() {
        this.centerX = -0.5;
        this.centerY = 0;
        this.zoom = 1;
        this.render();
    }

    saveScreenshot() {
        const link = document.createElement('a');
        link.download = `fractal_${Date.now()}.png`;
        link.href = this.canvas.toDataURL();
        link.click();
    }

    startTour() {
        this.isTouring = true;
        this.tourIndex = 0;
        this.goToTourLocation(0);
        document.getElementById('tourStart').disabled = true;
        document.getElementById('tourStop').disabled = false;
        document.getElementById('tourNext').disabled = false;
        document.getElementById('tourPrev').disabled = true;
    }

    stopTour() {
        this.isTouring = false;
        document.getElementById('tourStart').disabled = false;
        document.getElementById('tourStop').disabled = true;
        document.getElementById('tourNext').disabled = true;
        document.getElementById('tourPrev').disabled = true;
        document.getElementById('tourInfo').textContent = 'Click "Start Guided Tour" to explore fascinating locations';
    }

    nextTourLocation() {
        if (this.tourIndex < this.tourLocations.length - 1) {
            this.tourIndex++;
            this.goToTourLocation(this.tourIndex);
        }
    }

    prevTourLocation() {
        if (this.tourIndex > 0) {
            this.tourIndex--;
            this.goToTourLocation(this.tourIndex);
        }
    }

    goToTourLocation(index) {
        const location = this.tourLocations[index];
        this.fractalType = location.type || 'mandelbrot';
        const typeSelect = document.getElementById('fractalType');
        if (typeSelect) typeSelect.value = this.fractalType;
        
        this.centerX = location.x;
        this.centerY = location.y;
        this.zoom = location.zoom;
        this.render();
        document.getElementById('tourInfo').innerHTML = `<strong>${location.name}</strong><br>${location.description}<br>Location ${index + 1} of ${this.tourLocations.length}`;
        document.getElementById('tourPrev').disabled = index === 0;
        document.getElementById('tourNext').disabled = index === this.tourLocations.length - 1;
    }
}

window.addEventListener('DOMContentLoaded', () => {
    new MandelbrotViewer();
});
