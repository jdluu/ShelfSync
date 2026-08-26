import { beforeEach, describe, expect, it } from "vitest";
import { useToastStore } from "@/store/toastStore";
import { formatOpdsErrorMessage, notifyOpdsError } from "@/utils/notifyOpdsError";

const toastMessages = () => useToastStore.getState().toasts.map((t) => t.message);

beforeEach(() => {
  useToastStore.setState({ toasts: [] });
});

describe("formatOpdsErrorMessage", () => {
  it("uses the message of Error instances", () => {
    expect(formatOpdsErrorMessage(new Error("Connection refused"))).toBe("Connection refused");
  });

  it("falls back when the error carries no usable message", () => {
    expect(formatOpdsErrorMessage(new Error(""))).toBe("Unknown error");
    expect(formatOpdsErrorMessage(null)).toBe("Unknown error");
    expect(formatOpdsErrorMessage(undefined)).toBe("Unknown error");
    expect(formatOpdsErrorMessage(42, "Custom fallback")).toBe("Custom fallback");
  });
});

describe("notifyOpdsError", () => {
  it("shows the shaped error message as an error toast", () => {
    notifyOpdsError(new Error("Catalog unreachable"));
    const toasts = useToastStore.getState().toasts;
    expect(toasts).toHaveLength(1);
    expect(toasts[0]?.message).toBe("Catalog unreachable");
    expect(toasts[0]?.type).toBe("error");
  });

  it("prefixes the context and honors the fallback", () => {
    notifyOpdsError(new Error("denied"), { context: "Catalog refresh" });
    expect(toastMessages()).toEqual(["Catalog refresh: denied"]);

    notifyOpdsError("just a string", { context: "Offline sync", fallback: "failed" });
    expect(toastMessages()).toEqual(["Catalog refresh: denied", "Offline sync: failed"]);
  });

  it("works without options", () => {
    notifyOpdsError(new Error("boom"));
    expect(toastMessages()).toEqual(["boom"]);
  });
});
