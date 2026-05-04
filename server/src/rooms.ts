import {
  ANSWER_SECONDS,
  DISCUSS_SECONDS,
  IMPOSTER_ANSWER_SECONDS,
  MAX_ANSWER_LEN,
  MAX_CHAT_LEN,
  MAX_NAME_LEN,
  MAX_PLAYERS,
  MIN_PLAYERS_IMPOSTER,
  MIN_PLAYERS_SPYFALL,
  RESULTS_SECONDS,
  REVEAL_SECONDS,
  VOTING_SECONDS,
} from "../../shared/types.ts";
import type {
  ChatMsg,
  GameType,
  ImposterRoundPublic,
  Phase,
  Player,
  PlayerId,
  RoomCode,
  RoomStatePublic,
  SpyfallRoundPublic,
} from "../../shared/types.ts";
import { pickRandomPrompt } from "./prompts.ts";
import { ALL_LOCATION_NAMES, pickRandomLocation } from "./locations.ts";

const CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export function generateRoomCode(taken: Set<string>): RoomCode {
  for (let attempt = 0; attempt < 100; attempt++) {
    let code = "";
    for (let i = 0; i < 4; i++) {
      code += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
    }
    if (!taken.has(code)) return code;
  }
  throw new Error("Could not generate a unique room code");
}

export function sanitizeName(raw: string): string {
  const trimmed = (raw ?? "").trim().slice(0, MAX_NAME_LEN);
  return trimmed || "Player";
}

export function sanitizeText(raw: string, max: number): string {
  return (raw ?? "").toString().slice(0, max);
}

export type StateChangeListener = (room: RoomBase) => void;

export abstract class RoomBase {
  abstract readonly gameType: GameType;
  abstract readonly minPlayers: number;
  code: RoomCode;
  players = new Map<PlayerId, Player>();
  hostId: PlayerId;
  phase: Phase = "LOBBY";
  protected timer?: NodeJS.Timeout;
  private listeners = new Set<StateChangeListener>();

  constructor(code: RoomCode, hostId: PlayerId) {
    this.code = code;
    this.hostId = hostId;
  }

  on(listener: StateChangeListener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  emitChange() {
    for (const l of this.listeners) l(this);
  }

  addPlayer(playerId: PlayerId, name: string): { ok: boolean; error?: string } {
    if (this.phase !== "LOBBY") {
      const existing = this.players.get(playerId);
      if (existing) {
        existing.connected = true;
        this.emitChange();
        return { ok: true };
      }
      return { ok: false, error: "Game already in progress" };
    }
    if (this.players.size >= MAX_PLAYERS) {
      return { ok: false, error: "Room is full" };
    }
    if (this.players.has(playerId)) {
      const p = this.players.get(playerId)!;
      p.connected = true;
      p.name = sanitizeName(name);
      this.emitChange();
      return { ok: true };
    }
    this.players.set(playerId, {
      id: playerId,
      name: sanitizeName(name),
      score: 0,
      connected: true,
      isHost: playerId === this.hostId,
    });
    this.emitChange();
    return { ok: true };
  }

  reconnect(playerId: PlayerId): { ok: boolean; error?: string } {
    const p = this.players.get(playerId);
    if (!p) return { ok: false, error: "Player not in room" };
    p.connected = true;
    this.emitChange();
    return { ok: true };
  }

  markDisconnected(playerId: PlayerId) {
    const p = this.players.get(playerId);
    if (!p) return;
    p.connected = false;
    if (this.phase === "LOBBY") {
      this.players.delete(playerId);
      if (playerId === this.hostId) {
        const next = [...this.players.values()].find((pp) => pp.connected);
        if (next) {
          this.hostId = next.id;
          next.isHost = true;
        }
      }
    }
    this.emitChange();
  }

  isEmpty(): boolean {
    return [...this.players.values()].every((p) => !p.connected);
  }

  protected setPhase(phase: Phase, seconds: number, onElapsed: () => void) {
    this.phase = phase;
    this.clearTimer();
    this.timer = setTimeout(onElapsed, seconds * 1000);
    this.emitChange();
  }

  protected clearTimer() {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = undefined;
    }
  }

  destroy() {
    this.clearTimer();
    this.listeners.clear();
  }

  abstract startGame(by: PlayerId): { ok: boolean; error?: string };
  abstract publicStateFor(viewerId: PlayerId): RoomStatePublic;

