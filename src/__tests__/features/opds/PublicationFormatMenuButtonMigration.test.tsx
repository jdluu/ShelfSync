import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PublicationFormatMenu } from "@/features/opds/PublicationFormatMenu";
import type { MediaType } from "@/types/opds";

function MenuHarness({
  onSelectFormat = vi.fn(),
  selectedFormat = null,
  disabled = false,
}: {
  onSelectFormat?: (format: MediaType) => void;
  selectedFormat?: MediaType | null;
  disabled?: boolean;
}) {
  const [isOpen, setIsOpen] = useState(false);
  return (
    <PublicationFormatMenu
      isOpen={isOpen}
      onOpenChange={setIsOpen}
      formats={["application/epub+zip", "application/pdf"]}
      selectedFormat={selectedFormat}
      onSelectFormat={onSelectFormat}
      disabled={disabled}
      triggerText="Select Format"
    />
  );
}

function openMenu(disabled = false) {
  render(<MenuHarness disabled={disabled} />);
  const trigger = screen.getByRole("button", { name: "Select download format" });
  fireEvent.click(trigger);
  return trigger;
}

describe("PublicationFormatMenu controls (Button primitive migration)", () => {
  afterEach(cleanup);

  describe("trigger", () => {
    it("renders through the shared Button primitive with its DaisyUI classes", () => {
      const trigger = openMenu();
      const className = trigger.getAttribute("class") ?? "";
      expect(className).toContain("btn");
      expect(className).toContain("btn-outline");
      expect(className).toContain("btn-sm");
      expect(className).toContain("w-full");
      expect(className).toContain("justify-between");
    });

    it("keeps its ARIA listbox attributes and listbox labelling", () => {
      const trigger = openMenu();
      expect(trigger.getAttribute("aria-haspopup")).toBe("listbox");
      expect(trigger.getAttribute("aria-expanded")).toBe("true");

      const listbox = screen.getByRole("listbox");
      expect(listbox.getAttribute("aria-labelledby")).toBe(trigger.id);
      expect(trigger.getAttribute("aria-controls")).toBe(listbox.id);
    });

    it("forwards its disabled state with the same visual classes", () => {
      render(<MenuHarness disabled />);
      const trigger = screen.getByRole("button", { name: "Select download format" });
      expect(trigger.hasAttribute("disabled")).toBe(true);
      const className = trigger.getAttribute("class") ?? "";
      expect(className).toContain("opacity-50");
      expect(className).toContain("cursor-not-allowed");
    });

    it("keeps its exact accessible name when a format is selected", () => {
      render(<MenuHarness selectedFormat="application/pdf" />);
      expect(
        screen.getByRole("button", { name: "Selected format: PDF, change format" }),
      ).not.toBeNull();
    });
  });

  describe("options", () => {
    it("renders each option as a native button with only its non-DaisyUI menu-item classes", () => {
      openMenu();
      const options = screen.getAllByRole("option");
      expect(options.map((option) => option.tagName)).toEqual(["BUTTON", "BUTTON"]);

      for (const option of options) {
        const className = option.getAttribute("class") ?? "";
        expect(className).not.toContain("btn");
        expect(className).toContain("w-full");
        expect(className).toContain("px-3");
        expect(className).toContain("py-2");
        expect(className).toContain("text-left");
        expect(className).toContain("text-sm");
        expect(className).toContain("rounded-md");
        expect(className).toContain("outline-none");
        expect(className).toContain("focus-visible:ring-2");
        expect(className).toContain("focus-visible:ring-primary");
        expect(className).toContain("hover:bg-base-200");
      }
    });

    it("keeps role=option and aria-selected on the native button", () => {
      openMenu();
      for (const option of screen.getAllByRole("option")) {
        expect(option.getAttribute("role")).toBe("option");
        expect(option.getAttribute("aria-selected")).toBe("false");
      }
    });

    it("reflects the selected format with the same visual classes", () => {
      render(<MenuHarness selectedFormat="application/pdf" />);
      fireEvent.click(screen.getByRole("button", { name: "Selected format: PDF, change format" }));

      const pdf = screen.getByRole("option", { name: "PDF" });
      expect(pdf.getAttribute("aria-selected")).toBe("true");
      const pdfClass = pdf.getAttribute("class") ?? "";
      expect(pdfClass).toContain("bg-primary/10");
      expect(pdfClass).toContain("font-medium");

      const epub = screen.getByRole("option", { name: "EPUB" });
      expect(epub.getAttribute("aria-selected")).toBe("false");
      expect(epub.getAttribute("class")).not.toContain("bg-primary/10");
    });

    it("forwards the disabled state with the same visual classes on every option", () => {
      const { rerender } = render(<MenuHarness />);
      fireEvent.click(screen.getByRole("button", { name: "Select download format" }));
      rerender(<MenuHarness disabled />);

      for (const option of screen.getAllByRole("option")) {
        expect(option.hasAttribute("disabled")).toBe(true);
        const className = option.getAttribute("class") ?? "";
        expect(className).toContain("opacity-50");
        expect(className).toContain("cursor-not-allowed");
      }
    });

    it("selects an option, closes the listbox, and restores focus to the trigger", () => {
      const onSelectFormat = vi.fn();
      render(<MenuHarness onSelectFormat={onSelectFormat} />);
      const trigger = screen.getByRole("button", { name: "Select download format" });
      fireEvent.click(trigger);

      fireEvent.click(screen.getByRole("option", { name: "PDF" }));

      expect(onSelectFormat).toHaveBeenCalledWith("application/pdf");
      expect(screen.queryByRole("listbox")).toBeNull();
      expect(document.activeElement).toBe(trigger);
    });

    it("keeps ArrowDown navigation and Escape focus restoration through the primitive", () => {
      const trigger = openMenu();
      const epub = screen.getByRole("option", { name: "EPUB" });

      fireEvent.keyDown(epub, { key: "ArrowDown" });
      expect(document.activeElement).toBe(screen.getByRole("option", { name: "PDF" }));

      fireEvent.keyDown(document, { key: "Escape" });
      expect(screen.queryByRole("listbox")).toBeNull();
      expect(document.activeElement).toBe(trigger);
    });
  });
});
