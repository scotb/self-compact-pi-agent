/**
 * Pi extension entry point.
 *
 * When this directory is deployed as ~/.pi/agent/extensions/self-compact/, Pi's extension
 * discovery loads this index (or the "pi" field of package.json, which takes precedence
 * when present). Both resolve to the same implementation.
 */
export { default } from "./extensions/self-compact/self-compact.ts";
