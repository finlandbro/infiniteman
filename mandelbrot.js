class MandelbrotViewer {
    constructor() {
        this.canvas = document.getElementById('canvas');
        this.cpuCanvas = document.getElementById('cpuCanvas');
        this.cpuCtx = this.cpuCanvas ? this.cpuCanvas.getContext('2d') : null;
        this.cpuBuffer = document.createElement('canvas');
        this.cpuBufferCtx = this.cpuBuffer.getContext('2d');
        this.zoomValueEl = document.getElementById('zoomValue');
        this.cpuIndicatorEl = document.getElementById('cpuIndicator');
        this.cpuRenderToken = 0;
        this.cpuRenderHandle = null;
        this.isCpuRendering = false;
        
        // View parameters
        this.centerX = -0.5;
        this.centerY = 0;
        this.zoom = 1;
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
        
        // WebGL state
        this.gl = null;
        this.program = null;
        this.uniforms = {};
        this.cpuFallbackZoom = 100000;
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
            }
        ];
        
        this.colorScheme = 'classic';
        
        // Initialization
        this.initWebGL();
        this.resizeCanvas(false);
        window.addEventListener('resize', () => this.resizeCanvas(true));
        this.setupWebGLEvents();
        this.setupEventListeners();
        this.setupCollapsiblePanels();
        this.render();
    }

    initWebGL() {
        const params = { alpha: true, depth: false, stencil: false, antialias: false, preserveDrawingBuffer: false };
        try {
            const gl = this.canvas.getContext('webgl2', params) || 
                       this.canvas.getContext('webgl', params) || 
                       this.canvas.getContext('experimental-webgl', params);
            if (!gl) {
                this.showWebGLError();
                return;
            }
            this.gl = gl;
            
            const vertexSrc = `
                attribute vec2 a_position;
                varying vec2 v_position;

                void main() {
                    v_position = a_position;
                    gl_Position = vec4(a_position, 0.0, 1.0);
                }
            `;
            
            const fragmentSrc = `
                precision highp float;
                varying vec2 v_position;
                uniform vec2 u_resolution;
                uniform vec2 u_center;
                uniform vec2 u_centerResidual;
                uniform float u_zoomBase;
                uniform float u_zoomResidual;
                uniform int u_maxIterations;
                uniform int u_colorScheme;
                uniform int u_fractalType;

                vec3 hsv2rgb(vec3 c) {
                    vec4 K = vec4(1.0, 2.0/3.0, 1.0/3.0, 3.0);
                    vec3 p = abs(fract(c.xxx + K.xyz) * 6.0 - K.www);
                    return c.z * mix(K.xxx, clamp(p - K.xxx, 0.0, 1.0), c.y);
                }

                vec3 palette(float t, int scheme) {
                    if (scheme == 1) return vec3(min(1.0, t * 2.0), min(1.0, t * 1.0), min(1.0, t * 0.5)); // fire
                    if (scheme == 2) return vec3(t * 0.3, t * 0.5, 0.5 + t * 0.5); // ocean
                    if (scheme == 3) return vec3(sin(t * 12.566) * 0.5 + 0.5, sin(t * 18.849 + 2.0) * 0.5 + 0.5, sin(t * 25.132 + 4.0) * 0.5 + 0.5); // psychedelic
                    if (scheme == 4) return vec3(1.0 - t); // eink monochrome
                    if (scheme == 5) {
                        // eink color: muted tones with posterization
                        vec3 c1 = hsv2rgb(vec3(t, 0.5, 0.8));
                        return floor(c1 * 4.0) / 4.0;
                    }
                    return hsv2rgb(vec3(t, 1.0, 1.0)); // classic
                }

                void main() {
                    float scale = 4.0 / (u_resolution.x * u_zoomBase);
                    scale *= u_zoomResidual;
                    vec2 baseCoord = vec2(
                        u_center.x + (gl_FragCoord.x - 0.5 * u_resolution.x) * scale,
                        u_center.y + (gl_FragCoord.y - 0.5 * u_resolution.y) * scale
                    );
                    vec2 c = baseCoord + u_centerResidual;

                    vec2 z = vec2(0.0);
                    int iterations = 0;
                    bool escaped = false;
                    for (int i = 0; i < 5000; i++) {
                        if (i >= u_maxIterations) break;
                        if (u_fractalType == 1) z = vec2(abs(z.x), abs(z.y));
                        float x = z.x * z.x - z.y * z.y + c.x;
                        float y = 2.0 * z.x * z.y + c.y;
                        z = vec2(x, y);
                        if (dot(z, z) > 4.0) { escaped = true; iterations = i; break; }
                    }

                    vec3 color;
                    if (!escaped) {
                        color = vec3(0.0);
                    } else {
                        float t = float(iterations) / float(u_maxIterations);
                        color = palette(t, u_colorScheme);
                    }
                    gl_FragColor = vec4(color, 1.0);
                }
            `;

            const vertexShader = this.compileShader(gl.VERTEX_SHADER, vertexSrc);
            const fragmentShader = this.compileShader(gl.FRAGMENT_SHADER, fragmentSrc);
            if (!vertexShader || !fragmentShader) return;

            const program = gl.createProgram();
            gl.attachShader(program, vertexShader);
            gl.attachShader(program, fragmentShader);
            gl.linkProgram(program);
            if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
                console.error('Link failed:', gl.getProgramInfoLog(program));
                return;
            }
            this.program = program;
            gl.useProgram(program);

            const positionBuffer = gl.createBuffer();
            gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
            gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
            const posLoc = gl.getAttribLocation(program, 'a_position');
            gl.enableVertexAttribArray(posLoc);
            gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 0, 0);

            this.uniforms = {
                resolution: gl.getUniformLocation(program, 'u_resolution'),
                center: gl.getUniformLocation(program, 'u_center'),
                centerResidual: gl.getUniformLocation(program, 'u_centerResidual'),
                zoomBase: gl.getUniformLocation(program, 'u_zoomBase'),
                zoomResidual: gl.getUniformLocation(program, 'u_zoomResidual'),
                maxIterations: gl.getUniformLocation(program, 'u_maxIterations'),
                colorScheme: gl.getUniformLocation(program, 'u_colorScheme'),
                fractalType: gl.getUniformLocation(program, 'u_fractalType'),
            };
        } catch (error) {
            console.error('WebGL Init error:', error);
            this.showWebGLError();
        }
    }

    compileShader(type, source) {
        const gl = this.gl;
        const shader = gl.createShader(type);
        gl.shaderSource(shader, source);
        gl.compileShader(shader);
        if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
            console.error('Shader compile failed:', gl.getShaderInfoLog(shader));
            gl.deleteShader(shader);
            return null;
        }
        return shader;
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
        this.canvas.width = window.innerWidth;
        this.canvas.height = window.innerHeight;
        if (this.cpuCanvas) {
            this.cpuCanvas.width = this.canvas.width;
            this.cpuCanvas.height = this.canvas.height;
        }
        if (this.cpuBuffer) {
            this.cpuBuffer.width = this.canvas.width;
            this.cpuBuffer.height = this.canvas.height;
        }
        if (this.gl) {
            this.gl.viewport(0, 0, this.canvas.width, this.canvas.height);
        }
        if (shouldRender) this.render();
    }

    setupEventListeners() {
        this.canvas.addEventListener('mousedown', (e) => this.handleMouseDown(e));
        this.canvas.addEventListener('mousemove', (e) => this.handleMouseMove(e));
        this.canvas.addEventListener('mouseup', (e) => this.handleMouseUp(e));
        this.canvas.addEventListener('wheel', (e) => this.handleWheel(e));
        this.canvas.addEventListener('contextmenu', (e) => e.preventDefault());
        
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
            hudCollapseBtn.addEventListener('click', () => {
                const isCollapsed = hudPanel.classList.toggle('hud-collapsed');
                hudCollapseBtn.setAttribute('aria-expanded', (!isCollapsed).toString());
                hudCollapseBtn.textContent = isCollapsed ? 'HUD' : '−';
            });
        }
    }

    setupWebGLEvents() {
        this.canvas.addEventListener('webglcontextlost', (event) => {
            event.preventDefault();
            this.gl = null;
            this.program = null;
        });
        this.canvas.addEventListener('webglcontextrestored', () => {
            this.initWebGL();
            this.render();
        });
    }

    setupCollapsiblePanels() {
        document.querySelectorAll('.collapse-btn').forEach((btn) => {
            const panel = document.getElementById(btn.dataset.target);
            if (!panel) return;
            btn.addEventListener('click', () => {
                const isCollapsed = panel.classList.toggle('collapsed');
                btn.setAttribute('aria-expanded', (!isCollapsed).toString());
                btn.textContent = isCollapsed ? '+' : '−';
            });
        });
    }

    handleMouseDown(e) {
        if (e.button === 0) {
            this.isDragging = true;
            this.isInteracting = true;
            this.cancelCpuRender();
            this.dragStartX = e.clientX;
            this.dragStartY = e.clientY;
        } else if (e.button === 2) {
            this.cancelCpuRender();
            this.zoomAt(e.clientX, e.clientY, 0.5);
        }
    }

    handleMouseMove(e) {
        const coords = this.screenToComplex(e.clientX, e.clientY);
        this.updateCoordinates(coords.x, coords.y);
        if (this.isDragging) {
            const scale = 4 / (this.canvas.width * this.zoom);
            this.centerX -= (e.clientX - this.dragStartX) * scale;
            this.centerY += (e.clientY - this.dragStartY) * scale;
            this.dragStartX = e.clientX;
            this.dragStartY = e.clientY;
            this.render();
        }
    }

    handleMouseUp(e) {
        if (e.button === 0 && !this.isDragging) this.zoomAt(e.clientX, e.clientY, 2);
        this.isDragging = false;
        this.isInteracting = false;
        this.render(); // Final render to potentially switch to CPU
    }

    handleWheel(e) {
        e.preventDefault();
        this.isInteracting = true;
        this.cancelCpuRender();
        this.zoomAt(e.clientX, e.clientY, e.deltaY > 0 ? 0.9 : 1.1);
        
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
            this.dragStartX = e.touches[0].clientX;
            this.dragStartY = e.touches[0].clientY;
        } else if (e.touches.length === 2) {
            this.isDragging = false;
            this.isPinching = true;
            this.initialPinchDistance = this.getTouchDistance(e.touches);
            this.initialZoom = this.zoom;
            this.pinchCenter = this.getTouchCenter(e.touches);
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
            this.zoomAt(center.x, center.y, targetZoom / this.zoom);
            this.updateCenterCoordinates();
        } else if (e.touches.length === 1 && this.isDragging) {
            const scale = 4 / (this.canvas.width * this.zoom);
            this.centerX -= (e.touches[0].clientX - this.dragStartX) * scale;
            this.centerY += (e.touches[0].clientY - this.dragStartY) * scale;
            this.dragStartX = e.touches[0].clientX;
            this.dragStartY = e.touches[0].clientY;
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
            this.dragStartX = e.touches[0].clientX;
            this.dragStartY = e.touches[0].clientY;
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
        // Force WebGL during interaction, otherwise check fallback zoom
        const useCpu = (!this.gl || !this.program || this.zoom >= this.cpuFallbackZoom) && !this.isInteracting;
        
        this.isCpuMode = useCpu;
        if (useCpu) {
            this.beginCpuRender();
        } else {
            this.renderWebGL();
            this.setCpuCanvasVisibility(false);
        }
        this.updateRenderModeBadge();
        this.updateZoomIndicator();
    }

    beginCpuRender() {
        const token = ++this.cpuRenderToken;
        this.isCpuRendering = true;
        this.setCpuCanvasVisibility(false);
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

    cancelCpuRender() {
        this.cpuRenderToken++;
        if (this.cpuRenderHandle) {
            clearTimeout(this.cpuRenderHandle);
            this.cpuRenderHandle = null;
        }
        if (this.isCpuMode) {
            this.setCpuCanvasVisibility(false);
        }
        if (this.isCpuRendering) {
            this.isCpuRendering = false;
            this.updateZoomIndicator();
        }
    }

    renderWebGL() {
        const gl = this.gl;
        if (!gl || !this.program) return;
        gl.useProgram(this.program);
        const fround = Math.fround || ((value) => value);
        const centerBaseX = fround(this.centerX);
        const centerBaseY = fround(this.centerY);
        const centerResidualX = this.centerX - centerBaseX;
        const centerResidualY = this.centerY - centerBaseY;
        const zoomBase = fround(this.zoom);
        const zoomResidual = this.zoom / zoomBase;
        gl.uniform2f(this.uniforms.center, centerBaseX, centerBaseY);
        gl.uniform2f(this.uniforms.centerResidual, centerResidualX, centerResidualY);
        gl.uniform1f(this.uniforms.zoomBase, zoomBase);
        gl.uniform1f(this.uniforms.zoomResidual, zoomResidual);
        gl.uniform2f(this.uniforms.resolution, this.canvas.width, this.canvas.height);
        gl.uniform1i(this.uniforms.maxIterations, this.maxIterations);
        gl.uniform1i(this.uniforms.colorScheme, this.getColorSchemeIndex());
        gl.uniform1i(this.uniforms.fractalType, this.fractalType === 'burningship' ? 1 : 0);
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    }

    renderCpu(token) {
        if (!this.cpuCtx) return;
        if (token !== this.cpuRenderToken) return;
        this.isCpuRendering = true;
        this.updateZoomIndicator();
        const width = this.canvas.width;
        const height = this.canvas.height;
        if (this.cpuCanvas) {
            this.cpuCanvas.width = width;
            this.cpuCanvas.height = height;
        }
        if (this.cpuBuffer) {
            this.cpuBuffer.width = width;
            this.cpuBuffer.height = height;
        }
        const imageData = this.cpuBufferCtx.createImageData(width, height);
        const data = imageData.data;
        const scale = 4 / (this.canvas.width * this.zoom);
        let offset = 0;
        try {
            for (let y = 0; y < height; y++) {
                if (token !== this.cpuRenderToken) return;
                const cy = this.centerY - (y - height / 2) * scale;
                for (let x = 0; x < width; x++) {
                    if (token !== this.cpuRenderToken) return;
                    const cx = this.centerX + (x - width / 2) * scale;
                    let zx = 0;
                    let zy = 0;
                    let escaped = false;
                    let iter = 0;
                    for (; iter < this.maxIterations; iter++) {
                        if (this.fractalType === 'burningship') {
                            zx = Math.abs(zx);
                            zy = Math.abs(zy);
                        }
                        const xTemp = zx * zx - zy * zy + cx;
                        zy = 2 * zx * zy + cy;
                        zx = xTemp;
                        if (zx * zx + zy * zy > 4) {
                            escaped = true;
                            break;
                        }
                    }
                    let r = 0;
                    let g = 0;
                    let b = 0;
                    if (escaped) {
                        const t = iter / this.maxIterations;
                        ({ r, g, b } = this.getPaletteColor(t));
                    }
                    data[offset++] = r;
                    data[offset++] = g;
                    data[offset++] = b;
                    data[offset++] = 255;
                }
            }
            this.cpuCtx.putImageData(imageData, 0, 0);
            this.setCpuCanvasVisibility(true);
        } finally {
            if (token === this.cpuRenderToken) {
                this.isCpuRendering = false;
                this.updateZoomIndicator();
            }
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
        document.getElementById('coordinates').textContent = `X: ${x.toFixed(6)} | Y: ${y.toFixed(6)} | Zoom: ${this.zoom.toFixed(1)}x`;
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
    }

    updateRenderModeBadge() {
        const badge = document.getElementById('renderMode');
        if (!badge) return;
        const mode = this.isCpuMode ? 'cpu' : 'webgl';
        badge.dataset.mode = mode;
        badge.textContent = this.isCpuMode ? 'CPU Renderer' : 'WebGL Renderer';
    }

    setCpuCanvasVisibility(visible) {
        if (!this.cpuCanvas) return;
        this.cpuCanvas.style.display = visible ? 'block' : 'none';
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
                const hue = t;
                const saturation = 0.5;
                const value = 0.8;
                const rgb = this.hsvToRgb(hue, saturation, value);
                return {
                    r: Math.round(Math.floor(rgb.r * 4) / 4 * 255),
                    g: Math.round(Math.floor(rgb.g * 4) / 4 * 255),
                    b: Math.round(Math.floor(rgb.b * 4) / 4 * 255)
                };
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
