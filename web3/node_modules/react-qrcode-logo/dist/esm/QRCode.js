import React from 'react';
import { DEFAULT_PROPS, renderQRCodeToCanvas } from './renderer';
import { deepEqual, mimeFor, triggerDownload } from './utils';
export class QRCode extends React.Component {
    canvasRef = React.createRef();
    /**
     * Download the currently-rendered QR code.
     * Uses the on-screen canvas (DPR-scaled) — the visible result is identical to what the user sees.
     */
    download(fileType, fileName) {
        if (!this.canvasRef.current)
            return;
        const url = this.canvasRef.current.toDataURL(mimeFor(fileType), 1.0);
        triggerDownload(url, fileName ?? 'react-qrcode-logo');
    }
    shouldComponentUpdate(nextProps) {
        return !deepEqual(this.props, nextProps);
    }
    componentDidMount() {
        this.update();
    }
    componentDidUpdate() {
        this.update();
    }
    update() {
        if (!this.canvasRef.current)
            return;
        renderQRCodeToCanvas(this.canvasRef.current, this.props)
            .catch((err) => {
            console.error('[react-qrcode-logo] QRCode render failed:', err);
        });
    }
    render() {
        const size = this.props.size ?? DEFAULT_PROPS.size;
        const quietZone = this.props.quietZone ?? DEFAULT_PROPS.quietZone;
        const qrSize = +size + 2 * +quietZone;
        return (React.createElement("canvas", { id: this.props.id ?? 'react-qrcode-logo', height: qrSize, width: qrSize, style: { height: qrSize + 'px', width: qrSize + 'px', ...this.props.style }, ref: this.canvasRef }));
    }
}
export default QRCode;
