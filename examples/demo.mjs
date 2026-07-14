import {
  applyCareerCommand,
  createInitialCareerState,
  replayCareer,
  selectCareerFlow,
} from "../src/career-machine.mjs";

let state = createInitialCareerState({ seed: "harbor-chess-club" });

state = run(state, {
  type: "complete_setup",
  playerName: "Ari Example",
});
state = run(state, { type: "enter_event", eventId: "harbor-open" });

const blocked = applyCareerCommand(state, {
  type: "train",
  focus: "calculation",
});
console.log(`\nBlocked advance: ${blocked.error}`);

state = run(state, {
  type: "acknowledge_result",
  resultId: state.pending.result.id,
});
state = run(state, { type: "train", focus: "calculation" });

const replayed = replayCareer({
  seed: state.seed,
  commands: state.commandLog,
});

console.log(`\nReplay equals live state: ${JSON.stringify(replayed) === JSON.stringify(state)}`);

function run(current, command) {
  const before = selectCareerFlow(current);
  const result = applyCareerCommand(current, command);
  if (!result.accepted) throw new Error(result.error);
  const after = selectCareerFlow(result.state);
  console.log(`${before.kind} --${command.type}--> ${after.kind}`);
  return result.state;
}
