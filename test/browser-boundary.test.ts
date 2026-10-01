import { afterEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Page, Locator, Dialog } from "playwright";
import { PlaywrightSurfaceAdapter } from "../src/surface/playwright-surface-adapter.js";
import { recordHumanActions } from "../src/hitl/browser-recorder.js";
import { FakeSurfaceAdapter } from "../src/surface/fake-surface-adapter.js";
import { artifact } from "./helpers.js";
import type { Target } from "../src/artifact/capability-schema.js";

class Element { innerText = "text"; click = vi.fn(); }
class Input extends Element { value = "input value"; }
class Select extends Element { value = "selected value"; }
class Textarea extends Element { value = "textarea value"; }
class Form extends Element { requestSubmit = vi.fn(); }
function browserMock() {
  vi.stubGlobal("HTMLElement", Element); vi.stubGlobal("HTMLInputElement", Input); vi.stubGlobal("HTMLSelectElement", Select); vi.stubGlobal("HTMLTextAreaElement", Textarea); vi.stubGlobal("HTMLFormElement", Form);
  let element: unknown = new Element();
  let dialog: (dialog: Dialog) => Promise<void>;
  const locator = {
    first: vi.fn((): unknown => locator), count: vi.fn(async () => 1), waitFor: vi.fn(async () => {}),
    fill: vi.fn(async () => {}), selectOption: vi.fn(async () => {}), click: vi.fn(async () => {}),
    innerText: vi.fn(async () => "Ready\n \nTwo"), ariaSnapshot: vi.fn(async () => "button Find member"),
    evaluate: vi.fn(async (fn: (element: unknown) => unknown) => fn(element)),
    evaluateAll: vi.fn(async (fn: (items: unknown[]) => unknown) => fn([{ tagName: "INPUT", childElementCount: 0, getClientRects: () => [1] }, { tagName: "DIV", childElementCount: 2, getClientRects: () => [] }])),
    locator: vi.fn((): unknown => locator),
  };
  const expired = { count: vi.fn(async () => 0) };
  const ctx = { route: vi.fn() };
  const page = {
    evaluate: vi.fn(async (fn: (arg: readonly Target[]) => unknown, arg: readonly Target[]) => fn(arg)),
    setDefaultTimeout: vi.fn(), on: vi.fn((_name: string, callback: typeof dialog) => { dialog = callback; }),
    isClosed: vi.fn(() => false), url: vi.fn(() => "https://demo.invalid/"), title: vi.fn(async () => "Test"),
    locator: vi.fn((selector: string) => selector.includes("data-session-state") ? expired : locator),
    getByRole: vi.fn(() => locator), getByLabel: vi.fn(() => locator), getByText: vi.fn(() => locator),
    goto: vi.fn(async () => {}), waitForTimeout: vi.fn(async () => {}), mouse: { click: vi.fn(async () => {}) }, context: vi.fn(() => ctx),
  };
  return { page: page as unknown as Page, raw: page, locator, expired, ctx, setElement(value: unknown) { element = value; }, fireDialog: () => dialog({ dismiss: vi.fn(async () => {}) } as unknown as Dialog) };
}
const target = (strategies: Target["strategies"] = [{ kind: "selector", selector: "#field" }]): Target => ({ id: "t", description: "Target", strategies, requireUniqueMatch: true });
afterEach(() => vi.unstubAllGlobals());

