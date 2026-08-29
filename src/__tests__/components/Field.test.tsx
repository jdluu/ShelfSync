import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Field } from "@/components/ui/Field";

describe("Field primitive", () => {
  afterEach(cleanup);

  it("labels its input through the htmlFor/id association", () => {
    render(<Field id="opds-catalog-url" label="Catalog URL" />);

    const input = screen.getByLabelText("Catalog URL") as HTMLInputElement;
    expect(input.tagName).toBe("INPUT");
    expect(input.id).toBe("opds-catalog-url");
    expect(document.querySelector('label[for="opds-catalog-url"]')).not.toBeNull();
  });

  it("renders a text input by default with the DaisyUI input classes", () => {
    render(<Field id="opds-catalog-url" label="Catalog URL" />);

    const input = screen.getByLabelText("Catalog URL") as HTMLInputElement;
    expect(input.type).toBe("text");
    const className = input.getAttribute("class");
    expect(className).toContain("input");
    expect(className).toContain("input-bordered");
    expect(className).toContain("w-full");
  });

  it("forwards value, onChange, and remaining input attributes", () => {
    const onChange = vi.fn();
    render(
      <Field
        id="opds-catalog-url"
        label="Catalog URL"
        value="https://example.com/opds"
        onChange={onChange}
        placeholder="https://example.com/opds"
        autoComplete="off"
        inputMode="url"
      />,
    );

    const input = screen.getByLabelText("Catalog URL") as HTMLInputElement;
    expect(input.value).toBe("https://example.com/opds");
    expect(input.getAttribute("placeholder")).toBe("https://example.com/opds");
    expect(input.getAttribute("autocomplete")).toBe("off");
    expect(input.getAttribute("inputmode")).toBe("url");

    fireEvent.change(input, { target: { value: "https://other.com" } });
    expect(onChange).toHaveBeenCalled();
  });

  it("omits aria-invalid and aria-describedby when there is no auxiliary text", () => {
    render(<Field id="opds-catalog-url" label="Catalog URL" />);

    const input = screen.getByLabelText("Catalog URL");
    expect(input.hasAttribute("aria-invalid")).toBe(false);
    expect(input.hasAttribute("aria-describedby")).toBe(false);
  });

  it("renders helper text referenced by aria-describedby without marking the field invalid", () => {
    render(
      <Field id="opds-username" label="Username" helper="Optional, used for authentication" />,
    );

    const input = screen.getByLabelText("Username") as HTMLInputElement;
    expect(input.hasAttribute("aria-invalid")).toBe(false);
    expect(input.getAttribute("aria-describedby")).toBe("opds-username-helper");

    const helper = document.getElementById("opds-username-helper");
    expect(helper?.textContent).toContain("Optional, used for authentication");
  });

  it("marks the field invalid and links a stable error id via aria-describedby", () => {
    render(
      <Field
        id="opds-catalog-url"
        label="Catalog URL"
        error="Catalog URL is required."
        errorId="opds-url-error"
      />,
    );

    const input = screen.getByLabelText("Catalog URL") as HTMLInputElement;
    expect(input.getAttribute("aria-invalid")).toBe("true");
    expect(input.getAttribute("aria-describedby")).toBe("opds-url-error");

    const alert = screen.getByRole("alert");
    expect(alert.id).toBe("opds-url-error");
    expect(alert.textContent).toBe("Catalog URL is required.");
  });

  it("lists both helper and error ids in aria-describedby when both are present", () => {
    render(
      <Field
        id="opds-catalog-url"
        label="Catalog URL"
        helper="Must be http or https"
        helperId="opds-catalog-url-help"
        error="Invalid URL"
        errorId="opds-catalog-url-err"
      />,
    );

    const input = screen.getByLabelText("Catalog URL");
    const describedBy = input.getAttribute("aria-describedby")?.split(/\s+/);
    expect(describedBy).toContain("opds-catalog-url-help");
    expect(describedBy).toContain("opds-catalog-url-err");
  });

  it("applies the error styling to the input only when an error is present", () => {
    const { rerender } = render(
      <Field
        id="opds-catalog-url"
        label="Catalog URL"
        error="Required."
        errorId="opds-url-error"
      />,
    );

    expect(screen.getByLabelText("Catalog URL").getAttribute("class")).toContain("input-error");

    rerender(<Field id="opds-catalog-url" label="Catalog URL" />);

    expect(screen.getByLabelText("Catalog URL").getAttribute("class")).not.toContain("input-error");
  });

  it("does not render an error message when there is no error", () => {
    render(<Field id="opds-catalog-url" label="Catalog URL" />);

    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("honors the native className by merging extra input classes through cn", () => {
    render(<Field id="opds-content-root" label="Content root" className="input-sm" />);

    const className = screen.getByLabelText("Content root").getAttribute("class");
    expect(className).toContain("input");
    expect(className).toContain("input-sm");
  });

  it("merges the native className alongside error styling through cn", () => {
    render(
      <Field
        id="opds-catalog-url"
        label="Catalog URL"
        className="input-sm"
        error="Required."
        errorId="opds-url-error"
      />,
    );

    const className = screen.getByLabelText("Catalog URL").getAttribute("class");
    expect(className).toContain("input-error");
    expect(className).toContain("input-sm");
  });

  it("forwards a ref to the underlying native input element", () => {
    const ref = { current: null as HTMLInputElement | null };
    render(<Field id="opds-catalog-url" label="Catalog URL" ref={ref} />);

    expect(ref.current).toBe(screen.getByLabelText("Catalog URL"));
  });

  it("accepts a custom input type for password fields", () => {
    render(<Field id="opds-password" label="Password" type="password" />);

    expect((screen.getByLabelText("Password") as HTMLInputElement).type).toBe("password");
  });
});
