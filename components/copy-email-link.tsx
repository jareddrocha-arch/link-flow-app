"use client";

import { useCallback, useState } from "react";

type Props = {
  email?: string;
  /** Optional class for the button (looks like a link) */
  className?: string;
  children?: React.ReactNode;
};

/**
 * Clickable email that copies to clipboard instead of opening mailto:.
 */
export function CopyEmailLink({
  email = "support@linkflowaffiliates.com",
  className,
  children,
}: Props) {
  const [copied, setCopied] = useState(false);

  const onClick = useCallback(
    async (e: React.MouseEvent) => {
      e.preventDefault();
      try {
        await navigator.clipboard.writeText(email);
        setCopied(true);
        window.setTimeout(() => setCopied(false), 2000);
      } catch {
        // Fallback for older browsers / denied clipboard
        try {
          const ta = document.createElement("textarea");
          ta.value = email;
          ta.setAttribute("readonly", "");
          ta.style.position = "fixed";
          ta.style.left = "-9999px";
          document.body.appendChild(ta);
          ta.select();
          document.execCommand("copy");
          document.body.removeChild(ta);
          setCopied(true);
          window.setTimeout(() => setCopied(false), 2000);
        } catch {
          /* ignore */
        }
      }
    },
    [email],
  );

  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
      <button
        type="button"
        onClick={onClick}
        className={className}
        title={`Copy ${email}`}
        style={{
          background: "none",
          border: "none",
          padding: 0,
          margin: 0,
          cursor: "pointer",
          color: "var(--p-color-text-link, #005bd3)",
          textDecoration: "underline",
          font: "inherit",
          fontWeight: 500,
        }}
      >
        {children ?? email}
      </button>
      {copied ? (
        <span
          role="status"
          style={{
            fontSize: "0.75rem",
            fontWeight: 600,
            color: "var(--p-color-text-success, #0c5132)",
          }}
        >
          Copied!
        </span>
      ) : null}
    </span>
  );
}
