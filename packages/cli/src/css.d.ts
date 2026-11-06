/** esbuild bundles stylesheets as text (see the build script). */
declare module "*.css" {
  const text: string;
  export default text;
}

/** esbuild bundles .txt as text too: the canvas runtime, to put in a page. */
declare module "*.txt" {
  const text: string;
  export default text;
}
