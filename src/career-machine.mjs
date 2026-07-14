const STATE_VERSION = 1;

const CALENDAR_COMMANDS = ["train", "enter_event"];
const REFLECTION_COMMANDS = ["complete_setup", "acknowledge_result"];
const INSPECTION_COMMANDS = ["inspect_calendar"];

/**
 * Create the only valid starting state.
 *
 * The active flow is derived rather than stored. This prevents a saved flow
 * label from drifting away from the facts that actually make it active.
 */
export function createInitialCareerState({ seed = "public-demo-seed" } = {}) {
  if (typeof seed !== "string" || seed.length === 0) {
    throw new TypeError("seed must be a non-empty string");
  }

  return {
    version: STATE_VERSION,
    seed,
    player: null,
    clock: { week: 1 },
    resources: { rating: 1500, fatigue: 0 },
    pending: { result: null },
    history: [],
    commandLog: [],
  };
}

/**
 * One selector owns the current obligation and legal actions.
 */
export function selectCareerFlow(state) {
  if (state.player === null) {
    return flow({
      kind: "CareerSetup",
      blocking: true,
      reason: "Create the player before career time can advance.",
      legalCommands: ["complete_setup"],
      pendingObligations: ["career-setup"],
    });
  }

  if (state.pending.result !== null) {
    return flow({
      kind: "EvidenceReview",
      blocking: true,
      reason: "Review the latest result before advancing the calendar.",
      legalCommands: ["acknowledge_result", ...INSPECTION_COMMANDS],
      pendingObligations: [state.pending.result.id],
    });
  }

  return flow({
    kind: "Calendar",
    blocking: false,
    reason: "Choose how to spend the next career week.",
    legalCommands: [...CALENDAR_COMMANDS, ...INSPECTION_COMMANDS],
  });
}

export function isCommandLegal(state, command) {
  return selectCareerFlow(state).legalCommands.includes(command.type);
}

/**
 * Apply one command through the state-machine boundary.
 *
 * Inspection returns the same state object. Accepted mutating commands return
 * a new state and join the replayable command log.
 */
export function applyCareerCommand(state, command) {
  const beforeFlow = selectCareerFlow(state);

  if (!isCommandLegal(state, command)) {
    return rejected(
      state,
      `Command ${JSON.stringify(command.type)} is not legal during ${beforeFlow.kind}.`,
    );
  }

  if (command.type === "inspect_calendar") {
    return {
      accepted: true,
      state,
      observation: {
        week: state.clock.week,
        nextEvent: `Open Week ${state.clock.week + 1}`,
      },
    };
  }

  const next = clone(state);

  switch (command.type) {
    case "complete_setup": {
      if (typeof command.playerName !== "string" || command.playerName.trim() === "") {
        return rejected(state, "playerName must be a non-empty string.");
      }
      next.player = { name: command.playerName.trim() };
      break;
    }

    case "train": {
      next.clock.week += 1;
      next.resources.fatigue = Math.min(100, next.resources.fatigue + 8);
      next.history.push({
        kind: "training",
        week: state.clock.week,
        focus: command.focus ?? "balanced",
      });
      break;
    }

    case "enter_event": {
      if (typeof command.eventId !== "string" || command.eventId.length === 0) {
        return rejected(state, "eventId must be a non-empty string.");
      }
      const result = resolveEvent(state, command.eventId);
      next.clock.week += 1;
      next.resources.rating += result.ratingDelta;
      next.resources.fatigue = Math.min(100, next.resources.fatigue + 12);
      next.pending.result = result;
      next.history.push({
        kind: "event",
        week: state.clock.week,
        eventId: command.eventId,
        outcome: result.outcome,
        ratingDelta: result.ratingDelta,
      });
      break;
    }

    case "acknowledge_result": {
      if (command.resultId !== state.pending.result.id) {
        return rejected(state, "resultId does not match the pending result.");
      }
      next.pending.result = null;
      break;
    }

    default:
      return rejected(state, `Unknown command ${JSON.stringify(command.type)}.`);
  }

  next.commandLog.push(clone(command));
  return { accepted: true, state: next };
}

export function serializeCareerState(state) {
  return JSON.stringify(state, null, 2);
}

export function restoreCareerState(serialized) {
  const state = JSON.parse(serialized);
  validateCareerState(state);
  return state;
}

/**
 * Rebuild state from the same seed and accepted mutating commands.
 */
export function replayCareer({ seed, commands }) {
  let state = createInitialCareerState({ seed });

  for (const command of commands) {
    const result = applyCareerCommand(state, command);
    if (!result.accepted) {
      throw new Error(`Replay rejected a recorded command: ${result.error}`);
    }
    state = result.state;
  }

  return state;
}

export function getCommandCategory(commandType) {
  if (CALENDAR_COMMANDS.includes(commandType)) return "calendar";
  if (INSPECTION_COMMANDS.includes(commandType)) return "inspection";
  if (REFLECTION_COMMANDS.includes(commandType)) return "reflection";
  return "unknown";
}

function resolveEvent(state, eventId) {
  const value = stableHash(
    `${state.seed}|${eventId}|${state.clock.week}|${state.commandLog.length}`,
  );
  const outcomes = [
    { outcome: "loss", ratingDelta: -8 },
    { outcome: "draw", ratingDelta: 1 },
    { outcome: "win", ratingDelta: 11 },
  ];
  const selected = outcomes[value % outcomes.length];

  return {
    id: `result-${state.clock.week}-${value.toString(16)}`,
    eventId,
    ...selected,
  };
}

function stableHash(value) {
  let hash = 2166136261;
  for (const character of value) {
    hash ^= character.codePointAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function validateCareerState(state) {
  if (state === null || typeof state !== "object") {
    throw new TypeError("Career state must be an object.");
  }
  if (state.version !== STATE_VERSION) {
    throw new Error(`Unsupported career state version: ${state.version}`);
  }
  if (!Array.isArray(state.commandLog) || !Array.isArray(state.history)) {
    throw new Error("Career state is missing replay history.");
  }
  if (typeof state.clock?.week !== "number" || state.clock.week < 1) {
    throw new Error("Career state has an invalid clock.");
  }
  selectCareerFlow(state);
}

function flow({
  kind,
  blocking,
  reason,
  legalCommands,
  pendingObligations = [],
}) {
  return {
    kind,
    blocking,
    reason,
    legalCommands,
    pendingObligations,
  };
}

function rejected(state, error) {
  return { accepted: false, state, error };
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}
