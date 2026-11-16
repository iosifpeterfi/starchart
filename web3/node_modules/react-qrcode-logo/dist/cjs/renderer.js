"use strict";
var __assign = (this && this.__assign) || function () {
    __assign = Object.assign || function(t) {
        for (var s, i = 1, n = arguments.length; i < n; i++) {
            s = arguments[i];
            for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p))
                t[p] = s[p];
        }
        return t;
    };
    return __assign.apply(this, arguments);
};
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g = Object.create((typeof Iterator === "function" ? Iterator : Object).prototype);
    return g.next = verb(0), g["throw"] = verb(1), g["return"] = verb(2), typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (g && (g = 0, op[0] && (_ = 0)), _) try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [op[0] & 2, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.DEFAULT_PROPS = void 0;
exports.renderQRCodeToCanvas = renderQRCodeToCanvas;
exports.generateCanvas = generateCanvas;
exports.generateDataURL = generateDataURL;
exports.generateBlob = generateBlob;
exports.downloadQRCode = downloadQRCode;
var qrcode_generator_1 = __importDefault(require("qrcode-generator"));
var utils_1 = require("./utils");
function utf16to8(str) {
    var out = '', i, c;
    var len = str.length;
    for (i = 0; i < len; i++) {
        c = str.charCodeAt(i);
        if ((c >= 0x0001) && (c <= 0x007F)) {
            out += str.charAt(i);
        }
        else if (c > 0x07FF) {
            out += String.fromCharCode(0xE0 | ((c >> 12) & 0x0F));
            out += String.fromCharCode(0x80 | ((c >> 6) & 0x3F));
            out += String.fromCharCode(0x80 | ((c >> 0) & 0x3F));
        }
        else {
            out += String.fromCharCode(0xC0 | ((c >> 6) & 0x1F));
            out += String.fromCharCode(0x80 | ((c >> 0) & 0x3F));
        }
    }
    return out;
}
/**
 * Draw a rounded square in the canvas
 */
function drawRoundedSquare(lineWidth, x, y, size, color, radii, fill, ctx) {
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
    radii = radii.map(function (r) {
        r = Math.min(r, size / 2);
        return (r < 0) ? 0 : r;
    });
    var rTopLeft = radii[0] || 0;
    var rTopRight = radii[1] || 0;
    var rBottomRight = radii[2] || 0;
    var rBottomLeft = radii[3] || 0;
    ctx.beginPath();
    ctx.moveTo(x + rTopLeft, y);
    ctx.lineTo(x + size - rTopRight, y);
    if (rTopRight)
        ctx.quadraticCurveTo(x + size, y, x + size, y + rTopRight);
    ctx.lineTo(x + size, y + size - rBottomRight);
    if (rBottomRight)
        ctx.quadraticCurveTo(x + size, y + size, x + size - rBottomRight, y + size);
    ctx.lineTo(x + rBottomLeft, y + size);
    if (rBottomLeft)
        ctx.quadraticCurveTo(x, y + size, x, y + size - rBottomLeft);
    ctx.lineTo(x, y + rTopLeft);
    if (rTopLeft)
        ctx.quadraticCurveTo(x, y, x + rTopLeft, y);
    ctx.closePath();
    ctx.stroke();
    if (fill) {
        ctx.fill();
    }
}
/**
 * Draw a single positional pattern eye.
 */
function drawPositioningPattern(ctx, cellSize, offset, row, col, color, radii) {
    if (radii === void 0) { radii = [0, 0, 0, 0]; }
    var lineWidth = Math.ceil(cellSize);
    var radiiOuter;
    var radiiInner;
    if (typeof radii !== 'number' && !Array.isArray(radii)) {
        radiiOuter = radii.outer || 0;
        radiiInner = radii.inner || 0;
    }
    else {
        radiiOuter = radii;
        radiiInner = radiiOuter;
    }
    var colorOuter;
    var colorInner;
    if (typeof color !== 'string') {
        colorOuter = color.outer;
        colorInner = color.inner;
    }
    else {
        colorOuter = color;
        colorInner = color;
    }
    var y = (row * cellSize) + offset;
    var x = (col * cellSize) + offset;
    var size = cellSize * 7;
    // Outer box
    drawRoundedSquare(lineWidth, x, y, size, colorOuter, radiiOuter, false, ctx);
    // Inner box
    size = cellSize * 3;
    y += cellSize * 2;
    x += cellSize * 2;
    drawRoundedSquare(lineWidth, x, y, size, colorInner, radiiInner, true, ctx);
}
;
/**
 * Is this dot inside a positional pattern zone.
 */
function isInPositioninZone(row, col, zones) {
    return zones.some(function (zone) { return (row >= zone.row && row <= zone.row + 7 &&
        col >= zone.col && col <= zone.col + 7); });
}
/**
 * Checks whether the coordinate is behind the logo and needs to be removed. true if the coordinate is behind the logo and needs to be removed.
 */
function removeCoordinateBehindLogo(removeQrCodeBehindLogo, row, col, dWidthLogo, dHeightLogo, dxLogo, dyLogo, cellSize, offset, logoImage, logoPadding, logoPaddingStyle) {
    if (logoPadding === void 0) { logoPadding = 0; }
    if (logoPaddingStyle === void 0) { logoPaddingStyle = 'square'; }
    if (!removeQrCodeBehindLogo || !logoImage) {
        return false;
    }
    var paddingInCells = Math.ceil(logoPadding / cellSize);
    var snappedPadding = paddingInCells * cellSize;
    var absolute_dxLogo = dxLogo + offset;
    var absolute_dyLogo = dyLogo + offset;
    var cellLeft = Math.round(col * cellSize) + offset;
    var cellTop = Math.round(row * cellSize) + offset;
    var w = (Math.ceil((col + 1) * cellSize) - Math.floor(col * cellSize));
    var h = (Math.ceil((row + 1) * cellSize) - Math.floor(row * cellSize));
    var cellRight = cellLeft + w;
    var cellBottom = cellTop + h;
    if (logoPaddingStyle === 'square') {
        var logoLeft = absolute_dxLogo - snappedPadding;
        var logoRight = absolute_dxLogo + dWidthLogo + snappedPadding;
        var logoTop = absolute_dyLogo - snappedPadding;
        var logoBottom = absolute_dyLogo + dHeightLogo + snappedPadding;
        var overlapX = cellLeft < logoRight && cellRight > logoLeft;
        var overlapY = cellTop < logoBottom && cellBottom > logoTop;
        return overlapX && overlapY;
    }
    if (logoPaddingStyle === 'circle') {
        var logoCenterX = absolute_dxLogo + dWidthLogo / 2;
        var logoCenterY = absolute_dyLogo + dHeightLogo / 2;
        var circleRadius = (Math.max(dWidthLogo, dHeightLogo) / 2) + snappedPadding;
        var closestX = Math.max(cellLeft, Math.min(logoCenterX, cellRight));
        var closestY = Math.max(cellTop, Math.min(logoCenterY, cellBottom));
        var distanceX = logoCenterX - closestX;
        var distanceY = logoCenterY - closestY;
        var distanceSquared = (distanceX * distanceX) + (distanceY * distanceY);
        return distanceSquared < (circleRadius * circleRadius);
    }
    return false;
}
/**
 *  Load an HTMLImageElement as a Promise so we can await it
 */
function loadImage(src, enableCORS) {
    return new Promise(function (resolve, reject) {
        var image = new Image();
        if (enableCORS) {
            image.crossOrigin = 'Anonymous';
        }
        image.onload = function (event) { return resolve({ image: image, event: event }); };
        image.onerror = function () { return reject(new Error("Failed to load logo image: ".concat(src))); };
        image.src = src;
    });
}
exports.DEFAULT_PROPS = {
    value: 'https://reactjs.org/',
    ecLevel: 'M',
    enableCORS: false,
    size: 150,
    quietZone: 10,
    bgColor: '#FFFFFF',
    fgColor: '#000000',
    logoOpacity: 1,
    qrStyle: 'squares',
    eyeRadius: [0, 0, 0],
    logoPaddingStyle: 'square',
    logoPaddingRadius: 0,
    removeQrCodeBehindLogo: false,
};
/**
 *  Render a QR code into a canvas.

 *  - If `canvas` is provided, draws into it. Otherwise creates a new offscreen canvas.
 *  - Resolves AFTER the logo (if any) has been loaded and drawn, so the returned canvas is always in its final state.
 *
 *   Browser-only: uses `document`, `Image`, and `window.devicePixelRatio`.
 */
function renderQRCodeToCanvas(canvas, opts) {
    return __awaiter(this, void 0, void 0, function () {
        var props, ctx, size, quietZone, logoWidth, logoHeight, logoPadding, qrCode, canvasSize, length, cellSize, scale, dWidthLogo, dHeightLogo, dxLogo, dyLogo, offset, positioningZones, shouldSkipCell, radius, row, col, radius, row, col, roundedCorners, w, h, row, col, w, h, i, _a, row, col, radii, color, _b, image, event_1, dWidthLogoPadding, dHeightLogoPadding, dxLogoPadding, dyLogoPadding, dxCenterLogoPadding, dyCenterLogoPadding, err_1;
        var _c, _d;
        return __generator(this, function (_e) {
            switch (_e.label) {
                case 0:
                    if (typeof document === 'undefined') {
                        throw new Error('renderQRCodeToCanvas must be called in a browser environment');
                    }
                    props = __assign(__assign({}, exports.DEFAULT_PROPS), opts);
                    ctx = canvas.getContext('2d');
                    if (!ctx) {
                        throw new Error('Canvas 2D context not available');
                    }
                    size = +props.size;
                    quietZone = +props.quietZone;
                    logoWidth = props.logoWidth ? +props.logoWidth : 0;
                    logoHeight = props.logoHeight ? +props.logoHeight : 0;
                    logoPadding = props.logoPadding ? +props.logoPadding : 0;
                    qrCode = (0, qrcode_generator_1.default)(0, props.ecLevel);
                    qrCode.addData(utf16to8(props.value));
                    qrCode.make();
                    canvasSize = size + (2 * quietZone);
                    length = qrCode.getModuleCount();
                    cellSize = size / length;
                    scale = (_d = (_c = props.pixelRatio) !== null && _c !== void 0 ? _c : window.devicePixelRatio) !== null && _d !== void 0 ? _d : 1;
                    dWidthLogo = logoWidth || size * 0.2;
                    dHeightLogo = logoHeight || dWidthLogo;
                    dxLogo = (size - dWidthLogo) / 2;
                    dyLogo = (size - dHeightLogo) / 2;
                    canvas.height = canvas.width = canvasSize * scale;
                    ctx.setTransform(scale, 0, 0, scale, 0, 0);
                    ctx.fillStyle = props.bgColor;
                    ctx.fillRect(0, 0, canvasSize, canvasSize);
                    offset = quietZone;
                    positioningZones = [
                        { row: 0, col: 0 },
                        { row: 0, col: length - 7 },
                        { row: length - 7, col: 0 },
                    ];
                    ctx.strokeStyle = props.fgColor;
                    shouldSkipCell = function (row, col) {
                        return isInPositioninZone(row, col, positioningZones) ||
                            removeCoordinateBehindLogo(props.removeQrCodeBehindLogo, row, col, dWidthLogo, dHeightLogo, dxLogo, dyLogo, cellSize, offset, props.logoImage, logoPadding, props.logoPaddingStyle);
                    };
                    if (props.qrStyle === 'dots') {
                        ctx.fillStyle = props.fgColor;
                        radius = cellSize / 2;
                        for (row = 0; row < length; row++) {
                            for (col = 0; col < length; col++) {
                                if (qrCode.isDark(row, col) && !shouldSkipCell(row, col)) {
                                    ctx.beginPath();
                                    ctx.arc(Math.round(col * cellSize) + radius + offset, Math.round(row * cellSize) + radius + offset, (radius / 100) * 75, 0, 2 * Math.PI, false);
                                    ctx.closePath();
                                    ctx.fill();
                                }
                            }
                        }
                    }
                    else if (props.qrStyle === 'fluid') {
                        radius = Math.ceil(cellSize / 2);
                        for (row = 0; row < length; row++) {
                            for (col = 0; col < length; col++) {
                                if (qrCode.isDark(row, col) && !shouldSkipCell(row, col)) {
                                    roundedCorners = [false, false, false, false];
                                    if ((row > 0 && !qrCode.isDark(row - 1, col)) && (col > 0 && !qrCode.isDark(row, col - 1)))
                                        roundedCorners[0] = true;
                                    if ((row > 0 && !qrCode.isDark(row - 1, col)) && (col < length - 1 && !qrCode.isDark(row, col + 1)))
                                        roundedCorners[1] = true;
                                    if ((row < length - 1 && !qrCode.isDark(row + 1, col)) && (col < length - 1 && !qrCode.isDark(row, col + 1)))
                                        roundedCorners[2] = true;
                                    if ((row < length - 1 && !qrCode.isDark(row + 1, col)) && (col > 0 && !qrCode.isDark(row, col - 1)))
                                        roundedCorners[3] = true;
                                    w = (Math.ceil((col + 1) * cellSize) - Math.floor(col * cellSize));
                                    h = (Math.ceil((row + 1) * cellSize) - Math.floor(row * cellSize));
                                    ctx.fillStyle = props.fgColor;
                                    ctx.beginPath();
                                    ctx.arc(Math.round(col * cellSize) + radius + offset, Math.round(row * cellSize) + radius + offset, radius, 0, 2 * Math.PI, false);
                                    ctx.closePath();
                                    ctx.fill();
                                    if (!roundedCorners[0])
                                        ctx.fillRect(Math.round(col * cellSize) + offset, Math.round(row * cellSize) + offset, w / 2, h / 2);
                                    if (!roundedCorners[1])
                                        ctx.fillRect(Math.round(col * cellSize) + offset + Math.floor(w / 2), Math.round(row * cellSize) + offset, w / 2, h / 2);
                                    if (!roundedCorners[2])
                                        ctx.fillRect(Math.round(col * cellSize) + offset + Math.floor(w / 2), Math.round(row * cellSize) + offset + Math.floor(h / 2), w / 2, h / 2);
                                    if (!roundedCorners[3])
                                        ctx.fillRect(Math.round(col * cellSize) + offset, Math.round(row * cellSize) + offset + Math.floor(h / 2), w / 2, h / 2);
                                }
                            }
                        }
                    }
                    else {
                        for (row = 0; row < length; row++) {
                            for (col = 0; col < length; col++) {
                                if (qrCode.isDark(row, col) && !shouldSkipCell(row, col)) {
                                    ctx.fillStyle = props.fgColor;
                                    w = Math.ceil((col + 1) * cellSize) - Math.floor(col * cellSize);
                                    h = Math.ceil((row + 1) * cellSize) - Math.floor(row * cellSize);
                                    ctx.fillRect(Math.round(col * cellSize) + offset, Math.round(row * cellSize) + offset, w, h);
                                }
                            }
                        }
                    }
                    // Draw positioning patterns (eyes)
                    for (i = 0; i < 3; i++) {
                        _a = positioningZones[i], row = _a.row, col = _a.col;
                        radii = props.eyeRadius;
                        color = void 0;
                        if (Array.isArray(radii)) {
                            radii = radii[i];
                        }
                        if (typeof radii === 'number') {
                            radii = [radii, radii, radii, radii];
                        }
                        if (!opts.eyeColor) {
                            color = props.fgColor;
                        }
                        else if (Array.isArray(opts.eyeColor)) {
                            color = opts.eyeColor[i];
                        }
                        else {
                            color = opts.eyeColor;
                        }
                        drawPositioningPattern(ctx, cellSize, offset, row, col, color, radii);
                    }
                    if (!props.logoImage) return [3 /*break*/, 4];
                    _e.label = 1;
                case 1:
                    _e.trys.push([1, 3, , 4]);
                    return [4 /*yield*/, loadImage(props.logoImage, props.enableCORS)];
                case 2:
                    _b = _e.sent(), image = _b.image, event_1 = _b.event;
                    ctx.save();
                    if (logoPadding) {
                        ctx.beginPath();
                        ctx.strokeStyle = props.bgColor;
                        ctx.fillStyle = props.bgColor;
                        dWidthLogoPadding = dWidthLogo + (2 * logoPadding);
                        dHeightLogoPadding = dHeightLogo + (2 * logoPadding);
                        dxLogoPadding = dxLogo + offset - logoPadding;
                        dyLogoPadding = dyLogo + offset - logoPadding;
                        if (props.logoPaddingStyle === 'circle') {
                            dxCenterLogoPadding = dxLogoPadding + (dWidthLogoPadding / 2);
                            dyCenterLogoPadding = dyLogoPadding + (dHeightLogoPadding / 2);
                            ctx.ellipse(dxCenterLogoPadding, dyCenterLogoPadding, dWidthLogoPadding / 2, dHeightLogoPadding / 2, 0, 0, 2 * Math.PI);
                            ctx.stroke();
                            ctx.fill();
                        }
                        else {
                            ctx.roundRect(dxLogoPadding, dyLogoPadding, dWidthLogoPadding, dHeightLogoPadding, props.logoPaddingRadius);
                            ctx.stroke();
                            ctx.fill();
                        }
                    }
                    ctx.globalAlpha = props.logoOpacity;
                    ctx.drawImage(image, dxLogo + offset, dyLogo + offset, dWidthLogo, dHeightLogo);
                    ctx.restore();
                    if (opts.logoOnLoad) {
                        opts.logoOnLoad(event_1);
                    }
                    return [3 /*break*/, 4];
                case 3:
                    err_1 = _e.sent();
                    // do not fail the whole render if the logo can't load
                    console.warn('[react-qrcode-logo] QRCode logo loading failed:', err_1);
                    return [3 /*break*/, 4];
                case 4: return [2 /*return*/, canvas];
            }
        });
    });
}
// --------------------------
// Public headless API
// --------------------------
/**
 * Build a fully-rendered canvas with the QR code.
 * Defaults to devicePixelRatio = 1 for pixel-perfect export output.
 */
function generateCanvas(opts) {
    return __awaiter(this, void 0, void 0, function () {
        var canvas;
        var _a;
        return __generator(this, function (_b) {
            canvas = document.createElement('canvas');
            return [2 /*return*/, renderQRCodeToCanvas(canvas, __assign(__assign({}, opts), { pixelRatio: (_a = opts.pixelRatio) !== null && _a !== void 0 ? _a : 1 }))];
        });
    });
}
/**
 * Return a data URL for the QR code
 */
function generateDataURL(opts_1) {
    return __awaiter(this, arguments, void 0, function (opts, fileType) {
        var canvas;
        if (fileType === void 0) { fileType = 'png'; }
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, generateCanvas(opts)];
                case 1:
                    canvas = _a.sent();
                    return [2 /*return*/, canvas.toDataURL((0, utils_1.mimeFor)(fileType), 1.0)];
            }
        });
    });
}
/**
 * Return a Blob for the QR code
 */
function generateBlob(opts_1) {
    return __awaiter(this, arguments, void 0, function (opts, fileType) {
        var canvas;
        if (fileType === void 0) { fileType = 'png'; }
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, generateCanvas(opts)];
                case 1:
                    canvas = _a.sent();
                    return [2 /*return*/, new Promise(function (resolve, reject) {
                            canvas.toBlob(function (blob) { return (blob ? resolve(blob) : reject(new Error('toBlob returned null'))); }, (0, utils_1.mimeFor)(fileType), 1.0);
                        })];
            }
        });
    });
}
/**
 * Generate and downloads QRCode w specified props
 */
function downloadQRCode(opts_1) {
    return __awaiter(this, arguments, void 0, function (opts, fileType, fileName) {
        var url;
        if (fileType === void 0) { fileType = 'png'; }
        if (fileName === void 0) { fileName = 'react-qrcode-logo'; }
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, generateDataURL(opts, fileType)];
                case 1:
                    url = _a.sent();
                    (0, utils_1.triggerDownload)(url, fileName);
                    return [2 /*return*/];
            }
        });
    });
}
