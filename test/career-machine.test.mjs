import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  applyCareerCommand,
  createInitialCareerState,
  replayCareer,
  restoreCareerState,
  selectCareerFlow,
  serializeCareerState,
} from "../src/career-machine.mjs";

describe("AI game state-machine pattern", () => {
  it("rejects actions that are illegal in the current flow", () => {
    const initial = createInitialCareerState({ seed: "illegal-action" });
    const result = applyCareerCommand(initial, {
      type: "train",
      focus: "calculation",
    });

    assert.equal(selectCareerFlow(initial).kind, "CareerSetup");
    assert.equal(result.accepted, false);
    assert.strictEqual(result.state, initial);
    assert.match(result.error, /not legal during CareerSetup/);
  });

  it("keeps inspection read-only", () => {
    const ready = completeSetup("read-only-inspection");
    const before = JSON.stringify(ready);
    const result = applyCareerCommand(ready, { type: "inspect_calendar" });

    assert.equal(result.accepted, true);
    assert.strictEqual(result.state, ready);
    assert.equal(JSON.stringify(ready), before);
    assert.equal(result.observation.week, 1);
    assert.equal(ready.commandLog.length, 1);
  });

  it("preserves a blocking obligation through save and restore", () => {
    const ready = completeSetup("save-restore-obligation");
    const event = applyCareerCommand(ready, {
      type: "enter_event",
      eventId: "synthetic-open",
    }).state;
    const restored = restoreCareerState(serializeCareerState(event));
    const flow = selectCareerFlow(restored);

    assert.equal(flow.kind, "EvidenceReview");
    assert.equal(flow.blocking, true);
    assert.deepEqual(flow.pendingObligations, [restored.pending.result.id]);

    const blocked = applyCareerCommand(restored, {
      type: "train",
      focus: "endgames",
    });
    assert.equal(blocked.accepted, false);
  });

  it("replays the same seed and command log to the same final state", () => {
    let state = completeSetup("deterministic-replay");
    state = applyCareerCommand(state, {
      type: "enter_event",
      eventId: "synthetic-open",
    }).state;
    state = applyCareerCommand(state, {
      type: "acknowledge_result",
      resultId: state.pending.result.id,
    }).state;
    state = applyCareerCommand(state, {
      type: "train",
      focus: "calculation",
    }).state;

    const replayed = replayCareer({
      seed: state.seed,
      commands: state.commandLog,
    });

    assert.deepEqual(replayed, state);
  });
});

function completeSetup(seed) {
  const initial = createInitialCareerState({ seed });
  const result = applyCareerCommand(initial, {
    type: "complete_setup",
    playerName: "Ari Example",
  });
  assert.equal(result.accepted, true);
  return result.state;
}
