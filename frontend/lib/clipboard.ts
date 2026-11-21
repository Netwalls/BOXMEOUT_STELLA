/**
 * Copies `text` to the system clipboard (F-157).
 *
 * Uses the async Clipboard API when it is available and permitted, and falls
 * back to a hidden textarea with `document.execCommand("copy")` for insecure
 * contexts and older browsers. Resolves to `true` when the copy succeeded and
 * `false` otherwise. Never rejects.
 */
export async function copyToClipboard(text: string): Promise<boolean> {
  if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // Permission denied or insecure context: try the legacy path below.
    }
  }
  return copyWithExecCommand(text);
}

function copyWithExecCommand(text: string): boolean {
  if (typeof document === "undefined" || !document.body) return false;

  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.top = "0";
  textarea.style.left = "0";
  textarea.style.opacity = "0";

  document.body.appendChild(textarea);
  try {
    textarea.select();
    return document.execCommand("copy") === true;
  } catch {
    return false;
  } finally {
    document.body.removeChild(textarea);
  }
}
