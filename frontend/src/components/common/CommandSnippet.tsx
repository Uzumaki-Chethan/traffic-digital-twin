import { useState } from 'react'
import { Check, Copy } from 'lucide-react'

export function CommandSnippet({ command }: { command: string }) {
  const [copied, setCopied] = useState(false)

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(command)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      // Clipboard API unavailable (e.g. insecure context) - fail silently,
      // the command is still visible to copy manually.
    }
  }

  return (
    <div className="flex items-center justify-between gap-2 rounded-md border border-[var(--color-border-soft)] bg-[var(--color-panel-inset)] px-3 py-2">
      <code className="overflow-x-auto whitespace-nowrap font-mono text-[12px] text-[var(--color-text)]">
        {command}
      </code>
      <button
        onClick={handleCopy}
        className="flex shrink-0 items-center gap-1 rounded px-2 py-1 text-[11px] font-medium text-[var(--color-text-dim)] hover:bg-[var(--color-panel-raised)] hover:text-[var(--color-text)]"
      >
        {copied ? <Check size={12} className="text-[var(--color-flow)]" /> : <Copy size={12} />}
        {copied ? 'Copied' : 'Copy'}
      </button>
    </div>
  )
}