  submitAnswer(_playerId: PlayerId, _text: string): { ok: boolean; error?: string } {
    return { ok: false, error: "Not supported in this game" };
  }
  castVote(_voterId: PlayerId, _targetPlayerId: PlayerId): { ok: boolean; error?: string } {
    return { ok: false, error: "Not voting right now" };
  }
  callVote(_playerId: PlayerId): { ok: boolean; error?: string } {
    return { ok: false, error: "Not supported in this game" };
  }
  postChat(_playerId: PlayerId, _text: string): { ok: boolean; error?: string } {
    return { ok: false, error: "Chat not available right now" };
  }

  protected baseStateFor(
    viewerId: PlayerId
  ): Omit<RoomStatePublic, "imposterRound" | "spyfallRound"> {
    const players = [...this.players.values()].map((p) => ({ ...p }));
    return {
      code: this.code,
      gameType: this.gameType,
      phase: this.phase,
      players,
      hostId: this.hostId,
      myId: viewerId,
      minPlayers: this.minPlayers,
    };
  }

  protected returnToLobby() {
    this.phase = "LOBBY";
    this.clearTimer();
    this.emitChange();
  }
}

// ---------------- Imposter ----------------

interface ImposterRound {
  promptId: string;
  promptText: string;
  imposterId: PlayerId;
  answers: Map<PlayerId, string>;
  votes: Map<PlayerId, PlayerId>;
  chat: ChatMsg[];
  phaseEndsAt: number;
  winner?: "PLAYERS" | "IMPOSTER";
  mostVotedAnswerOwnerId?: PlayerId;
}

export class ImposterRoom extends RoomBase {
  readonly gameType = "imposter" as const;
  readonly minPlayers = MIN_PLAYERS_IMPOSTER;
  round?: ImposterRound;

  startGame(by: PlayerId): { ok: boolean; error?: string } {
    if (by !== this.hostId) return { ok: false, error: "Only the host can start" };
    if (this.phase !== "LOBBY") return { ok: false, error: "Game already started" };
    const connected = [...this.players.values()].filter((p) => p.connected);
    if (connected.length < this.minPlayers) {
      return { ok: false, error: `Need at least ${this.minPlayers} players` };
    }
    this.beginRound();
    return { ok: true };
  }

  private beginRound() {
    const connected = [...this.players.values()].filter((p) => p.connected);
    const imposter = connected[Math.floor(Math.random() * connected.length)];
    const prompt = pickRandomPrompt();
    this.round = {
      promptId: prompt.id,
      promptText: prompt.text,
      imposterId: imposter.id,
      answers: new Map(),
      votes: new Map(),
      chat: [],
      phaseEndsAt: Date.now() + ANSWER_SECONDS * 1000,
    };
    this.setPhase("ANSWERING", ANSWER_SECONDS, () => this.endAnsweringPhase());
  }

  override submitAnswer(playerId: PlayerId, text: string): { ok: boolean; error?: string } {
    if (!this.round) return { ok: false, error: "No active round" };
    const trimmed = sanitizeText(text, MAX_ANSWER_LEN).trim();
    if (!trimmed) return { ok: false, error: "Answer cannot be empty" };
    const isImposter = playerId === this.round.imposterId;
    if (this.phase === "ANSWERING") {
      if (isImposter) return { ok: false, error: "Imposter answers later" };
      if (this.round.answers.has(playerId)) return { ok: false, error: "Already answered" };
      this.round.answers.set(playerId, trimmed);
      this.emitChange();
      const realPlayers = [...this.players.values()].filter(
        (p) => p.connected && p.id !== this.round!.imposterId
      );
      if (this.round.answers.size >= realPlayers.length) {
        this.endAnsweringPhase();
      }
      return { ok: true };
    }
    if (this.phase === "IMPOSTER_ANSWERING") {
      if (!isImposter) return { ok: false, error: "Only the imposter answers now" };
      if (this.round.answers.has(playerId)) return { ok: false, error: "Already answered" };
      this.round.answers.set(playerId, trimmed);
      this.emitChange();
      this.startVotingPhase();
      return { ok: true };
    }
    return { ok: false, error: "Not accepting answers right now" };
  }

