import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { HeroBlock } from "./index.js";

describe("hero snapshot", () => {
  it("renders the default hero", () => {
    const html = renderToStaticMarkup(
      <HeroBlock props={{ heading: "Hello", subheading: "World", cta: { label: "Go", href: "/go" } }} className="" style={{}} />,
    );
    expect(html).toMatchSnapshot();
  });
});