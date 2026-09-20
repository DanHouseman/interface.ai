import { describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ question: vi.fn(async () => "resume"), close: vi.fn(), execute: vi.fn() }));
vi.mock("node:readline/promises", () => ({ createInterface: () => ({ question: mocks.question, close: mocks.close }) }));
vi.mock("../src/demo/run-demo.js", () => ({ runDemo: mocks.execute }));
import { main } from "../src/demo/cli.js";

// Milestone 13 | Assignment §6 | REQ-OPS-002
// Exercise real CLI defaults without launching a browser or contacting any model.
describe("terminal defaults", () => {
  it("uses environment defaults and closes the terminal after an explicit response", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    mocks.execute.mockImplementation(async options => {
      if (options.operator) await options.operator({}, {});
      return { result: { disposition: "SUCCESS", code: "SUCCESS" }, directory: "/tmp/test" };
    });
    await main(["offline"]); await main(["handoff", "--artifact", "test.json"]);
    expect(mocks.question).toHaveBeenCalled(); expect(mocks.close).toHaveBeenCalled(); expect(log).toHaveBeenCalledWith(expect.stringContaining("SUCCESS"));
    mocks.question.mockRejectedValueOnce(Error("closed input")); await expect(main(["handoff", "--artifact", "test.json"])).rejects.toThrow("closed input");
    log.mockRestore();
  });
});
