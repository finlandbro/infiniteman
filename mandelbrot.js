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
        
        // WebGL state
        this.gl = null;
        this.program = null;
        this.uniforms = {};
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

                vec3 einkColorPalette(float t) {
                    vec3 c1 = vec3(0.06, 0.14, 0.18);
                    vec3 c2 = vec3(0.33, 0.30, 0.24);
                    vec3 c3 = vec3(0.63, 0.47, 0.23);
                    vec3 c4 = vec3(0.90, 0.86, 0.68);
                    float clampedT = clamp(t, 0.0, 1.0);
                    float segments = 3.0;
                    float scaled = clampedT * segments;
                    float segment = floor(scaled);
                    float localT = scaled - segment;
                    if (segment >= segments) {
                        segment = segments - 1.0;
                        localT = 1.0;
                    }
                    if (segment < 1.0) return mix(c1, c2, localT);
                    if (segment < 2.0) return mix(c2, c3, localT);
                    return mix(c3, c4, localT);
                }

                vec3 palette(float t, int scheme) {
                    if (scheme == 1) return vec3(min(1.0, t * 2.0), min(1.0, t * 1.0), min(1.0, t * 0.5));
                    if (scheme == 2) return vec3(t * 0.3, t * 0.5, 0.5 + t * 0.5);
                    if (scheme == 3) return vec3(
                        sin(t * 12.566) * 0.5 + 0.5,
                        sin(t * 18.849 + 2.0) * 0.5 + 0.5,
                        sin(t * 25.132 + 4.0) * 0.5 + 0.5
                    );
                    if (scheme == 4) return vec3(1.0 - t);
                    if (scheme == 5) return einkColorPalette(t);
                    return hsv2rgb(vec3(t, 1.0, 1.0));
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
                        float y = u_fractalType == 1 ? -2.0 * z.x * z.y + c.y : 2.0 * z.x * z.y + c.y;
                        z = vec2(x, y);
                        if (dot(z, z) > 4.0) {
                            escaped = true;
                            iterations = i;
                            break;
                        }
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

    buildDoubleDoubleCoordinateArray(startDD, deltaDD, length) {
        if (typeof DoubleDouble === 'undefined') return [];
        const coords = new Array(length);
        let current = startDD.clone();
        for (let i = 0; i < length; i++) {
            coords[i] = current.clone();
            current = current.add(deltaDD);
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
        
        // Hide progress canvas now that stable is updated
        if (this.cpuCanvasProgress) {
            this.cpuCanvasProgress.classList.remove('visible');
        }
        
        this.cpuCanvas.classList.add('visible');
        this.updateCpuFrameTransform();
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
        if (this.cpuBufferCtx) {
            this.cpuBufferCtx.imageSmoothingEnabled = true;
        }
        if (this.cpuCtx) {
            this.cpuCtx.imageSmoothingEnabled = true;
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
        const needsCpu = (!this.gl || !this.program || this.zoom >= this.cpuFallbackZoom);
        this.isCpuMode = needsCpu;
        this.isHighPrecisionCpuActive = needsCpu && this.shouldUseHighPrecisionCpu();

        if (!needsCpu) {
            this.cancelCpuRender();
            this.hasCpuFrame = false;
            this.renderWebGL();
            this.setCpuCanvasVisibility(false);
            if (this.canvas) this.canvas.style.opacity = '1';
        } else {
            // If we already have a CPU frame, we use it as the preview.
            // We only render WebGL if we DON'T have a CPU frame yet (handoff phase).
            if (!this.hasCpuFrame) {
                this.renderWebGL();
                if (this.canvas) this.canvas.style.opacity = '1';
            } else {
                // Hide WebGL artifacts when we have a valid high-precision preview
                if (this.canvas) this.canvas.style.opacity = '0';
            }
            
            const shouldShowCpuFrame = this.hasCpuFrame;
            this.setCpuCanvasVisibility(shouldShowCpuFrame);
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

    async renderCpu(token) {
        if (!this.cpuCtx) return;
        if (token !== this.cpuRenderToken) return;
        
        const width = this.canvas.width;
        const height = this.canvas.height;
        if (width === 0 || height === 0) {
            console.warn('[CPU Render] Canvas dimensions are 0, skipping render.');
            this.isCpuRendering = false;
            this.updateZoomIndicator();
            return;
        }

        this.isCpuRendering = true;
        const totalPixels = width * height;
        console.log(`[CPU Render] Starting render: ${width}x${height} (${totalPixels.toLocaleString()} pixels)`);
        
        // Ensure UI updates to show 0%
        this.updateProgressBar(0, 0, totalPixels);
        this.updateZoomIndicator();
        
        // Clear progress canvas at start of new render
        if (this.cpuCtxProgress) {
            this.cpuCtxProgress.clearRect(0, 0, this.cpuCanvasProgress.width, this.cpuCanvasProgress.height);
            this.cpuCanvasProgress.classList.remove('visible');
        }
        
        // Yield to browser to show initial progress
        await new Promise(resolve => requestAnimationFrame(resolve));

        if (this.cpuBuffer) {
            this.cpuBuffer.width = width;
            this.cpuBuffer.height = height;
        }
        
        const imageData = this.cpuBufferCtx.createImageData(width, height);
        const useHighPrecision = this.shouldUseHighPrecisionCpu();
        
        const renderCenterX = this.centerX;
        const renderCenterY = this.centerY;
        const renderZoom = this.zoom;

        try {
            const populated = useHighPrecision
                ? await this.populateCpuBufferHighPrecisionAsync(token, imageData, width, height, renderCenterX, renderCenterY, renderZoom)
                : await this.populateCpuBufferStandardAsync(token, imageData, width, height, renderCenterX, renderCenterY, renderZoom);
            
            if (!populated || token !== this.cpuRenderToken) {
                console.log('[CPU Render] Render cancelled or failed.');
                return;
            }
            
            this.commitFinalCpuFrame(imageData, renderCenterX, renderCenterY, renderZoom);
            this.updatePrecisionBadge();
            console.log('[CPU Render] Render completed successfully.');
        } catch (e) {
            console.error('[CPU Render] Error during render:', e);
        } finally {
            if (token === this.cpuRenderToken) {
                this.isCpuRendering = false;
                this.updateZoomIndicator();
                // Ensure progress canvas is hidden after completion
                if (this.cpuCanvasProgress) {
                    this.cpuCanvasProgress.classList.remove('visible');
                }
            }
        }
    }

    shouldUseHighPrecisionCpu() {
        return typeof DoubleDouble !== 'undefined' && this.zoom >= this.highPrecisionCpuThreshold;
    }

    async buildDoubleDoubleCoordinateArrayAsync(startDD, deltaDD, length, token, label) {
        if (typeof DoubleDouble === 'undefined') return [];
        const coords = new Array(length);
        let current = startDD.clone();
        for (let i = 0; i < length; i++) {
            if (token !== this.cpuRenderToken) return [];
            coords[i] = current.clone();
            current = current.add(deltaDD);
            
            // Yield and update UI every 200 coordinates
            if (i % 200 === 0) {
                if (this.progressTextEl) {
                    this.progressTextEl.textContent = `Setting up ${label}: ${Math.round((i / length) * 100)}%`;
                }
                await new Promise(resolve => requestAnimationFrame(resolve));
            }
        }
        return coords;
    }

    async populateCpuBufferStandardAsync(token, imageData, width, height, renderCenterX, renderCenterY, renderZoom) {
        console.log(`[CPU Render] Standard precision mode active.`);
        const data = imageData.data;
        const scale = 4 / (this.canvas.width * renderZoom);
        const halfWidth = width / 2;
        const halfHeight = height / 2;
        const startX = renderCenterX - halfWidth * scale;
        const startY = renderCenterY + halfHeight * scale;

        console.log(`[CPU Render] Building coordinate arrays...`);
        const yCoords = this.buildCoordinateArray(startY, -scale, height);
        const xCoords = this.buildCoordinateArray(startX, scale, width);
        const rowOrder = this.buildCenterOutOrder(height);
        const colOrder = this.buildCenterOutOrder(width);
        console.log(`[CPU Render] Coordinate arrays built. Starting pixel loop...`);

        let lastYieldTime = performance.now();
        const yieldInterval = 16; // Yield every 16ms (60fps)
        const showProgress = !this.hasCpuFrame; // Only show progress if we don't have an old frame to show

        for (let rIdx = 0; rIdx < rowOrder.length; rIdx++) {
            if (token !== this.cpuRenderToken) return false;
            const y = rowOrder[rIdx];
            const cy = yCoords[y];
            for (let cIdx = 0; cIdx < colOrder.length; cIdx++) {
                if (token !== this.cpuRenderToken) return false;
                const x = colOrder[cIdx];
                const cx = xCoords[x];
                let zx = 0;
                let zy = 0;
                let escaped = false;
                let iter = 0;
                for (; iter < this.maxIterations; iter++) {
                    if (this.fractalType === 'burningship') {
                        zx = Math.abs(zx);
                        zy = Math.abs(zy);
                    }
                    const x2 = zx * zx;
                    const y2 = zy * zy;
                    const new_zx = x2 - y2 + cx;
                    const new_zy = this.fractalType === 'burningship' ? -2.0 * zx * zy + cy : 2.0 * zx * zy + cy;
                    zx = new_zx;
                    zy = new_zy;
                }
                let r = 0, g = 0, b = 0;
                if (escaped) {
                    const t = iter / this.maxIterations;
                    const color = this.getPaletteColor(t);
                    r = color.r; g = color.g; b = color.b;
                }
                const offset = (y * width + x) * 4;
                data[offset] = r;
                data[offset + 1] = g;
                data[offset + 2] = b;
                data[offset + 3] = 255;
            }
            
            // Time-based yielding
            if (performance.now() - lastYieldTime > yieldInterval) {
                const totalPixels = width * height;
                const pixelsDone = (rIdx + 1) * width;
                this.updateProgressBar((pixelsDone / totalPixels) * 100, pixelsDone, totalPixels);
                
                // Show blooming progress on the dedicated progress canvas
                this.updateProgressFrame(imageData, renderCenterX, renderCenterY, renderZoom);
                
                await new Promise(resolve => requestAnimationFrame(resolve));
                lastYieldTime = performance.now();
            }
        }
        const totalPixels = width * height;
        this.updateProgressBar(100, totalPixels, totalPixels);
        return true;
    }

    async populateCpuBufferHighPrecisionAsync(token, imageData, width, height, renderCenterX, renderCenterY, renderZoom) {
        if (typeof DoubleDouble === 'undefined') return this.populateCpuBufferStandardAsync(token, imageData, width, height, renderCenterX, renderCenterY, renderZoom);
        console.log(`[CPU Render] High precision (DoubleDouble) mode active.`);
        const data = imageData.data;
        const scale = 4 / (this.canvas.width * renderZoom);
        const scaleDD = DoubleDouble.fromNumber(scale);
        const negScaleDD = scaleDD.neg();
        const halfWidth = DoubleDouble.fromNumber(width / 2);
        const halfHeight = DoubleDouble.fromNumber(height / 2);
        const centerXDD = DoubleDouble.fromNumber(renderCenterX);
        const centerYDD = DoubleDouble.fromNumber(renderCenterY);
        const startX = centerXDD.sub(halfWidth.mul(scaleDD));
        const startY = centerYDD.add(halfHeight.mul(scaleDD));
        
        console.log(`[CPU Render] Building high-precision coordinate arrays...`);
        const yCoords = await this.buildDoubleDoubleCoordinateArrayAsync(startY, negScaleDD, height, token, 'Y-axis');
        if (token !== this.cpuRenderToken) return false;
        const xCoords = await this.buildDoubleDoubleCoordinateArrayAsync(startX, scaleDD, width, token, 'X-axis');
        if (token !== this.cpuRenderToken) return false;

        const rowOrder = this.buildCenterOutOrder(height);
        const colOrder = this.buildCenterOutOrder(width);
        console.log(`[CPU Render] Coordinate arrays built. Starting pixel loop...`);
        const escapeThreshold = 4.0; // Use number for comparison

        const zx = DoubleDouble.zero();
        const zy = DoubleDouble.zero();
        const zx2 = DoubleDouble.zero();
        const zy2 = DoubleDouble.zero();
        const tmp = DoubleDouble.zero();
        const twoZxZy = DoubleDouble.zero();

        let lastYieldTime = performance.now();
        const yieldInterval = 16; // Yield every 16ms (60fps)
        const isInitialCpuRender = !this.hasCpuFrame;

        for (let rIdx = 0; rIdx < rowOrder.length; rIdx++) {
            if (token !== this.cpuRenderToken) return false;
            const y = rowOrder[rIdx];
            const cy = yCoords[y];
            for (let cIdx = 0; cIdx < colOrder.length; cIdx++) {
                if (token !== this.cpuRenderToken) return false;
                const x = colOrder[cIdx];
                const cx = xCoords[x];
                
                zx.hi = 0; zx.lo = 0;
                zy.hi = 0; zy.lo = 0;
                
                let escaped = false;
                let iter = 0;
                for (; iter < this.maxIterations; iter++) {
                    if (this.fractalType === 'burningship') {
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
                    if (this.fractalType === 'burningship') {
                        // Invert the imaginary part for upright ship: -2*zx*zy + cy
                        twoZxZy.hi = -twoZxZy.hi;
                        twoZxZy.lo = -twoZxZy.lo;
                    }
                    twoZxZy.hi *= 2; twoZxZy.lo *= 2;
                    
                    // zx = zx2 - zy2 + cx
                    DoubleDouble.sub(zx2.hi, zx2.lo, zy2.hi, zy2.lo, tmp);
                    DoubleDouble.add(tmp.hi, tmp.lo, cx.hi, cx.lo, zx);
                    
                    // zy = twoZxZy + cy
                    DoubleDouble.add(twoZxZy.hi, twoZxZy.lo, cy.hi, cy.lo, zy);
                    
                    // Inner loop yield check for very slow iterations
                    if (iter > 0 && iter % 1000 === 0) {
                        if (performance.now() - lastYieldTime > yieldInterval) {
                            await new Promise(resolve => requestAnimationFrame(resolve));
                            lastYieldTime = performance.now();
                            if (token !== this.cpuRenderToken) return false;
                        }
                    }
                }
                let r = 0, g = 0, b = 0;
                if (escaped) {
                    const t = iter / this.maxIterations;
                    const color = this.getPaletteColor(t);
                    r = color.r; g = color.g; b = color.b;
                }
                const offset = (y * width + x) * 4;
                data[offset] = r;
                data[offset + 1] = g;
                data[offset + 2] = b;
                data[offset + 3] = 255;

                // Time-based yielding between pixels
                if (performance.now() - lastYieldTime > yieldInterval) {
                    const totalPixels = width * height;
                    const pixelsDone = rIdx * width + cIdx;
                    this.updateProgressBar((pixelsDone / totalPixels) * 100, pixelsDone, totalPixels);
                    
                    // Show blooming progress on the dedicated progress canvas
                    this.updateProgressFrame(imageData, renderCenterX, renderCenterY, renderZoom);
                    
                    await new Promise(resolve => requestAnimationFrame(resolve));
                    lastYieldTime = performance.now();
                }
            }
        }
        const totalPixels = width * height;
        this.updateProgressBar(100, totalPixels, totalPixels);
        return true;
    }

    updateCpuFrameTransform() {
        const width = this.canvas.width;
        const height = this.canvas.height;

        // Transform the stable CPU frame
        if (this.cpuCanvas && this.hasCpuFrame) {
            const scaleRatio = this.zoom / this.cpuFrameZoom;
            const currentScale = 4 / (width * this.zoom);
            const tx = (1 - scaleRatio) * (width / 2) + (this.cpuFrameCenterX - this.centerX) / currentScale;
            const ty = (1 - scaleRatio) * (height / 2) + (this.centerY - this.cpuFrameCenterY) / currentScale;
            this.cpuCanvas.style.transformOrigin = '0 0';
            this.cpuCanvas.style.transform = `matrix(${scaleRatio}, 0, 0, ${scaleRatio}, ${tx}, ${ty})`;
        } else if (this.cpuCanvas) {
            this.cpuCanvas.style.transform = '';
        }

        // Transform the progress CPU frame
        if (this.cpuCanvasProgress && this.isCpuRendering && this.progressFrameZoom) {
            const scaleRatio = this.zoom / this.progressFrameZoom;
            const currentScale = 4 / (width * this.zoom);
            const tx = (1 - scaleRatio) * (width / 2) + (this.progressFrameCenterX - this.centerX) / currentScale;
            const ty = (1 - scaleRatio) * (height / 2) + (this.centerY - this.progressFrameCenterY) / currentScale;
            this.cpuCanvasProgress.style.transformOrigin = '0 0';
            this.cpuCanvasProgress.style.transform = `matrix(${scaleRatio}, 0, 0, ${scaleRatio}, ${tx}, ${ty})`;
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
