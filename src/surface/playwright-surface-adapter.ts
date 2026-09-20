import { mkdir, writeFile } from "node:fs/promises";
import { resolve as resolvePath } from "node:path";
import { randomUUID } from "node:crypto";
import type { Locator, Page } from "playwright";
import { evaluateLocation, type Authority } from "../policy/policy-evaluator.js";
import type { JsonValue } from "../domain/contracts.js";
import type { Target, TargetStrategy } from "../artifact/capability-schema.js";
import type {
  ActionResult,
  EvidenceReference,
  Observation,
  ResolvedTarget,
  SessionOwner,
  SessionState,
  SurfaceAction,
  SurfaceAdapter,
} from "./surface-adapter.js";

type BrowserHandle =
  | { readonly kind: "locator"; readonly locator: Locator }
  | { readonly kind: "coordinate"; readonly x: number; readonly y: number };

export interface PlaywrightSurfaceAdapterOptions {
  readonly evidenceDirectory?: string;
  readonly timeoutMs?: number;
}

// Plan: Milestone 10 | REQ-SRF-001/002, REQ-RPL-002/004, REQ-EVD-002
// Browser mechanics live behind SurfaceAdapter. Replay remains independent of Playwright.
export class PlaywrightSurfaceAdapter implements SurfaceAdapter {
  private state: SessionState = "active";
  private owner: SessionOwner = "automation";
  private evidenceSequence = 0;
  private readonly evidenceDirectory: string;
  private readonly sessionId = randomUUID();
  private activeAction: Promise<ActionResult> | undefined;
  private dialogSeen = false;
  private readonly timeoutMs: number;

  public constructor(
    private readonly page: Page,
    options: PlaywrightSurfaceAdapterOptions = {},
  ) {
    this.evidenceDirectory = resolvePath(options.evidenceDirectory ?? "evidence/runtime/browser");
    this.timeoutMs = options.timeoutMs ?? 1000;
    this.page.setDefaultTimeout(this.timeoutMs);
    this.page.on("dialog", async (dialog) => { this.dialogSeen = true; await dialog.dismiss(); });
  }

  // Milestone 7 | Assignment §3.4 | REQ-POL-000
  // Install before first navigation: navigation, subresources, popups and redirects share
  // the context guard. Service workers are blocked by the caller's browser context.
  public async guard(policy: Authority): Promise<void> {
    await this.page.context().route("**/*", async (route) => {
      if (evaluateLocation(route.request().url(), policy)) await route.abort("blockedbyclient");
      else await route.continue();
    });
  }

  public async observe(): Promise<Observation> {
    if (this.page.isClosed()) {
      this.state = "expired";
      return {
        surfaceKind: "browser",
        timestamp: new Date().toISOString(),
        signals: { session: "expired" },
      };
    }

    const visibleText = (await this.page.locator("body").innerText().catch(() => ""))
      .split(/\r?\n/)
      .map((value) => value.trim())
      .filter((value) => value.length > 0);

    return {
      surfaceKind: "browser",
      timestamp: new Date().toISOString(),
      location: this.page.url(),
      title: await this.page.title(),
      visibleText,
      signals: {
        session: this.state,
        owner: this.owner,
        sessionId: this.sessionId,
        controls: await this.page.locator("body").ariaSnapshot(),
      },
    };
  }

  // Ordered fallback is deterministic. No model participates in target resolution.
  public async resolve(target: Target): Promise<ResolvedTarget> {
    const failures: string[] = [];

    for (const strategy of target.strategies) {
      try {
        const handle = await this.resolveStrategy(strategy, target.requireUniqueMatch);
        return { targetId: target.id, strategy, opaqueHandle: handle };
      } catch (error) {
        failures.push(`${strategy.kind}: ${errorMessage(error)}`);
      }
    }

    throw new Error(`Target '${target.id}' could not be resolved. ${failures.join(" | ")}`);
  }

  // Milestone 10 | Assignment §3.6 | REQ-HITL-001/002
  // Claim the action slot synchronously before the first await. Pause closes admission,
  // drains that slot, then transfers control; no in-flight click overlaps human control.
  public async execute(action: SurfaceAction): Promise<ActionResult> {
    if (this.activeAction) return failure("ACTION_CONFLICT", "Another action is active.", false);
    const pending = this.perform(action);
    this.activeAction = pending;
    try { return await pending; } finally { this.activeAction = undefined; }
  }

  private async perform(action: SurfaceAction): Promise<ActionResult> {
    if (this.owner !== "automation" || (await this.getSessionState()) !== "active") {
      return failure(
        "SURFACE_NOT_OWNED_BY_AUTOMATION",
        "Automation does not currently own an active browser session.",
        false,
      );
    }

    this.dialogSeen = false;
    try {
      switch (action.type) {
        case "click":
          await this.clickHandle(asBrowserHandle(action.target));
          return this.dialogSeen ? failure("UNEXPECTED_DIALOG", "Unexpected dialog was dismissed; verify state before continuing.", false) : { ok: true };
        case "type": {
          const locator = asLocator(action.target);
          await locator.fill(action.value);
          return { ok: true };
        }
        case "select": {
          const locator = asLocator(action.target);
          await locator.selectOption(action.value);
          return { ok: true };
        }
        case "navigate":
          await this.page.goto(action.value, { waitUntil: "domcontentloaded" });
          return { ok: true };
        case "read": {
          const locator = asLocator(action.target);
          const value = await locator.evaluate((element) => element instanceof HTMLInputElement || element instanceof HTMLSelectElement || element instanceof HTMLTextAreaElement ? element.value : (element as HTMLElement).innerText);
          return { ok: true, observedValue: value };
        }
        case "wait":
          await this.page.waitForTimeout(action.durationMs);
          return { ok: true };
        case "submit": {
          const locator = asLocator(action.target);
          await locator.evaluate((element) => {
            if (element instanceof HTMLFormElement) element.requestSubmit();
            else if (element instanceof HTMLElement) element.click();
            else throw new Error("Resolved submit target is not an HTML element.");
          });
          return { ok: true };
        }
        case "custom":
          return failure("CUSTOM_ACTION_UNSUPPORTED", `Browser adapter does not implement custom action '${action.name}'.`, false);
      }
    } catch (error) {
      const ambiguous = ["click", "submit", "type", "select"].includes(action.type);
      return { ok: false, error: { code: "BROWSER_ACTION_FAILED", message: errorMessage(error), recoverable: !ambiguous, ambiguousCommit: ambiguous } };
    }
  }

