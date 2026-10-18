import { beforeEach, describe, expect, it } from "vitest";
import { useToastStore } from "@/store/toastStore";
import {
  diagnoseOpdsError,
  formatOpdsErrorMessage,
  notifyOpdsError,
} from "@/utils/notifyOpdsError";

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

describe("diagnoseOpdsError", () => {
  it("returns null for null, undefined, or empty errors", () => {
    expect(diagnoseOpdsError(null)).toBeNull();
    expect(diagnoseOpdsError(undefined)).toBeNull();
    expect(diagnoseOpdsError("")).toBeNull();
  });

  it("diagnoses 401 Unauthorized errors", () => {
    const tip = diagnoseOpdsError("HTTP 401 Unauthorized");
    expect(tip).toContain("username and password");
  });

  it("diagnoses 404 Not Found errors", () => {
    const tip = diagnoseOpdsError(new Error("404 Not Found"));
    expect(tip).toContain("Verify the URL endpoint");
  });

  it("diagnoses connection refused errors", () => {
    const tip = diagnoseOpdsError("ECONNREFUSED 127.0.0.1:8080");
    expect(tip).toContain("Confirm your OPDS server is running");
  });

  it("diagnoses timeout errors", () => {
    const tip = diagnoseOpdsError(new Error("request timed out after 30000ms"));
    expect(tip).toContain("Connection timed out");
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
