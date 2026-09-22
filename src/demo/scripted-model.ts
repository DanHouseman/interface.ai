import type { DiscoveryModel, DiscoveryDecision, ModelInput } from "../discovery/discovery-contracts.js";

// Milestone 13 | Assignment §6 | REQ-OPS-002
// Explicit OFFLINE fixture for reproducible integration tests. Never label its evidence
// as genuine discovery. The live command replaces it with OpenAIDiscoveryModel.
export class ScriptedDemoModel implements DiscoveryModel {
  private index = 0;
  public async decide(input?: ModelInput): Promise<DiscoveryDecision> {
    const decisions: DiscoveryDecision[] = [
      { kind: "act", rationale: "Fill identifier", actionType: "type", targetId: "member" },
      { kind: "act", rationale: "Search", actionType: "click", targetId: "find" },
      { kind: "act", rationale: "Open result", actionType: "click", targetId: "open" },
      { kind: "complete", rationale: "Detail is visible" },
    ];
    // In the offline operator demo a blocked proposal was never executed. Re-propose
    // that fixture action after handback rather than skipping it. No LLM is involved.
    const index = input ? input.history.filter(event => event.kind === "ACTION" && event.result.ok).length : this.index++;
    return decisions[index] ?? { kind: "stuck", rationale: "Offline fixture exhausted" };
  }
}
