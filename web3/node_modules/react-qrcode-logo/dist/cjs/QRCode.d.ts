import React from 'react';
import { FileType, QRRenderOptions } from './renderer';
export interface IProps extends QRRenderOptions {
    style?: React.CSSProperties;
    id?: string;
}
export declare class QRCode extends React.Component<IProps, {}> {
    private canvasRef;
    /**
     * Download the currently-rendered QR code.
     * Uses the on-screen canvas (DPR-scaled) — the visible result is identical to what the user sees.
     */
    download(fileType?: FileType, fileName?: string): void;
    shouldComponentUpdate(nextProps: IProps): boolean;
    componentDidMount(): void;
    componentDidUpdate(): void;
    private update;
    render(): React.JSX.Element;
}
export default QRCode;
