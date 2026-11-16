import qrGenerator from 'qrcode-generator';
import { mimeFor, triggerDownload } from './utils';

type InnerOuterEyeColor = {
    inner: string;
    outer: string;
}
export type EyeColor = string | InnerOuterEyeColor;

type InnerOuterRadii = {
    inner: number | [number, number, number, number];
    outer: number | [number, number, number, number];
}
export type CornerRadii = number | [number, number, number, number] | InnerOuterRadii;

export interface QRRenderOptions {
    value?: string;
    ecLevel?: 'L' | 'M' | 'Q' | 'H';
    enableCORS?: boolean;
    size?: number;
    quietZone?: number;
    bgColor?: string;
    fgColor?: string;
    logoImage?: string;
    logoWidth?: number;
    logoHeight?: number;
    logoOpacity?: number;
    logoOnLoad?: (e: Event) => void;
    removeQrCodeBehindLogo?: boolean;
    logoPadding?: number;
    logoPaddingStyle?: 'square' | 'circle';
    logoPaddingRadius?: number | DOMPointInit | (number | DOMPointInit)[];
    eyeRadius?: CornerRadii | [CornerRadii, CornerRadii, CornerRadii];
    eyeColor?: EyeColor | [EyeColor, EyeColor, EyeColor];
    qrStyle?: 'squares' | 'dots' | 'fluid';
    pixelRatio?: number;
}

export type FileType = 'png' | 'jpg' | 'webp';

interface ModulePosition {
    row: number;
    col: number;
}

function utf16to8(str: string): string {
    let out: string = '', i: number, c: number;
    const len: number = str.length;
    for (i = 0; i < len; i++) {
        c = str.charCodeAt(i);
        if ((c >= 0x0001) && (c <= 0x007F)) {
            out += str.charAt(i);
        } else if (c > 0x07FF) {
            out += String.fromCharCode(0xE0 | ((c >> 12) & 0x0F));
            out += String.fromCharCode(0x80 | ((c >> 6) & 0x3F));
            out += String.fromCharCode(0x80 | ((c >> 0) & 0x3F));
        } else {
            out += String.fromCharCode(0xC0 | ((c >> 6) & 0x1F));
            out += String.fromCharCode(0x80 | ((c >> 0) & 0x3F));
        }
    }
    return out;
}

/**
 * Draw a rounded square in the canvas
 */
function drawRoundedSquare(
    lineWidth: number,
    x: number,
    y: number,
    size: number,
    color: string,
    radii: number | number[],
    fill: boolean,
    ctx: CanvasRenderingContext2D) {

    ctx.lineWidth = lineWidth;
    ctx.fillStyle = color;
    ctx.strokeStyle = color;

    // Adjust coordinates so that the outside of the stroke is aligned to the edges
    y += lineWidth / 2;
    x += lineWidth / 2;
    size -= lineWidth;

    if (!Array.isArray(radii)) {
        radii = [radii, radii, radii, radii];
    }

    // Radius should not be greater than half the size or less than zero
    radii = radii.map((r) => {
        r = Math.min(r, size / 2);
        return (r < 0) ? 0 : r;
    });

    const rTopLeft = radii[0] || 0;
    const rTopRight = radii[1] || 0;
    const rBottomRight = radii[2] || 0;
    const rBottomLeft = radii[3] || 0;

    ctx.beginPath();

    ctx.moveTo(x + rTopLeft, y);

    ctx.lineTo(x + size - rTopRight, y);
    if (rTopRight) ctx.quadraticCurveTo(x + size, y, x + size, y + rTopRight);

    ctx.lineTo(x + size, y + size - rBottomRight);
    if (rBottomRight) ctx.quadraticCurveTo(x + size, y + size, x + size - rBottomRight, y + size);

    ctx.lineTo(x + rBottomLeft, y + size);
    if (rBottomLeft) ctx.quadraticCurveTo(x, y + size, x, y + size - rBottomLeft);

    ctx.lineTo(x, y + rTopLeft);
    if (rTopLeft) ctx.quadraticCurveTo(x, y, x + rTopLeft, y);

    ctx.closePath();

    ctx.stroke();
    if (fill) {
        ctx.fill();
    }
}