  private endAnsweringPhase() {
    if (this.phase !== "ANSWERING" || !this.round) return;
    this.round.phaseEndsAt = Date.now() + IMPOSTER_ANSWER_SECONDS * 1000;
    this.setPhase("IMPOSTER_ANSWERING", IMPOSTER_ANSWER_SECONDS, () =>
      this.startVotingPhase()
    );
  }

  private startVotingPhase() {
    if (!this.round) return;
    if (!this.round.answers.has(this.round.imposterId)) {
      this.round.answers.set(this.round.imposterId, "(no answer)");
    }
    this.round.phaseEndsAt = Date.now() + VOTING_SECONDS * 1000;
    this.setPhase("VOTING", VOTING_SECONDS, () => this.tallyVotes());
  }

  override castVote(voterId: PlayerId, targetPlayerId: PlayerId): { ok: boolean; error?: string } {
    if (this.phase !== "VOTING" || !this.round) {
      return { ok: false, error: "Not voting right now" };
    }
    if (!this.players.has(voterId)) return { ok: false, error: "Not in this room" };
    if (!this.round.answers.has(targetPlayerId)) {
      return { ok: false, error: "Invalid vote target" };
    }
    if (voterId === targetPlayerId) {
      return { ok: false, error: "Cannot vote for your own answer" };
    }
    this.round.votes.set(voterId, targetPlayerId);
    this.emitChange();
    const connected = [...this.players.values()].filter((p) => p.connected);
    if (this.round.votes.size >= connected.length) this.tallyVotes();
    return { ok: true };
  }

  override postChat(playerId: PlayerId, text: string): { ok: boolean; error?: string } {
    if (this.phase !== "VOTING") return { ok: false, error: "Chat only during voting" };
    const player = this.players.get(playerId);
    if (!player) return { ok: false, error: "Not in this room" };
    const trimmed = sanitizeText(text, MAX_CHAT_LEN).trim();
    if (!trimmed) return { ok: false, error: "Empty message" };
    if (!this.round) return { ok: false, error: "No round" };
    this.round.chat.push({
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      playerId,
      playerName: player.name,
      text: trimmed,
      ts: Date.now(),
    });
    this.emitChange();
    return { ok: true };
  }

  private tallyVotes() {
    if (!this.round) return;
    const counts = new Map<PlayerId, number>();
    for (const target of this.round.votes.values()) {
      counts.set(target, (counts.get(target) ?? 0) + 1);
    }
    let topCount = -1;
    const topOwners: PlayerId[] = [];
    for (const [ownerId, count] of counts) {
      if (count > topCount) {
        topCount = count;
        topOwners.length = 0;
        topOwners.push(ownerId);
      } else if (count === topCount) {
        topOwners.push(ownerId);
      }
    }
    const isImposterTopAndAlone =
      topOwners.length === 1 && topOwners[0] === this.round.imposterId;
    this.round.winner = isImposterTopAndAlone ? "PLAYERS" : "IMPOSTER";
    this.round.mostVotedAnswerOwnerId = topOwners.length === 1 ? topOwners[0] : undefined;
    if (this.round.winner === "PLAYERS") {
      for (const p of this.players.values()) {
        if (p.id !== this.round.imposterId) p.score += 1;
      }
    } else {
      const imposter = this.players.get(this.round.imposterId);
      if (imposter) imposter.score += 2;
    }
    this.round.phaseEndsAt = Date.now() + RESULTS_SECONDS * 1000;
    this.setPhase("RESULTS", RESULTS_SECONDS, () => {
      this.round = undefined;
      this.returnToLobby();
    });
  }

