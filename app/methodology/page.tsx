import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Metadata } from 'next';
import { marked } from 'marked';

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://stellar-intel.vercel.app';
const TITLE = 'Methodology — Stellar Intel';
const DESCRIPTION =
  'Understand how Stellar Intel evaluates anchor reputation, corridor performance, and recent outcomes.';

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  openGraph: {
    type: 'website',
    title: TITLE,
    description: DESCRIPTION,
    url: new URL('/methodology', SITE_URL).toString(),
    images: [
      {
        url: new URL('/opengraph-image', SITE_URL).toString(),
        width: 1200,
        height: 630,
        alt: 'Stellar Intel — The execution layer for stablecoin off-ramps',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: TITLE,
    description: DESCRIPTION,
  },
};

// Renders docs/ANCHOR_REPUTATION.md directly rather than duplicating its
// content in this component, so the doc stays the single source of truth —
// editing it is the only way to update this page.
function renderMethodologyDoc(): string {
  const source = readFileSync(join(process.cwd(), 'docs/ANCHOR_REPUTATION.md'), 'utf-8');
  return marked.parse(source, { async: false });
}

const PROSE_CLASSES = [
  '[&_h1]:text-3xl [&_h1]:font-semibold [&_h1]:text-gray-900 dark:[&_h1]:text-white',
  '[&_h2]:mt-8 [&_h2]:text-xl [&_h2]:font-semibold [&_h2]:text-gray-900 dark:[&_h2]:text-white',
  '[&_h3]:mt-6 [&_h3]:text-lg [&_h3]:font-semibold [&_h3]:text-gray-900 dark:[&_h3]:text-white',
  '[&_p]:mt-3 [&_p]:leading-relaxed [&_p]:text-gray-600 dark:[&_p]:text-gray-300',
  '[&_ul]:mt-3 [&_ul]:list-disc [&_ul]:space-y-1 [&_ul]:pl-6 [&_ul]:text-gray-600 dark:[&_ul]:text-gray-300',
  '[&_ol]:mt-3 [&_ol]:list-decimal [&_ol]:space-y-1 [&_ol]:pl-6 [&_ol]:text-gray-600 dark:[&_ol]:text-gray-300',
  '[&_a]:text-blue-600 [&_a]:underline dark:[&_a]:text-blue-400',
  '[&_code]:rounded [&_code]:bg-gray-100 [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:text-sm dark:[&_code]:bg-gray-800',
  '[&_pre]:mt-3 [&_pre]:overflow-x-auto [&_pre]:rounded-xl [&_pre]:border [&_pre]:border-gray-200 [&_pre]:bg-gray-50 [&_pre]:p-4 [&_pre]:text-sm dark:[&_pre]:border-gray-700 dark:[&_pre]:bg-gray-900/60',
  '[&_pre_code]:bg-transparent [&_pre_code]:p-0',
  '[&_table]:mt-3 [&_table]:w-full [&_table]:border-collapse [&_table]:text-sm',
  '[&_th]:border [&_th]:border-gray-200 [&_th]:bg-gray-50 [&_th]:p-2 [&_th]:text-left dark:[&_th]:border-gray-700 dark:[&_th]:bg-gray-900/60',
  '[&_td]:border [&_td]:border-gray-200 [&_td]:p-2 dark:[&_td]:border-gray-700',
].join(' ');

export default function MethodologyPage() {
  const html = renderMethodologyDoc();

  return (
    <main className="mx-auto max-w-4xl px-4 py-8">
      <div className={PROSE_CLASSES} dangerouslySetInnerHTML={{ __html: html }} />
    </main>
  );
}
