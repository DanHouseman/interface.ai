import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { chromium, type Browser, type Page } from "playwright";
import type { Target } from "../src/artifact/capability-schema.js";
import { PlaywrightSurfaceAdapter } from "../src/surface/playwright-surface-adapter.js";

// Plan: Milestone 10 | REQ-SRF-001/002, REQ-RPL-002, REQ-EVD-002
// Integration coverage proves the same SurfaceAdapter contract against a real browser.
describe("PlaywrightSurfaceAdapter", () => {
  let browser: Browser | undefined;
  let page: Page;
  let surface: PlaywrightSurfaceAdapter;

  beforeAll(async () => {
    browser = await chromium.launch({ headless: true });
    page = await browser.newPage();
    surface = new PlaywrightSurfaceAdapter(page, { evidenceDirectory: "evidence/runtime/test-browser" });
  });

  afterAll(async () => {
    await browser?.close();
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
    expect(evidence.kind).toBe("snapshot");
    expect(evidence.path).toContain("browser-evidence-");

    await surface.pause();
    expect(await surface.getSessionOwner()).toBe("human");
    expect(await surface.getSessionState()).toBe("paused");

    await surface.resume();
    expect(await surface.getSessionOwner()).toBe("automation");
    expect(await surface.getSessionState()).toBe("active");
  });

  it("classifies configured permission denial before resolving or executing controls", async () => {
    await page.setContent('<p>Permission denied</p><div id="result"></div><button id="action" onclick="this.textContent=\'executed\'">Act</button>');
    const guarded = new PlaywrightSurfaceAdapter(page, { permissionDeniedSelector: '#result:text-is("Permission denied")' });
    const target: Target = { id: "action", description: "Action", strategies: [{ kind: "selector", selector: "#action" }], requireUniqueMatch: true };
    const resolved = await guarded.resolve(target);
    // Unrelated prose does not trigger the configured application error indicator.
    expect(resolved.targetId).toBe("action");
    await page.locator('#result').evaluate(element => { element.textContent = 'Permission denied'; });
    await expect(guarded.resolve(target)).rejects.toMatchObject({ code: "PERMISSION_DENIED" });
    expect(await guarded.execute({ type: "click", target: resolved })).toMatchObject({ ok: false, error: { code: "PERMISSION_DENIED", recoverable: false } });
    expect(await page.locator('#action').textContent()).toBe('Act');
  });

  it("supports selector, attribute, structural, visual, select, read, wait, submit, and navigation mechanics", async () => {
    await page.setContent(`
      <form id="form" onsubmit="event.preventDefault(); document.querySelector('#submitted').textContent='submitted'">
        <div id="descendant-box">Descendant<input class="descendant-child" /></div>\n        <section id="ancestor-box"><span>Inside</span><input class="ancestor-child" /></section>
        <label>Plan<select id="plan"><option value="a">A</option><option value="b">B</option></select></label>
        <button id="submit" data-purpose="commit" type="submit">Commit</button>
        <div id="submitted"></div><div id="before">Before</div><span>Anchor</span><input id="after" value="read-me" />
      </form>
    `);
    const selector = await surface.resolve({ id:"plan",description:"plan",strategies:[{kind:"selector",selector:"#plan"}],requireUniqueMatch:true });
    expect((await surface.execute({type:"select",target:selector,value:"b"})).ok).toBe(true);
    expect(await page.locator("#plan").inputValue()).toBe("b");

    const attribute = await surface.resolve({ id:"commit",description:"commit",strategies:[{kind:"attribute",name:"data-purpose",value:"commit"}],requireUniqueMatch:true });
    expect((await surface.execute({type:"submit",target:attribute})).ok).toBe(true);
    expect(await page.locator("#submitted").innerText()).toBe("submitted");

    for (const [id, relation, anchorText, controlHint] of [
      ["desc","descendant","Descendant","input"], ["following","following","Anchor",undefined], ["preceding","preceding","Anchor",undefined], ["ancestor","ancestor","Inside","input"]
    ] as const) {
      const resolved = await surface.resolve({ id,description:id,strategies:[{kind:"structural",anchorText,relation,...(controlHint?{controlHint}: {})}],requireUniqueMatch:false });
      expect(resolved.strategy.kind).toBe("structural");
    }

    const readTarget = await surface.resolve({id:"read",description:"read",strategies:[{kind:"selector",selector:"#after"}],requireUniqueMatch:true});
    expect((await surface.execute({type:"read",target:readTarget})).observedValue).toBe("read-me");
    expect((await surface.execute({type:"wait",durationMs:1})).ok).toBe(true);

    const visual = await surface.resolve({id:"xy",description:"xy",strategies:[{kind:"visual",description:"point",x:1,y:1}],requireUniqueMatch:true});
    expect((await surface.execute({type:"click",target:visual})).ok).toBe(true);
    const invalidCoordinateAction = await surface.execute({type:"type",target:visual,value:"x"});
    expect(invalidCoordinateAction.ok).toBe(false);
    expect(invalidCoordinateAction.error?.code).toBe("BROWSER_ACTION_FAILED");

    const custom = await surface.execute({type:"custom",name:"unsupported"});
    expect(custom).toMatchObject({ok:false,error:{code:"CUSTOM_ACTION_UNSUPPORTED",recoverable:false}});

    await surface.execute({type:"navigate",value:"data:text/html,<title>Navigated</title><body>done</body>"});
    expect((await surface.observe()).title).toBe("Navigated");
  });

  it("rejects unresolved, ambiguous, unsupported, and incomplete targets", async () => {
    await page.setContent(`<button>Duplicate</button><button>Duplicate</button>`);
    await expect(surface.resolve({id:"none",description:"none",strategies:[{kind:"selector",selector:"#missing"}],requireUniqueMatch:true})).rejects.toThrow("Timeout");
    await expect(surface.resolve({id:"many",description:"many",strategies:[{kind:"accessibility",role:"button",name:"Duplicate",exact:true}],requireUniqueMatch:true})).rejects.toThrow("expected one match, found 2");
    await expect(surface.resolve({id:"visual",description:"visual",strategies:[{kind:"visual",description:"missing coordinate"}],requireUniqueMatch:true})).rejects.toThrow("requires deterministic x/y");
    await expect(surface.resolve({id:"terminal",description:"terminal",strategies:[{kind:"terminal_field",fieldName:"X"}],requireUniqueMatch:true})).rejects.toThrow("not supported");
  });

  it("reports expired state and guards closed-session operations", async () => {
    const closedPage = await browser!.newPage();
    const closedSurface = new PlaywrightSurfaceAdapter(closedPage, { evidenceDirectory:"evidence/runtime/test-browser" });
    await closedPage.close();
    expect(await closedSurface.getSessionState()).toBe("expired");
    expect((await closedSurface.observe()).signals.session).toBe("expired");
    await closedSurface.pause();
    expect(await closedSurface.getSessionOwner()).toBe("none");
    await expect(closedSurface.resume()).rejects.toThrow("closed browser session");
    await expect(closedSurface.captureEvidence("closed")).rejects.toThrow("page has closed");
    const action = await closedSurface.execute({type:"wait",durationMs:0});
    expect(action.error?.code).toBe("SURFACE_NOT_OWNED_BY_AUTOMATION");
  });

});
