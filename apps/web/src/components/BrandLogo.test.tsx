import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { BrandLogo } from "./BrandLogo";
import { t } from "../i18n";

describe("BrandLogo", () => {
  it("renders the full accessible Open Data Fusion wordmark and industrial mark", () => {
    render(<BrandLogo />);

    const logo = screen.getByRole("img", { name: t("Open Data Fusion logo") });
    expect(logo).toHaveClass("brand-logo", "brand-logo--full");
    expect(screen.getByText(t("Open Data"))).toBeVisible();
    expect(screen.getByText(t("Fusion"))).toBeVisible();
    const svg = logo.querySelector("svg");
    expect(svg).toHaveAttribute("data-logo", "impeller-nodes");
    expect(svg).toHaveAttribute("viewBox", "0 0 64 64");
    expect(svg).toHaveAttribute("fill", "none");
    expect(logo.querySelectorAll("path")).toHaveLength(3);
  });

  it("renders an icon-only decorative mark for already-labelled controls", () => {
    const { container } = render(<BrandLogo variant="icon" aria-hidden="true" />);

    expect(screen.queryByRole("img", { name: t("Open Data Fusion logo") })).not.toBeInTheDocument();
    expect(screen.queryByText(t("Open Data"))).not.toBeInTheDocument();
    expect(container.querySelector(".brand-logo--icon path")).toBeInTheDocument();
    expect(container.querySelector('[data-logo="impeller-nodes"]')).toBeInTheDocument();
  });
});
