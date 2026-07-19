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

import { AuthStatusNav } from "./AuthStatusNav";

function session(overrides: Record<string, unknown>) {
  return { data: null, isPending: false, error: null, ...overrides };
}

beforeEach(() => {
  useSession.mockReset();
  signOut.mockReset();
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("AuthStatusNav — always-available Sign in", () => {
  it("shows Sign in while the session is pending (never an ellipsis-only state)", () => {
    useSession.mockReturnValue(session({ isPending: true }));
    render(<AuthStatusNav />);
    const link = screen.getByRole("link", { name: "Sign in" });
    expect(link).toBeInTheDocument();
    expect(link).toHaveAttribute("href", "/login");
    // A subtle loading indicator may appear, but it is aria-hidden and never replaces Sign in.
    expect(screen.getByTestId("session-loading")).toHaveAttribute("aria-hidden", "true");
  });

  it("shows Sign in when the session lookup errors, and logs only a safe status", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    useSession.mockReturnValue(
      session({ error: { status: 500, message: "secret@example.com token=abc" } }),
    );
    render(<AuthStatusNav />);
    expect(screen.getByRole("link", { name: "Sign in" })).toBeInTheDocument();
    const logged = warn.mock.calls.map((c) => JSON.stringify(c)).join(" ");
    expect(logged).toContain("500");
    expect(logged).not.toContain("secret@example.com");
    expect(logged).not.toContain("token=abc");
  });

  it("shows Sign in for an anonymous (signed-out) session", () => {
    useSession.mockReturnValue(session({ data: null }));
    render(<AuthStatusNav />);
    expect(screen.getByRole("link", { name: "Sign in" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Sign out" })).not.toBeInTheDocument();
  });

  it("shows a role landing that does not flash before the session is confirmed", () => {
    // An unknown/absent role must not render private links.
    useSession.mockReturnValue(session({ data: { user: { role: undefined } } }));
    render(<AuthStatusNav />);
    expect(screen.getByRole("link", { name: "Sign in" })).toBeInTheDocument();
  });

  it("shows My submissions + Sign out for a seller session", () => {
    useSession.mockReturnValue(session({ data: { user: { role: "seller" } } }));
    render(<AuthStatusNav />);
    expect(screen.getByRole("link", { name: "My submissions" })).toHaveAttribute("href", "/seller");
    expect(screen.getByRole("button", { name: "Sign out" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Sign in" })).not.toBeInTheDocument();
  });

  it("shows Agent queue + Sign out for an agent session", () => {
    useSession.mockReturnValue(session({ data: { user: { role: "agent" } } }));
    render(<AuthStatusNav />);
    expect(screen.getByRole("link", { name: "Agent queue" })).toHaveAttribute("href", "/agent");
    expect(screen.getByRole("button", { name: "Sign out" })).toBeInTheDocument();
  });

  it("shows Admin + Sign out for an admin session", () => {
    useSession.mockReturnValue(session({ data: { user: { role: "admin" } } }));
    render(<AuthStatusNav />);
    expect(screen.getByRole("link", { name: "Admin" })).toHaveAttribute("href", "/admin");
    expect(screen.getByRole("button", { name: "Sign out" })).toBeInTheDocument();
  });

  it("returns to Sign in when the session becomes revoked (null after being set)", () => {
    useSession.mockReturnValue(session({ data: { user: { role: "agent" } } }));
    const { rerender } = render(<AuthStatusNav />);
    expect(screen.getByRole("link", { name: "Agent queue" })).toBeInTheDocument();

    // Revocation → the hook now returns no user.
    useSession.mockReturnValue(session({ data: null }));
    rerender(<AuthStatusNav />);
    expect(screen.getByRole("link", { name: "Sign in" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Agent queue" })).not.toBeInTheDocument();
  });

  it("keeps the Sign in entry point keyboard-focusable", () => {
    useSession.mockReturnValue(session({ isPending: true }));
    render(<AuthStatusNav />);
    const link = screen.getByRole("link", { name: "Sign in" });
    link.focus();
    expect(link).toHaveFocus();
  });
});
