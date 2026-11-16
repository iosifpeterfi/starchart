import { FileType } from "./renderer";

/**
 *  Props equality check
 */
export function deepEqual(
    a: unknown,
    b: unknown,
    visited: WeakMap<object, object> = new WeakMap()
): boolean {
    // same reference or same primitive value
    if (Object.is(a, b)) return true;

    // different types -> cannot be equal
    if (typeof a !== typeof b) return false;

    // null / undefined check
    if (a == null || b == null) return false;

    // functions compare only by reference
    if (typeof a === 'function' || typeof b === 'function') {
        return a === b;
    }

    // avoid infinite loops on circular references
    if (typeof a === 'object' && typeof b === 'object') {
        if (visited.has(a as object) && visited.get(a as object) === b) {
            return true;
        }
        visited.set(a as object, b as object);
    }

    // date
    if (a instanceof Date && b instanceof Date) {
        return a.getTime() === b.getTime();
    }

    // arrays
    if (Array.isArray(a) && Array.isArray(b)) {
        if (a.length !== b.length) return false;
        for (let i = 0; i < a.length; i++) {
            if (!deepEqual(a[i], b[i], visited)) return false;
        }
        return true;
    }

    // sets
    if (a instanceof Set && b instanceof Set) {
        if (a.size !== b.size) return false;
        for (const val of a) {
            if (![...b].some(bVal => deepEqual(val, bVal, visited))) return false;
        }
        return true;
    }

    // maps
    if (a instanceof Map && b instanceof Map) {
        if (a.size !== b.size) return false;
        for (const [key, val] of a) {
            if (!b.has(key) || !deepEqual(val, b.get(key), visited)) return false;
        }
        return true;
    }

    // plain objects
    if (
        Object.getPrototypeOf(a) === Object.prototype ||
        Object.getPrototypeOf(a) === null
    ) {
        const keysA = Object.keys(a as object);
        const keysB = Object.keys(b as object);
        if (keysA.length !== keysB.length) return false;

        for (const key of keysA) {
            if (!keysB.includes(key)) return false;
            if (!deepEqual((a as any)[key], (b as any)[key], visited)) return false;
        }
        return true;
    }

    // remaining objects with custom prototypes (e.g., DOMPointInit, CSSProperties)
    try {
        return JSON.stringify(a) === JSON.stringify(b);
    } catch {
        return false;
    }
}

/**
 *  FileType to MimeType mapping
 */
export function mimeFor(fileType: FileType = 'png'): string {
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
export function triggerDownload(url: string, fileName: string): void {
    const link = document.createElement('a');
    link.download = fileName;
    link.href = url;
    document.body.appendChild(link); // Safari in some contexts requires the element to be in the DOM.
    link.click();
    link.remove();
}