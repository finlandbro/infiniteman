export class Renderer {
    constructor(canvas, options = {}) {
        this.canvas = canvas;
        this.options = options;
    }

    render(params) {
        throw new Error('Method "render" must be implemented');
    }

    cancel() {
        // Optional: override to cancel ongoing renders
    }

    resize(width, height) {
        // Optional: handle canvas resize
    }
}
