import { FileType } from "./renderer";
/**
 *  Props equality check
 */
export declare function deepEqual(a: unknown, b: unknown, visited?: WeakMap<object, object>): boolean;
/**
 *  FileType to MimeType mapping
 */
export declare function mimeFor(fileType?: FileType): string;
/**
 *  Create an <a download> and click it
 */
export declare function triggerDownload(url: string, fileName: string): void;
