import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type React from "react";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { OpdsCatalogScreen } from "@/features/opds/OpdsCatalogScreen";
import { OpdsPublicationCard } from "@/features/opds/OpdsPublicationCard";
import { PublicationFormatMenu } from "@/features/opds/PublicationFormatMenu";
import type { Catalog, MediaType, Publication } from "@/types/opds";

const makePublication = (overrides?: Partial<Publication>): Publication => ({
  id: "pub-1",
  title: "Dune",
  authors: ["Frank Herbert"],
  languages: ["en"],
  relations: [],
  descriptions: [],
  identifiers: {},
  links: [
    { href: "https://example.com/dune.epub", media_type: "application/epub+zip" },
    { href: "https://example.com/dune.pdf", media_type: "application/pdf" },
  ],
  ...overrides,
});

const makeCatalog = (overrides?: Partial<Catalog>): Catalog => ({
  title: "Test OPDS Catalog",
  authors: [],
  links: [],
  publications: [makePublication()],
  ...overrides,
});

describe("OPDS connect form labels", () => {
  afterEach(cleanup);

  const renderConnectForm = (overrides?: Partial<React.ComponentProps<typeof OpdsCatalogScreen>>) =>
    render(
      <OpdsCatalogScreen
        url=""
        onUrlChange={vi.fn()}
        username=""
        onUsernameChange={vi.fn()}
        password=""
        onPasswordChange={vi.fn()}
        connected={false}
        onConnect={vi.fn()}
        onDisconnect={vi.fn()}
        loading={false}
        error={null}
        page={1}
        onPageChange={vi.fn()}
        contentRoot="/downloads/opds"
        onContentRootChange={vi.fn()}
        {...overrides}
      />,
    );

  it("exposes a named form with labeled credential fields", () => {
    renderConnectForm();

    expect(screen.getByRole("form", { name: "OPDS catalog connection" })).not.toBeNull();
    expect(screen.getByLabelText("Catalog URL")).not.toBeNull();
    expect(screen.getByLabelText("Username (optional)")).not.toBeNull();

    const passwordInput = screen.getByLabelText("Password (optional)") as HTMLInputElement;
    expect(passwordInput.type).toBe("password");
  });

  it("links validation errors to the URL field via alert and describedby", () => {
    renderConnectForm({ url: "not-a-url" });

    fireEvent.click(screen.getByRole("button", { name: "Connect" }));

    const urlInput = screen.getByLabelText("Catalog URL") as HTMLInputElement;
    expect(urlInput.getAttribute("aria-invalid")).toBe("true");
    expect(urlInput.getAttribute("aria-describedby")).toBe("opds-url-error");

    const alert = screen.getByRole("alert");
    expect(alert.id).toBe("opds-url-error");
    expect(alert.textContent).toContain("http:// or https://");
  });

  it("marks the form busy while connecting", () => {
    renderConnectForm({ loading: true });

    const form = screen.getByRole("form", { name: "OPDS catalog connection" });
    expect(form.getAttribute("aria-busy")).toBe("true");

    const connectButton = screen.getByRole("button", { name: "Connect" }) as HTMLButtonElement;
    expect(connectButton.disabled).toBe(true);
  });
});

describe("OPDS catalog change announcements", () => {
  afterEach(cleanup);

  const baseProps = {
    url: "https://example.com/opds",
    onUrlChange: vi.fn(),
    username: "",
    onUsernameChange: vi.fn(),
    password: "",
    onPasswordChange: vi.fn(),
    connected: true,
    onConnect: vi.fn(),
    onDisconnect: vi.fn(),
    loading: false,
    error: null,
    onPageChange: vi.fn(),
    contentRoot: "/downloads/opds",
    onContentRootChange: vi.fn(),
  };

  it("announces the loaded catalog page through a live region", () => {
    render(
      <OpdsCatalogScreen
        {...baseProps}
        catalog={makeCatalog({
          publications: [makePublication(), makePublication({ id: "pub-2" })],
        })}
        page={2}
      />,
    );

    const status = screen.getByRole("status");
    expect(status.getAttribute("aria-live")).toBe("polite");
    expect(status.textContent).toBe("Test OPDS Catalog: page 2, 2 publications");
  });

  it("moves focus to the catalog content after the page changes", () => {
    const { rerender } = render(
      <OpdsCatalogScreen
        {...baseProps}
        catalog={makeCatalog()}
        page={1}
      />,
    );

    expect(document.activeElement).toBe(document.body);

    rerender(
      <OpdsCatalogScreen
        {...baseProps}
        catalog={makeCatalog()}
        page={2}
      />,
    );

    const focused = document.activeElement as HTMLElement | null;
    expect(focused).not.toBe(document.body);
    expect(focused?.getAttribute("tabindex")).toBe("-1");
    expect(focused?.textContent).toContain("Test OPDS Catalog");
  });

  it("does not move focus when rerendering without a page change", () => {
    const { rerender } = render(
      <OpdsCatalogScreen
        {...baseProps}
        catalog={makeCatalog()}
        page={1}
      />,
    );

    rerender(
      <OpdsCatalogScreen
        {...baseProps}
        catalog={makeCatalog()}
        page={1}
      />,
    );

    expect(document.activeElement).toBe(document.body);
  });
});

