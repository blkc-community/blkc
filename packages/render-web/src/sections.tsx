/**
 * BLKC Render-Web - Page sections.
 *
 * The section set most small-business sites need: services, story, values, cta
 * and contact. Each is one Block with a manifest in the `blocks` repo. The code
 * lives here because render-web bundles reviewed Blocks at build time (D6).
 *
 * @package @blkc-code/render-web
 * @license Apache-2.0
 */

import type { ReactNode } from "react";
import { clsx } from "./clsx.js";
import { richTextToHtml, type RichText } from "./richtext.js";
import type { BlockProps } from "./types.js";
import * as utils from "./utils.js";

interface LinkValue {
  label: string;
  href: string;
}

interface ImageValue {
  src: string;
  alt: string;
}

interface CardItem {
  title: string;
  text?: string;
  link?: LinkValue;
}

const BAND = "w-full px-6 py-16 sm:py-24";
const INNER = "mx-auto flex w-full max-w-blkc flex-col gap-8";
const HEADING = "blkc-heading text-3xl font-bold tracking-tight text-balance sm:text-4xl";
const LEAD = "max-w-2xl text-lg text-muted-foreground text-pretty";
const BUTTON =
  "inline-flex w-fit items-center justify-center rounded-lg bg-accent-foreground px-7 py-3.5 text-base font-semibold text-accent no-underline shadow-md transition-all hover:-translate-y-0.5 hover:shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

function CardGrid({ items, showLinks, surface }: { items: CardItem[]; showLinks: boolean; surface: string }): ReactNode {
  return (
    <ul className="grid list-none gap-6 p-0 sm:grid-cols-2 lg:grid-cols-3">
      {items.map((item, index) => (
        <li key={index} className={clsx("flex flex-col gap-3 rounded-xl border border-border p-6 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md", surface)}>
          <h3 className="text-xl font-semibold">{item.title}</h3>
          {item.text && <p className="text-muted-foreground">{item.text}</p>}
          {showLinks && item.link && (
            <a href={utils.normalizeUrl(item.link.href)} className="mt-auto font-medium text-primary underline-offset-4 hover:underline">
              {item.link.label}
            </a>
          )}
        </li>
      ))}
    </ul>
  );
}

export interface ServicesProps {
  heading: string;
  intro?: string;
  items?: CardItem[];
}

export function ServicesBlock({ props: p, className, style }: BlockProps<ServicesProps>): ReactNode {
  return (
    <section className={clsx("blkc-services", BAND, className)} style={style}>
      <div className={INNER}>
        <h2 className={HEADING}>{p.heading}</h2>
        {p.intro && <p className={LEAD}>{p.intro}</p>}
        <CardGrid items={p.items ?? []} showLinks surface="bg-muted" />
      </div>
    </section>
  );
}

export interface StoryProps {
  heading: string;
  body?: RichText;
  image?: ImageValue;
  imageSide?: "left" | "right";
}

export function StoryBlock({ props: p, className, style }: BlockProps<StoryProps>): ReactNode {
  const body = richTextToHtml(p.body);
  return (
    <section className={clsx("blkc-story", BAND, className)} style={style}>
      <div className="mx-auto grid w-full max-w-blkc items-center gap-10 md:grid-cols-2">
        <div className={clsx("flex flex-col gap-4", p.imageSide === "left" && "md:order-2")}>
          <h2 className={HEADING}>{p.heading}</h2>
          {body && <div className="flex flex-col gap-3 text-lg leading-relaxed text-muted-foreground [&_strong]:text-foreground" dangerouslySetInnerHTML={{ __html: body }} />}
        </div>
        {p.image && (
          <img src={p.image.src} alt={p.image.alt} className="h-auto w-full rounded-2xl border border-border object-cover shadow-lg" />
        )}
      </div>
    </section>
  );
}

export interface ValuesProps {
  heading: string;
  items?: CardItem[];
}

export function ValuesBlock({ props: p, className, style }: BlockProps<ValuesProps>): ReactNode {
  return (
    <section className={clsx("blkc-values bg-muted", BAND, className)} style={style}>
      <div className={INNER}>
        <h2 className={HEADING}>{p.heading}</h2>
        <CardGrid items={p.items ?? []} showLinks={false} surface="bg-background" />
      </div>
    </section>
  );
}

export interface CtaProps {
  heading: string;
  text?: string;
  cta?: LinkValue;
}

export function CtaBlock({ props: p, className, style }: BlockProps<CtaProps>): ReactNode {
  return (
    <section className={clsx("blkc-cta", BAND, className)} style={style}>
      <div className={clsx(INNER, "items-center rounded-3xl bg-accent px-6 py-14 text-center text-accent-foreground shadow-lg sm:py-20")}>
        <h2 className={HEADING}>{p.heading}</h2>
        {p.text && <p className="max-w-2xl text-lg">{p.text}</p>}
        {p.cta && (
          <a href={utils.normalizeUrl(p.cta.href)} className={BUTTON}>
            {p.cta.label}
          </a>
        )}
      </div>
    </section>
  );
}

export interface ContactProps {
  heading: string;
  intro?: string;
  email?: string;
  phone?: string;
  address?: string;
}

/** Contact details only: a form needs a server, which is a capability Block's job. */
export function ContactBlock({ props: p, className, style }: BlockProps<ContactProps>): ReactNode {
  return (
    <section className={clsx("blkc-contact", BAND, className)} style={style}>
      <div className={INNER}>
        <h2 className={HEADING}>{p.heading}</h2>
        {p.intro && <p className={LEAD}>{p.intro}</p>}
        <address className="grid gap-4 not-italic sm:grid-cols-2 lg:grid-cols-3 [&>*]:rounded-xl [&>*]:border [&>*]:border-border [&>*]:bg-muted [&>*]:p-6 [&>*]:font-medium [&>*]:shadow-sm">
          {p.email && <a href={`mailto:${encodeURI(p.email)}`} className="text-primary underline-offset-4 hover:underline">{p.email}</a>}
          {p.phone && <a href={`tel:${p.phone.replace(/[^+\d]/g, "")}`} className="text-primary underline-offset-4 hover:underline">{p.phone}</a>}
          {p.address && <span>{p.address}</span>}
        </address>
      </div>
    </section>
  );
}
