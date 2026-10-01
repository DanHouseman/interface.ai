import type { Frame, Page } from "playwright";
import type { SurfaceAdapter } from "../surface/surface-adapter.js";
import type { HumanActionRecord } from "./intervention.js";

// Identity consists of a host-assigned document number and a numeric DOM path.
// No URL, label, element ID, typed value, or printable keystroke crosses the binding.
export async function recordHumanActions(page: Page, surface: SurfaceAdapter, operatorId: string): Promise<HumanActionRecord[]> {
  const records: HumanActionRecord[] = [];
  const documents = new WeakMap<Frame, number>();
  let sequence = 0;
  const documentId = (frame: Frame) => {
    if (!documents.has(frame)) documents.set(frame, ++sequence);
    return documents.get(frame)!;
  };
  const kinds = new Set(["click", "change", "input", "focusin", "keydown"]);
  const tags = new Set(["INPUT", "BUTTON", "SELECT", "TEXTAREA", "A", "FORM", "DIV", "SPAN", "BODY", "TD", "LABEL"]);
  const keys = new Set(["Tab", "Enter", "Escape", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Home", "End"]);
  await page.exposeBinding("__recordHumanAction", async (source, kind: unknown, tag: unknown, path: unknown, key: unknown) => {
    if (await surface.getSessionOwner() !== "human") return;
    if (typeof kind !== "string" || !kinds.has(kind) || !Array.isArray(path) || path.length === 0 || path.length > 100 || !path.every(index => Number.isSafeInteger(index) && index >= 0)) return;
    if (kind === "keydown" && (typeof key !== "string" || !keys.has(key))) return;
    const safeTag = typeof tag === "string" && tags.has(tag) ? tag : "ELEMENT";
    records.push({ operatorId, timestamp: new Date().toISOString(), description: `${kind} ${safeTag}`,
      metadata: { documentId: documentId(source.frame), controlPath: path.join("."), ...(kind === "keydown" ? { key: key as string } : {}) },
    });
  });
  page.on("framenavigated", async frame => {
    documents.set(frame, ++sequence);
    if (await surface.getSessionOwner() === "human") records.push({ operatorId, timestamp: new Date().toISOString(), description: "navigation", metadata: { documentId: documentId(frame), mainFrame: frame === page.mainFrame() } });
  });
  const install = () => {
    for (const kind of ["click", "change", "input", "focusin", "keydown"]) document.addEventListener(kind, event => {
      if (!(event.target instanceof Element)) return;
      const path: number[] = [];
      for (let element: Element | null = event.target; element; element = element.parentElement) {
        path.unshift(element.parentElement ? Array.prototype.indexOf.call(element.parentElement.children, element) : 0);
      }
      const key = event instanceof KeyboardEvent ? event.key : null;
      if (key !== null && !["Tab", "Enter", "Escape", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Home", "End"].includes(key)) return;
      void (window as unknown as { __recordHumanAction: (kind: string, tag: string, path: number[], key: string | null) => Promise<void> }).__recordHumanAction(kind, event.target.tagName, path, key);
    }, true);
  };
  await page.addInitScript(install);
  await page.evaluate(install);
  return records;
}
