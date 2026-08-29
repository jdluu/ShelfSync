import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Button } from "@/components/ui/Button";

describe("Button primitive", () => {
  afterEach(cleanup);
  it("renders a native button named by its children", () => {
    render(<Button>Connect</Button>);

    const button = screen.getByRole("button", { name: "Connect" });
    expect(button.tagName).toBe("BUTTON");
  });

  it("defaults to type button so it never submits a form implicitly", () => {
    render(<Button>Save catalog</Button>);

    expect(screen.getByRole("button", { name: "Save catalog" }).getAttribute("type")).toBe(
      "button",
    );
  });

  it("forwards native type attributes such as submit", () => {
    render(<Button type="submit">Connect</Button>);

    expect(screen.getByRole("button", { name: "Connect" }).getAttribute("type")).toBe("submit");
  });

  it.each([
    ["primary", ["btn-primary"]],
    ["outline", ["btn-outline"]],
    ["ghost", ["btn-ghost"]],
    ["danger", ["btn-outline", "btn-error"]],
  ] as const)("maps the %s variant to its DaisyUI classes", (variant, expected) => {
    render(<Button variant={variant}>Action</Button>);

    const className = screen.getByRole("button", { name: "Action" }).getAttribute("class");
    expect(className).toContain("btn");
    for (const token of expected) {
      expect(className).toContain(token);
    }
  });

  it("defaults to the outline variant", () => {
    render(<Button>Action</Button>);

    expect(screen.getByRole("button", { name: "Action" }).getAttribute("class")).toContain(
      "btn-outline",
    );
  });

  it("applies the sm size classes and omits them at the default size", () => {
    const { rerender } = render(<Button size="sm">Small</Button>);
    expect(screen.getByRole("button", { name: "Small" }).getAttribute("class")).toContain("btn-sm");

    rerender(<Button>Default</Button>);
    expect(screen.getByRole("button", { name: "Default" }).getAttribute("class")).not.toContain(
      "btn-sm",
    );
  });

  it("forwards the disabled attribute and suppresses click handlers", () => {
    const onClick = vi.fn();
    render(
      <Button disabled onClick={onClick}>
        Blocked
      </Button>,
    );

    const button = screen.getByRole("button", { name: "Blocked" });
    expect(button.hasAttribute("disabled")).toBe(true);

    fireEvent.click(button);
    expect(onClick).not.toHaveBeenCalled();
  });

  it("invokes click handlers on activation", () => {
    const onClick = vi.fn();
    render(<Button onClick={onClick}>Connect</Button>);

    fireEvent.click(screen.getByRole("button", { name: "Connect" }));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("preserves accessible naming from an aria-label", () => {
    render(<Button aria-label="Refresh catalog metadata">Refresh</Button>);

    expect(screen.getByRole("button", { name: "Refresh catalog metadata" })).not.toBeNull();
  });

  it("merges extra className tokens so surface-specific classes survive", () => {
    render(
      <Button variant="ghost" size="sm" className="gap-1.5">
        Save catalog
      </Button>,
    );

    const className = screen.getByRole("button", { name: "Save catalog" }).getAttribute("class");
    expect(className).toContain("btn-ghost");
    expect(className).toContain("btn-sm");
    expect(className).toContain("gap-1.5");
  });

  it("spreads remaining native attributes onto the button element", () => {
    render(
      <Button id="opds-submit" data-testid="connect-btn" aria-expanded="true">
        Connect
      </Button>,
    );

    const button = screen.getByTestId("connect-btn");
    expect(button.getAttribute("id")).toBe("opds-submit");
    expect(button.getAttribute("aria-expanded")).toBe("true");
  });

  it("forwards a ref to the underlying native button element", () => {
    const ref = { current: null as HTMLButtonElement | null };
    render(<Button ref={ref}>Ref me</Button>);

    expect(ref.current).toBe(screen.getByRole("button", { name: "Ref me" }));
  });

  it("renders the plain variant with no DaisyUI classes so callers own all styling", () => {
    const { rerender } = render(
      <Button variant="plain" className="w-full px-3 py-2 text-left text-sm">
        Option
      </Button>,
    );

    const className = screen.getByRole("button", { name: "Option" }).getAttribute("class") ?? "";
    expect(className).not.toContain("btn");
    expect(className).toContain("w-full");
    expect(className).toContain("px-3");
    expect(className).toContain("py-2");
    expect(className).toContain("text-left");
    expect(className).toContain("text-sm");

    rerender(
      <Button variant="plain" size="sm">
        Nested
      </Button>,
    );
    const nested = screen.getByRole("button", { name: "Nested" });
    expect(nested.getAttribute("class")).not.toContain("btn");
    expect(nested.getAttribute("class")).not.toContain("btn-sm");
  });

  it("spreads role and aria attributes onto plain variant buttons", () => {
    render(
      <Button variant="plain" role="option" aria-selected="true">
        EPUB
      </Button>,
    );

    const option = screen.getByRole("option", { name: "EPUB" });
    expect(option.getAttribute("role")).toBe("option");
    expect(option.getAttribute("aria-selected")).toBe("true");
  });
});
