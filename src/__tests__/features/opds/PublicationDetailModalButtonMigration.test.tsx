import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PublicationDetailModal } from "@/features/opds/PublicationDetailModal";
import type { Publication } from "@/types/opds";
import { cn } from "@/utils/cn";

vi.mock("@/utils/tauri", () => ({
  isTauri: () => false,
  safeInvoke: vi.fn(),
  safeStoreLoad: vi.fn(),
}));

const variantClasses: Record<string, string> = {
  primary: "btn-primary",
  outline: "btn-outline",
  ghost: "btn-ghost",
  danger: "btn-outline btn-error",
  plain: "",
};
const sizeClasses: Record<string, string> = {
  sm: "btn-sm",
  md: "",
};

const mockButtonRender = vi.fn();
vi.mock("@/components/ui/Button", () => ({
  Button: (props: React.ComponentProps<"button"> & { variant?: string; size?: string }) => {
    mockButtonRender(props);
    const variant = props.variant ?? "outline";
    const { className, variant: _v, size: _s, ...rest } = props;
    return (
      <button
        {...rest}
        className={cn(
          variant === "plain" ? "" : "btn",
          variant === "plain" ? "" : variantClasses[variant],
          variant === "plain" ? "" : sizeClasses[props.size ?? "md"],
          className,
        )}
      />
    );
  },
}));

const makePublication = (overrides: Partial<Publication> = {}): Publication => ({
  id: "urn:book:1",
  title: "Blackflame",
  authors: ["Will Wight"],
  pubdate: "2017-04-18",
  publisher: "Hidden Gnome Publishing",
  identifiers: {},
  series: { name: "Cradle", index: 3 },
  languages: ["en"],
  categories: ["Fantasy", "Adventure"],
  relations: [],
  descriptions: ["<p>Lindon has a year left.</p>"],
  links: [
    {
      href: "/download/934",
      media_type: "application/epub+zip",
      rel: "http://opds-spec.org/acquisition",
    },
    {
      href: "/download/934.pdf",
      media_type: "application/pdf",
      rel: "http://opds-spec.org/acquisition",
    },
  ],
  representative: { href: "/cover/934", type: "image/jpeg" },
  ...overrides,
});

const renderWithDownload = (props: Partial<Parameters<typeof PublicationDetailModal>[0]> = {}) =>
  render(
    <PublicationDetailModal
      publication={makePublication()}
      onClose={() => {}}
      catalogUrl="http://localhost:6061/api/v1/opds"
      contentRoot="ShelfSync"
      onDownload={vi.fn()}
      {...props}
    />,
  );

describe("PublicationDetailModal buttons (Button primitive migration)", () => {
  afterEach(() => {
    cleanup();
    mockButtonRender.mockClear();
  });

  describe("header close button", () => {
    it("renders through the shared Button primitive with ghost, sm, and square classes", () => {
      renderWithDownload();
      const button = screen.getByRole("button", { name: "Close details" });
      const className = button.getAttribute("class") ?? "";
      expect(className).toContain("btn-ghost");
      expect(className).toContain("btn-sm");
      expect(className).toContain("btn-square");
      expect(className).toContain("shrink-0");
    });

    it("passes variant, size, onClick, and aria-label to the primitive", () => {
      const onClose = vi.fn();
      renderWithDownload({ onClose });
      const matched = mockButtonRender.mock.calls
        .map(([p]) => p)
        .find((p) => p["aria-label"] === "Close details");
      expect(matched?.variant).toBe("ghost");
      expect(matched?.size).toBe("sm");
      expect(typeof matched?.onClick).toBe("function");
      matched?.onClick?.({} as React.MouseEvent<HTMLButtonElement>);
      expect(onClose).toHaveBeenCalledTimes(1);
    });
  });

  describe("acquisition download buttons", () => {
    it("renders one Button per acquisition format with the primary variant and sm size", () => {
      renderWithDownload();
      const epub = screen.getByRole("button", { name: /Download Blackflame as EPUB/ });
      const pdf = screen.getByRole("button", { name: /Download Blackflame as PDF/ });
      for (const button of [epub, pdf]) {
        const className = button.getAttribute("class") ?? "";
        expect(className).toContain("btn-primary");
        expect(className).toContain("btn-sm");
        expect(className).toContain("gap-2");
      }
    });

    it("passes the primary variant and format-scoped onClick to the primitive", async () => {
      const onDownload = vi
        .fn()
        .mockResolvedValue({ localPath: "/x.pdf", mediaType: "application/pdf" });
      renderWithDownload({ onDownload });
      const matched = mockButtonRender.mock.calls
        .map(([p]) => p)
        .find((p) => (p["aria-label"] as string).includes("as PDF"));
      expect(matched?.variant).toBe("primary");
      expect(matched?.size).toBe("sm");
      expect(typeof matched?.onClick).toBe("function");
      expect(onDownload).not.toHaveBeenCalled();
      matched?.onClick?.({} as React.MouseEvent<HTMLButtonElement>);
      await waitFor(() => expect(onDownload).toHaveBeenCalled());
      expect(onDownload.mock.calls[0]?.[2]).toBe("application/pdf");
    });

    it("keeps exact aria-labels and per-format labels", () => {
      renderWithDownload();
      expect(
        screen
          .getByRole("button", { name: "Download Blackflame as EPUB" })
          .getAttribute("aria-label"),
      ).toBe("Download Blackflame as EPUB");
      expect(
        screen
          .getByRole("button", { name: "Download Blackflame as PDF" })
          .getAttribute("aria-label"),
      ).toBe("Download Blackflame as PDF");
      expect(screen.getByText("EPUB")).not.toBeNull();
      expect(screen.getByText("PDF")).not.toBeNull();
    });
  });

  describe("footer close button", () => {
    it("renders through the shared Button primitive with ghost and sm classes", () => {
      renderWithDownload();
      const button = screen.getByRole("button", { name: "Close" });
      const className = button.getAttribute("class") ?? "";
      expect(button.tagName).toBe("BUTTON");
      expect(className).toContain("btn-ghost");
      expect(className).toContain("btn-sm");
    });

    it("calls onClose when clicked", () => {
      const onClose = vi.fn();
      renderWithDownload({ onClose });
      fireEvent.click(screen.getByRole("button", { name: "Close" }));
      expect(onClose).toHaveBeenCalledTimes(1);
    });
  });
});
