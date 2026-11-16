"use strict";
var __extends = (this && this.__extends) || (function () {
    var extendStatics = function (d, b) {
        extendStatics = Object.setPrototypeOf ||
            ({ __proto__: [] } instanceof Array && function (d, b) { d.__proto__ = b; }) ||
            function (d, b) { for (var p in b) if (Object.prototype.hasOwnProperty.call(b, p)) d[p] = b[p]; };
        return extendStatics(d, b);
    };
    return function (d, b) {
        if (typeof b !== "function" && b !== null)
            throw new TypeError("Class extends value " + String(b) + " is not a constructor or null");
        extendStatics(d, b);
        function __() { this.constructor = d; }
        d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());
    };
})();
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
var __read = (this && this.__read) || function (o, n) {
    var m = typeof Symbol === "function" && o[Symbol.iterator];
    if (!m) return o;
    var i = m.call(o), r, ar = [], e;
    try {
        while ((n === void 0 || n-- > 0) && !(r = i.next()).done) ar.push(r.value);
    }
    catch (error) { e = { error: error }; }
    finally {
        try {
            if (r && !r.done && (m = i["return"])) m.call(i);
        }
        finally { if (e) throw e.error; }
    }
    return ar;
};
var __spreadArray = (this && this.__spreadArray) || function (to, from, pack) {
    if (pack || arguments.length === 2) for (var i = 0, l = from.length, ar; i < l; i++) {
        if (ar || !(i in from)) {
            if (!ar) ar = Array.prototype.slice.call(from, 0, i);
            ar[i] = from[i];
        }
    }
    return to.concat(ar || Array.prototype.slice.call(from));
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.QRCode = void 0;
var react_1 = __importDefault(require("react"));
var renderer_1 = require("./renderer");
var utils_1 = require("./utils");
var QRCode = /** @class */ (function (_super) {
    __extends(QRCode, _super);
    function QRCode() {
        var _this = _super.apply(this, __spreadArray([], __read(arguments), false)) || this;
        _this.canvasRef = react_1.default.createRef();
        return _this;
    }
    /**
     * Download the currently-rendered QR code.
     * Uses the on-screen canvas (DPR-scaled) — the visible result is identical to what the user sees.
     */
    QRCode.prototype.download = function (fileType, fileName) {
        if (!this.canvasRef.current)
            return;
        var url = this.canvasRef.current.toDataURL((0, utils_1.mimeFor)(fileType), 1.0);
        (0, utils_1.triggerDownload)(url, fileName !== null && fileName !== void 0 ? fileName : 'react-qrcode-logo');
    };
    QRCode.prototype.shouldComponentUpdate = function (nextProps) {
        return !(0, utils_1.deepEqual)(this.props, nextProps);
    };
    QRCode.prototype.componentDidMount = function () {
        this.update();
    };
    QRCode.prototype.componentDidUpdate = function () {
        this.update();
    };
    QRCode.prototype.update = function () {
        if (!this.canvasRef.current)
            return;
        (0, renderer_1.renderQRCodeToCanvas)(this.canvasRef.current, this.props)
            .catch(function (err) {
            console.error('[react-qrcode-logo] QRCode render failed:', err);
        });
    };
    QRCode.prototype.render = function () {
        var _a, _b, _c;
        var size = (_a = this.props.size) !== null && _a !== void 0 ? _a : renderer_1.DEFAULT_PROPS.size;
        var quietZone = (_b = this.props.quietZone) !== null && _b !== void 0 ? _b : renderer_1.DEFAULT_PROPS.quietZone;
        var qrSize = +size + 2 * +quietZone;
        return (react_1.default.createElement("canvas", { id: (_c = this.props.id) !== null && _c !== void 0 ? _c : 'react-qrcode-logo', height: qrSize, width: qrSize, style: __assign({ height: qrSize + 'px', width: qrSize + 'px' }, this.props.style), ref: this.canvasRef }));
    };
    return QRCode;
}(react_1.default.Component));
exports.QRCode = QRCode;
exports.default = QRCode;
