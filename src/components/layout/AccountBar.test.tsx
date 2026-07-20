import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Control the session hook per test.
const useSession = vi.fn();
const signOut = vi.fn();
vi.mock("@/lib/auth-client", () => ({
  authClient: {
    useSession: () => useSession(),
    signOut: () => signOut(),
  },
}));

import { AccountBar } from "./AccountBar";

function session(overrides: Record<string, unknown>) {
  return { data: null, isPending: false, error: null, ...overrides };
}

beforeEach(() => {
  useSession.mockReset();
  signOut.mockReset();
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  delete document.body.dataset.accountBar;
  vi.restoreAllMocks();
});

describe("AccountBar — always-available sticky Sign in", () => {
  it("renders a prominent Sign in link to the relative /login path", () => {
    useSession.mockReturnValue(session({ data: null }));
    render(<AccountBar />);
    const link = screen.getByTestId("account-bar-sign-in");
    expect(link).toHaveAttribute("href", "/login");
    expect(link).toHaveTextContent("Sign in");
  });

  it("keeps Sign in visible while the session is pending (never an ellipsis-only state)", () => {
    useSession.mockReturnValue(session({ isPending: true }));
    render(<AccountBar />);
    expect(screen.getByTestId("account-bar-sign-in")).toHaveAttribute("href", "/login");
    // A subtle loading indicator may appear, but it is aria-hidden and never replaces Sign in.
    expect(screen.getByTestId("account-bar-loading")).toHaveAttribute("aria-hidden", "true");
  });

  it("keeps Sign in visible when the session lookup errors, logging only a safe status", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    useSession.mockReturnValue(
      session({ error: { status: 500, message: "secret@example.com token=abc" } }),
    );
    render(<AccountBar />);
    expect(screen.getByTestId("account-bar-sign-in")).toHaveAttribute("href", "/login");
    const logged = warn.mock.calls.map((c) => JSON.stringify(c)).join(" ");
    expect(logged).toContain("500");
    expect(logged).not.toContain("secret@example.com");
    expect(logged).not.toContain("token=abc");
  });

  it("does not render role links for an unknown/absent role", () => {
    useSession.mockReturnValue(session({ data: { user: { role: undefined } } }));
    render(<AccountBar />);
    expect(screen.getByTestId("account-bar-sign-in")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Sign out" })).not.toBeInTheDocument();
  });

  it("shows My submissions + Sign out for a seller session", () => {
    useSession.mockReturnValue(session({ data: { user: { role: "seller" } } }));
    render(<AccountBar />);
    expect(screen.getByTestId("account-bar-home")).toHaveAttribute("href", "/seller");
    expect(screen.getByTestId("account-bar-home")).toHaveTextContent("My submissions");
    expect(screen.getByRole("button", { name: "Sign out" })).toBeInTheDocument();
    expect(screen.queryByTestId("account-bar-sign-in")).not.toBeInTheDocument();
  });

  it("shows Agent queue for an agent session and Admin portal for an admin session", () => {
    useSession.mockReturnValue(session({ data: { user: { role: "agent" } } }));
    const { rerender } = render(<AccountBar />);
    expect(screen.getByTestId("account-bar-home")).toHaveAttribute("href", "/agent");
    expect(screen.getByTestId("account-bar-home")).toHaveTextContent("Agent queue");

    useSession.mockReturnValue(session({ data: { user: { role: "admin" } } }));
    rerender(<AccountBar />);
    expect(screen.getByTestId("account-bar-home")).toHaveAttribute("href", "/admin");
    expect(screen.getByTestId("account-bar-home")).toHaveTextContent("Admin portal");
  });

  it("returns to Sign in when the session becomes revoked", () => {
    useSession.mockReturnValue(session({ data: { user: { role: "agent" } } }));
    const { rerender } = render(<AccountBar />);
    expect(screen.getByTestId("account-bar-home")).toBeInTheDocument();

    useSession.mockReturnValue(session({ data: null }));
    rerender(<AccountBar />);
    expect(screen.getByTestId("account-bar-sign-in")).toBeInTheDocument();
    expect(screen.queryByTestId("account-bar-home")).not.toBeInTheDocument();
  });

  it("keeps the Sign in entry point keyboard-focusable", () => {
    useSession.mockReturnValue(session({ isPending: true }));
    render(<AccountBar />);
    const link = screen.getByTestId("account-bar-sign-in");
    link.focus();
    expect(link).toHaveFocus();
  });

  it("reserves page space by flagging the document body while mounted", () => {
    useSession.mockReturnValue(session({ data: null }));
    const { unmount } = render(<AccountBar />);
    expect(document.body.dataset.accountBar).toBe("open");
    unmount();
    expect(document.body.dataset.accountBar).toBeUndefined();
  });
});
