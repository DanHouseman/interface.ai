import type { DiscoveryModel, DiscoveryDecision } from "../discovery/discovery-contracts.js";

// Milestone 13 | Assignment §6 | REQ-OPS-002
// Explicit OFFLINE fixture for reproducible integration tests. Never label its evidence
// as genuine discovery. The live command replaces it with OpenAIDiscoveryModel.
export class ScriptedDemoModel implements DiscoveryModel {
  private index = 0;
  public async decide(): Promise<DiscoveryDecision> {
    const decisions: DiscoveryDecision[] = [
      { kind: "act", rationale: "Fill identifier", actionType: "type", targetId: "member" },
      { kind: "act", rationale: "Search", actionType: "click", targetId: "find" },
      { kind: "act", rationale: "Open result", actionType: "click", targetId: "open" },
      { kind: "complete", rationale: "Detail is visible" },
    ];
    return decisions[this.index++] ?? { kind: "stuck", rationale: "Offline fixture exhausted" };
  }
}
