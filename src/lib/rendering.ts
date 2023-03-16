import { mat4, vec2, vec3 } from "gl-matrix";
import vertexShaderUrl from "$lib/shaders/shader.vs.glsl?url";
import fragmentShaderUrl from "$lib/shaders/shader.fs.glsl?url";

export class VPixel {
    // ====================
    // Static functionality
    // ====================

    /** Shared vertex array for all VPixels */
    public static readonly vertices = [
        0, 1, 0,    // 0: Top-left
        0, -1, 0,   // 1: Bottom-left
        1, -1, 0,   // 2: Bottom-right
        1, 1, 0     // 3: Top-right
    ];

    /** Shared vertex indices for all VPixels */
    public static readonly indices = [
        0, 1, 2,    // Left tri
        2, 3, 0     // Right tri
    ];

    public static readonly onColor = vec3.fromValues(1.0, 1.0, 1.0);
    public static readonly offColor = vec3.fromValues(0.0, 0.0, 0.0);

    private static scale: number = 1.0;

    /**
     * 
     * @param width width of rendered image in pixels
     * @param vWidth width of vPixels in display
     */
    public static calculateScale(width: number, vWidth: number) {
        VPixel.scale = width / vWidth;
    }

    // ======================
    // Instance functionality
    // ======================

    private position: vec2 = vec2.create();
    // private scale: number;

    private renderPosition: vec3 = vec3.create();

    public on: boolean = false;

    public constructor(x: number, y: number) {
        this.position[0] = x;
        this.position[1] = y;
        this.calculateRenderPosition();
    }

    public getPosition(): vec2 {
        return this.position;
    }

    public calculateRenderPosition(): void {
        const x = (this.position[0] * VPixel.scale);
        const y = (this.position[1] * VPixel.scale) + VPixel.scale;
        this.renderPosition = [x, y, 0.0];
    }

    public getModelMat4(): mat4 {
        const modelMatrix = mat4.create();

        // TODO: Translate
        mat4.translate(modelMatrix, modelMatrix, this.renderPosition);

        // Scale
        mat4.scale(modelMatrix, modelMatrix, [VPixel.scale, VPixel.scale, 1.0]);

        return modelMatrix;
    }
}

export default class Display {
    /** Fixed display aspect ratio */
    private static readonly ASPECT_RATIO = 2;

    /** Display width in VPixels */
    public static readonly vWidth = 64;
    /** Display height in VPixels */
    public static readonly vHeight = 32;

    private vPixels: Array<VPixel> = [];

    private canvas: HTMLCanvasElement;
    private gl: WebGL2RenderingContext;

    private shaderProgram: WebGLProgram | null = null;
    private vao: WebGLVertexArrayObject | null = null;
    private indexBuffer: WebGLBuffer | null = null;
    private vertexBuffer: WebGLBuffer | null = null;

    private projectionUniformLoc: WebGLUniformLocation | null = null;
    private modelUniformLoc: WebGLUniformLocation | null = null;
    private colorUniformLoc: WebGLUniformLocation | null = null;

    private projectionMatrix: mat4 = mat4.create();
    private viewMatrix: mat4 = mat4.create();

    protected constructor(gl: WebGL2RenderingContext, canvas: HTMLCanvasElement) {
        this.gl = gl;
        this.canvas = canvas;

        this.resizeViewport();
    }

    public resizeViewport() {
        const width = this.canvas.clientWidth;
        this.canvas.width = width;
        const height = width / Display.ASPECT_RATIO
        this.canvas.height = height;

        this.gl.viewport(0, 0, width, height);
        this.gl.scissor(0, 0, width, height);
        mat4.ortho(this.projectionMatrix, 0, width, height, 0, -1000, 1000);
        mat4.lookAt(this.viewMatrix, [0, 0, 1], [0, 0, 0], [0, 1, 0]);

        VPixel.calculateScale(width, Display.vWidth);
        for (const vPixel of this.vPixels) {
            vPixel.calculateRenderPosition();
        }

        this.render();
    }

    public static createForCanvas(canvas: HTMLCanvasElement): Display {
        const gl = canvas.getContext("webgl2", {alpha: false});
        if (!gl) {
            throw Error("Failed to create WebGL2 rendering context");
        }

        return new Display(gl, canvas);
    }

    private compileShader(src: string, type: number): WebGLShader {
        const shader = this.gl.createShader(type);
        if (!shader) {
            throw Error("Failed to allocate shader");
        }

        this.gl.shaderSource(shader, src);
        this.gl.compileShader(shader);

        const success = this.gl.getShaderParameter(shader, this.gl.COMPILE_STATUS);
        if (!success) {
            this.gl.deleteShader(shader);
            const infoLog = this.gl.getShaderInfoLog(shader) ?? "Unknown shader compilation error";
            throw Error(infoLog);
        }

        return shader;
    }

