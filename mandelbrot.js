class MandelbrotViewer {
    constructor() {
        this.canvas = document.getElementById('canvas');
        this.ctx = this.canvas.getContext('2d');
        
        // View parameters
        this.centerX = -0.5;
        this.centerY = 0;
        this.zoom = 1;
        this.baseIterations = 100;
        this.maxIterations = 100;
        this.adaptiveIterations = true;
        this.fractalType = 'mandelbrot';
        this.isPinching = false;
        this.initialPinchDistance = 0;
        this.initialZoom = 1;
        this.pinchCenter = { x: 0, y: 0 };
        this.useWebGL = false;
        this.webglAvailable = false;
        this.webglEnabled = true;
        this.gl = null;
        this.program = null;
        this.uniforms = {};
        
        // Canvas setup
        this.resizeCanvas();
        window.addEventListener('resize', () => this.resizeCanvas());
        this.initWebGL();
        this.render();

        this.setupCollapsiblePanels();
        
        // Interaction state
        this.isDragging = false;
        this.dragStartX = 0;
        this.dragStartY = 0;
        this.isTouring = false;
        this.tourIndex = 0;
        
        // Tour locations - interesting fractal spots
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
        this.setupEventListeners();
        this.render();
    }
    
    resizeCanvas() {
        this.canvas.width = window.innerWidth;
        this.canvas.height = window.innerHeight;
        if (this.useWebGL && this.gl) {
            this.gl.viewport(0, 0, this.canvas.width, this.canvas.height);
        }
        this.render();
    }
    
    setupEventListeners() {
        // Mouse controls
        this.canvas.addEventListener('mousedown', (e) => this.handleMouseDown(e));
        this.canvas.addEventListener('mousemove', (e) => this.handleMouseMove(e));
        this.canvas.addEventListener('mouseup', (e) => this.handleMouseUp(e));
        this.canvas.addEventListener('wheel', (e) => this.handleWheel(e));
        this.canvas.addEventListener('contextmenu', (e) => e.preventDefault());
        
        // Touch controls for mobile
        this.canvas.addEventListener('touchstart', (e) => this.handleTouchStart(e));
        this.canvas.addEventListener('touchmove', (e) => this.handleTouchMove(e));
        this.canvas.addEventListener('touchend', (e) => this.handleTouchEnd(e));
        
        // UI controls
        document.getElementById('iterations').addEventListener('input', (e) => {
            this.baseIterations = parseInt(e.target.value);
            this.updateIterations();
            this.render();
        });
        
        document.getElementById('adaptiveToggle').addEventListener('change', (e) => {
            this.adaptiveIterations = e.target.checked;
            this.updateIterations();
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
            this.render();
        });

        const webglToggle = document.getElementById('webglToggle');
        if (webglToggle) {
            webglToggle.addEventListener('change', (e) => {
                this.setWebGLOption(e.target.checked);
            });
        }
        
        // Tour controls
        document.getElementById('tourStart').addEventListener('click', () => this.startTour());
        document.getElementById('tourStop').addEventListener('click', () => this.stopTour());
        document.getElementById('tourNext').addEventListener('click', () => this.nextTourLocation());
        document.getElementById('tourPrev').addEventListener('click', () => this.prevTourLocation());
    }

    setupCollapsiblePanels() {
        const buttons = document.querySelectorAll('.collapse-btn');
        buttons.forEach((btn) => {
            const targetId = btn.dataset.target;
            const panel = document.getElementById(targetId);
            if (!panel) return;
            btn.addEventListener('click', () => {
                const isCollapsed = panel.classList.toggle('collapsed');
                btn.setAttribute('aria-expanded', (!isCollapsed).toString());
                btn.textContent = isCollapsed ? '+' : '−';
            });
        });
    }
    
    handleMouseDown(e) {
        if (e.button === 0) { // Left click
            this.isDragging = true;
            this.dragStartX = e.clientX;
            this.dragStartY = e.clientY;
        } else if (e.button === 2) { // Right click
            this.zoomAt(e.clientX, e.clientY, 0.5);
        }
    }
    
    handleMouseMove(e) {
        const coords = this.screenToComplex(e.clientX, e.clientY);
        this.updateCoordinates(coords.x, coords.y);
        
        if (this.isDragging) {
            const dx = e.clientX - this.dragStartX;
            const dy = e.clientY - this.dragStartY;
            
            const scale = 4 / (this.canvas.width * this.zoom);
            this.centerX -= dx * scale;
            this.centerY -= dy * scale;
            
            this.dragStartX = e.clientX;
            this.dragStartY = e.clientY;
            
            this.render();
        }
    }
    
    handleMouseUp(e) {
        if (e.button === 0 && !this.isDragging) {
            // Left click release without drag = zoom in
            this.zoomAt(e.clientX, e.clientY, 2);
        }
        this.isDragging = false;
    }
    
    handleWheel(e) {
        e.preventDefault();
        const zoomFactor = e.deltaY > 0 ? 0.9 : 1.1;
        this.zoomAt(e.clientX, e.clientY, zoomFactor);
    }
    
    handleTouchStart(e) {
        if (e.touches.length === 1 && !this.isPinching) {
            this.isDragging = true;
            this.dragStartX = e.touches[0].clientX;
            this.dragStartY = e.touches[0].clientY;
        }
        
        if (e.touches.length === 2) {
            this.isDragging = false;
            this.isPinching = true;
            this.initialPinchDistance = this.getTouchDistance(e.touches);
            this.initialZoom = this.zoom;
            this.pinchCenter = this.getTouchCenter(e.touches);
        }
    }
    
    handleTouchMove(e) {
        e.preventDefault();
        
        if (this.isPinching && e.touches.length === 2) {
            const currentDistance = this.getTouchDistance(e.touches);
            if (this.initialPinchDistance === 0) return;
            
            const pinchScale = currentDistance / this.initialPinchDistance;
            const targetZoom = this.initialZoom * pinchScale;
            const factor = targetZoom / this.zoom;
            const center = this.getTouchCenter(e.touches);
            this.zoomAt(center.x, center.y, factor);
            return;
        }
        
        if (e.touches.length === 1 && this.isDragging) {
            const dx = e.touches[0].clientX - this.dragStartX;
            const dy = e.touches[0].clientY - this.dragStartY;
            
            const scale = 4 / (this.canvas.width * this.zoom);
            this.centerX -= dx * scale;
            this.centerY -= dy * scale;
            
            this.dragStartX = e.touches[0].clientX;
            this.dragStartY = e.touches[0].clientY;
            
            this.render();
        }
    }
    
    handleTouchEnd(e) {
        if (e.touches.length === 0) {
            this.isDragging = false;
            this.isPinching = false;
        } else if (e.touches.length === 1) {
            // If one finger remains, allow panning to continue seamlessly
            this.isPinching = false;
            this.isDragging = true;
            this.dragStartX = e.touches[0].clientX;
            this.dragStartY = e.touches[0].clientY;
        }
    }
    
    getTouchDistance(touches) {
        const dx = touches[0].clientX - touches[1].clientX;
        const dy = touches[0].clientY - touches[1].clientY;
        return Math.hypot(dx, dy);
    }
    
    getTouchCenter(touches) {
        const x = (touches[0].clientX + touches[1].clientX) / 2;
        const y = (touches[0].clientY + touches[1].clientY) / 2;
        return { x, y };
    }
    
    zoomAt(screenX, screenY, factor) {
        const coords = this.screenToComplex(screenX, screenY);
        
        this.zoom *= factor;
        
        // Adjust center to zoom towards the clicked point
        const newCoords = this.screenToComplex(screenX, screenY);
        this.centerX += coords.x - newCoords.x;
        this.centerY += coords.y - newCoords.y;
        
        this.render();
    }
    
    screenToComplex(screenX, screenY) {
        const scale = 4 / (this.canvas.width * this.zoom);
        return {
            x: this.centerX + (screenX - this.canvas.width / 2) * scale,
            y: this.centerY + (screenY - this.canvas.height / 2) * scale
        };
    }
    
    mandelbrot(cx, cy) {
        let x = 0, y = 0;
        let iteration = 0;
        
        if (this.fractalType === 'mandelbrot') {
            while (x * x + y * y <= 4 && iteration < this.maxIterations) {
                const xTemp = x * x - y * y + cx;
                y = 2 * x * y + cy;
                x = xTemp;
                iteration++;
            }
        } else if (this.fractalType === 'burningship') {
            while (x * x + y * y <= 4 && iteration < this.maxIterations) {
                // Burning Ship: z = (|Re(z)| + i|Im(z)|)^2 + c
                const xTemp = x * x - y * y + cx;
                y = Math.abs(2 * x * y) + cy;
                x = xTemp; // Corrected: Re(z) doesn't need another abs here
                iteration++;
            }
        }
        
        if (iteration === this.maxIterations) {
            return { inSet: true, iteration: this.maxIterations };
        }
        
        // Smooth coloring
        const smoothed = iteration + 1 - Math.log(Math.log(Math.sqrt(x * x + y * y))) / Math.log(2);
        return { inSet: false, iteration: smoothed };
    }
    
    getColor(iteration, maxIterations) {
        const theme = document.body.getAttribute('data-theme') || 'light';
        
        if (iteration >= maxIterations) {
            // Set color: Black for light/dark, but can be customized
            if (theme === 'eink') return [0, 0, 0];
            if (theme === 'light') return [0, 0, 0]; // Keep set black in light theme for contrast
            return [255, 255, 255]; // White set in dark theme
        }
        
        const t = iteration / maxIterations;
        
        // E-ink theme should be strictly grayscale
        if (theme === 'eink') {
            const gray = Math.round((1 - t) * 255);
            return [gray, gray, gray];
        }
        
        switch (this.colorScheme) {
            case 'classic':
                return this.classicColor(t);
            case 'fire':
                return this.fireColor(t);
            case 'ocean':
                return this.oceanColor(t);
            case 'psychedelic':
                return this.psychedelicColor(t);
            default:
                return this.classicColor(t);
        }
    }
    
    classicColor(t) {
        const hue = t * 360;
        return this.hslToRgb(hue, 100, 50);
    }
    
    fireColor(t) {
        const r = Math.min(255, t * 512);
        const g = Math.min(255, t * 256);
        const b = Math.min(255, t * 128);
        return [r, g, b];
    }
    
    oceanColor(t) {
        const r = Math.min(255, t * 64);
        const g = Math.min(255, t * 128);
        const b = Math.min(255, 128 + t * 127);
        return [r, g, b];
    }
    
    psychedelicColor(t) {
        const r = Math.sin(t * Math.PI * 4) * 127 + 128;
        const g = Math.sin(t * Math.PI * 6 + 2) * 127 + 128;
        const b = Math.sin(t * Math.PI * 8 + 4) * 127 + 128;
        return [r, g, b];
    }
    
    hslToRgb(h, s, l) {
        h = h / 360;
        s = s / 100;
        l = l / 100;
        
        let r, g, b;
        
        if (s === 0) {
            r = g = b = l;
        } else {
            const hue2rgb = (p, q, t) => {
                if (t < 0) t += 1;
                if (t > 1) t -= 1;
                if (t < 1/6) return p + (q - p) * 6 * t;
                if (t < 1/2) return q;
                if (t < 2/3) return p + (q - p) * (2/3 - t) * 6;
                return p;
            };
            
            const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
            const p = 2 * l - q;
            r = hue2rgb(p, q, h + 1/3);
            g = hue2rgb(p, q, h);
            b = hue2rgb(p, q, h - 1/3);
        }
        
        return [Math.round(r * 255), Math.round(g * 255), Math.round(b * 255)];
    }
    
    updateIterations() {
        if (this.adaptiveIterations) {
            // Adaptive formula: base * (1 + 0.5 * log10(zoom))
            // This increases iterations as we zoom in, but not too aggressively
            const logZoom = Math.log10(Math.max(1, this.zoom));
            this.maxIterations = Math.round(this.baseIterations * (1 + logZoom * 0.8));
        } else {
            this.maxIterations = this.baseIterations;
        }
        
        document.getElementById('iterValue').textContent = this.maxIterations;
    }
    
    render() {
        this.updateIterations();
        if (this.useWebGL) {
            this.renderWebGL();
        } else {
            this.renderCanvas();
        }
        this.updateZoomIndicator();
        this.updateRenderIndicator();
    }

    getColorSchemeIndex() {
        switch (this.colorScheme) {
            case 'fire':
                return 1;
            case 'ocean':
                return 2;
            case 'psychedelic':
                return 3;
            default:
                return 0;
        }
    }

    setWebGLOption(enable) {
        this.webglEnabled = enable;
        if (enable) {
            if (!this.webglAvailable) {
                this.initWebGL();
            }
            this.useWebGL = this.webglAvailable;
        } else {
            this.useWebGL = false;
        }
        this.updateWebGLToggleUI();
        this.render();
    }

    initWebGL() {
        if (this.webglAvailable && this.gl) {
            this.useWebGL = this.webglEnabled;
            this.updateWebGLToggleUI();
            return;
        }

        try {
            const gl = this.canvas.getContext('webgl', { antialias: false });
            if (!gl) {
                console.warn('WebGL not supported, falling back to Canvas 2D.');
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
                uniform float u_zoom;
                uniform int u_maxIterations;
                uniform int u_colorScheme;
                uniform int u_fractalType;
                uniform int u_theme;

                vec3 hsv2rgb(vec3 c) {
                    vec4 K = vec4(1.0, 2.0/3.0, 1.0/3.0, 3.0);
                    vec3 p = abs(fract(c.xxx + K.xyz) * 6.0 - K.www);
                    return c.z * mix(K.xxx, clamp(p - K.xxx, 0.0, 1.0), c.y);
                }

                vec3 classicScheme(float t) {
                    return hsv2rgb(vec3(t, 1.0, 1.0));
                }

                vec3 fireScheme(float t) {
                    return vec3(min(1.0, t * 2.0), min(1.0, t * 1.0), min(1.0, t * 0.5));
                }

                vec3 oceanScheme(float t) {
                    return vec3(t * 0.3, t * 0.5, 0.5 + t * 0.5);
                }

                vec3 psychedelicScheme(float t) {
                    return vec3(
                        sin(t * 12.566 + 0.0) * 0.5 + 0.5,
                        sin(t * 18.849 + 2.0) * 0.5 + 0.5,
                        sin(t * 25.132 + 4.0) * 0.5 + 0.5
                    );
                }

                vec3 palette(float t, int scheme) {
                    if (scheme == 1) return fireScheme(t);
                    if (scheme == 2) return oceanScheme(t);
                    if (scheme == 3) return psychedelicScheme(t);
                    return classicScheme(t);
                }

                void main() {
                    float scale = 4.0 / (u_resolution.x * u_zoom);
                    vec2 c = vec2(
                        u_center.x + (gl_FragCoord.x - 0.5 * u_resolution.x) * scale,
                        u_center.y + (gl_FragCoord.y - 0.5 * u_resolution.y) * scale
                    );

                    vec2 z = vec2(0.0);
                    int i;
                    for (i = 0; i < 5000; i++) {
                        if (i >= u_maxIterations) break;

                        if (u_fractalType == 1) {
                            z = vec2(abs(z.x), abs(z.y));
                        }

                        float x = z.x * z.x - z.y * z.y + c.x;
                        float y = 2.0 * z.x * z.y + c.y;
                        z = vec2(x, y);

                        if (dot(z, z) > 4.0) break;
                    }

                    vec3 color;
                    if (i >= u_maxIterations) {
                        if (u_theme == 1) {
                            color = vec3(1.0);
                        } else {
                            color = vec3(0.0);
                        }
                    } else {
                        float t = float(i) / float(u_maxIterations);
                        if (u_theme == 2) {
                            float gray = 1.0 - t;
                            color = vec3(gray);
                        } else {
                            color = palette(t, u_colorScheme);
                        }
                    }

                    gl_FragColor = vec4(color, 1.0);
                }
            `;

            const vertexShader = this.compileShader(gl.VERTEX_SHADER, vertexSrc);
            const fragmentShader = this.compileShader(gl.FRAGMENT_SHADER, fragmentSrc);
            const program = gl.createProgram();
            gl.attachShader(program, vertexShader);
            gl.attachShader(program, fragmentShader);
            gl.linkProgram(program);
            if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
                console.warn('WebGL program failed to link:', gl.getProgramInfoLog(program));
                return;
            }

            gl.useProgram(program);
            const positionBuffer = gl.createBuffer();
            gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
            const positions = new Float32Array([
                -1, -1,
                 1, -1,
                -1,  1,
                 1,  1,
            ]);
            gl.bufferData(gl.ARRAY_BUFFER, positions, gl.STATIC_DRAW);
            const positionLocation = gl.getAttribLocation(program, 'a_position');
            gl.enableVertexAttribArray(positionLocation);
            gl.vertexAttribPointer(positionLocation, 2, gl.FLOAT, false, 0, 0);

            this.uniforms = {
                resolution: gl.getUniformLocation(program, 'u_resolution'),
                center: gl.getUniformLocation(program, 'u_center'),
                zoom: gl.getUniformLocation(program, 'u_zoom'),
                maxIterations: gl.getUniformLocation(program, 'u_maxIterations'),
                colorScheme: gl.getUniformLocation(program, 'u_colorScheme'),
                fractalType: gl.getUniformLocation(program, 'u_fractalType'),
                theme: gl.getUniformLocation(program, 'u_theme'),
            };

            this.program = program;
            this.webglAvailable = true;
            this.useWebGL = this.webglEnabled;
            gl.viewport(0, 0, this.canvas.width, this.canvas.height);
            console.info('WebGL rendering enabled.');
            this.updateWebGLToggleUI();
        } catch (error) {
            console.warn('Failed to initialize WebGL, falling back to Canvas 2D.', error);
            this.useWebGL = false;
            this.webglAvailable = false;
            this.webglEnabled = false;
            this.updateWebGLToggleUI();
        }
    }

    compileShader(type, source) {
        const gl = this.gl;
        const shader = gl.createShader(type);
        gl.shaderSource(shader, source);
        gl.compileShader(shader);
        if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
            console.warn('Shader compile failed:', gl.getShaderInfoLog(shader));
            gl.deleteShader(shader);
            throw new Error('Shader compilation failed');
        }
        return shader;
    }

    renderCanvas() {
        const width = this.canvas.width;
        const height = this.canvas.height;
        const imageData = this.ctx.createImageData(width, height);
        const data = imageData.data;
        
        const scale = 4 / (width * this.zoom);
        
        for (let py = 0; py < height; py++) {
            for (let px = 0; px < width; px++) {
                const x = this.centerX + (px - width / 2) * scale;
                const y = this.centerY + (py - height / 2) * scale;
                
                const result = this.mandelbrot(x, y);
                const [r, g, b] = this.getColor(result.iteration, this.maxIterations);
                
                const index = (py * width + px) * 4;
                data[index] = r;
                data[index + 1] = g;
                data[index + 2] = b;
                data[index + 3] = 255;
            }
        }
        
        this.ctx.putImageData(imageData, 0, 0);
    }
    
    renderWebGL() {
        const gl = this.gl;
        if (!gl || !this.program) return;
        gl.useProgram(this.program);
        gl.uniform2f(this.uniforms.center, this.centerX, this.centerY);
        gl.uniform1f(this.uniforms.zoom, this.zoom);
        gl.uniform2f(this.uniforms.resolution, this.canvas.width, this.canvas.height);
        gl.uniform1i(this.uniforms.maxIterations, this.maxIterations);
        gl.uniform1i(this.uniforms.colorScheme, this.getColorSchemeIndex());
        gl.uniform1i(this.uniforms.fractalType, this.fractalType === 'burningship' ? 1 : 0);
        const theme = document.body.getAttribute('data-theme') || 'light';
        const themeIndex = theme === 'dark' ? 1 : theme === 'eink' ? 2 : 0;
        gl.uniform1i(this.uniforms.theme, themeIndex);
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    }
    
    updateCoordinates(x, y) {
        const coords = document.getElementById('coordinates');
        coords.textContent = `X: ${x.toFixed(6)} | Y: ${y.toFixed(6)} | Zoom: ${this.zoom.toFixed(1)}x`;
    }
    
    updateZoomIndicator() {
        const indicator = document.getElementById('zoomIndicator');
        indicator.textContent = `Zoom: ${this.zoom.toFixed(1)}x`;
    }

    updateRenderIndicator() {
        const indicator = document.getElementById('renderIndicator');
        const text = document.getElementById('renderModeText');
        if (!indicator || !text) return;
        if (this.useWebGL) {
            indicator.classList.remove('canvas');
            text.textContent = 'Renderer: WebGL';
        } else {
            indicator.classList.add('canvas');
            text.textContent = 'Renderer: Canvas';
        }
    }

    updateWebGLToggleUI() {
        const toggle = document.getElementById('webglToggle');
        const status = document.getElementById('webglStatus');
        if (!toggle || !status) return;
        if (!this.webglAvailable) {
            toggle.checked = false;
            toggle.disabled = true;
            status.textContent = 'WebGL not supported';
            this.useWebGL = false;
        } else {
            toggle.disabled = false;
            toggle.checked = this.webglEnabled;
            status.textContent = this.webglEnabled ? 'WebGL enabled' : 'WebGL disabled';
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
        link.download = `mandelbrot_${Date.now()}.png`;
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
        const fractalSelect = document.getElementById('fractalType');
        if (fractalSelect) {
            fractalSelect.value = this.fractalType;
        }
        
        this.centerX = location.x;
        this.centerY = location.y;
        this.zoom = location.zoom;
        
        this.render();
        
        document.getElementById('tourInfo').innerHTML = `
            <strong>${location.name}</strong><br>
            ${location.description}<br>
            Location ${index + 1} of ${this.tourLocations.length}
        `;
        
        document.getElementById('tourPrev').disabled = index === 0;
        document.getElementById('tourNext').disabled = index === this.tourLocations.length - 1;
    }
}

// Initialize the viewer when the page loads
window.addEventListener('DOMContentLoaded', () => {
    new MandelbrotViewer();
});