// Milestone 4, 7, 9, 10 | Assignment §3.3-3.6 | REQ-SRF-001, REQ-EVD-003, REQ-HITL-002
// Unit execution covers the same page callbacks exercised in browser integration tests,
// including unsupported elements and process-boundary failures unreachable through normal UI.
describe("browser boundary failure modes", () => {
  it("classifies sensitive CSS targets atomically and fails closed on unsupported or ambiguous classification", async () => {
    const m = browserMock(), s = new PlaywrightSurfaceAdapter(m.page);
    const document = { title: "Safe title", body: { innerText: "Public diagnostic" }, querySelectorAll: vi.fn((_selector: string): Element[] => []) };
    vi.stubGlobal("document", document); vi.stubGlobal("location", { href: "https://demo.invalid/" });
    expect((await s.observe([target()])).targetValues).toEqual({ t: null });
    for (const element of [new Input(), new Select(), new Textarea(), new Element()]) {
      document.querySelectorAll.mockReturnValue([element]);
      expect((await s.observe([target()])).targetValues).toEqual({ t: "value" in element ? element.value : element.innerText });
    }
    document.querySelectorAll.mockImplementation(selector => selector === "#missing" ? [] : [new Element()]);
    expect((await s.observe([target([{ kind: "selector", selector: "#missing" }, { kind: "selector", selector: "#field" }])])).targetValues).toEqual({ t: "text" });
    document.querySelectorAll.mockReturnValue([new Element(), new Element()]);
    await expect(s.observe([target()])).rejects.toThrow("OBSERVATION_CLASSIFICATION_AMBIGUOUS");
    expect((await s.observe([{ ...target(), requireUniqueMatch: false }])).targetValues).toEqual({ t: "text" });
    await expect(s.observe([target([{ kind: "visual", description: "pixel", x: 1, y: 1 }])])).rejects.toThrow("OBSERVATION_CLASSIFICATION_UNSUPPORTED");
    for (const element of [new Input(), new Select(), new Textarea(), new Element()]) {
      m.setElement(element);
      expect((await s.observe([target([{ kind: "label", text: "Field", exact: true }])])).targetValues).toEqual({ t: "value" in element ? element.value : element.innerText });
    }
    m.raw.isClosed.mockReturnValue(true);
    expect((await s.observe([target()])).targetValues).toEqual({ t: null });
  });
  it("reads actual form values and text, submits forms/buttons, rejects non-HTML submit targets", async () => {
    const m = browserMock(), s = new PlaywrightSurfaceAdapter(m.page); const t = await s.resolve(target());
    for (const element of [new Input(), new Select(), new Textarea(), new Element()]) {
      m.setElement(element); expect((await s.execute({ type: "read", target: t })).observedValue).toBe("value" in element ? element.value : element.innerText);
    }
    const form = new Form(); m.setElement(form); expect((await s.execute({ type: "submit", target: t })).ok).toBe(true); expect(form.requestSubmit).toHaveBeenCalled();
    const button = new Element(); m.setElement(button); await s.execute({ type: "submit", target: t }); expect(button.click).toHaveBeenCalled();
    m.setElement({}); expect((await s.execute({ type: "submit", target: t })).error).toMatchObject({ ambiguousCommit: true, recoverable: false });
  });
  it("persists only structural snapshots and uses unique names", async () => {
    const m = browserMock(), directory = await mkdtemp(join(tmpdir(), "browser-snapshot-"));
    const s = new PlaywrightSurfaceAdapter(m.page, { evidenceDirectory: directory, timeoutMs: 10 });
    const one = await s.captureEvidence("secret=must-not-persist"), two = await s.captureEvidence("other"); expect(one.path).not.toBe(two.path);
    const text = await readFile(one.path!, "utf8"); expect(text).not.toContain("secret"); expect(JSON.parse(text)).toEqual({ structure: [{ tag: "input", children: 0, visible: true }, { tag: "div", children: 2, visible: false }] });
  });
  it("blocks forbidden network requests and permits the exact configured origin", async () => {
    const m = browserMock(), s = new PlaywrightSurfaceAdapter(m.page); await s.guard(artifact().policy);
    const callback = m.ctx.route.mock.calls[0]![1] as (route: unknown) => Promise<void>;
    const abort = vi.fn(), proceed = vi.fn();
    await callback({ request: () => ({ url: () => "https://outside.invalid" }), abort, continue: proceed }); expect(abort).toHaveBeenCalledWith("blockedbyclient"); expect(proceed).not.toHaveBeenCalled();
    await callback({ request: () => ({ url: () => "https://demo.invalid" }), abort, continue: proceed }); expect(proceed).toHaveBeenCalledOnce();
  });
  it("classifies unexpected dialogs and never treats them as successful clicks", async () => {
    const m = browserMock(), s = new PlaywrightSurfaceAdapter(m.page); m.locator.click.mockImplementation(async () => { await m.fireDialog(); });
    expect((await s.execute({ type: "click", target: await s.resolve(target()) })).error?.code).toBe("UNEXPECTED_DIALOG");
  });
  it("drains an in-flight action before granting human control and rejects competing transitions", async () => {
    const m = browserMock(), s = new PlaywrightSurfaceAdapter(m.page); let release!: () => void;
    m.raw.waitForTimeout.mockImplementation(async () => await new Promise<void>(resolve => { release = resolve; }));
    const active = s.execute({ type: "wait", durationMs: 100 }); await vi.waitFor(() => expect(release).toBeDefined());
    expect((await s.execute({ type: "wait", durationMs: 0 })).error?.code).toBe("ACTION_CONFLICT");
    const pausing = s.pause(); expect(await s.getSessionOwner()).toBe("none");
    await expect(s.pause()).rejects.toThrow("CONTROL_TRANSFER_CONFLICT"); release(); await active; await pausing;
    expect(await s.getSessionOwner()).toBe("human"); expect((await s.execute({ type: "wait", durationMs: 0 })).ok).toBe(false);
    await s.resume(); await expect(s.resume()).rejects.toThrow("CONTROL_TRANSFER_CONFLICT");
    m.expired.count.mockResolvedValue(1); await expect(s.pause()).resolves.toBeUndefined();
  });
  it("handles observation failure, unknown roles, escaped attributes and non-Error failures", async () => {
    const m = browserMock(), s = new PlaywrightSurfaceAdapter(m.page);
    m.locator.innerText.mockRejectedValueOnce(new Error("body unavailable")); expect((await s.observe()).visibleText).toEqual([]);
    await s.resolve(target([{ kind: "accessibility", role: "button", exact: true }])); expect(m.raw.getByRole).toHaveBeenCalledWith("button", { exact: true });
    await s.resolve(target([{ kind: "attribute", name: "a:b", value: 'one\\"two' }])); expect(m.raw.locator.mock.calls.some(([selector]) => selector.includes("\\3a "))).toBe(true);
    m.locator.waitFor.mockRejectedValueOnce("raw failure"); await expect(s.resolve(target())).rejects.toThrow("raw failure");
    m.raw.goto.mockRejectedValueOnce("navigation failed"); expect((await s.execute({ type: "navigate", value: "https://demo.invalid" })).error).toMatchObject({ recoverable: true, ambiguousCommit: false });
  });
});

