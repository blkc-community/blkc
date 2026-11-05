import { KitPage } from "@blkc-code/render-web";
import type { KitManifest } from "@blkc-code/core";
// Your own Kit is usually a file in your project: import kit from "./kit.json".
import kit from "@blkc-code/render-web/fixtures/kit-basic.json";

export default function Home() {
  return <KitPage kit={kit as unknown as KitManifest} page="home" />;
}
