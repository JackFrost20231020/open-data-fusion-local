import { t } from "../i18n";
import type { ComponentPropsWithoutRef } from "react";

export type BrandLogoVariant = "full" | "icon";

interface BrandLogoProps extends ComponentPropsWithoutRef<"span"> {
  variant?: BrandLogoVariant;
}

/**
 * Impeller Nodes mark: a centrifugal-pump volute ring, three backswept
 * impeller vanes, and three data nodes fusing at the rim. Colors come from
 * --logo-blue and --logo-teal so the mark follows light and dark surfaces.
 */
export function BrandLogo({
  "aria-hidden": ariaHidden,
  "aria-label": ariaLabel,
  className,
  variant = "full",
  ...props
}: BrandLogoProps) {
  const hidden = ariaHidden === true || ariaHidden === "true";
  const classes = ["brand-logo", `brand-logo--${variant}`, className].filter(Boolean).join(" ");

  return (
    <span
      {...props}
      aria-hidden={ariaHidden}
      aria-label={hidden ? undefined : ariaLabel ?? t("Open Data Fusion logo")}
      className={classes}
      role={hidden ? undefined : "img"}
    >
      <svg
        className="brand-logo__icon"
        viewBox="0 0 64 64"
        fill="none"
        data-logo="impeller-nodes"
        aria-hidden="true"
        focusable="false"
      >
        <circle cx="32" cy="32" r="26.82" stroke="var(--logo-blue)" strokeWidth="2.6" />
        <path fill="var(--logo-blue)" d="M 28.24 26.43 Q 29.28 16.60 37.45 10.13 Q 42.47 20.38 34.95 25.96 Z" />
        <path fill="var(--logo-blue)" d="M 38.70 31.53 Q 46.70 37.35 48.21 47.66 Q 36.83 46.87 35.76 37.57 Z" />
        <path fill="var(--logo-blue)" d="M 29.05 38.04 Q 20.02 42.05 10.33 38.21 Q 16.70 28.75 25.30 32.47 Z" />
        <circle cx="38.24" cy="6.96" r="3.73" fill="var(--logo-teal)" />
        <circle cx="50.57" cy="49.93" r="3.73" fill="var(--logo-teal)" />
        <circle cx="7.19" cy="39.11" r="3.73" fill="var(--logo-teal)" />
        <circle cx="32" cy="32" r="7.5" fill="var(--logo-teal)" />
        <circle cx="32" cy="32" r="2.9" fill="var(--logo-blue)" />
      </svg>
      {variant === "full" ? (
        <span className="brand-logo__wordmark" aria-hidden="true">
          <span className="brand-logo__open">Open Data</span>
          <span className="brand-logo__fusion">Fusion</span>
        </span>
      ) : null}
    </span>
  );
}
