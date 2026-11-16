type InnerOuterEyeColor = {
    inner: string;
    outer: string;
};
export type EyeColor = string | InnerOuterEyeColor;
type InnerOuterRadii = {
    inner: number | [number, number, number, number];
    outer: number | [number, number, number, number];
};
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
export declare const DEFAULT_PROPS: {
    value: string;
    ecLevel: "M";
    enableCORS: boolean;
    size: number;
    quietZone: number;
    bgColor: string;
    fgColor: string;
    logoOpacity: number;
    qrStyle: "squares";
    eyeRadius: CornerRadii | [CornerRadii, CornerRadii, CornerRadii];
    logoPaddingStyle: "square";
    logoPaddingRadius: number | DOMPointInit | (number | DOMPointInit)[];
    removeQrCodeBehindLogo: boolean;
};
/**
 *  Render a QR code into a canvas.

 *  - If `canvas` is provided, draws into it. Otherwise creates a new offscreen canvas.
 *  - Resolves AFTER the logo (if any) has been loaded and drawn, so the returned canvas is always in its final state.
 *
 *   Browser-only: uses `document`, `Image`, and `window.devicePixelRatio`.
 */
export declare function renderQRCodeToCanvas(canvas: HTMLCanvasElement, opts: QRRenderOptions): Promise<HTMLCanvasElement>;
/**
 * Build a fully-rendered canvas with the QR code.
 * Defaults to devicePixelRatio = 1 for pixel-perfect export output.
 */
export declare function generateCanvas(opts: QRRenderOptions): Promise<HTMLCanvasElement>;
/**
 * Return a data URL for the QR code
 */
export declare function generateDataURL(opts: QRRenderOptions, fileType?: FileType): Promise<string>;
/**
 * Return a Blob for the QR code
 */
export declare function generateBlob(opts: QRRenderOptions, fileType?: FileType): Promise<Blob>;
/**
 * Generate and downloads QRCode w specified props
 */
export declare function downloadQRCode(opts: QRRenderOptions, fileType?: FileType, fileName?: string): Promise<void>;
export {};
