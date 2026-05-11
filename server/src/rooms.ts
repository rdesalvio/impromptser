import { randomUUID } from "crypto";
import {
  ANSWER_SECONDS,
  DISCUSS_SECONDS,
  FLIP7_DECISION_SECONDS,
  FLIP7_DEFAULT_TARGET,
  FLIP7_FORCED_DRAW_MS,
  FLIP7_RECENT_EVENTS,
  FLIP7_ROUND_END_SECONDS,
  FLIP7_TARGET_SCORES,
  FLIP7_TARGET_SECONDS,
  IMPOSTER_ANSWER_SECONDS,
  IMPOSTER_BETWEEN_ROUNDS_SECONDS,
  IMPOSTER_DEFAULT_ROUNDS,
  IMPOSTER_ROUND_OPTIONS,
  MAX_ANSWER_LEN,
  MAX_CHAT_LEN,
  MAX_DRAWING_POINTS,
  MAX_DRAWING_STROKES,
  MAX_NAME_LEN,
  MAX_PLAYERS,
  MAX_SLOGAN_LEN,
  MIN_PLAYERS_FLIP7,
  MIN_PLAYERS_IMPOSTER,
  MIN_PLAYERS_SPYFALL,
  MIN_PLAYERS_TEEKO,
  RESULTS_SECONDS,
  REVEAL_SECONDS,
  TEEKO_BYE_REVEAL_SECONDS,
  TEEKO_COMPOSING_SECONDS,
  TEEKO_DRAWING_SECONDS,
  TEEKO_DRAWING_TARGET,
  TEEKO_HAND_DRAWINGS,
  TEEKO_HAND_SLOGANS,
  TEEKO_MATCHUP_REVEAL_SECONDS,
  TEEKO_MATCHUP_VOTE_SECONDS,
  TEEKO_SHIRTS_PER_PLAYER,
  TEEKO_SLOGAN_TARGET,
  TEEKO_WRITING_SECONDS,
  VOTING_SECONDS,
} from "../../shared/types.ts";
import type {
  ChatMsg,
  DrawingStroke,
  Flip7Awaiting,
  Flip7Card,
  Flip7Event,
  Flip7Hand,
  Flip7Modifier,
  Flip7RoundPublic,
  GameType,
  ImposterRoundPublic,
  Phase,
  Player,
  PlayerId,
  RoomCode,
  RoomStatePublic,
  SpyfallRoundPublic,
  TeekoMatchupPublic,
  TeekoRoundPublic,
  TeekoShirtPublic,
} from "../../shared/types.ts";
import { pickRandomPrompt, pickRandomPromptExcluding } from "./prompts.ts";
import { ALL_LOCATION_NAMES, pickRandomLocation } from "./locations.ts";
import { buildDeck, shuffleInPlace } from "./cards.ts";

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
    // Existing player reconnecting (any phase).
    if (this.players.has(playerId)) {
      const p = this.players.get(playerId)!;
      p.connected = true;
      if (this.phase === "LOBBY") p.name = sanitizeName(name);
      this.emitChange();
      return { ok: true };
    }
    if (this.players.size >= MAX_PLAYERS) {
      return { ok: false, error: "Room is full" };
    }
    // Mid-game new joiner → spectator. In LOBBY → regular player.
    const isSpectator = this.phase !== "LOBBY";
    this.players.set(playerId, {
      id: playerId,
      name: sanitizeName(name),
      score: 0,
      connected: true,
      isHost: playerId === this.hostId,
      isSpectator,
    });
    this.emitChange();
    return { ok: true };
  }

  /** Players who are connected and not spectating — the game-relevant population. */
  protected playingPlayers(): Player[] {
    return [...this.players.values()].filter(
      (p) => p.connected && !p.isSpectator
    );
  }

  /** True iff this player is currently treated as an active participant. */
  protected isPlaying(playerId: PlayerId): boolean {
    const p = this.players.get(playerId);
    return !!p && p.connected && !p.isSpectator;
  }

  /** Reset all spectator flags — call when transitioning back to LOBBY. */
  protected promoteSpectators(): void {
    for (const p of this.players.values()) p.isSpectator = false;
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
    // Migrate host to another connected player if possible — but never delete the
    // disconnecting player. Keeping their slot is what lets them rejoin via the
    // grace window (e.g. mobile tab suspension when sharing the link).
    if (playerId === this.hostId) {
      const next = [...this.players.values()].find((pp) => pp.connected);
      if (next) {
        this.hostId = next.id;
        next.isHost = true;
        p.isHost = false;
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
  ): Omit<RoomStatePublic, "imposterRound" | "spyfallRound" | "flip7Round" | "teekoRound" | "flip7TargetScore"> {
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
  totalRounds = IMPOSTER_DEFAULT_ROUNDS;
  currentRoundIndex = 0;            // 0-based index of round in progress / just-played
  usedPromptIds = new Set<string>();
  recentImposterIds: PlayerId[] = []; // for fairer rotation
  gameWinnerId?: PlayerId;

  startGame(by: PlayerId): { ok: boolean; error?: string } {
    if (by !== this.hostId) return { ok: false, error: "Only the host can start" };
    if (this.phase !== "LOBBY") return { ok: false, error: "Game already started" };
    const connected = [...this.players.values()].filter((p) => p.connected);
    if (connected.length < this.minPlayers) {
      return { ok: false, error: `Need at least ${this.minPlayers} players` };
    }
    for (const p of this.players.values()) p.score = 0;
    this.currentRoundIndex = 0;
    this.usedPromptIds.clear();
    this.recentImposterIds = [];
    this.gameWinnerId = undefined;
    this.beginRound();
    return { ok: true };
  }

  setRoundsTarget(by: PlayerId, rounds: number): { ok: boolean; error?: string } {
    if (by !== this.hostId) return { ok: false, error: "Only the host can change rounds" };
    if (this.phase !== "LOBBY") return { ok: false, error: "Game already started" };
    if (!IMPOSTER_ROUND_OPTIONS.includes(rounds as 3 | 5 | 7)) {
      return { ok: false, error: "Invalid round count" };
    }
    this.totalRounds = rounds;
    this.emitChange();
    return { ok: true };
  }

  nextGame(by: PlayerId): { ok: boolean; error?: string } {
    if (by !== this.hostId) return { ok: false, error: "Only the host can reset" };
    if (this.phase !== "GAME_OVER") return { ok: false, error: "Game still in progress" };
    for (const p of this.players.values()) p.score = 0;
    this.currentRoundIndex = 0;
    this.usedPromptIds.clear();
    this.recentImposterIds = [];
    this.gameWinnerId = undefined;
    this.round = undefined;
    this.promoteSpectators();
    this.phase = "LOBBY";
    this.clearTimer();
    this.emitChange();
    return { ok: true };
  }

  private beginRound() {
    const playing = this.playingPlayers();
    // Prefer players who haven't been imposter recently.
    const eligible = playing.filter((p) => !this.recentImposterIds.includes(p.id));
    const pool = eligible.length > 0 ? eligible : playing;
    const imposter = pool[Math.floor(Math.random() * pool.length)];
    this.recentImposterIds.push(imposter.id);
    const window = Math.max(playing.length - 1, 1);
    while (this.recentImposterIds.length > window) this.recentImposterIds.shift();

    const prompt = pickRandomPromptExcluding(this.usedPromptIds);
    this.usedPromptIds.add(prompt.id);

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
    if (!this.isPlaying(playerId)) return { ok: false, error: "Spectators can't answer" };
    const trimmed = sanitizeText(text, MAX_ANSWER_LEN).trim();
    if (!trimmed) return { ok: false, error: "Answer cannot be empty" };
    const normalized = trimmed.toLowerCase();
    for (const existing of this.round.answers.values()) {
      if (existing.toLowerCase() === normalized) {
        return { ok: false, error: "Someone already used that answer — try a different one" };
      }
    }
    const isImposter = playerId === this.round.imposterId;
    if (this.phase === "ANSWERING") {
      if (isImposter) return { ok: false, error: "Imposter answers later" };
      if (this.round.answers.has(playerId)) return { ok: false, error: "Already answered" };
      this.round.answers.set(playerId, trimmed);
      this.emitChange();
      const realPlayers = this.playingPlayers().filter(
        (p) => p.id !== this.round!.imposterId
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
    if (!this.isPlaying(voterId)) return { ok: false, error: "Spectators can't vote" };
    if (!this.round.answers.has(targetPlayerId)) {
      return { ok: false, error: "Invalid vote target" };
    }
    if (voterId === targetPlayerId) {
      return { ok: false, error: "Cannot vote for your own answer" };
    }
    this.round.votes.set(voterId, targetPlayerId);
    this.emitChange();
    if (this.round.votes.size >= this.playingPlayers().length) this.tallyVotes();
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
        if (p.isSpectator) continue;
        if (p.id !== this.round.imposterId) p.score += 1;
      }
    } else {
      const imposter = this.players.get(this.round.imposterId);
      if (imposter) imposter.score += 2;
    }
    this.round.phaseEndsAt = Date.now() + IMPOSTER_BETWEEN_ROUNDS_SECONDS * 1000;
    this.setPhase("RESULTS", IMPOSTER_BETWEEN_ROUNDS_SECONDS, () => this.endRoundOrGame());
  }

  private endRoundOrGame() {
    this.currentRoundIndex++;
    if (this.currentRoundIndex >= this.totalRounds) {
      // Game over — pick the highest-score player as winner (ties: first encountered wins).
      let topScore = -1;
      let winnerId: PlayerId | undefined;
      for (const p of this.players.values()) {
        if (p.score > topScore) {
          topScore = p.score;
          winnerId = p.id;
        }
      }
      this.gameWinnerId = winnerId;
      this.phase = "GAME_OVER";
      this.clearTimer();
      this.emitChange();
      return;
    }
    this.beginRound();
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
        roundNumber: this.currentRoundIndex + 1,
        totalRounds: this.totalRounds,
      };
    }
    if (this.phase === "GAME_OVER") {
      imposterRound = imposterRound ?? {
        promptForRealPlayers: null,
        answers: [],
        votes: {},
        chat: [],
        phaseEndsAt: 0,
        iSubmittedAnswer: false,
        iVoted: false,
        roundNumber: this.totalRounds,
        totalRounds: this.totalRounds,
      };
      imposterRound.finalGameWinnerId = this.gameWinnerId;
    }
    return { ...base, imposterRound, imposterTotalRounds: this.totalRounds };
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
    const playing = this.playingPlayers();
    const spy = playing[Math.floor(Math.random() * playing.length)];
    const location = pickRandomLocation();
    const rolesByPlayer = new Map<PlayerId, string>();
    const roles = shuffle(location.roles);
    let i = 0;
    for (const p of playing) {
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
    if (!this.isPlaying(playerId)) return { ok: false, error: "Spectators can't call a vote" };
    this.startVotingPhase();
    return { ok: true };
  }

  override castVote(voterId: PlayerId, targetPlayerId: PlayerId): { ok: boolean; error?: string } {
    if (this.phase !== "VOTING" || !this.round) {
      return { ok: false, error: "Not voting right now" };
    }
    if (!this.isPlaying(voterId)) return { ok: false, error: "Spectators can't vote" };
    if (!this.players.has(targetPlayerId)) return { ok: false, error: "Invalid vote target" };
    if (voterId === targetPlayerId) return { ok: false, error: "Cannot vote for yourself" };
    this.round.votes.set(voterId, targetPlayerId);
    this.emitChange();
    if (this.round.votes.size >= this.playingPlayers().length) this.tallyVotes();
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
        if (p.isSpectator) continue;
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
      const viewer = this.players.get(viewerId);
      const isSpectator = !!viewer?.isSpectator;
      const reveal = this.phase === "RESULTS";
      // Spectators see neither the location nor the spy role; they're just observers.
      // Location is revealed to everyone in RESULTS via `actualLocation`.
      spyfallRound = {
        myRole: isSpectator ? "SPECTATOR" : isSpy ? "SPY" : "PLAYER",
        myLocation: isSpectator || isSpy ? undefined : this.round.location,
        myLocationRole:
          isSpectator || isSpy ? undefined : this.round.rolesByPlayer.get(viewerId),
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

// ---------------- Flip 7 ----------------

interface Flip7Round {
  roundNumber: number;
  deck: Flip7Card[];
  discard: Flip7Card[];
  turnOrder: PlayerId[];
  currentPlayerIndex: number;
  hands: Map<PlayerId, Flip7Hand>;
  awaiting: Flip7Awaiting;
  flipThree?: { targetId: PlayerId; remaining: number };
  initialDealIndex?: number; // server-internal: position in turn order being dealt to
  recentEvents: Flip7Event[];
  roundEndsAt?: number;
}

const MODIFIER_VALUES: Record<Flip7Modifier, number> = {
  "+2": 2, "+4": 4, "+6": 6, "+8": 8, "+10": 10, "x2": 0, // x2 handled separately
};

function computeRoundScore(hand: Flip7Hand): number {
  if (hand.status === "BUSTED") return 0;
  let numbers = hand.numbers.reduce((s, n) => s + n, 0);
  let bonus = 0;
  for (const m of hand.modifiers) {
    if (m === "x2") numbers *= 2;
    else bonus += MODIFIER_VALUES[m];
  }
  if (hand.status === "FLIPPED_SEVEN") bonus += 15;
  return numbers + bonus;
}

export class Flip7Room extends RoomBase {
  readonly gameType = "flip7" as const;
  readonly minPlayers = MIN_PLAYERS_FLIP7;
  targetScore = FLIP7_DEFAULT_TARGET;
  round?: Flip7Round;
  gameWinnerId?: PlayerId;
  chat: ChatMsg[] = [];

  startGame(by: PlayerId): { ok: boolean; error?: string } {
    if (by !== this.hostId) return { ok: false, error: "Only the host can start" };
    if (this.phase !== "LOBBY") return { ok: false, error: "Game already started" };
    const connected = [...this.players.values()].filter((p) => p.connected);
    if (connected.length < this.minPlayers) {
      return { ok: false, error: `Need at least ${this.minPlayers} players` };
    }
    for (const p of this.players.values()) p.score = 0;
    this.gameWinnerId = undefined;
    this.chat = [];
    this.beginRound(1);
    return { ok: true };
  }

  setTargetScore(by: PlayerId, value: number): { ok: boolean; error?: string } {
    if (by !== this.hostId) return { ok: false, error: "Only the host can change target" };
    if (this.phase !== "LOBBY") return { ok: false, error: "Game already started" };
    if (!FLIP7_TARGET_SCORES.includes(value as 50 | 100 | 200)) {
      return { ok: false, error: "Invalid target score" };
    }
    this.targetScore = value;
    this.emitChange();
    return { ok: true };
  }

  nextGame(by: PlayerId): { ok: boolean; error?: string } {
    if (by !== this.hostId) return { ok: false, error: "Only the host can reset" };
    if (this.phase !== "GAME_OVER") return { ok: false, error: "Game still in progress" };
    for (const p of this.players.values()) p.score = 0;
    this.round = undefined;
    this.gameWinnerId = undefined;
    this.chat = [];
    this.promoteSpectators();
    this.phase = "LOBBY";
    this.clearTimer();
    this.emitChange();
    return { ok: true };
  }

  override postChat(playerId: PlayerId, text: string): { ok: boolean; error?: string } {
    if (this.phase !== "ROUND" && this.phase !== "ROUND_END" && this.phase !== "GAME_OVER") {
      return { ok: false, error: "Chat is only available during the game" };
    }
    const player = this.players.get(playerId);
    if (!player) return { ok: false, error: "Not in this room" };
    const trimmed = sanitizeText(text, MAX_CHAT_LEN).trim();
    if (!trimmed) return { ok: false, error: "Empty message" };
    this.chat.push({
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      playerId,
      playerName: player.name,
      text: trimmed,
      ts: Date.now(),
    });
    this.emitChange();
    return { ok: true };
  }

  hit(playerId: PlayerId): { ok: boolean; error?: string } {
    if (!this.round) return { ok: false, error: "No active round" };
    const a = this.round.awaiting;
    if (a.kind !== "DECISION" || a.playerId !== playerId) {
      return { ok: false, error: "Not your turn" };
    }
    this.clearTimer();
    this.drawAndApply(playerId);
    return { ok: true };
  }

  stay(playerId: PlayerId): { ok: boolean; error?: string } {
    if (!this.round) return { ok: false, error: "No active round" };
    const a = this.round.awaiting;
    if (a.kind !== "DECISION" || a.playerId !== playerId) {
      return { ok: false, error: "Not your turn" };
    }
    this.clearTimer();
    const hand = this.round.hands.get(playerId)!;
    hand.status = "STAYED";
    hand.roundScore = computeRoundScore(hand);
    this.logEvent(`${this.nameOf(playerId)} stayed`);
    this.advanceAfterPlayerDone();
    return { ok: true };
  }

  target(playerId: PlayerId, targetId: PlayerId): { ok: boolean; error?: string } {
    if (!this.round) return { ok: false, error: "No active round" };
    const a = this.round.awaiting;
    if (a.kind !== "TARGET" || a.actorId !== playerId) {
      return { ok: false, error: "Not waiting on your target choice" };
    }
    if (!this.players.has(targetId)) return { ok: false, error: "Invalid target" };
    if (a.cardKind === "GIVE_SC") {
      const targetHand = this.round.hands.get(targetId);
      if (!targetHand || targetHand.status !== "ACTIVE" || targetHand.hasSecondChance || targetId === playerId) {
        return { ok: false, error: "Invalid target for Second Chance" };
      }
    } else {
      const targetHand = this.round.hands.get(targetId);
      if (!targetHand || targetHand.status !== "ACTIVE") {
        return { ok: false, error: "Target is not active" };
      }
    }
    this.clearTimer();
    this.applyTarget(a.cardKind, playerId, targetId);
    return { ok: true };
  }

  private beginRound(roundNumber: number) {
    const playing = this.playingPlayers();
    const turnOrder = playing.map((p) => p.id);
    shuffleInPlace(turnOrder);
    const deck = buildDeck();
    shuffleInPlace(deck);
    const hands = new Map<PlayerId, Flip7Hand>();
    for (const p of playing) {
      hands.set(p.id, {
        numbers: [],
        modifiers: [],
        hasSecondChance: false,
        status: "ACTIVE",
        roundScore: 0,
      });
    }
    this.round = {
      roundNumber,
      deck,
      discard: [],
      turnOrder,
      currentPlayerIndex: 0,
      hands,
      awaiting: { kind: "FORCED_DRAWING", targetId: turnOrder[0] },
      recentEvents: [],
      initialDealIndex: 0,
    };
    this.phase = "ROUND";
    this.logEvent(`Round ${roundNumber} begins — dealing one card to each player`);
    this.scheduleInitialDeal();
  }

  private scheduleInitialDeal() {
    if (!this.round) return;
    // Skip players who became non-ACTIVE before their initial card (e.g. an
    // earlier dealt FREEZE landed on them).
    while (
      this.round.initialDealIndex !== undefined &&
      this.round.initialDealIndex < this.round.turnOrder.length
    ) {
      const candidateId = this.round.turnOrder[this.round.initialDealIndex];
      const hand = this.round.hands.get(candidateId);
      if (hand?.status === "ACTIVE") break;
      this.round.initialDealIndex++;
    }
    if (
      this.round.initialDealIndex === undefined ||
      this.round.initialDealIndex >= this.round.turnOrder.length
    ) {
      // Done dealing — start regular play.
      this.round.initialDealIndex = undefined;
      this.beginCurrentPlayerDecision();
      return;
    }
    const targetId = this.round.turnOrder[this.round.initialDealIndex];
    this.round.awaiting = { kind: "FORCED_DRAWING", targetId };
    this.clearTimer();
    this.timer = setTimeout(() => {
      this.drawAndApply(targetId);
    }, FLIP7_FORCED_DRAW_MS);
    this.emitChange();
  }

  private advanceInitialDeal() {
    if (!this.round) return;
    this.round.initialDealIndex = (this.round.initialDealIndex ?? 0) + 1;
    this.scheduleInitialDeal();
  }

  private startDecisionTimer() {
    this.clearTimer();
    this.timer = setTimeout(() => {
      if (!this.round) return;
      const a = this.round.awaiting;
      if (a.kind !== "DECISION") return;
      const hand = this.round.hands.get(a.playerId);
      if (!hand) return;
      hand.status = "STAYED";
      hand.roundScore = computeRoundScore(hand);
      this.logEvent(`${this.nameOf(a.playerId)} timed out — auto-stay`);
      this.advanceAfterPlayerDone();
    }, FLIP7_DECISION_SECONDS * 1000);
  }

  private startTargetTimer() {
    this.clearTimer();
    this.timer = setTimeout(() => {
      if (!this.round) return;
      const a = this.round.awaiting;
      if (a.kind !== "TARGET") return;
      let target: PlayerId | undefined;
      if (a.cardKind === "GIVE_SC") {
        const eligible = [...this.round.hands.entries()].find(
          ([id, h]) => id !== a.actorId && h.status === "ACTIVE" && !h.hasSecondChance
        );
        target = eligible?.[0];
      } else {
        target = a.actorId;
      }
      if (target) {
        this.logEvent(`${this.nameOf(a.actorId)} idled — auto-targeted ${this.nameOf(target)}`);
        this.applyTarget(a.cardKind, a.actorId, target);
      } else {
        this.logEvent(`${this.nameOf(a.actorId)} idled — Second Chance discarded`);
        this.resumeAfterAction(a.actorId);
      }
    }, FLIP7_TARGET_SECONDS * 1000);
  }

  private drawCardFromDeck(): Flip7Card | undefined {
    if (!this.round) return undefined;
    if (this.round.deck.length === 0) {
      if (this.round.discard.length === 0) return undefined;
      this.round.deck = this.round.discard;
      this.round.discard = [];
      shuffleInPlace(this.round.deck);
      this.logEvent("Deck reshuffled");
    }
    return this.round.deck.pop();
  }

  private drawAndApply(drawerId: PlayerId) {
    if (!this.round) return;
    const card = this.drawCardFromDeck();
    if (!card) {
      // Defensive: deck and discard both empty. End round.
      this.endRound("ALL_STOPPED");
      return;
    }
    const hand = this.round.hands.get(drawerId);
    if (!hand) return;

    if (card.kind === "number") {
      if (hand.numbers.includes(card.value)) {
        // Bust check
        if (hand.hasSecondChance) {
          hand.hasSecondChance = false;
          this.round.discard.push(card);
          this.logEvent(`${this.nameOf(drawerId)} would bust on ${card.value} — Second Chance saves them`);
          hand.roundScore = computeRoundScore(hand);
          this.continueAfterDraw(drawerId);
        } else {
          hand.status = "BUSTED";
          hand.bustedOn = card.value;
          hand.roundScore = 0;
          this.round.discard.push(card);
          this.logEvent(`${this.nameOf(drawerId)} BUSTED on duplicate ${card.value}`);
          this.handleDrawerStopped(drawerId);
        }
      } else {
        hand.numbers.push(card.value);
        if (hand.numbers.length === 7) {
          hand.status = "FLIPPED_SEVEN";
          hand.roundScore = computeRoundScore(hand);
          this.logEvent(`${this.nameOf(drawerId)} FLIPPED 7! Round ends.`);
          // Force any other ACTIVE players to bank their current scores (they "stayed by force").
          for (const [id, h] of this.round.hands) {
            if (id !== drawerId && h.status === "ACTIVE") {
              h.status = "STAYED";
              h.roundScore = computeRoundScore(h);
            }
          }
          this.endRound("FLIP_7");
        } else {
          hand.roundScore = computeRoundScore(hand);
          this.continueAfterDraw(drawerId);
        }
      }
    } else if (card.kind === "modifier") {
      hand.modifiers.push(card.modifier);
      hand.roundScore = computeRoundScore(hand);
      this.logEvent(`${this.nameOf(drawerId)} drew ${card.modifier}`);
      this.continueAfterDraw(drawerId);
    } else {
      // Action card — does NOT consume the turn (decision B).
      this.handleActionDraw(drawerId, card.action);
    }
  }

  private continueAfterDraw(drawerId: PlayerId) {
    if (!this.round) return;
    if (this.round.flipThree && this.round.flipThree.targetId === drawerId) {
      this.continueFlipThreeSequence();
    } else if (this.round.initialDealIndex !== undefined) {
      this.advanceInitialDeal();
    } else {
      // Round-robin: one card per turn, then advance.
      this.advanceAfterPlayerDone();
    }
  }

  private continueFlipThreeSequence() {
    if (!this.round?.flipThree) return;
    this.round.flipThree.remaining -= 1;
    const targetId = this.round.flipThree.targetId;
    const targetHand = this.round.hands.get(targetId);
    const targetCanContinue = targetHand?.status === "ACTIVE";
    if (this.round.flipThree.remaining <= 0 || !targetCanContinue) {
      if (!targetCanContinue && this.round.flipThree.remaining > 0) {
        this.logEvent(
          `Flip Three on ${this.nameOf(targetId)} ends — they are no longer active`
        );
      }
      this.round.flipThree = undefined;
      if (this.round.initialDealIndex !== undefined) {
        this.advanceInitialDeal();
      } else {
        this.advanceAfterPlayerDone();
      }
    } else {
      this.scheduleForcedDraw();
    }
  }

  private handleDrawerStopped(drawerId: PlayerId) {
    if (!this.round) return;
    if (this.round.flipThree && this.round.flipThree.targetId === drawerId) {
      // Sequence stops: target busted (or otherwise can't continue).
      this.round.flipThree = undefined;
    }
    if (this.round.initialDealIndex !== undefined) {
      this.advanceInitialDeal();
      return;
    }
    this.advanceAfterPlayerDone();
  }

  private handleActionDraw(actorId: PlayerId, kind: "FREEZE" | "FLIP3" | "SECOND_CHANCE") {
    if (!this.round) return;
    if (kind === "FREEZE" || kind === "FLIP3") {
      this.logEvent(`${this.nameOf(actorId)} drew ${kind === "FREEZE" ? "Freeze" : "Flip Three"}`);
      this.round.awaiting = {
        kind: "TARGET",
        actorId,
        cardKind: kind,
        deadline: Date.now() + FLIP7_TARGET_SECONDS * 1000,
      };
      this.startTargetTimer();
      this.emitChange();
      return;
    }
    // SECOND_CHANCE
    const hand = this.round.hands.get(actorId)!;
    if (!hand.hasSecondChance) {
      hand.hasSecondChance = true;
      this.logEvent(`${this.nameOf(actorId)} drew Second Chance`);
      this.continueAfterDraw(actorId);
      return;
    }
    // Already has one — must give to another active player without one
    const eligible = [...this.round.hands.entries()].find(
      ([id, h]) => id !== actorId && h.status === "ACTIVE" && !h.hasSecondChance
    );
    if (!eligible) {
      this.logEvent(`${this.nameOf(actorId)} drew Second Chance — no eligible recipient, discarded`);
      this.continueAfterDraw(actorId);
      return;
    }
    this.logEvent(`${this.nameOf(actorId)} drew Second Chance — must give it away`);
    this.round.awaiting = {
      kind: "TARGET",
      actorId,
      cardKind: "GIVE_SC",
      deadline: Date.now() + FLIP7_TARGET_SECONDS * 1000,
    };
    this.startTargetTimer();
    this.emitChange();
  }

  private applyTarget(
    cardKind: "FREEZE" | "FLIP3" | "GIVE_SC",
    actorId: PlayerId,
    targetId: PlayerId
  ) {
    if (!this.round) return;
    if (cardKind === "FREEZE") {
      const target = this.round.hands.get(targetId)!;
      target.status = "FROZEN";
      target.roundScore = computeRoundScore(target);
      this.logEvent(`${this.nameOf(actorId)} froze ${this.nameOf(targetId)}`);
      this.resumeAfterAction(actorId);
    } else if (cardKind === "FLIP3") {
      this.logEvent(`${this.nameOf(actorId)} Flip-Three'd ${this.nameOf(targetId)}`);
      this.round.flipThree = { targetId, remaining: 3 };
      this.scheduleForcedDraw();
    } else {
      // GIVE_SC
      const target = this.round.hands.get(targetId)!;
      target.hasSecondChance = true;
      this.logEvent(`${this.nameOf(actorId)} gave Second Chance to ${this.nameOf(targetId)}`);
      this.resumeAfterAction(actorId);
    }
  }

  private resumeAfterAction(actorId: PlayerId) {
    if (!this.round) return;
    // The action card draw counts as the actor's draw for this turn / sequence slot.
    if (this.round.flipThree && this.round.flipThree.targetId === actorId) {
      // Action card was drawn during a Flip Three forced sequence — count it.
      this.continueFlipThreeSequence();
    } else if (this.round.initialDealIndex !== undefined) {
      this.advanceInitialDeal();
    } else {
      // Round-robin: action card resolved → turn passes.
      this.advanceAfterPlayerDone();
    }
  }

  private scheduleForcedDraw() {
    if (!this.round || !this.round.flipThree) return;
    const targetId = this.round.flipThree.targetId;
    this.round.awaiting = { kind: "FORCED_DRAWING", targetId };
    this.clearTimer();
    this.timer = setTimeout(() => {
      this.drawAndApply(targetId);
    }, FLIP7_FORCED_DRAW_MS);
    this.emitChange();
  }

  private beginDecisionFor(playerId: PlayerId) {
    if (!this.round) return;
    const hand = this.round.hands.get(playerId);
    if (!hand || hand.status !== "ACTIVE") {
      // Player can no longer act — advance turn instead.
      this.advanceAfterPlayerDone();
      return;
    }
    this.round.awaiting = {
      kind: "DECISION",
      playerId,
      deadline: Date.now() + FLIP7_DECISION_SECONDS * 1000,
    };
    this.startDecisionTimer();
    this.emitChange();
  }

  private beginCurrentPlayerDecision() {
    if (!this.round) return;
    const turnHolder = this.round.turnOrder[this.round.currentPlayerIndex];
    this.beginDecisionFor(turnHolder);
  }

  private advanceAfterPlayerDone() {
    if (!this.round) return;
    if (!this.anyoneActive()) {
      this.endRound("ALL_STOPPED");
      return;
    }
    this.advanceTurn();
  }

  private anyoneActive(): boolean {
    if (!this.round) return false;
    for (const h of this.round.hands.values()) if (h.status === "ACTIVE") return true;
    return false;
  }

  private advanceTurn() {
    if (!this.round) return;
    for (let step = 0; step < this.round.turnOrder.length; step++) {
      this.round.currentPlayerIndex =
        (this.round.currentPlayerIndex + 1) % this.round.turnOrder.length;
      const id = this.round.turnOrder[this.round.currentPlayerIndex];
      const hand = this.round.hands.get(id);
      if (hand?.status === "ACTIVE") {
        this.beginDecisionFor(id);
        return;
      }
    }
    this.endRound("ALL_STOPPED");
  }

  private endRound(_reason: "FLIP_7" | "ALL_STOPPED") {
    if (!this.round) return;
    this.clearTimer();
    // Finalize round scores (for any still-ACTIVE players being banked)
    for (const [id, hand] of this.round.hands) {
      if (hand.status === "ACTIVE") {
        hand.status = "STAYED";
      }
      hand.roundScore = computeRoundScore(hand);
      const player = this.players.get(id);
      if (player) player.score += hand.roundScore;
    }
    this.logEvent(`Round ${this.round.roundNumber} complete`);
    // Winner check
    let winnerId: PlayerId | undefined;
    let topScore = -1;
    for (const p of this.players.values()) {
      if (p.score >= this.targetScore && p.score > topScore) {
        topScore = p.score;
        winnerId = p.id;
      }
    }
    if (winnerId) {
      this.gameWinnerId = winnerId;
      this.phase = "GAME_OVER";
      this.emitChange();
      return;
    }
    // Otherwise schedule next round
    this.round.roundEndsAt = Date.now() + FLIP7_ROUND_END_SECONDS * 1000;
    this.phase = "ROUND_END";
    this.emitChange();
    this.timer = setTimeout(() => {
      const next = (this.round?.roundNumber ?? 0) + 1;
      this.beginRound(next);
    }, FLIP7_ROUND_END_SECONDS * 1000);
  }

  private logEvent(text: string) {
    if (!this.round) return;
    this.round.recentEvents.push({ ts: Date.now(), text });
    if (this.round.recentEvents.length > FLIP7_RECENT_EVENTS) {
      this.round.recentEvents.shift();
    }
  }

  private nameOf(id: PlayerId): string {
    return this.players.get(id)?.name ?? "?";
  }

  publicStateFor(viewerId: PlayerId): RoomStatePublic {
    const base = this.baseStateFor(viewerId);
    let flip7Round: Flip7RoundPublic | undefined;
    if (this.round) {
      const hands: Record<PlayerId, Flip7Hand> = {};
      for (const [id, h] of this.round.hands) {
        hands[id] = {
          numbers: [...h.numbers],
          modifiers: [...h.modifiers],
          hasSecondChance: h.hasSecondChance,
          status: h.status,
          roundScore: h.roundScore,
          bustedOn: h.bustedOn,
        };
      }
      const roundOverIn =
        this.phase === "ROUND_END" && this.round.roundEndsAt
          ? Math.max(0, this.round.roundEndsAt - Date.now())
          : undefined;
      flip7Round = {
        roundNumber: this.round.roundNumber,
        targetScore: this.targetScore,
        turnOrder: [...this.round.turnOrder],
        currentPlayerIndex: this.round.currentPlayerIndex,
        hands,
        awaiting: this.round.awaiting,
        flipThree: this.round.flipThree
          ? { targetId: this.round.flipThree.targetId, remaining: this.round.flipThree.remaining }
          : undefined,
        deckRemaining: this.round.deck.length + this.round.discard.length,
        recentEvents: [...this.round.recentEvents],
        chat: [...this.chat],
        roundOverIn,
        gameWinnerId: this.phase === "GAME_OVER" ? this.gameWinnerId : undefined,
      };
    }
    return {
      ...base,
      flip7Round,
      flip7TargetScore: this.targetScore,
    };
  }
}

// ---------------- Tee K.O. ----------------

interface TeekoDrawing {
  id: string;
  authorId: PlayerId;
  strokes: DrawingStroke[];
}

interface TeekoSlogan {
  id: string;
  authorId: PlayerId;
  text: string;
}

interface TeekoShirt {
  id: string;
  composerId: PlayerId;
  drawingId: string;
  sloganId: string;
}

interface TeekoMatchup {
  byeShirtId?: string;
  leftShirtId?: string;
  rightShirtId?: string;
  votes: Map<PlayerId, "LEFT" | "RIGHT">;
  leftCount: number;
  rightCount: number;
  revealed: boolean;
  winner?: "LEFT" | "RIGHT";
}

interface TeekoBracketRound {
  matchups: TeekoMatchup[];
  currentIndex: number;
}

interface TeekoRound {
  drawings: Map<string, TeekoDrawing>;
  slogans: Map<string, TeekoSlogan>;
  drawingsByPlayer: Map<PlayerId, string[]>;
  slogansByPlayer: Map<PlayerId, string[]>;
  hands: Map<PlayerId, { drawingIds: string[]; sloganIds: string[] }>;
  shirts: Map<string, TeekoShirt>;
  shirtsByPlayer: Map<PlayerId, string[]>;
  bracket?: { rounds: TeekoBracketRound[]; currentRoundIndex: number; totalRounds: number };
  champion?: { shirtId: string };
  phaseEndsAt: number;
}

function sanitizeStrokes(input: unknown): DrawingStroke[] | null {
  if (!Array.isArray(input)) return null;
  if (input.length > MAX_DRAWING_STROKES) return null;
  let totalPoints = 0;
  const out: DrawingStroke[] = [];
  for (const raw of input) {
    if (!raw || typeof raw !== "object") return null;
    const s = raw as Partial<DrawingStroke>;
    if (typeof s.color !== "string" || !/^#[0-9a-fA-F]{6}$/.test(s.color)) return null;
    if (typeof s.width !== "number" || s.width <= 0 || s.width > 50) return null;
    if (!Array.isArray(s.points) || s.points.length === 0) return null;
    totalPoints += s.points.length;
    if (totalPoints > MAX_DRAWING_POINTS) return null;
    const points: { x: number; y: number }[] = [];
    for (const p of s.points) {
      if (!p || typeof p !== "object") return null;
      const x = (p as { x?: number }).x;
      const y = (p as { y?: number }).y;
      if (typeof x !== "number" || typeof y !== "number") return null;
      if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
      points.push({ x, y });
    }
    out.push({ color: s.color, width: s.width, points });
  }
  return out;
}

function pickRandomFrom<T>(pool: T[], count: number): T[] {
  if (pool.length === 0) return [];
  const out: T[] = [];
  if (pool.length >= count) {
    // Sample without replacement.
    const copy = pool.slice();
    shuffleInPlace(copy);
    return copy.slice(0, count);
  }
  // With replacement when pool too small.
  for (let i = 0; i < count; i++) {
    out.push(pool[Math.floor(Math.random() * pool.length)]);
  }
  return out;
}

export class TeekoRoom extends RoomBase {
  readonly gameType = "teeko" as const;
  readonly minPlayers = MIN_PLAYERS_TEEKO;
  round?: TeekoRound;

  startGame(by: PlayerId): { ok: boolean; error?: string } {
    if (by !== this.hostId) return { ok: false, error: "Only the host can start" };
    if (this.phase !== "LOBBY") return { ok: false, error: "Game already started" };
    const connected = [...this.players.values()].filter((p) => p.connected);
    if (connected.length < this.minPlayers) {
      return { ok: false, error: `Need at least ${this.minPlayers} players` };
    }
    this.round = {
      drawings: new Map(),
      slogans: new Map(),
      drawingsByPlayer: new Map(),
      slogansByPlayer: new Map(),
      hands: new Map(),
      shirts: new Map(),
      shirtsByPlayer: new Map(),
      phaseEndsAt: Date.now() + TEEKO_DRAWING_SECONDS * 1000,
    };
    this.setPhase("DRAWING", TEEKO_DRAWING_SECONDS, () => this.endDrawingPhase());
    return { ok: true };
  }

  submitDrawing(playerId: PlayerId, strokesInput: unknown): { ok: boolean; error?: string } {
    if (!this.round) return { ok: false, error: "No active round" };
    if (this.phase !== "DRAWING") return { ok: false, error: "Not the drawing phase" };
    if (!this.isPlaying(playerId)) return { ok: false, error: "Spectators can't draw" };
    const strokes = sanitizeStrokes(strokesInput);
    if (!strokes || strokes.length === 0) return { ok: false, error: "Invalid drawing" };
    const id = randomUUID();
    this.round.drawings.set(id, { id, authorId: playerId, strokes });
    const list = this.round.drawingsByPlayer.get(playerId) ?? [];
    list.push(id);
    this.round.drawingsByPlayer.set(playerId, list);
    this.emitChange();
    return { ok: true };
  }

  submitSlogan(playerId: PlayerId, text: string): { ok: boolean; error?: string } {
    if (!this.round) return { ok: false, error: "No active round" };
    if (this.phase !== "WRITING") return { ok: false, error: "Not the writing phase" };
    if (!this.isPlaying(playerId)) return { ok: false, error: "Spectators can't write slogans" };
    const trimmed = sanitizeText(text, MAX_SLOGAN_LEN).trim();
    if (!trimmed) return { ok: false, error: "Slogan cannot be empty" };
    const id = randomUUID();
    this.round.slogans.set(id, { id, authorId: playerId, text: trimmed });
    const list = this.round.slogansByPlayer.get(playerId) ?? [];
    list.push(id);
    this.round.slogansByPlayer.set(playerId, list);
    this.emitChange();
    return { ok: true };
  }

  submitShirts(
    playerId: PlayerId,
    shirts: { drawingId: string; sloganId: string }[]
  ): { ok: boolean; error?: string } {
    if (!this.round) return { ok: false, error: "No active round" };
    if (this.phase !== "COMPOSING") return { ok: false, error: "Not the composing phase" };
    const hand = this.round.hands.get(playerId);
    if (!hand) return { ok: false, error: "You're not composing this round" };
    if (this.round.shirtsByPlayer.has(playerId)) {
      return { ok: false, error: "Already submitted" };
    }
    if (!Array.isArray(shirts) || shirts.length === 0 || shirts.length > TEEKO_SHIRTS_PER_PLAYER) {
      return { ok: false, error: "Invalid shirts payload" };
    }
    const usedDrawings = new Set<string>();
    const usedSlogans = new Set<string>();
    for (const s of shirts) {
      if (!s || typeof s.drawingId !== "string" || typeof s.sloganId !== "string") {
        return { ok: false, error: "Invalid shirt entry" };
      }
      if (!hand.drawingIds.includes(s.drawingId)) return { ok: false, error: "Drawing not in your hand" };
      if (!hand.sloganIds.includes(s.sloganId)) return { ok: false, error: "Slogan not in your hand" };
      if (usedDrawings.has(s.drawingId)) return { ok: false, error: "Drawing used twice" };
      if (usedSlogans.has(s.sloganId)) return { ok: false, error: "Slogan used twice" };
      usedDrawings.add(s.drawingId);
      usedSlogans.add(s.sloganId);
    }
    const created: string[] = [];
    for (const s of shirts) {
      const id = randomUUID();
      this.round.shirts.set(id, { id, composerId: playerId, drawingId: s.drawingId, sloganId: s.sloganId });
      created.push(id);
    }
    this.round.shirtsByPlayer.set(playerId, created);
    this.emitChange();
    // Advance early if every composer has submitted.
    const composers = [...this.round.hands.keys()];
    if (composers.every((id) => this.round!.shirtsByPlayer.has(id))) {
      this.endComposingPhase();
    }
    return { ok: true };
  }

  vote(playerId: PlayerId, side: "LEFT" | "RIGHT"): { ok: boolean; error?: string } {
    if (!this.round?.bracket) return { ok: false, error: "No bracket" };
    if (this.phase !== "BRACKET") return { ok: false, error: "Not voting right now" };
    if (!this.isPlaying(playerId)) return { ok: false, error: "Spectators can't vote" };
    const matchup = this.currentMatchup();
    if (!matchup || matchup.revealed || matchup.byeShirtId) {
      return { ok: false, error: "Not voting on this matchup" };
    }
    const targetShirtId = side === "LEFT" ? matchup.leftShirtId : matchup.rightShirtId;
    if (targetShirtId && this.didContribute(playerId, targetShirtId)) {
      return { ok: false, error: "Can't vote for your own creation" };
    }
    const prev = matchup.votes.get(playerId);
    if (prev === side) return { ok: true };
    if (prev === "LEFT") matchup.leftCount--;
    else if (prev === "RIGHT") matchup.rightCount--;
    matchup.votes.set(playerId, side);
    if (side === "LEFT") matchup.leftCount++;
    else matchup.rightCount++;
    this.emitChange();
    // Reveal early if every eligible voter has voted (skip those who can't vote at all).
    const connected = [...this.players.values()].filter((p) => p.connected);
    const eligible = connected.filter((p) => this.canVote(p.id, matchup));
    if (matchup.votes.size >= eligible.length) this.revealCurrentMatchup();
    return { ok: true };
  }

  private didContribute(playerId: PlayerId, shirtId: string): boolean {
    if (!this.round) return false;
    const shirt = this.round.shirts.get(shirtId);
    if (!shirt) return false;
    if (shirt.composerId === playerId) return true;
    const drawing = this.round.drawings.get(shirt.drawingId);
    if (drawing?.authorId === playerId) return true;
    const slogan = this.round.slogans.get(shirt.sloganId);
    if (slogan?.authorId === playerId) return true;
    return false;
  }

  private canVote(playerId: PlayerId, matchup: TeekoMatchup): boolean {
    if (matchup.byeShirtId) return false;
    if (!this.isPlaying(playerId)) return false;
    const leftMine = matchup.leftShirtId
      ? this.didContribute(playerId, matchup.leftShirtId)
      : true;
    const rightMine = matchup.rightShirtId
      ? this.didContribute(playerId, matchup.rightShirtId)
      : true;
    return !(leftMine && rightMine);
  }

  nextGame(by: PlayerId): { ok: boolean; error?: string } {
    if (by !== this.hostId) return { ok: false, error: "Only the host can reset" };
    if (this.phase !== "CHAMPION") return { ok: false, error: "Game still in progress" };
    this.round = undefined;
    this.promoteSpectators();
    this.phase = "LOBBY";
    this.clearTimer();
    this.emitChange();
    return { ok: true };
  }

  // ----- phase transitions -----

  private endDrawingPhase() {
    if (!this.round || this.phase !== "DRAWING") return;
    this.round.phaseEndsAt = Date.now() + TEEKO_WRITING_SECONDS * 1000;
    this.setPhase("WRITING", TEEKO_WRITING_SECONDS, () => this.endWritingPhase());
  }

  private endWritingPhase() {
    if (!this.round || this.phase !== "WRITING") return;
    if (this.round.drawings.size === 0 || this.round.slogans.size === 0) {
      // Nothing to compose with — bail.
      this.round = undefined;
      this.phase = "LOBBY";
      this.clearTimer();
      this.emitChange();
      return;
    }
    this.dealHands();
    this.round.phaseEndsAt = Date.now() + TEEKO_COMPOSING_SECONDS * 1000;
    this.setPhase("COMPOSING", TEEKO_COMPOSING_SECONDS, () => this.endComposingPhase());
  }

  private dealHands() {
    if (!this.round) return;
    const allDrawingIds = [...this.round.drawings.keys()];
    const allSloganIds = [...this.round.slogans.keys()];
    const composers = [...this.players.values()].filter(
      (p) => p.connected && (this.round!.drawingsByPlayer.get(p.id)?.length ?? 0) > 0
    );
    for (const composer of composers) {
      // Prefer dealing items NOT authored by the composer; fall back to all if needed.
      const ownDrawings = new Set(this.round.drawingsByPlayer.get(composer.id) ?? []);
      const ownSlogans = new Set(this.round.slogansByPlayer.get(composer.id) ?? []);
      const otherDrawings = allDrawingIds.filter((id) => !ownDrawings.has(id));
      const otherSlogans = allSloganIds.filter((id) => !ownSlogans.has(id));
      const drawingPool = otherDrawings.length >= TEEKO_HAND_DRAWINGS ? otherDrawings : allDrawingIds;
      const sloganPool = otherSlogans.length >= TEEKO_HAND_SLOGANS ? otherSlogans : allSloganIds;
      this.round.hands.set(composer.id, {
        drawingIds: pickRandomFrom(drawingPool, TEEKO_HAND_DRAWINGS),
        sloganIds: pickRandomFrom(sloganPool, TEEKO_HAND_SLOGANS),
      });
    }
  }

  private endComposingPhase() {
    if (!this.round || this.phase !== "COMPOSING") return;
    // Auto-fill any composer who hasn't submitted.
    for (const [composerId, hand] of this.round.hands) {
      if (this.round.shirtsByPlayer.has(composerId)) continue;
      if (hand.drawingIds.length === 0 || hand.sloganIds.length === 0) continue;
      const created: string[] = [];
      const id1 = randomUUID();
      this.round.shirts.set(id1, {
        id: id1,
        composerId,
        drawingId: hand.drawingIds[0],
        sloganId: hand.sloganIds[0],
      });
      created.push(id1);
      if (hand.drawingIds.length >= 2 && hand.sloganIds.length >= 2) {
        const id2 = randomUUID();
        this.round.shirts.set(id2, {
          id: id2,
          composerId,
          drawingId: hand.drawingIds[1],
          sloganId: hand.sloganIds[1],
        });
        created.push(id2);
      }
      this.round.shirtsByPlayer.set(composerId, created);
    }
    if (this.round.shirts.size === 0) {
      this.round = undefined;
      this.phase = "LOBBY";
      this.clearTimer();
      this.emitChange();
      return;
    }
    this.buildBracket();
  }

  private buildBracket() {
    if (!this.round) return;
    const shirtIds = [...this.round.shirts.keys()];
    shuffleInPlace(shirtIds);
    const matchups = this.pairToMatchups(shirtIds);
    const totalRounds = Math.max(1, Math.ceil(Math.log2(shirtIds.length)));
    this.round.bracket = {
      rounds: [{ matchups, currentIndex: 0 }],
      currentRoundIndex: 0,
      totalRounds,
    };
    this.phase = "BRACKET";
    this.startCurrentMatchup();
  }

  private pairToMatchups(shirtIds: string[]): TeekoMatchup[] {
    const out: TeekoMatchup[] = [];
    for (let i = 0; i < shirtIds.length; i += 2) {
      if (i + 1 < shirtIds.length) {
        out.push({
          leftShirtId: shirtIds[i],
          rightShirtId: shirtIds[i + 1],
          votes: new Map(),
          leftCount: 0,
          rightCount: 0,
          revealed: false,
        });
      } else {
        out.push({
          byeShirtId: shirtIds[i],
          votes: new Map(),
          leftCount: 0,
          rightCount: 0,
          revealed: true,
        });
      }
    }
    return out;
  }

  private currentMatchup(): TeekoMatchup | undefined {
    const b = this.round?.bracket;
    if (!b) return undefined;
    const round = b.rounds[b.currentRoundIndex];
    return round?.matchups[round.currentIndex];
  }

  private startCurrentMatchup() {
    if (!this.round?.bracket) return;
    const matchup = this.currentMatchup();
    if (!matchup) return;
    if (matchup.byeShirtId) {
      this.round.phaseEndsAt = Date.now() + TEEKO_BYE_REVEAL_SECONDS * 1000;
      this.clearTimer();
      this.timer = setTimeout(() => this.advanceToNextMatchup(), TEEKO_BYE_REVEAL_SECONDS * 1000);
      this.emitChange();
      return;
    }
    matchup.revealed = false;
    matchup.winner = undefined;
    matchup.votes.clear();
    matchup.leftCount = 0;
    matchup.rightCount = 0;
    this.round.phaseEndsAt = Date.now() + TEEKO_MATCHUP_VOTE_SECONDS * 1000;
    this.clearTimer();
    this.timer = setTimeout(() => this.revealCurrentMatchup(), TEEKO_MATCHUP_VOTE_SECONDS * 1000);
    this.emitChange();
  }

  private revealCurrentMatchup() {
    if (!this.round?.bracket) return;
    const matchup = this.currentMatchup();
    if (!matchup || matchup.revealed) return;
    matchup.revealed = true;
    if (matchup.leftCount === matchup.rightCount) {
      matchup.winner = Math.random() < 0.5 ? "LEFT" : "RIGHT";
    } else {
      matchup.winner = matchup.leftCount > matchup.rightCount ? "LEFT" : "RIGHT";
    }
    this.round.phaseEndsAt = Date.now() + TEEKO_MATCHUP_REVEAL_SECONDS * 1000;
    this.clearTimer();
    this.timer = setTimeout(
      () => this.advanceToNextMatchup(),
      TEEKO_MATCHUP_REVEAL_SECONDS * 1000
    );
    this.emitChange();
  }

  private advanceToNextMatchup() {
    if (!this.round?.bracket) return;
    const bracket = this.round.bracket;
    const round = bracket.rounds[bracket.currentRoundIndex];
    round.currentIndex++;
    if (round.currentIndex < round.matchups.length) {
      this.startCurrentMatchup();
      return;
    }
    // Round done: collect winners and either build next round or crown a champion.
    const winners: string[] = [];
    for (const m of round.matchups) {
      if (m.byeShirtId) {
        winners.push(m.byeShirtId);
      } else {
        const id = m.winner === "LEFT" ? m.leftShirtId : m.rightShirtId;
        if (id) winners.push(id);
      }
    }
    if (winners.length === 1) {
      this.crownChampion(winners[0]);
      return;
    }
    bracket.rounds.push({ matchups: this.pairToMatchups(winners), currentIndex: 0 });
    bracket.currentRoundIndex++;
    this.startCurrentMatchup();
  }

  private crownChampion(shirtId: string) {
    if (!this.round) return;
    this.round.champion = { shirtId };
    this.phase = "CHAMPION";
    this.clearTimer();
    this.emitChange();
  }

  // ----- public state -----

  publicStateFor(viewerId: PlayerId): RoomStatePublic {
    const base = this.baseStateFor(viewerId);
    let teekoRound: TeekoRoundPublic | undefined;
    if (this.round) {
      teekoRound = { phaseEndsAt: this.round.phaseEndsAt };
      if (this.phase === "DRAWING") {
        teekoRound.drawing = {
          mySubmitted: (this.round.drawingsByPlayer.get(viewerId) ?? []).length,
          target: TEEKO_DRAWING_TARGET,
        };
      } else if (this.phase === "WRITING") {
        const myIds = this.round.slogansByPlayer.get(viewerId) ?? [];
        teekoRound.writing = {
          mySubmitted: myIds.length,
          mySlogans: myIds
            .map((id) => this.round!.slogans.get(id)?.text)
            .filter((t): t is string => Boolean(t)),
          target: TEEKO_SLOGAN_TARGET,
        };
      } else if (this.phase === "COMPOSING") {
        const hand = this.round.hands.get(viewerId);
        teekoRound.composing = {
          myHand: hand
            ? {
                drawings: hand.drawingIds.map((id) => ({
                  id,
                  strokes: this.round!.drawings.get(id)?.strokes ?? [],
                })),
                slogans: hand.sloganIds.map((id) => ({
                  id,
                  text: this.round!.slogans.get(id)?.text ?? "",
                })),
              }
            : undefined,
          submitted: this.round.shirtsByPlayer.has(viewerId),
          progress: {
            submitted: this.round.shirtsByPlayer.size,
            total: this.round.hands.size,
          },
        };
      } else if (this.phase === "BRACKET" && this.round.bracket) {
        const bracket = this.round.bracket;
        const round = bracket.rounds[bracket.currentRoundIndex];
        const matchup = round.matchups[round.currentIndex];
        teekoRound.bracket = {
          currentRound: bracket.currentRoundIndex + 1,
          totalRounds: bracket.totalRounds,
          matchupIndex: round.currentIndex + 1,
          matchupsInRound: round.matchups.length,
          matchup: this.publicMatchup(matchup, viewerId),
        };
      } else if (this.phase === "CHAMPION" && this.round.champion) {
        const shirt = this.round.shirts.get(this.round.champion.shirtId);
        if (shirt) {
          const drawing = this.round.drawings.get(shirt.drawingId);
          const slogan = this.round.slogans.get(shirt.sloganId);
          teekoRound.champion = {
            shirt: this.publicShirt(shirt.id)!,
            composerId: shirt.composerId,
            drawingAuthorId: drawing?.authorId ?? "",
            sloganAuthorId: slogan?.authorId ?? "",
          };
        }
      }
    }
    return { ...base, teekoRound };
  }

  private publicShirt(shirtId: string): TeekoShirtPublic | undefined {
    if (!this.round) return undefined;
    const shirt = this.round.shirts.get(shirtId);
    if (!shirt) return undefined;
    const drawing = this.round.drawings.get(shirt.drawingId);
    const slogan = this.round.slogans.get(shirt.sloganId);
    if (!drawing || !slogan) return undefined;
    return {
      id: shirt.id,
      drawing: { id: drawing.id, strokes: drawing.strokes },
      slogan: { id: slogan.id, text: slogan.text },
    };
  }

  private publicMatchup(m: TeekoMatchup, viewerId: PlayerId): TeekoMatchupPublic {
    if (m.byeShirtId) {
      return {
        byeShirt: this.publicShirt(m.byeShirtId),
        revealed: true,
      };
    }
    return {
      leftShirt: m.leftShirtId ? this.publicShirt(m.leftShirtId) : undefined,
      rightShirt: m.rightShirtId ? this.publicShirt(m.rightShirtId) : undefined,
      myVote: m.votes.get(viewerId),
      revealed: m.revealed,
      leftVotes: m.revealed ? m.leftCount : undefined,
      rightVotes: m.revealed ? m.rightCount : undefined,
      winner: m.winner,
      iContributedLeft: m.leftShirtId ? this.didContribute(viewerId, m.leftShirtId) : false,
      iContributedRight: m.rightShirtId ? this.didContribute(viewerId, m.rightShirtId) : false,
    };
  }
}

export class RoomStore {
  private rooms = new Map<RoomCode, RoomBase>();

  create(hostId: PlayerId, gameType: GameType): RoomBase {
    const code = generateRoomCode(new Set(this.rooms.keys()));
    const room: RoomBase =
      gameType === "spyfall"
        ? new SpyfallRoom(code, hostId)
        : gameType === "flip7"
          ? new Flip7Room(code, hostId)
          : gameType === "teeko"
            ? new TeekoRoom(code, hostId)
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