// Milestone 10 | Assignment §3.6 | REQ-HITL-003
describe("human activity recording", () => {
  it("records event kinds and tags only while the human owns the session", async () => {
    const handlers = new Map<string, (event: unknown) => void>(); let binding!: (_source: unknown, kind: string, tag: string, path: number[], key: string | null) => Promise<void>;
    class RecordedElement { tagName = "INPUT"; parentElement: RecordedElement | null = null; children: RecordedElement[] = []; }
    class KeyEvent { constructor(public target: RecordedElement, public key: string) {} }
    vi.stubGlobal("Element", RecordedElement); vi.stubGlobal("KeyboardEvent", KeyEvent);
    vi.stubGlobal("document", { addEventListener: (kind: string, fn: (event: unknown) => void) => handlers.set(kind, fn) });
    const frame = {};
    vi.stubGlobal("window", { __recordHumanAction: (kind: string, tag: string, path: number[], key: string | null) => binding({ frame }, kind, tag, path, key) });
    let navigated!: (frame: unknown) => Promise<void>;
    const page = { on: (_name: string, fn: typeof navigated) => { navigated = fn; }, mainFrame: () => frame, exposeBinding: async (_name: string, fn: typeof binding) => { binding = fn; }, addInitScript: async () => {}, evaluate: async (fn: () => void) => fn() } as unknown as Page;
    const s = new FakeSurfaceAdapter(); const records = await recordHumanActions(page, s, "operator");
    handlers.get("click")!({ target: new RecordedElement() }); await Promise.resolve(); expect(records).toHaveLength(0);
    await s.pause(); handlers.get("change")!({ target: new RecordedElement() }); await Promise.resolve();
    expect(records[0]!.description).toBe("change INPUT"); expect(records[0]!.metadata).toMatchObject({ documentId: 1, controlPath: "0" });
    const parent = new RecordedElement(), child = new RecordedElement(); parent.children = [child]; child.parentElement = parent;
    handlers.get("keydown")!(new KeyEvent(child, "Enter")); await Promise.resolve();
    expect(records.at(-1)!.metadata).toMatchObject({ controlPath: "0.0", key: "Enter" });
    const count = records.length;
    handlers.get("keydown")!(new KeyEvent(child, "PRIVATE_KEY"));
    handlers.get("click")!({ target: null });
    const untrusted = binding as (...args: unknown[]) => Promise<void>;
    for (const [kind, tag, path, key] of [["unknown", "INPUT", [0], null], [42, "INPUT", [0], null], ["click", "INPUT", null, null], ["click", "INPUT", [], null], ["click", "INPUT", Array(101).fill(0), null], ["click", "INPUT", [-1], null], ["keydown", "INPUT", [0], "PRIVATE_KEY"], ["keydown", "INPUT", [0], 5]]) await untrusted({ frame }, kind, tag, path, key);
    expect(records).toHaveLength(count);
    await untrusted({ frame }, "click", "PRIVATE_TAG", [1], null);
    expect(records.at(-1)!.description).toBe("click ELEMENT");
    await untrusted({ frame }, "click", 42, [1], null);
    await navigated(frame); await navigated({});
    expect(records.at(-1)!.metadata!.mainFrame).toBe(false);
    await s.resume(); const before = records.length; await navigated(frame); expect(records).toHaveLength(before);
    expect(JSON.stringify(records)).not.toContain("PRIVATE");

  });
});
