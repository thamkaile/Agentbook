import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  Link,
  MemoryRouter,
  Route,
  Routes,
  useLocation,
} from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { RouteReveal } from "../layouts/RouteReveal";

function RouteTransitionHarness() {
  const location = useLocation();

  return (
    <>
      <nav aria-label="Test navigation">
        <Link to="/one">First page</Link>
        <Link to="/two">Second page</Link>
      </nav>
      <RouteReveal key={location.key}>
        <Routes>
          <Route path="/one" element={<h1>First route</h1>} />
          <Route path="/two" element={<h1>Second route</h1>} />
        </Routes>
      </RouteReveal>
    </>
  );
}

describe("RouteReveal lifecycle", () => {
  beforeEach(() => {
    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      value: vi.fn().mockImplementation((query: string) => ({
        matches: query.includes("prefers-reduced-motion: no-preference"),
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    });
  });

  it("cleans up repeated animated route transitions without a context cycle", async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={["/one"]}>
        <RouteTransitionHarness />
      </MemoryRouter>,
    );

    expect(screen.getByText("First route")).toBeTruthy();
    await user.click(screen.getByRole("link", { name: "Second page" }));
    expect(screen.getByText("Second route")).toBeTruthy();
    await user.click(screen.getByRole("link", { name: "First page" }));
    expect(screen.getByText("First route")).toBeTruthy();
  });
});
