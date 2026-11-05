/** esbuild bundles stylesheets as text (see the build script). */
declare module "*.css" {
  const text: string;
  export default text;
}