  publicStateFor(viewerId: PlayerId): RoomStatePublic {
    const base = this.baseStateFor(viewerId);
    let imposterRound: ImposterRoundPublic | undefined;
    if (this.round) {
      const isImposter = viewerId === this.round.imposterId;
      const myRole: "IMPOSTER" | "PLAYER" = isImposter ? "IMPOSTER" : "PLAYER";
      const showPromptToReal = !isImposter && this.phase !== "RESULTS";
      const showPromptToAll = this.phase === "VOTING" || this.phase === "RESULTS";
      const promptForRealPlayers = showPromptToAll
        ? this.round.promptText
        : showPromptToReal
          ? this.round.promptText
          : null;

      let answers: { ownerId: PlayerId; text: string }[] = [];
      if (this.phase === "IMPOSTER_ANSWERING" && isImposter) {
        answers = [...this.round.answers.entries()].map(([ownerId, text]) => ({
          ownerId,
          text,
        }));
        answers = shuffle(answers);
      } else if (this.phase === "VOTING" || this.phase === "RESULTS") {
        answers = [...this.round.answers.entries()].map(([ownerId, text]) => ({
          ownerId,
          text,
        }));
        answers = shuffle(answers);
      }

      imposterRound = {
        promptForRealPlayers,
        answers,
        votes:
          this.phase === "VOTING" || this.phase === "RESULTS"
            ? Object.fromEntries(this.round.votes)
            : {},
        chat: this.phase === "VOTING" || this.phase === "RESULTS" ? this.round.chat : [],
        phaseEndsAt: this.round.phaseEndsAt,
        imposterRevealed:
          this.phase === "RESULTS" ? this.round.imposterId : undefined,
        winner: this.round.winner,
        mostVotedAnswerOwnerId: this.round.mostVotedAnswerOwnerId,
        myRole,
        iSubmittedAnswer: this.round.answers.has(viewerId),
        iVoted: this.round.votes.has(viewerId),
      };
    }
    return { ...base, imposterRound };
  }
}

// ---------------- Spyfall ----------------

interface SpyfallRound {
  spyId: PlayerId;
  location: string;
  rolesByPlayer: Map<PlayerId, string>;
  votes: Map<PlayerId, PlayerId>;
  chat: ChatMsg[];
  phaseEndsAt: number;
  winner?: "PLAYERS" | "SPY";
  mostVotedPlayerId?: PlayerId;
}

export class SpyfallRoom extends RoomBase {
  readonly gameType = "spyfall" as const;
  readonly minPlayers = MIN_PLAYERS_SPYFALL;
  round?: SpyfallRound;

  startGame(by: PlayerId): { ok: boolean; error?: string } {
    if (by !== this.hostId) return { ok: false, error: "Only the host can start" };
    if (this.phase !== "LOBBY") return { ok: false, error: "Game already started" };
    const connected = [...this.players.values()].filter((p) => p.connected);
    if (connected.length < this.minPlayers) {
      return { ok: false, error: `Need at least ${this.minPlayers} players` };
    }
    this.beginRound();
    return { ok: true };
  }

  private beginRound() {
    const connected = [...this.players.values()].filter((p) => p.connected);
    const spy = connected[Math.floor(Math.random() * connected.length)];
    const location = pickRandomLocation();
    const rolesByPlayer = new Map<PlayerId, string>();
    const roles = shuffle(location.roles);
    let i = 0;
    for (const p of connected) {
      if (p.id === spy.id) continue;
      rolesByPlayer.set(p.id, roles[i % roles.length]);
      i++;
    }
    this.round = {
      spyId: spy.id,
      location: location.name,
      rolesByPlayer,
      votes: new Map(),
      chat: [],
      phaseEndsAt: Date.now() + REVEAL_SECONDS * 1000,
    };
    this.setPhase("REVEAL", REVEAL_SECONDS, () => this.startDiscussPhase());
  }

  private startDiscussPhase() {
    if (!this.round) return;
    this.round.phaseEndsAt = Date.now() + DISCUSS_SECONDS * 1000;
    this.setPhase("DISCUSS", DISCUSS_SECONDS, () => this.startVotingPhase());
  }

  private startVotingPhase() {
    if (!this.round) return;
    this.round.phaseEndsAt = Date.now() + VOTING_SECONDS * 1000;
    this.setPhase("VOTING", VOTING_SECONDS, () => this.tallyVotes());
  }

  override callVote(playerId: PlayerId): { ok: boolean; error?: string } {
    if (this.phase !== "DISCUSS") {
      return { ok: false, error: "Can only call vote during discussion" };
    }
    if (!this.players.has(playerId)) return { ok: false, error: "Not in this room" };
    this.startVotingPhase();
    return { ok: true };
  }

  override castVote(voterId: PlayerId, targetPlayerId: PlayerId): { ok: boolean; error?: string } {
    if (this.phase !== "VOTING" || !this.round) {
      return { ok: false, error: "Not voting right now" };
    }
    if (!this.players.has(voterId)) return { ok: false, error: "Not in this room" };
    if (!this.players.has(targetPlayerId)) return { ok: false, error: "Invalid vote target" };
    if (voterId === targetPlayerId) return { ok: false, error: "Cannot vote for yourself" };
    this.round.votes.set(voterId, targetPlayerId);
    this.emitChange();
    const connected = [...this.players.values()].filter((p) => p.connected);
    if (this.round.votes.size >= connected.length) this.tallyVotes();
    return { ok: true };
  }

