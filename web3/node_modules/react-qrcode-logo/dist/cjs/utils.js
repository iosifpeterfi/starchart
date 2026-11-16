"use strict";
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
var __values = (this && this.__values) || function(o) {
    var s = typeof Symbol === "function" && Symbol.iterator, m = s && o[s], i = 0;
    if (m) return m.call(o);
    if (o && typeof o.length === "number") return {
        next: function () {
            if (o && i >= o.length) o = void 0;
            return { value: o && o[i++], done: !o };
        }
    };
    throw new TypeError(s ? "Object is not iterable." : "Symbol.iterator is not defined.");
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.deepEqual = deepEqual;
exports.mimeFor = mimeFor;
exports.triggerDownload = triggerDownload;
/**
 *  Props equality check
 */
function deepEqual(a, b, visited) {
    var e_1, _a, e_2, _b, e_3, _c;
    if (visited === void 0) { visited = new WeakMap(); }
    // same reference or same primitive value
    if (Object.is(a, b))
        return true;
    // different types -> cannot be equal
    if (typeof a !== typeof b)
        return false;
    // null / undefined check
    if (a == null || b == null)
        return false;
    // functions compare only by reference
    if (typeof a === 'function' || typeof b === 'function') {
        return a === b;
    }
    // avoid infinite loops on circular references
    if (typeof a === 'object' && typeof b === 'object') {
        if (visited.has(a) && visited.get(a) === b) {
            return true;
        }
        visited.set(a, b);
    }
    // date
    if (a instanceof Date && b instanceof Date) {
        return a.getTime() === b.getTime();
    }
    // arrays
    if (Array.isArray(a) && Array.isArray(b)) {
        if (a.length !== b.length)
            return false;
        for (var i = 0; i < a.length; i++) {
            if (!deepEqual(a[i], b[i], visited))
                return false;
        }
        return true;
    }
    // sets
    if (a instanceof Set && b instanceof Set) {
        if (a.size !== b.size)
            return false;
        var _loop_1 = function (val) {
            if (!__spreadArray([], __read(b), false).some(function (bVal) { return deepEqual(val, bVal, visited); }))
                return { value: false };
        };
        try {
            for (var a_1 = __values(a), a_1_1 = a_1.next(); !a_1_1.done; a_1_1 = a_1.next()) {
                var val = a_1_1.value;
                var state_1 = _loop_1(val);
                if (typeof state_1 === "object")
                    return state_1.value;
            }
        }
        catch (e_1_1) { e_1 = { error: e_1_1 }; }
        finally {
            try {
                if (a_1_1 && !a_1_1.done && (_a = a_1.return)) _a.call(a_1);
            }
            finally { if (e_1) throw e_1.error; }
        }
        return true;
    }
    // maps
    if (a instanceof Map && b instanceof Map) {
        if (a.size !== b.size)
            return false;
        try {
            for (var a_2 = __values(a), a_2_1 = a_2.next(); !a_2_1.done; a_2_1 = a_2.next()) {
                var _d = __read(a_2_1.value, 2), key = _d[0], val = _d[1];
                if (!b.has(key) || !deepEqual(val, b.get(key), visited))
                    return false;
            }
        }
        catch (e_2_1) { e_2 = { error: e_2_1 }; }
        finally {
            try {
                if (a_2_1 && !a_2_1.done && (_b = a_2.return)) _b.call(a_2);
            }
            finally { if (e_2) throw e_2.error; }
        }
        return true;
    }
    // plain objects
    if (Object.getPrototypeOf(a) === Object.prototype ||
        Object.getPrototypeOf(a) === null) {
        var keysA = Object.keys(a);
        var keysB = Object.keys(b);
        if (keysA.length !== keysB.length)
            return false;
        try {
            for (var keysA_1 = __values(keysA), keysA_1_1 = keysA_1.next(); !keysA_1_1.done; keysA_1_1 = keysA_1.next()) {
                var key = keysA_1_1.value;
                if (!keysB.includes(key))
                    return false;
                if (!deepEqual(a[key], b[key], visited))
                    return false;
            }
        }
        catch (e_3_1) { e_3 = { error: e_3_1 }; }
        finally {
            try {
                if (keysA_1_1 && !keysA_1_1.done && (_c = keysA_1.return)) _c.call(keysA_1);
            }
            finally { if (e_3) throw e_3.error; }
        }
        return true;
    }
    // remaining objects with custom prototypes (e.g., DOMPointInit, CSSProperties)
    try {
        return JSON.stringify(a) === JSON.stringify(b);
    }
    catch (_e) {
        return false;
    }
}
/**
 *  FileType to MimeType mapping
 */
function mimeFor(fileType) {
    if (fileType === void 0) { fileType = 'png'; }
    switch (fileType) {
        case 'jpg':
            return 'image/jpeg';
        case 'webp':
            return 'image/webp';
        case 'png':
        default:
            return 'image/png';
    }
}
/**
 *  Create an <a download> and click it
 */
function triggerDownload(url, fileName) {
    var link = document.createElement('a');
    link.download = fileName;
    link.href = url;
    document.body.appendChild(link); // Safari in some contexts requires the element to be in the DOM.
    link.click();
    link.remove();
}