    private async loadShaderProgram() {
        const vertexShaderSrc = await (await fetch(vertexShaderUrl)).text();
        const fragmentShaderSrc = await (await fetch(fragmentShaderUrl)).text();

        const shaders = [
            this.compileShader(vertexShaderSrc, this.gl.VERTEX_SHADER),
            this.compileShader(fragmentShaderSrc, this.gl.FRAGMENT_SHADER),
        ];

        const program = this.gl.createProgram();
        if (!program) {
            throw Error("Failed to allocate shader program");
        }

        for (const shader of shaders) {
            this.gl.attachShader(program, shader);
        }
        this.gl.linkProgram(program);

        const success = this.gl.getProgramParameter(program, this.gl.LINK_STATUS);
        if (!success) {
            this.gl.deleteProgram(program);
            const errorLog = this.gl.getProgramInfoLog(program) ?? "Unknown shader linking error";
            throw Error(errorLog);
        }

        this.shaderProgram = program;

        shaders.forEach((shader) => {
            this.gl.deleteShader(shader);
        });

        // Get uniform locations
        this.projectionUniformLoc = this.gl.getUniformLocation(this.shaderProgram, "projection");
        this.modelUniformLoc = this.gl.getUniformLocation(this.shaderProgram, "model");
        this.colorUniformLoc = this.gl.getUniformLocation(this.shaderProgram, "color");
    }

    private loadVPixelRenderData() {
        this.vao = this.gl.createVertexArray();
        if (!this.vao) {
            throw Error("Failed to create Vertex Array Object");
        }

        this.gl.bindVertexArray(this.vao);
        {
            this.indexBuffer = this.gl.createBuffer();
            this.gl.bindBuffer(this.gl.ELEMENT_ARRAY_BUFFER, this.indexBuffer);
            this.gl.bufferData(this.gl.ELEMENT_ARRAY_BUFFER, new Uint32Array(VPixel.indices), this.gl.STATIC_DRAW);
            this.gl.bindBuffer(this.gl.ELEMENT_ARRAY_BUFFER, null);

            this.vertexBuffer = this.gl.createBuffer();
            this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.vertexBuffer);
            {
                this.gl.bufferData(this.gl.ARRAY_BUFFER, new Float32Array(VPixel.vertices), this.gl.STATIC_DRAW);
                // Vertices
                this.gl.vertexAttribPointer(0, 3, this.gl.FLOAT, false, 12, 0);
            }
            this.gl.bindBuffer(this.gl.ARRAY_BUFFER, null);
        }
        this.gl.bindVertexArray(null);
    }

    private makeVPixelArray() {
        VPixel.calculateScale(this.canvas.width, Display.vWidth);
        for (let row = 0; row < Display.vHeight; row++) {
            for (let col = 0; col < Display.vWidth; col++) {
                const vPixel = new VPixel(col, row);
                this.vPixels.push(vPixel);
            }
        }
    }

    public async initialize() {
        await this.loadShaderProgram();
        this.loadVPixelRenderData();
        this.makeVPixelArray();

        window.addEventListener('resize', (_ev) => {
            this.resizeViewport();
        });
    }

    /**
     * Toggles a VPixel
     * @param x x-coordinate of pixel to toggle
     * @param y y-coordinate of pixel to toggle
     * @returns true if the pixel was toggled from 'on' to 'off'; false otherwise
     */
    public toggleVPixel(x: number, y: number): boolean {
        const index = (y * Display.vWidth) + x;
        const vPixel = this.vPixels[index];

        vPixel.on = !vPixel.on;

        return !vPixel.on;
    }

    /**
     * Toggles vPixels in a checkerboard pattern
     */
    public showTestPattern() {
        for (let row = 0; row < Display.vHeight; row++) {
            for (let col = 0; col < Display.vWidth; col++) {
                if (row % 2 === 0) {
                    if (col % 2 === 0) {
                        this.toggleVPixel(col, row);
                    }
                } else {
                    if (col % 2 !== 0) {
                        this.toggleVPixel(col, row);
                    }
                }
            }
        }
    }

    /**
     * Clears the virtual display
     */
    public clear() {
        for (const vPixel of this.vPixels) {
            vPixel.on = false;
        }

        this.render();
    }

    public render() {
        if (!this.shaderProgram) {
            return;
        }

        this.gl.clearColor(1.0, 0.0, 1.0, 1.0);
        this.gl.clear(this.gl.COLOR_BUFFER_BIT);

        this.gl.useProgram(this.shaderProgram);
        {
            this.gl.uniformMatrix4fv(this.projectionUniformLoc, false, new Float32Array(this.projectionMatrix));
            this.gl.bindVertexArray(this.vao);
            {
                this.gl.bindBuffer(this.gl.ELEMENT_ARRAY_BUFFER, this.indexBuffer);
                this.gl.enableVertexAttribArray(0);
                for (const vPixel of this.vPixels) {
                    const color = vPixel.on ? VPixel.onColor : VPixel.offColor;
                    const modelMat4 = vPixel.getModelMat4();

                    this.gl.uniformMatrix4fv(this.modelUniformLoc, false, new Float32Array(modelMat4));
                    this.gl.uniform3fv(this.colorUniformLoc, new Float32Array(color));

                    this.gl.drawElements(this.gl.TRIANGLES, VPixel.indices.length, this.gl.UNSIGNED_INT, 0);
                }
                this.gl.bindBuffer(this.gl.ELEMENT_ARRAY_BUFFER, null);
            }
            this.gl.bindVertexArray(null);
        }
        this.gl.useProgram(null);

        this.gl.flush();
    }
}