/**
 * Draw a single positional pattern eye.
 */
function drawPositioningPattern(
    ctx: CanvasRenderingContext2D,
    cellSize: number,
    offset: number,
    row: number,
    col: number,
    color: EyeColor,
    radii: CornerRadii = [0, 0, 0, 0]) {

    const lineWidth = Math.ceil(cellSize);

    let radiiOuter: number | [number, number, number, number];
    let radiiInner: number | [number, number, number, number];
    if (typeof radii !== 'number' && !Array.isArray(radii)) {
        radiiOuter = radii.outer || 0;
        radiiInner = radii.inner || 0;
    } else {
        radiiOuter = radii;
        radiiInner = radiiOuter;
    }

    let colorOuter;
    let colorInner;
    if (typeof color !== 'string') {
        colorOuter = color.outer;
        colorInner = color.inner;
    } else {
        colorOuter = color;
        colorInner = color;
    }

    let y = (row * cellSize) + offset;
    let x = (col * cellSize) + offset;
    let size = cellSize * 7;

    // Outer box
    drawRoundedSquare(lineWidth, x, y, size, colorOuter, radiiOuter, false, ctx);

    // Inner box
    size = cellSize * 3;
    y += cellSize * 2;
    x += cellSize * 2;
    drawRoundedSquare(lineWidth, x, y, size, colorInner, radiiInner, true, ctx);
};

/**
 * Is this dot inside a positional pattern zone.
 */
function isInPositioninZone(row: number, col: number, zones: ModulePosition[]) {
    return zones.some((zone) => (
        row >= zone.row && row <= zone.row + 7 &&
        col >= zone.col && col <= zone.col + 7
    ));
}

/**
 * Checks whether the coordinate is behind the logo and needs to be removed. true if the coordinate is behind the logo and needs to be removed.
 */
function removeCoordinateBehindLogo(
    removeQrCodeBehindLogo: boolean,
    row: number,
    col: number,
    dWidthLogo: number,
    dHeightLogo: number,
    dxLogo: number,
    dyLogo: number,
    cellSize: number,
    offset: number,
    logoImage?: string,
    logoPadding: number = 0,
    logoPaddingStyle: 'square' | 'circle' = 'square'
): boolean {
    if (!removeQrCodeBehindLogo || !logoImage) {
        return false;
    }
    const paddingInCells = Math.ceil(logoPadding / cellSize);
    const snappedPadding = paddingInCells * cellSize;

    const absolute_dxLogo = dxLogo + offset;
    const absolute_dyLogo = dyLogo + offset;

    const cellLeft = Math.round(col * cellSize) + offset;
    const cellTop = Math.round(row * cellSize) + offset;
    const w = (Math.ceil((col + 1) * cellSize) - Math.floor(col * cellSize));
    const h = (Math.ceil((row + 1) * cellSize) - Math.floor(row * cellSize));
    const cellRight = cellLeft + w;
    const cellBottom = cellTop + h;

    if (logoPaddingStyle === 'square') {
        const logoLeft = absolute_dxLogo - snappedPadding;
        const logoRight = absolute_dxLogo + dWidthLogo + snappedPadding;
        const logoTop = absolute_dyLogo - snappedPadding;
        const logoBottom = absolute_dyLogo + dHeightLogo + snappedPadding;

        const overlapX = cellLeft < logoRight && cellRight > logoLeft;
        const overlapY = cellTop < logoBottom && cellBottom > logoTop;

        return overlapX && overlapY;
    }

    if (logoPaddingStyle === 'circle') {
        const logoCenterX = absolute_dxLogo + dWidthLogo / 2;
        const logoCenterY = absolute_dyLogo + dHeightLogo / 2;
        const circleRadius = (Math.max(dWidthLogo, dHeightLogo) / 2) + snappedPadding;

        const closestX = Math.max(cellLeft, Math.min(logoCenterX, cellRight));
        const closestY = Math.max(cellTop, Math.min(logoCenterY, cellBottom));

        const distanceX = logoCenterX - closestX;
        const distanceY = logoCenterY - closestY;
        const distanceSquared = (distanceX * distanceX) + (distanceY * distanceY);

        return distanceSquared < (circleRadius * circleRadius);
    }

    return false;
}

