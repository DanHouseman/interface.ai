import { mkdir } from "node:fs/promises";
import { resolve as resolvePath } from "node:path";
import type { Locator, Page } from "playwright";
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
}

// Plan: Milestone 10 | REQ-SRF-001/002, REQ-RPL-002/004, REQ-EVD-002
// Browser mechanics live behind SurfaceAdapter. Replay remains independent of Playwright.
export class PlaywrightSurfaceAdapter implements SurfaceAdapter {
  private state: SessionState = "active";
  private owner: SessionOwner = "automation";
  private evidenceSequence = 0;
  private readonly evidenceDirectory: string;

  public constructor(
    private readonly page: Page,
    options: PlaywrightSurfaceAdapterOptions = {},
  ) {
    this.evidenceDirectory = resolvePath(options.evidenceDirectory ?? "evidence/runtime/browser");
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

  public async execute(action: SurfaceAction): Promise<ActionResult> {
    if (this.owner !== "automation" || (await this.getSessionState()) !== "active") {
      return failure(
        "SURFACE_NOT_OWNED_BY_AUTOMATION",
        "Automation does not currently own an active browser session.",
        false,
      );
    }

    try {
      switch (action.type) {
        case "click":
          await this.clickHandle(asBrowserHandle(action.target));
          return { ok: true };
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
          const value = await locator.innerText();
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
      return failure("BROWSER_ACTION_FAILED", errorMessage(error), true);
    }
  }

  public async captureEvidence(reason: string): Promise<EvidenceReference> {
    if (this.page.isClosed()) throw new Error("Cannot capture browser evidence after the page has closed.");

    await mkdir(this.evidenceDirectory, { recursive: true });
    const id = `browser-evidence-${String(this.evidenceSequence++).padStart(4, "0")}`;
    const path = resolvePath(this.evidenceDirectory, `${id}.png`);
    await this.page.screenshot({ path, fullPage: true });

    return {
      id,
      kind: "screenshot",
      path,
      metadata: {
        reason,
        location: this.page.url(),
        title: await this.page.title(),
      },
    };
  }

  public async getSessionState(): Promise<SessionState> {
    if (this.page.isClosed()) this.state = "expired";
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
    this.state = "paused";
    this.owner = "human";
  }

  public async resume(): Promise<void> {
    if (this.page.isClosed()) throw new Error("Cannot resume a closed browser session.");
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
    const count = await locator.count();
    if (count === 0) throw new Error("no matches");
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
