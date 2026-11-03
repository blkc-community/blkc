/**
 * Minimal clsx implementation for BLKC Render-Web.
 * 
 * This is a lightweight implementation of the clsx utility to avoid
 * adding a dependency. It provides the same basic functionality:
 * combining class names with support for conditional classes.
 * 
 * @package @blkc-code/render-web
 * @license Apache-2.0
 * @author Black Code Enterprises LLC
 */

/**
 * Combine class names from multiple arguments.
 * Supports strings, objects with truthy values, and arrays.
 * 
 * @example
 * clsx("foo", "bar") // => "foo bar"
 * clsx("foo", { bar: true, baz: false }) // => "foo bar"
 * clsx("foo", ["bar", "baz"]) // => "foo bar baz"
 */
export function clsx(...args: clsx.ClsxArgument[]): string {
  const classes: string[] = [];
  
  for (const arg of args) {
    if (arg === null || arg === undefined || arg === false) {
      continue;
    }
    
    if (typeof arg === "string") {
      classes.push(arg);
    } else if (Array.isArray(arg)) {
      // Recursively process array elements
      classes.push(clsx(...arg));
    } else if (typeof arg === "object") {
      // Process object keys
      for (const [key, value] of Object.entries(arg)) {
        if (value) {
          classes.push(key);
        }
      }
    }
  }
  
  return classes.join(" ").trim();
}

declare namespace clsx {
  type ClsxValue = string | number | boolean | null | undefined;
  type ClsxObject = Record<string, ClsxValue>;
  type ClsxArray = ClsxArgument[];
  type ClsxArgument = ClsxValue | ClsxObject | ClsxArray;
}

export default clsx;
