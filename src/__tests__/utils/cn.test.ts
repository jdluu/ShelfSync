import { describe, expect, it } from "vitest";
import { cn } from "@/utils/cn";

describe("cn", () => {
  it("joins literal class names", () => {
    expect(cn("btn", "btn-primary")).toBe("btn btn-primary");
  });

  it("skips falsy conditional values", () => {
    expect(cn("btn", false && "btn-error", null, undefined, "", "btn-primary")).toBe(
      "btn btn-primary",
    );
  });

  it("keeps conditionally true values", () => {
    expect(cn("input", true && "input-error")).toBe("input input-error");
  });

  it("flattens nested arrays", () => {
    expect(cn("a", ["b", ["c"]])).toBe("a b c");
  });

  it("resolves Tailwind conflicts so the later class wins", () => {
    expect(cn("px-2 py-1", "px-4")).toBe("py-1 px-4");
    expect(cn("bg-red-500", "bg-blue-500")).toBe("bg-blue-500");
  });

  it("keeps conflicting Tailwind utility groups already present", () => {
    expect(cn("w-full", "input-sm")).toBe("w-full input-sm");
  });
});