/**
 *  Load an HTMLImageElement as a Promise so we can await it
 */
function loadImage(src: string, enableCORS: boolean): Promise<{ image: HTMLImageElement; event: Event }> {
    return new Promise((resolve, reject) => {
        const image = new Image();
        if (enableCORS) {
            image.crossOrigin = 'Anonymous';
        }
        image.onload = (event) => resolve({ image, event });
        image.onerror = () => reject(new Error(`Failed to load logo image: ${src}`));
        image.src = src;
    });
}

export const DEFAULT_PROPS = {
    value: 'https://reactjs.org/',
    ecLevel: 'M' as const,
    enableCORS: false,
    size: 150,
    quietZone: 10,
    bgColor: '#FFFFFF',
    fgColor: '#000000',
    logoOpacity: 1,
    qrStyle: 'squares' as const,
    eyeRadius: [0, 0, 0] as CornerRadii | [CornerRadii, CornerRadii, CornerRadii],
    logoPaddingStyle: 'square' as const,
    logoPaddingRadius: 0 as number | DOMPointInit | (number | DOMPointInit)[],
    removeQrCodeBehindLogo: false,
};

/**
 *  Render a QR code into a canvas.

 *  - If `canvas` is provided, draws into it. Otherwise creates a new offscreen canvas.
 *  - Resolves AFTER the logo (if any) has been loaded and drawn, so the returned canvas is always in its final state.
 *
 *   Browser-only: uses `document`, `Image`, and `window.devicePixelRatio`.
 */
