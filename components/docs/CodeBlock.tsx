'use client';
import { useState } from 'react';
import { Copy, Check } from 'lucide-react';

interface CodeBlockProps {
  code: string;
  language: string;
}

export function CodeBlock({ code, language }: CodeBlockProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="group relative">
      <div className="absolute right-2 top-2 z-10 flex items-center gap-2">
        <span className="rounded bg-gray-200 px-1.5 py-0.5 text-xs font-medium text-gray-500 dark:bg-gray-700 dark:text-gray-400">
          {language}
        </span>
        <button
          type="button"
          onClick={handleCopy}
          className="rounded p-1.5 text-gray-400 opacity-0 transition-opacity hover:bg-gray-700 hover:text-gray-200 group-hover:opacity-100"
          aria-label="Copy code"
        >
          {copied ? <Check className="h-4 w-4 text-green-400" /> : <Copy className="h-4 w-4" />}
        </button>
      </div>
      <pre className="overflow-x-auto rounded-xl border border-border bg-gray-950 p-4 text-sm leading-relaxed">
        <code className="text-gray-100">{code}</code>
      </pre>
    </div>
  );
}