  public async captureEvidence(reason: string): Promise<EvidenceReference> {
    if (this.page.isClosed()) throw new Error("Cannot capture browser evidence after the page has closed.");

    await mkdir(this.evidenceDirectory, { recursive: true });
    // Milestone 9 | Assignment §3.4-3.5 | REQ-EVD-002/003
    // Persist a structural DOM snapshot instead of raw pixels or text. Text, values,
    // attributes, URLs and credentials cannot leak through this richer evidence path.
    const id = `browser-evidence-${this.sessionId}-${this.evidenceSequence++}`;
    const path = resolvePath(this.evidenceDirectory, `${id}.json`);
    const structure = await this.page.locator("body *").evaluateAll((elements) => elements.map((element) => ({
      tag: element.tagName.toLowerCase(),
      children: element.childElementCount,
      visible: element.getClientRects().length > 0,
    })));
    await writeFile(path, JSON.stringify({ structure }, null, 2), { flag: "wx" });
    return { id, kind: "snapshot", path, metadata: { format: "structural-dom-v1" } };
  }

  public async getSessionState(): Promise<SessionState> {
    if (this.page.isClosed() || await this.page.locator('[data-session-state="expired"]').count() > 0) this.state = "expired";
    return this.state;
  }

  public async getSessionOwner(): Promise<SessionOwner> {
    return this.owner;
  }

  public async pause(): Promise<void> {
    if (this.page.isClosed()) {
      this.state = "expired";
      this.owner = "none";
      return;
    }
    if (this.owner !== "automation" || this.state !== "active") throw new Error("CONTROL_TRANSFER_CONFLICT");
    this.state = "paused";
    this.owner = "none";
    await this.activeAction;
    this.owner = "human";
  }

  public async resume(): Promise<void> {
    if (this.page.isClosed()) throw new Error("Cannot resume a closed browser session.");
    if (this.owner !== "human" || this.state !== "paused") throw new Error("CONTROL_TRANSFER_CONFLICT");
    this.owner = "automation";
    this.state = "active";
  }

  private async resolveStrategy(strategy: TargetStrategy, requireUniqueMatch: boolean): Promise<BrowserHandle> {
    if (strategy.kind === "visual") {
      if (strategy.x === undefined || strategy.y === undefined) {
        throw new Error("Visual strategy requires deterministic x/y coordinates during replay.");
      }
      return { kind: "coordinate", x: strategy.x, y: strategy.y };
    }
    if (strategy.kind === "terminal_field") {
      throw new Error("terminal_field is not supported by the browser adapter.");
    }

    const locator = this.locatorFor(strategy);
    await locator.first().waitFor({ state: "visible", timeout: this.timeoutMs });
    const count = await locator.count();
    if (requireUniqueMatch && count !== 1) throw new Error(`expected one match, found ${count}`);

    return { kind: "locator", locator: locator.first() };
  }

  private locatorFor(strategy: Exclude<TargetStrategy, { kind: "visual" | "terminal_field" }>): Locator {
    switch (strategy.kind) {
      case "accessibility":
        return this.page.getByRole(strategy.role as Parameters<Page["getByRole"]>[0], {
          ...(strategy.name ? { name: strategy.name } : {}),
          exact: strategy.exact,
        });
      case "label":
        return this.page.getByLabel(strategy.text, { exact: strategy.exact });
      case "attribute":
        return this.page.locator(`[${cssEscape(strategy.name)}="${cssString(strategy.value)}"]`);
      case "selector":
        return this.page.locator(strategy.selector);
      case "structural": {
        const anchor = this.page.getByText(strategy.anchorText, { exact: true }).first();
        const hint = strategy.controlHint ?? "input, button, select, textarea, a";
        switch (strategy.relation) {
          case "descendant":
            return anchor.locator(hint);
          case "following":
            return anchor.locator(`xpath=following::*[self::input or self::button or self::select or self::textarea or self::a][1]`);
          case "preceding":
            return anchor.locator(`xpath=preceding::*[self::input or self::button or self::select or self::textarea or self::a][1]`);
          case "ancestor":
            return anchor.locator("xpath=ancestor::*[1]").locator(hint);
        }
      }
    }
  }

  private async clickHandle(handle: BrowserHandle): Promise<void> {
    if (handle.kind === "locator") await handle.locator.click();
    else await this.page.mouse.click(handle.x, handle.y);
  }
}

function asBrowserHandle(target: ResolvedTarget): BrowserHandle {
  return target.opaqueHandle as BrowserHandle;
}

function asLocator(target: ResolvedTarget): Locator {
  const handle = asBrowserHandle(target);
  if (handle.kind !== "locator") throw new Error(`Action requires an element locator, but '${target.strategy.kind}' resolved to coordinates.`);
  return handle.locator;
}

function failure(code: string, message: string, recoverable: boolean): ActionResult {
  return { ok: false, error: { code, message, recoverable } };
}

function cssEscape(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]/g, (character) => `\\${character.codePointAt(0)!.toString(16)} `);
}

function cssString(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
