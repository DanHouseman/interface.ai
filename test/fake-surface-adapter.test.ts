import { describe, expect, it } from "vitest";
import { FakeSurfaceAdapter } from "../src/surface/fake-surface-adapter.js";

const target = {
  id: "search",
  description: "Search button",
  strategies: [{ kind: "accessibility" as const, role: "button", name: "Search", exact: true }],
  requireUniqueMatch: true,
};

describe("FakeSurfaceAdapter", () => {
  // REQ-SRF-001 + REQ-RPL-004: core behavior works through a fake surface adapter.
  it("resolves and executes while automation owns an active session", async () => {
    const adapter = new FakeSurfaceAdapter(new Set(["search"]));
    const resolved = await adapter.resolve(target);
    const result = await adapter.execute({ type: "click", target: resolved });

    expect(result.ok).toBe(true);
    expect(adapter.actions).toHaveLength(1);
  });

  // REQ-HITL-001/002: pause preserves the session while human ownership blocks automation.
  it("prevents automation from acting during human ownership", async () => {
    const adapter = new FakeSurfaceAdapter(new Set(["search"]));
    const resolved = await adapter.resolve(target);

    await adapter.pause();
    const result = await adapter.execute({ type: "click", target: resolved });

    expect(result.ok).toBe(false);
    expect(result.error?.code).toBe("SURFACE_NOT_OWNED_BY_AUTOMATION");
    expect(adapter.actions).toHaveLength(0);
  });

  // REQ-HITL-003: explicit handback restores automation ownership before execution resumes.
  it("restores automation ownership on resume", async () => {
    const adapter = new FakeSurfaceAdapter(new Set(["search"]));
    const resolved = await adapter.resolve(target);

    await adapter.pause();
    await adapter.resume();
    const result = await adapter.execute({ type: "click", target: resolved });

    expect(result.ok).toBe(true);
    expect(await adapter.getSessionOwner()).toBe("automation");
  });
});