describe("publication card download aria-labels", () => {
  afterEach(cleanup);

  const baseCardProps = {
    publication: makePublication(),
    catalogUrl: "https://example.com/opds",
    contentRoot: "/content",
    onDownload: vi.fn(),
  };

  it("names the download action with title and format", () => {
    render(<OpdsPublicationCard {...baseCardProps} />);

    fireEvent.click(screen.getByRole("button", { name: "Select download format" }));
    fireEvent.click(screen.getByRole("option", { name: "EPUB" }));

    const button = screen.getByRole("button", { name: "Download Dune as EPUB" });
    expect(button.className).toContain("focus-visible:ring-2");
  });

  it("announces downloading state with title and percent complete", () => {
    render(<OpdsPublicationCard {...baseCardProps} downloadStatus="downloading" downloadProgress={45} />);

    expect(screen.getByRole("button", { name: "Downloading Dune 45%" })).not.toBeNull();
    expect(screen.getByRole("progressbar", { name: "Downloading Dune" })).not.toBeNull();
    expect(screen.queryByRole("option")).toBeNull();
  });

  it("announces downloading state without a fake percentage when progress is unknown", () => {
    render(
      <OpdsPublicationCard
        {...baseCardProps}
        downloadStatus="downloading"
        downloadProgress={null}
      />,
    );

    expect(screen.getByRole("button", { name: "Downloading Dune" })).not.toBeNull();
    expect(screen.getByText("Downloading…")).not.toBeNull();
  });
});

describe("publication format menu roles", () => {
  afterEach(cleanup);

  function MenuHarness({
    onSelectFormat = vi.fn(),
    selectedFormat = null,
  }: {
    onSelectFormat?: (format: MediaType) => void;
    selectedFormat?: MediaType | null;
  }) {
    const [isOpen, setIsOpen] = useState(false);
    return (
      <PublicationFormatMenu
        isOpen={isOpen}
        onOpenChange={setIsOpen}
        formats={["application/epub+zip", "application/pdf"]}
        selectedFormat={selectedFormat}
        onSelectFormat={onSelectFormat}
        disabled={false}
        triggerText="Select Format"
      />
    );
  }

  it("wires the trigger to a listbox with selectable options", () => {
    render(<MenuHarness />);

    const trigger = screen.getByRole("button", { name: "Select download format" });
    expect(trigger.getAttribute("aria-haspopup")).toBe("listbox");
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
    expect(trigger.getAttribute("aria-controls")).toBeNull();

    fireEvent.click(trigger);

    expect(trigger.getAttribute("aria-expanded")).toBe("true");

    const listbox = screen.getByRole("listbox");
    expect(listbox.getAttribute("aria-labelledby")).toBe(trigger.id);
    expect(trigger.getAttribute("aria-controls")).toBe(listbox.id);

    const options = screen.getAllByRole("option");
    expect(options.map((option) => option.textContent)).toEqual(["EPUB", "PDF"]);
    for (const option of options) {
      expect(option.getAttribute("aria-selected")).toBe("false");
    }
  });

  it("navigates options with Arrow keys, Home, and End", () => {
    render(<MenuHarness />);
    fireEvent.click(screen.getByRole("button", { name: "Select download format" }));

    const epub = screen.getByRole("option", { name: "EPUB" });
    const pdf = screen.getByRole("option", { name: "PDF" });

    fireEvent.keyDown(epub, { key: "ArrowDown" });
    expect(document.activeElement).toBe(pdf);

    fireEvent.keyDown(pdf, { key: "End" });
    expect(document.activeElement).toBe(pdf);

    fireEvent.keyDown(pdf, { key: "Home" });
    expect(document.activeElement).toBe(epub);

    fireEvent.keyDown(epub, { key: "ArrowUp" });
    expect(document.activeElement).toBe(pdf);

    fireEvent.keyDown(pdf, { key: "ArrowDown" });
    expect(document.activeElement).toBe(epub);
  });

  it("closes on Escape and restores focus to the trigger", () => {
    render(<MenuHarness />);
    const trigger = screen.getByRole("button", { name: "Select download format" });
    fireEvent.click(trigger);
    expect(screen.getByRole("listbox")).not.toBeNull();

    fireEvent.keyDown(document, { key: "Escape" });

    expect(screen.queryByRole("listbox")).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });

  it("closes on Tab without selecting", () => {
    const onSelectFormat = vi.fn();
    render(<MenuHarness onSelectFormat={onSelectFormat} />);
    fireEvent.click(screen.getByRole("button", { name: "Select download format" }));

    fireEvent.keyDown(screen.getByRole("option", { name: "EPUB" }), { key: "Tab" });

    expect(screen.queryByRole("listbox")).toBeNull();
    expect(onSelectFormat).not.toHaveBeenCalled();
  });

  it("selects an option with keyboard activation and restores focus", () => {
    const onSelectFormat = vi.fn();
    render(<MenuHarness onSelectFormat={onSelectFormat} />);
    const trigger = screen.getByRole("button", { name: "Select download format" });
    fireEvent.click(trigger);

    const epub = screen.getByRole("option", { name: "EPUB" });
    fireEvent.keyDown(epub, { key: "ArrowDown" });
    fireEvent.click(screen.getByRole("option", { name: "PDF" }));

    expect(onSelectFormat).toHaveBeenCalledWith("application/pdf");
    expect(screen.queryByRole("listbox")).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });

  it("reflects the chosen format in aria-selected and the trigger label", () => {
    render(
      <MenuHarness selectedFormat="application/pdf" />,
    );
    const trigger = screen.getByRole("button", {
      name: "Selected format: PDF, change format",
    });
    fireEvent.click(trigger);

    expect(screen.getByRole("option", { name: "PDF" }).getAttribute("aria-selected")).toBe(
      "true",
    );
    expect(screen.getByRole("option", { name: "EPUB" }).getAttribute("aria-selected")).toBe(
      "false",
    );
  });

  it("gives options a visible focus indicator style", () => {
    render(<MenuHarness />);
    fireEvent.click(screen.getByRole("button", { name: "Select download format" }));

    for (const option of screen.getAllByRole("option")) {
      expect(option.className).toContain("focus-visible:ring-2");
      expect(option.className).toContain("focus-visible:ring-primary");
    }
  });
});