export async function renderQRCodeToCanvas(
    canvas: HTMLCanvasElement,
    opts: QRRenderOptions): Promise<HTMLCanvasElement> {
    if (typeof document === 'undefined') {
        throw new Error('renderQRCodeToCanvas must be called in a browser environment');
    }

    const props = { ...DEFAULT_PROPS, ...opts };

    const ctx = canvas.getContext('2d');
    if (!ctx) {
        throw new Error('Canvas 2D context not available');
    }

    // just make sure that these params are passed as numbers
    const size = +props.size;
    const quietZone = +props.quietZone;
    const logoWidth = props.logoWidth ? +props.logoWidth : 0;
    const logoHeight = props.logoHeight ? +props.logoHeight : 0;
    const logoPadding = props.logoPadding ? +props.logoPadding : 0;

    const qrCode = qrGenerator(0, props.ecLevel);
    qrCode.addData(utf16to8(props.value));
    qrCode.make();

    const canvasSize = size + (2 * quietZone);
    const length = qrCode.getModuleCount();
    const cellSize = size / length;

    const scale = props.pixelRatio ?? window.devicePixelRatio ?? 1;

    const dWidthLogo = logoWidth || size * 0.2;
    const dHeightLogo = logoHeight || dWidthLogo;
    const dxLogo = (size - dWidthLogo) / 2;
    const dyLogo = (size - dHeightLogo) / 2;

    canvas.height = canvas.width = canvasSize * scale;
    ctx.setTransform(scale, 0, 0, scale, 0, 0);

    ctx.fillStyle = props.bgColor;
    ctx.fillRect(0, 0, canvasSize, canvasSize);

    const offset = quietZone;

    const positioningZones: ModulePosition[] = [
        { row: 0, col: 0 },
        { row: 0, col: length - 7 },
        { row: length - 7, col: 0 },
    ];

    ctx.strokeStyle = props.fgColor;

    const shouldSkipCell = (row: number, col: number): boolean =>
        isInPositioninZone(row, col, positioningZones) ||
        removeCoordinateBehindLogo(
            props.removeQrCodeBehindLogo,
            row, col,
            dWidthLogo, dHeightLogo,
            dxLogo, dyLogo,
            cellSize, offset,
            props.logoImage, logoPadding, props.logoPaddingStyle
        );

    if (props.qrStyle === 'dots') {
        ctx.fillStyle = props.fgColor;
        const radius = cellSize / 2;
        for (let row = 0; row < length; row++) {
            for (let col = 0; col < length; col++) {
                if (qrCode.isDark(row, col) && !shouldSkipCell(row, col)) {
                    ctx.beginPath();
                    ctx.arc(
                        Math.round(col * cellSize) + radius + offset,
                        Math.round(row * cellSize) + radius + offset,
                        (radius / 100) * 75,
                        0,
                        2 * Math.PI,
                        false
                    );
                    ctx.closePath();
                    ctx.fill();
                }
            }
        }
    } else if (props.qrStyle === 'fluid') {
        const radius = Math.ceil(cellSize / 2);
        for (let row = 0; row < length; row++) {
            for (let col = 0; col < length; col++) {
                if (qrCode.isDark(row, col) && !shouldSkipCell(row, col)) {
                    const roundedCorners = [false, false, false, false]; // top-left, top-right, bottom-right, bottom-left
                    if ((row > 0 && !qrCode.isDark(row - 1, col)) && (col > 0 && !qrCode.isDark(row, col - 1))) roundedCorners[0] = true;
                    if ((row > 0 && !qrCode.isDark(row - 1, col)) && (col < length - 1 && !qrCode.isDark(row, col + 1))) roundedCorners[1] = true;
                    if ((row < length - 1 && !qrCode.isDark(row + 1, col)) && (col < length - 1 && !qrCode.isDark(row, col + 1))) roundedCorners[2] = true;
                    if ((row < length - 1 && !qrCode.isDark(row + 1, col)) && (col > 0 && !qrCode.isDark(row, col - 1))) roundedCorners[3] = true;
                    const w = (Math.ceil((col + 1) * cellSize) - Math.floor(col * cellSize));
                    const h = (Math.ceil((row + 1) * cellSize) - Math.floor(row * cellSize));
                    ctx.fillStyle = props.fgColor;
                    ctx.beginPath();
                    ctx.arc(
                        Math.round(col * cellSize) + radius + offset,
                        Math.round(row * cellSize) + radius + offset,
                        radius,
                        0,
                        2 * Math.PI,
                        false);
                    ctx.closePath();
                    ctx.fill();
                    if (!roundedCorners[0]) ctx.fillRect(Math.round(col * cellSize) + offset, Math.round(row * cellSize) + offset, w / 2, h / 2)
                    if (!roundedCorners[1]) ctx.fillRect(Math.round(col * cellSize) + offset + Math.floor(w / 2), Math.round(row * cellSize) + offset, w / 2, h / 2)
                    if (!roundedCorners[2]) ctx.fillRect(Math.round(col * cellSize) + offset + Math.floor(w / 2), Math.round(row * cellSize) + offset + Math.floor(h / 2), w / 2, h / 2)
                    if (!roundedCorners[3]) ctx.fillRect(Math.round(col * cellSize) + offset, Math.round(row * cellSize) + offset + Math.floor(h / 2), w / 2, h / 2)
                }
            }
        }
    } else {
        for (let row = 0; row < length; row++) {
            for (let col = 0; col < length; col++) {
                if (qrCode.isDark(row, col) && !shouldSkipCell(row, col)) {
                    ctx.fillStyle = props.fgColor;
                    const w = Math.ceil((col + 1) * cellSize) - Math.floor(col * cellSize);
                    const h = Math.ceil((row + 1) * cellSize) - Math.floor(row * cellSize);
                    ctx.fillRect(Math.round(col * cellSize) + offset, Math.round(row * cellSize) + offset, w, h);
                }
            }
        }
    }

    // Draw positioning patterns (eyes)
    for (let i = 0; i < 3; i++) {
        const { row, col } = positioningZones[i];

        let radii: CornerRadii | [CornerRadii, CornerRadii, CornerRadii] | undefined = props.eyeRadius;
        let color: EyeColor;

        if (Array.isArray(radii)) {
            radii = radii[i] as CornerRadii;
        }
        if (typeof radii === 'number') {
            radii = [radii, radii, radii, radii];
        }

        if (!opts.eyeColor) {
            color = props.fgColor;
        } else if (Array.isArray(opts.eyeColor)) {
            color = opts.eyeColor[i];
        } else {
            color = opts.eyeColor as EyeColor;
        }

        drawPositioningPattern(ctx, cellSize, offset, row, col, color, radii as CornerRadii);
    }

    if (props.logoImage) {
        try {
            const { image, event } = await loadImage(props.logoImage, props.enableCORS);

            ctx.save();

            if (logoPadding) {
                ctx.beginPath();
                ctx.strokeStyle = props.bgColor;
                ctx.fillStyle = props.bgColor;

                const dWidthLogoPadding = dWidthLogo + (2 * logoPadding);
                const dHeightLogoPadding = dHeightLogo + (2 * logoPadding);
                const dxLogoPadding = dxLogo + offset - logoPadding;
                const dyLogoPadding = dyLogo + offset - logoPadding;

                if (props.logoPaddingStyle === 'circle') {
                    const dxCenterLogoPadding = dxLogoPadding + (dWidthLogoPadding / 2);
                    const dyCenterLogoPadding = dyLogoPadding + (dHeightLogoPadding / 2);
                    ctx.ellipse(dxCenterLogoPadding, dyCenterLogoPadding, dWidthLogoPadding / 2, dHeightLogoPadding / 2, 0, 0, 2 * Math.PI);
                    ctx.stroke();
                    ctx.fill();
                } else {
                    ctx.roundRect(dxLogoPadding, dyLogoPadding, dWidthLogoPadding, dHeightLogoPadding, props.logoPaddingRadius)
                    ctx.stroke();
                    ctx.fill();
                }
            }

            ctx.globalAlpha = props.logoOpacity;
            ctx.drawImage(image, dxLogo + offset, dyLogo + offset, dWidthLogo, dHeightLogo);
            ctx.restore();

            if (opts.logoOnLoad) {
                opts.logoOnLoad(event);
            }
        } catch (err) {
            // do not fail the whole render if the logo can't load
            console.warn('[react-qrcode-logo] QRCode logo loading failed:', err);
        }
    }

    return canvas;
}

