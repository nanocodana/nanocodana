'use client';

import { memo } from 'react';
import { Streamdown, type Components } from 'streamdown';

// Render assistant markdown with Streamdown (robust parsing, GFM, streaming,
// link hardening) but styled to match the rest of the app — the same element
// styles the chat used before: compact headings, accent (primary) links,
// neutral inline code chips, and a tool-card-style code block.
//
// `code` always renders as the inline chip; the `pre` wrapper neutralizes the
// chip styles for code inside it via descendant overrides. That keeps the
// block/inline distinction purely structural — no sniffing className or
// newlines, which misfires on one-line fenced blocks without a language tag.
const components: Components = {
  h1: ({ children }) => <h1 className="mt-3 mb-1.5 text-lg font-bold first:mt-0">{children}</h1>,
  h2: ({ children }) => <h2 className="mt-3 mb-1.5 text-base font-bold first:mt-0">{children}</h2>,
  h3: ({ children }) => <h3 className="mt-2.5 mb-1 text-sm font-semibold first:mt-0">{children}</h3>,
  h4: ({ children }) => <h4 className="mt-2.5 mb-1 text-sm font-semibold first:mt-0">{children}</h4>,
  h5: ({ children }) => <h5 className="mt-2.5 mb-1 text-sm font-semibold first:mt-0">{children}</h5>,
  h6: ({ children }) => <h6 className="mt-2.5 mb-1 text-sm font-semibold first:mt-0">{children}</h6>,
  p: ({ children }) => <p className="my-1.5 leading-relaxed first:mt-0 last:mb-0">{children}</p>,
  ul: ({ children }) => (
    <ul className="my-1.5 list-disc space-y-1 pl-5 first:mt-0 last:mb-0">{children}</ul>
  ),
  ol: ({ children }) => (
    <ol className="my-1.5 list-decimal space-y-1 pl-5 first:mt-0 last:mb-0">{children}</ol>
  ),
  li: ({ children }) => <li className="leading-relaxed">{children}</li>,
  a: ({ href, children }) => (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="text-primary underline underline-offset-2 hover:opacity-80"
    >
      {children}
    </a>
  ),
  strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
  em: ({ children }) => <em className="italic">{children}</em>,
  pre: ({ children }) => (
    <pre className="my-2 overflow-x-auto rounded-xl border border-border/60 bg-muted/50 p-3 text-xs first:mt-0 last:mb-0 [&_code]:rounded-none [&_code]:bg-transparent [&_code]:p-0 [&_code]:text-[1em] [&_code]:text-foreground/90">
      {children}
    </pre>
  ),
  code: ({ children }) => (
    <code className="rounded bg-black/[0.06] px-1.5 py-0.5 font-mono text-[0.85em]">{children}</code>
  ),
};

// Memoized: the prop is a plain string, and the chat re-renders on every
// keystroke and stream chunk — this skips re-running Streamdown for all the
// messages whose text hasn't changed.
export const MarkdownMessage = memo(function MarkdownMessage({ content }: { content: string }) {
  return (
    <Streamdown className="text-sm leading-relaxed" components={components}>
      {content}
    </Streamdown>
  );
});
