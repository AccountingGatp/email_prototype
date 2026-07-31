"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

function looksLikeHtml(html?: string | null) {
  if (!html) return false;
  return /<(?:html|body|table|div|p|span|h[1-6]|img|a)\b/i.test(html);
}

function wrapEmailHtml(html: string) {
  return `<!DOCTYPE html><html><head><meta charset="utf-8"/><base target="_blank" rel="noopener noreferrer"/><style>
    html,body{margin:0;padding:12px;background:#fff;color:#1e293b;font:14px/1.5 Arial,Helvetica,sans-serif;}
    img{max-width:100%;height:auto;}
    a{color:#0f766e;}
  </style></head><body>${html}</body></html>`;
}

type Props = {
  bodyHtml?: string | null;
  bodyText: string;
  className?: string;
};

export function EmailBody({ bodyHtml, bodyText, className }: Props) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [height, setHeight] = useState(180);
  const useHtml = looksLikeHtml(bodyHtml);

  useEffect(() => {
    if (!useHtml) return;
    const iframe = iframeRef.current;
    if (!iframe) return;

    function resize() {
      try {
        const doc = iframe?.contentDocument;
        const h = doc?.body?.scrollHeight || doc?.documentElement?.scrollHeight;
        if (h && h > 40) setHeight(Math.min(Math.max(h + 24, 120), 900));
      } catch {
        /* ignore cross-origin */
      }
    }

    iframe.addEventListener("load", resize);
    resize();
    const t = window.setTimeout(resize, 300);
    return () => {
      iframe.removeEventListener("load", resize);
      window.clearTimeout(t);
    };
  }, [useHtml, bodyHtml]);

  if (useHtml && bodyHtml) {
    return (
      <iframe
        ref={iframeRef}
        title="Email content"
        sandbox="allow-same-origin"
        srcDoc={wrapEmailHtml(bodyHtml)}
        className={cn(
          "mt-2 w-full rounded-lg border border-slate-200 bg-white",
          className
        )}
        style={{ height }}
      />
    );
  }

  return (
    <pre
      className={cn(
        "mt-2 whitespace-pre-wrap font-sans text-sm leading-relaxed text-slate-800",
        className
      )}
    >
      {bodyText}
    </pre>
  );
}
