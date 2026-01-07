import { Renderer } from './Renderer.js';

export class WebGLRenderer extends Renderer {
    constructor(canvas, options = {}) {
        super(canvas, options);
        this.gl = null;
        this.program = null;
        this.uniforms = {};
        this.init();
    }

    init() {
        const params = { alpha: true, depth: false, stencil: false, antialias: false, preserveDrawingBuffer: false };
        const gl = this.canvas.getContext('webgl2', params) || 
                   this.canvas.getContext('webgl', params) || 
                   this.canvas.getContext('experimental-webgl', params);
        if (!gl) return;
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
                    u_center.x + ((gl_FragCoord.x - 0.5) - 0.5 * u_resolution.x) * scale,
                    u_center.y + (0.5 * u_resolution.y - (gl_FragCoord.y - 0.5)) * scale
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
    }

    compileShader(type, source) {
        const shader = this.gl.createShader(type);
        this.gl.shaderSource(shader, source);
        this.gl.compileShader(shader);
        if (!this.gl.getShaderParameter(shader, this.gl.COMPILE_STATUS)) {
            console.error('Shader compile failed:', this.gl.getShaderInfoLog(shader));
            this.gl.deleteShader(shader);
            return null;
        }
        return shader;
    }

    render(params) {
        const gl = this.gl;
        if (!gl || !this.program) return;
        gl.useProgram(this.program);
        const fround = Math.fround || ((value) => value);
        const centerBaseX = fround(params.centerX);
        const centerBaseY = fround(params.centerY);
        const centerResidualX = params.centerX - centerBaseX;
        const centerResidualY = params.centerY - centerBaseY;
        const zoomBase = fround(params.zoom);
        const zoomResidual = params.zoom / zoomBase;
        gl.uniform2f(this.uniforms.center, centerBaseX, centerBaseY);
        gl.uniform2f(this.uniforms.centerResidual, centerResidualX, centerResidualY);
        gl.uniform1f(this.uniforms.zoomBase, zoomBase);
        gl.uniform1f(this.uniforms.zoomResidual, zoomResidual);
        gl.uniform2f(this.uniforms.resolution, this.canvas.width, this.canvas.height);
        gl.uniform1i(this.uniforms.maxIterations, params.maxIterations);
        gl.uniform1i(this.uniforms.colorScheme, params.colorSchemeIndex);
        gl.uniform1i(this.uniforms.fractalType, params.fractalType === 'burningship' ? 1 : 0);
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    }

    resize(width, height) {
        if (this.gl) {
            this.gl.viewport(0, 0, width, height);
        }
    }
}
