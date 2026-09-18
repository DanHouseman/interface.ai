import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { chromium, type Browser, type Page } from "playwright";
import type { Target } from "../src/artifact/capability-schema.js";
import { PlaywrightSurfaceAdapter } from "../src/surface/playwright-surface-adapter.js";

// Plan: Milestone 10 | REQ-SRF-001/002, REQ-RPL-002, REQ-EVD-002
// Integration coverage proves the same SurfaceAdapter contract against a real browser.
describe("PlaywrightSurfaceAdapter", () => {
  let browser: Browser;
  let page: Page;
  let surface: PlaywrightSurfaceAdapter;

  beforeAll(async () => {
    browser = await chromium.launch({ headless: true });
    page = await browser.newPage();
    surface = new PlaywrightSurfaceAdapter(page, { evidenceDirectory: "evidence/test-browser" });
  });

  afterAll(async () => {
    await browser.close();
  });

  it("observes and acts on a live browser surface", async () => {
    await page.setContent(`
      <html><head><title>Member Search</title></head><body>
        <label for="member">Member ID</label>
        <input id="member" />
        <button type="button" onclick="document.querySelector('#result').textContent='Member 42'">Search</button>
        <div id="result"></div>
      </body></html>
    `);

    const memberTarget: Target = {
      id: "member-id",
      description: "Member ID input",
      strategies: [
        { kind: "label", text: "Missing Label", exact: true },
        { kind: "label", text: "Member ID", exact: true },
      ],
      requireUniqueMatch: true,
    };
    const searchTarget: Target = {
      id: "search",
      description: "Search button",
      strategies: [{ kind: "accessibility", role: "button", name: "Search", exact: true }],
      requireUniqueMatch: true,
    };

    const member = await surface.resolve(memberTarget);
    expect(member.strategy.kind).toBe("label");
    if (member.strategy.kind === "label") expect(member.strategy.text).toBe("Member ID");
    expect((await surface.execute({ type: "type", target: member, value: "42" })).ok).toBe(true);

    const search = await surface.resolve(searchTarget);
    expect((await surface.execute({ type: "click", target: search })).ok).toBe(true);

    const observation = await surface.observe();
    expect(observation.title).toBe("Member Search");
    expect(observation.visibleText).toContain("Member 42");
  });

  it("captures browser evidence and preserves same-session ownership state", async () => {
    const evidence = await surface.captureEvidence("milestone-10-checkpoint");
    expect(evidence.kind).toBe("screenshot");
    expect(evidence.path).toContain("browser-evidence-");

    await surface.pause();
    expect(await surface.getSessionOwner()).toBe("human");
    expect(await surface.getSessionState()).toBe("paused");

    await surface.resume();
    expect(await surface.getSessionOwner()).toBe("automation");
    expect(await surface.getSessionState()).toBe("active");
  });
});
