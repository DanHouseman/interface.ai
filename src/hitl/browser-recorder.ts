import type { Page } from "playwright";
import type { SurfaceAdapter } from "../surface/surface-adapter.js";
import type { HumanActionRecord } from "./intervention.js";

// Milestone 10 | Assignment §3.6 | REQ-HITL-003
// Record manual action kinds and element tags, never typed values or raw page text.
// This preserves an audit of human activity without recording credentials/PII.
export async function recordHumanActions(page: Page, surface: SurfaceAdapter, operatorId: string): Promise<HumanActionRecord[]> {
  const records: HumanActionRecord[] = [];
  await page.exposeBinding("__recordHumanAction", async (_source, kind: string, tag: string) => {
    if (await surface.getSessionOwner() === "human") {
      records.push({ operatorId, timestamp: new Date().toISOString(), description: `${kind} ${tag}` });
    }
  });
  const install = () => {
    for (const kind of ["click", "change"]) document.addEventListener(kind, (event) => {
      const element = event.target as Element;
      void (window as unknown as { __recordHumanAction: (kind: string, tag: string) => Promise<void> }).__recordHumanAction(kind, element.tagName);
    }, true);
  };
  await page.addInitScript(install);
  await page.evaluate(install);
  return records;
}