// --------------------------
// Public headless API
// --------------------------

/**
 * Build a fully-rendered canvas with the QR code.
 * Defaults to devicePixelRatio = 1 for pixel-perfect export output.
 */
export async function generateCanvas(
    opts: QRRenderOptions
): Promise<HTMLCanvasElement> {
    const canvas = document.createElement('canvas');
    return renderQRCodeToCanvas(canvas, { ...opts, pixelRatio: opts.pixelRatio ?? 1 });
}

/** 
 * Return a data URL for the QR code
 */
export async function generateDataURL(
    opts: QRRenderOptions,
    fileType: FileType = 'png'
): Promise<string> {
    const canvas = await generateCanvas(opts);
    return canvas.toDataURL(mimeFor(fileType), 1.0);
}

/** 
 * Return a Blob for the QR code
 */
export async function generateBlob(
    opts: QRRenderOptions,
    fileType: FileType = 'png'
): Promise<Blob> {
    const canvas = await generateCanvas(opts);
    return new Promise<Blob>((resolve, reject) => {
        canvas.toBlob(
            (blob) => (blob ? resolve(blob) : reject(new Error('toBlob returned null'))),
            mimeFor(fileType),
            1.0
        );
    });
}

/** 
 * Generate and downloads QRCode w specified props
 */
export async function downloadQRCode(
    opts: QRRenderOptions,
    fileType: FileType = 'png',
    fileName: string = 'react-qrcode-logo'
): Promise<void> {
    const url = await generateDataURL(opts, fileType);
    triggerDownload(url, fileName);
}

