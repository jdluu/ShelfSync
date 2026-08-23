import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type React from "react";
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { OpdsCatalogScreen } from "@/features/opds";
import type { OpdsConnectPayload } from "@/features/opds/OpdsCatalogScreen";
import { isValidOpdsCatalogUrl } from "@/features/opds/OpdsCatalogScreen";
import type { Catalog } from "@/types/opds";

const capturedViewProps = vi.hoisted(() => ({ current: null as Record<string, unknown> | null }));

vi.mock("@/features/opds/OpdsCatalogView", async () => {
  const React = await import("react");
  return {
    OpdsCatalogView: (props: Record<string, unknown>) => {
      capturedViewProps.current = props;
      return React.createElement("div", { "data-testid": "opds-catalog-view-mock" });
    },
  };
});

const createMockCatalog = (overrides?: Partial<Catalog>): Catalog => ({
  title: "Test OPDS Catalog",
  authors: ["Test Author"],
  links: [],
  publications: [],
  ...overrides,
});

afterEach(() => {
  cleanup();
  capturedViewProps.current = null;
});

describe("OpdsCatalogScreen connect form", () => {
  it("renders url, username, and password fields with a Connect button", () => {
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
        contentRoot="/downloads"
        onContentRootChange={vi.fn()}
      />,
    );

    expect(screen.getByLabelText("Catalog URL")).not.toBeNull();
    expect(screen.getByLabelText("Username (optional)")).not.toBeNull();

    const passwordInput = screen.getByLabelText("Password (optional)") as HTMLInputElement;
    expect(passwordInput.type).toBe("password");

    const connectButton = screen.getByRole("button", { name: "Connect" });
    expect(connectButton.hasAttribute("disabled")).toBe(false);
    expect(screen.queryByRole("button", { name: "Disconnect" })).toBeNull();
  });

  it("rejects an empty catalog URL without calling onConnect", () => {
    const onConnect = vi.fn();
    render(
      <OpdsCatalogScreen
        url="   "
        onUrlChange={vi.fn()}
        username=""
        onUsernameChange={vi.fn()}
        password=""
        onPasswordChange={vi.fn()}
        connected={false}
        onConnect={onConnect}
        onDisconnect={vi.fn()}
        loading={false}
        error={null}
        page={1}
        onPageChange={vi.fn()}
        contentRoot="/downloads"
        onContentRootChange={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Connect" }));

    expect(screen.getByRole("alert").textContent).toContain("required");
    expect(onConnect).not.toHaveBeenCalled();
  });

  it("rejects a non-http(s) catalog URL without calling onConnect", () => {
    const onConnect = vi.fn();
    render(
      <OpdsCatalogScreen
        url="ftp://example.com/opds"
        onUrlChange={vi.fn()}
        username=""
        onUsernameChange={vi.fn()}
        password=""
        onPasswordChange={vi.fn()}
        connected={false}
        onConnect={onConnect}
        onDisconnect={vi.fn()}
        loading={false}
        error={null}
        page={1}
        onPageChange={vi.fn()}
        contentRoot="/downloads"
        onContentRootChange={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Connect" }));

    expect(screen.getByRole("alert").textContent).toContain("http:// or https://");
    expect(onConnect).not.toHaveBeenCalled();
    expect(isValidOpdsCatalogUrl("javascript:alert(1)")).toBe(false);
  });

  it("clears the validation error when the URL is edited", () => {
    const onUrlChange = vi.fn();
    render(
      <OpdsCatalogScreen
        url="not-a-url"
        onUrlChange={onUrlChange}
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
        contentRoot="/downloads"
        onContentRootChange={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Connect" }));
    expect(screen.getByRole("alert")).not.toBeNull();

    fireEvent.change(screen.getByLabelText("Catalog URL"), {
      target: { value: "https://example.com/opds" },
    });

    expect(onUrlChange).toHaveBeenCalledWith("https://example.com/opds");
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("calls onConnect with trimmed values", () => {
    const onConnect = vi.fn();
    render(
      <OpdsCatalogScreen
        url="   https://example.com/opds   "
        onUrlChange={vi.fn()}
        username="  alice  "
        onUsernameChange={vi.fn()}
        password="  secret  "
        onPasswordChange={vi.fn()}
        connected={false}
        onConnect={onConnect}
        onDisconnect={vi.fn()}
        loading={false}
        error={null}
        page={1}
        onPageChange={vi.fn()}
        contentRoot="/downloads"
        onContentRootChange={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Connect" }));

    expect(onConnect).toHaveBeenCalledTimes(1);
    const payload = (onConnect.mock.calls[0]?.[0] ?? null) as OpdsConnectPayload | null;
    expect(payload).not.toBeNull();
    expect(payload?.url).toBe("https://example.com/opds");
    expect(payload?.username).toBe("alice");
    expect(payload?.password).toBe("  secret  ");
  });
});

interface HarnessState {
  url: string;
  username: string;
  password: string;
  contentRoot: string;
  connected: boolean;
}

function Harness({ initial, catalog }: { initial?: Partial<HarnessState>; catalog?: Catalog }) {
  const [url, setUrl] = useState(initial?.url ?? "");
  const [username, setUsername] = useState(initial?.username ?? "");
  const [password, setPassword] = useState(initial?.password ?? "");
  const [contentRoot, setContentRoot] = useState(initial?.contentRoot ?? "/downloads/opds");
  const [connected, setConnected] = useState(initial?.connected ?? false);
  const [lastPayload, setLastPayload] = useState<OpdsConnectPayload | null>(null);

  return (
    <div>
      <div data-testid="last-payload">{lastPayload ? JSON.stringify(lastPayload) : ""}</div>
      <OpdsCatalogScreen
        url={url}
        onUrlChange={setUrl}
        username={username}
        onUsernameChange={setUsername}
        password={password}
        onPasswordChange={setPassword}
        connected={connected}
        onConnect={(payload) => {
          setLastPayload(payload);
          setConnected(true);
        }}
        onDisconnect={() => setConnected(false)}
        catalog={catalog}
        loading={false}
        error={null}
        page={1}
        onPageChange={vi.fn()}
        contentRoot={contentRoot}
        onContentRootChange={setContentRoot}
      />
    </div>
  );
}

describe("OpdsCatalogScreen connection lifecycle", () => {
  it("hides the catalog view until connected and shows it after", () => {
    const { rerender } = render(
      <OpdsCatalogScreen
        url="https://example.com/opds"
        onUrlChange={vi.fn()}
        username="alice"
        onUsernameChange={vi.fn()}
        password="secret"
        onPasswordChange={vi.fn()}
        connected={false}
        onConnect={vi.fn()}
        onDisconnect={vi.fn()}
        catalog={createMockCatalog()}
        loading={false}
        error={null}
        page={1}
        onPageChange={vi.fn()}
        contentRoot="/downloads/opds"
        onContentRootChange={vi.fn()}
      />,
    );

    expect(screen.queryByTestId("opds-catalog-view-mock")).toBeNull();
    expect(capturedViewProps.current).toBeNull();

    rerender(
      <OpdsCatalogScreen
        url="https://example.com/opds"
        onUrlChange={vi.fn()}
        username="alice"
        onUsernameChange={vi.fn()}
        password="secret"
        onPasswordChange={vi.fn()}
        connected={true}
        onConnect={vi.fn()}
        onDisconnect={vi.fn()}
        catalog={createMockCatalog()}
        loading={false}
        error={null}
        page={1}
        onPageChange={vi.fn()}
        contentRoot="/downloads/opds"
        onContentRootChange={vi.fn()}
      />,
    );

    expect(screen.getByTestId("opds-catalog-view-mock")).not.toBeNull();
    expect(screen.getByRole("button", { name: "Disconnect" })).not.toBeNull();
    expect(screen.queryByLabelText("Catalog URL")).toBeNull();
  });

  it("passes transient credentials into downloadConfig only while connected", () => {
    const base = (connected: boolean): React.ReactElement => (
      <OpdsCatalogScreen
        url="https://example.com/opds"
        onUrlChange={vi.fn()}
        username="alice"
        onUsernameChange={vi.fn()}
        password="secret"
        onPasswordChange={vi.fn()}
        connected={connected}
        onConnect={vi.fn()}
        onDisconnect={vi.fn()}
        catalog={createMockCatalog()}
        loading={false}
        error={null}
        page={1}
        onPageChange={vi.fn()}
        contentRoot="/downloads/opds"
        onContentRootChange={vi.fn()}
        downloadStatuses={{ "pub-1": "downloading" }}
        downloadErrors={{ "pub-1": null }}
        downloadLocalPaths={{ "pub-1": null }}
      />
    );

    const { rerender } = render(base(false));

    expect(capturedViewProps.current).toBeNull();

    rerender(base(true));

    expect(capturedViewProps.current).not.toBeNull();
    const downloadConfig = capturedViewProps.current?.downloadConfig as Record<string, unknown>;
    expect(downloadConfig.catalogUrl).toBe("https://example.com/opds");
    expect(downloadConfig.transientUsername).toBe("alice");
    expect(downloadConfig.transientPassword).toBe("secret");
    expect(downloadConfig.contentRoot).toBe("/downloads/opds");
    expect(capturedViewProps.current?.downloadStatuses).toEqual({ "pub-1": "downloading" });

    capturedViewProps.current = null;
    rerender(base(false));

    expect(screen.queryByTestId("opds-catalog-view-mock")).toBeNull();
    expect(capturedViewProps.current).toBeNull();
  });

  it("forwards per-publication download progress to the catalog view", () => {
    const base = (): React.ReactElement => (
      <OpdsCatalogScreen
        url="https://example.com/opds"
        onUrlChange={vi.fn()}
        username="alice"
        onUsernameChange={vi.fn()}
        password="secret"
        onPasswordChange={vi.fn()}
        connected={true}
        onConnect={vi.fn()}
        onDisconnect={vi.fn()}
        catalog={createMockCatalog()}
        loading={false}
        error={null}
        page={1}
        onPageChange={vi.fn()}
        contentRoot="/downloads/opds"
        onContentRootChange={vi.fn()}
        downloadStatuses={{ "pub-1": "downloading" }}
        downloadProgress={{ "pub-1": 63 }}
      />
    );

    render(base());

    expect(capturedViewProps.current).not.toBeNull();
    expect(capturedViewProps.current?.downloadProgress).toEqual({ "pub-1": 63 });
  });

  it("clears visible credential values after disconnect", () => {
    render(
      <Harness
        initial={{ url: "https://example.com/opds", username: "alice", password: "secret" }}
      />,
    );

    const urlInput = screen.getByLabelText("Catalog URL") as HTMLInputElement;
    const usernameInput = screen.getByLabelText("Username (optional)") as HTMLInputElement;
    const passwordInput = screen.getByLabelText("Password (optional)") as HTMLInputElement;
    expect(usernameInput.value).toBe("alice");
    expect(passwordInput.value).toBe("secret");

    fireEvent.click(screen.getByRole("button", { name: "Connect" }));
    expect(screen.queryByLabelText("Password (optional)")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Disconnect" }));

    const usernameAfter = screen.getByLabelText("Username (optional)") as HTMLInputElement;
    const passwordAfter = screen.getByLabelText("Password (optional)") as HTMLInputElement;
    expect(usernameAfter.value).toBe("");
    expect(passwordAfter.value).toBe("");
    expect(urlInput.value).toBe("https://example.com/opds");
  });
});

describe("OpdsCatalogScreen content root input", () => {
  interface ContentRootHarnessProps {
    contentRoot?: string;
    onContentRootChange: (value: string) => void;
  }

  function renderConnectedScreen({
    contentRoot = "/downloads/opds",
    onContentRootChange,
  }: ContentRootHarnessProps) {
    return render(
      <OpdsCatalogScreen
        url="https://example.com/opds"
        onUrlChange={vi.fn()}
        username=""
        onUsernameChange={vi.fn()}
        password=""
        onPasswordChange={vi.fn()}
        connected={true}
        onConnect={vi.fn()}
        onDisconnect={vi.fn()}
        loading={false}
        error={null}
        page={1}
        onPageChange={vi.fn()}
        contentRoot={contentRoot}
        onContentRootChange={onContentRootChange}
      />,
    );
  }

  it("moves the content root input into a collapsed Advanced options disclosure", () => {
    renderConnectedScreen({ onContentRootChange: vi.fn() });

    const summary = screen.getByText("Advanced options");
    const details = summary.closest("details");
    expect(details).not.toBeNull();
    expect(details?.open).toBe(false);

    const contentRootInput = screen.getByLabelText("Content root") as HTMLInputElement;
    expect(details?.contains(contentRootInput)).toBe(true);
  });

  it("expands the Advanced options disclosure when the summary is clicked", () => {
    renderConnectedScreen({ onContentRootChange: vi.fn() });

    const details = screen.getByText("Advanced options").closest("details");
    expect(details?.open).toBe(false);

    fireEvent.click(screen.getByText("Advanced options"));
    expect(details?.open).toBe(true);
  });

  it("updates the content root through its change handler", () => {
    const onContentRootChange = vi.fn();
    const { rerender } = renderConnectedScreen({ onContentRootChange });

    const contentRootInput = screen.getByLabelText("Content root") as HTMLInputElement;
    expect(contentRootInput.value).toBe("/downloads/opds");

    fireEvent.change(contentRootInput, { target: { value: "/library/books" } });

    expect(onContentRootChange).toHaveBeenCalledWith("/library/books");

    rerender(
      <OpdsCatalogScreen
        url="https://example.com/opds"
        onUrlChange={vi.fn()}
        username=""
        onUsernameChange={vi.fn()}
        password=""
        onPasswordChange={vi.fn()}
        connected={true}
        onConnect={vi.fn()}
        onDisconnect={vi.fn()}
        loading={false}
        error={null}
        page={1}
        onPageChange={vi.fn()}
        contentRoot="/library/books"
        onContentRootChange={onContentRootChange}
      />,
    );
    expect((screen.getByLabelText("Content root") as HTMLInputElement).value).toBe(
      "/library/books",
    );
  });
});

describe("OpdsCatalogScreen credential persistence", () => {
  let setItemSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    localStorage.clear();
    setItemSpy = vi.spyOn(Storage.prototype, "setItem");
  });

  afterEach(() => {
    setItemSpy.mockRestore();
  });

  it("never writes credential values to localStorage across the full flow", () => {
    render(<Harness initial={{ url: "https://example.com/opds" }} />);

    fireEvent.change(screen.getByLabelText("Catalog URL"), {
      target: { value: "https://example.com/opds" },
    });
    fireEvent.change(screen.getByLabelText("Username (optional)"), {
      target: { value: "alice" },
    });
    fireEvent.change(screen.getByLabelText("Password (optional)"), {
      target: { value: "super-secret-password" },
    });

    fireEvent.click(screen.getByRole("button", { name: "Connect" }));
    fireEvent.click(screen.getByRole("button", { name: "Disconnect" }));

    expect(setItemSpy).not.toHaveBeenCalledWith(
      expect.anything(),
      expect.stringContaining("alice"),
    );
    expect(setItemSpy).not.toHaveBeenCalledWith(
      expect.anything(),
      expect.stringContaining("super-secret-password"),
    );
    expect(localStorage.length).toBe(0);
  });
});
