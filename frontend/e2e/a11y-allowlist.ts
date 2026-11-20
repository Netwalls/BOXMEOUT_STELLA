// Known axe violations that are accepted for now. Every entry must name the issue that tracks
// the fix, so the allowlist shrinks instead of quietly growing.
export interface AllowedViolation {
  /** axe rule id, e.g. "color-contrast" */
  rule: string;
  /** Route path the violation is accepted on, or "*" for every route */
  path: string;
  /** Issue URL tracking the fix */
  issue: string;
}

export const A11Y_ALLOWLIST: AllowedViolation[] = [];