  override postChat(playerId: PlayerId, text: string): { ok: boolean; error?: string } {
    if (this.phase !== "DISCUSS" && this.phase !== "VOTING") {
      return { ok: false, error: "Chat only during discussion or voting" };
    }
    const player = this.players.get(playerId);
    if (!player) return { ok: false, error: "Not in this room" };
    const trimmed = sanitizeText(text, MAX_CHAT_LEN).trim();
    if (!trimmed) return { ok: false, error: "Empty message" };
    if (!this.round) return { ok: false, error: "No round" };
    this.round.chat.push({
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      playerId,
      playerName: player.name,
      text: trimmed,
      ts: Date.now(),
    });
    this.emitChange();
    return { ok: true };
  }

  private tallyVotes() {
    if (!this.round) return;
    const counts = new Map<PlayerId, number>();
    for (const target of this.round.votes.values()) {
      counts.set(target, (counts.get(target) ?? 0) + 1);
    }
    let topCount = -1;
    const topPlayers: PlayerId[] = [];
    for (const [pid, count] of counts) {
      if (count > topCount) {
        topCount = count;
        topPlayers.length = 0;
        topPlayers.push(pid);
      } else if (count === topCount) {
        topPlayers.push(pid);
      }
    }
    const isSpyTopAndAlone =
      topPlayers.length === 1 && topPlayers[0] === this.round.spyId;
    this.round.winner = isSpyTopAndAlone ? "PLAYERS" : "SPY";
    this.round.mostVotedPlayerId = topPlayers.length === 1 ? topPlayers[0] : undefined;
    if (this.round.winner === "PLAYERS") {
      for (const p of this.players.values()) {
        if (p.id !== this.round.spyId) p.score += 1;
      }
    } else {
      const spy = this.players.get(this.round.spyId);
      if (spy) spy.score += 2;
    }
    this.round.phaseEndsAt = Date.now() + RESULTS_SECONDS * 1000;
    this.setPhase("RESULTS", RESULTS_SECONDS, () => {
      this.round = undefined;
      this.returnToLobby();
    });
  }

  publicStateFor(viewerId: PlayerId): RoomStatePublic {
    const base = this.baseStateFor(viewerId);
    let spyfallRound: SpyfallRoundPublic | undefined;
    if (this.round) {
      const isSpy = viewerId === this.round.spyId;
      const reveal = this.phase === "RESULTS";
      spyfallRound = {
        myRole: isSpy ? "SPY" : "PLAYER",
        myLocation: isSpy ? undefined : this.round.location,
        myLocationRole: isSpy ? undefined : this.round.rolesByPlayer.get(viewerId),
        allLocations: ALL_LOCATION_NAMES,
        votes:
          this.phase === "VOTING" || this.phase === "RESULTS"
            ? Object.fromEntries(this.round.votes)
            : {},
        chat:
          this.phase === "DISCUSS" || this.phase === "VOTING" || this.phase === "RESULTS"
            ? this.round.chat
            : [],
        phaseEndsAt: this.round.phaseEndsAt,
        iVoted: this.round.votes.has(viewerId),
        spyRevealed: reveal ? this.round.spyId : undefined,
        actualLocation: reveal ? this.round.location : undefined,
        winner: this.round.winner,
        mostVotedPlayerId: this.round.mostVotedPlayerId,
      };
    }
    return { ...base, spyfallRound };
  }
}

function shuffle<T>(arr: T[]): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export class RoomStore {
  private rooms = new Map<RoomCode, RoomBase>();

  create(hostId: PlayerId, gameType: GameType): RoomBase {
    const code = generateRoomCode(new Set(this.rooms.keys()));
    const room: RoomBase =
      gameType === "spyfall"
        ? new SpyfallRoom(code, hostId)
        : new ImposterRoom(code, hostId);
    this.rooms.set(code, room);
    return room;
  }

  get(code: RoomCode): RoomBase | undefined {
    return this.rooms.get(code.toUpperCase());
  }

  delete(code: RoomCode) {
    const room = this.rooms.get(code);
    if (room) {
      room.destroy();
      this.rooms.delete(code);
    }
  }

  all(): RoomBase[] {
    return [...this.rooms.values()];
  }
}
