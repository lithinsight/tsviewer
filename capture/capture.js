export class OpenSeadragonScreenshot {
    constructor(viewer) {
        this.viewer = viewer;
    }
    async capture(options = {}) {
        const blob = await this.toBlob(options);
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result);
            reader.onerror = () => reject(new Error('Failed to convert blob to data URL'));
            reader.readAsDataURL(blob);
        });
    }
    async toBlob(options = {}) {
        this.ensureViewerReady();
        const { format = 'png', quality = 0.9, scale = 1, overlays = [], fitImageToViewport = true, imageIndex = 0 } = options;
        const stage = await this.prepareCapture(scale, overlays, fitImageToViewport, imageIndex);
        return this.renderStage(stage, format, quality);
    }
    ensureViewerReady() {
        if (!this.viewer.isOpen()) {
            throw new Error('[OpenSeadragon Capture] Viewer is not open. Wait for the "open" event before capturing.');
        }
    }
    async prepareCapture(scale, overlays, fitImageToViewport, imageIndex) {
        await this.waitForDraw();
        if (fitImageToViewport) {
            const canvas = await this.captureFullImage(imageIndex);
            return { canvas, overlays, scale };
        }
        const canvas = this.getCanvas();
        return { canvas, overlays, scale };
    }
    getCanvas() {
        const canvas = this.viewer.drawer?.canvas;
        if (!canvas) {
            throw new Error('[OpenSeadragon Capture] Canvas not available. Ensure viewer is fully initialized.');
        }
        return canvas;
    }
    waitForDraw() {
        return new Promise((resolve) => {
            const timeout = setTimeout(() => {
                requestAnimationFrame(() => resolve());
            }, 100);
            this.viewer.addOnceHandler('animation-finish', () => {
                clearTimeout(timeout);
                requestAnimationFrame(() => resolve());
            });
            this.viewer.forceRedraw();
        });
    }
    async captureFullImage(imageIndex) {
        const tiledImage = this.viewer.world.getItemAt(imageIndex);
        if (!tiledImage) {
            throw new Error(`[OpenSeadragon Capture] No image at index ${imageIndex}`);
        }
        const currentBounds = this.viewer.viewport.getBounds();
        const bounds = tiledImage.getBounds();
        try {
            this.viewer.viewport.fitBounds(bounds, true);
            await this.waitForFullLoad(tiledImage);
            return this.getCanvas();
        }
        finally {
            this.viewer.viewport.fitBounds(currentBounds, true);
        }
    }
    waitForFullLoad(tiledImage) {
        if (tiledImage.getFullyLoaded()) {
            return this.waitForDraw();
        }
        return new Promise((resolve) => {
            tiledImage.addOnceHandler('fully-loaded-change', () => {
                this.waitForDraw().then(resolve);
            });
        });
    }
    validateOverlays(canvas, overlays) {
        for (const overlay of overlays) {
            if (overlay.width !== canvas.width || overlay.height !== canvas.height) {
                console.warn(`[OpenSeadragon Capture] Overlay dimensions (${overlay.width}x${overlay.height}) ` +
                    `do not match viewer canvas (${canvas.width}x${canvas.height}). ` +
                    `Overlay will be stretched.`);
            }
        }
    }
    renderStage(stage, format, quality) {
        return new Promise((resolve, reject) => {
            try {
                const outputCanvas = document.createElement('canvas');
                const outputCtx = outputCanvas.getContext('2d', { alpha: format === 'png' });
                if (!outputCtx) {
                    reject(new Error('[OpenSeadragon Capture] Failed to get canvas context'));
                    return;
                }
                outputCanvas.width = stage.canvas.width * stage.scale;
                outputCanvas.height = stage.canvas.height * stage.scale;
                const maxPixels = 16777216;
                if (outputCanvas.width * outputCanvas.height > maxPixels) {
                    console.warn(`[OpenSeadragon Capture] Output canvas is very large (${outputCanvas.width}x${outputCanvas.height}). ` +
                        `This may cause memory issues.`);
                }
                this.validateOverlays(stage.canvas, stage.overlays);
                outputCtx.imageSmoothingEnabled = true;
                outputCtx.imageSmoothingQuality = 'high';
                outputCtx.drawImage(stage.canvas, 0, 0, outputCanvas.width, outputCanvas.height);
                for (const overlay of stage.overlays) {
                    if (overlay.width > 0 && overlay.height > 0) {
                        outputCtx.drawImage(overlay, 0, 0, outputCanvas.width, outputCanvas.height);
                    }
                }
                outputCanvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error('[OpenSeadragon Capture] Failed to create blob')), `image/${format}`, quality);
            }
            catch (error) {
                const message = error instanceof Error ? error.message : 'Unknown error';
                reject(new Error(`[OpenSeadragon Capture] ${message}. Check CORS policy if using remote images.`));
            }
        });
    }
    async download(filename, options = {}) {
        const blob = await this.toBlob(options);
        const url = URL.createObjectURL(blob);
        try {
            const link = document.createElement('a');
            link.download = filename;
            link.href = url;
            link.click();
        }
        finally {
            if (typeof requestIdleCallback === 'undefined') {
                setTimeout(() => URL.revokeObjectURL(url), 100);
            }
            else {
                requestIdleCallback(() => URL.revokeObjectURL(url), { timeout: 1000 });
            }
        }
    }
}
export function createScreenshot(viewer) {
    return new OpenSeadragonScreenshot(viewer);
}