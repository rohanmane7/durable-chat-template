export type Role = "papa" | "villain";
export type FaceSet = { papa?: string; villain?: string; heroine?: string };
export type CharacterNames = { papa: string; villain: string; heroine: string };
export type GameState = {
  roomCode: string;
  hostId: string | null;
  players: { papa: string | null; villain: string | null };
  hp: { papa: number; villain: number };
  faces: FaceSet;
  names: CharacterNames;
  phase: "lobby" | "fight" | "victory";
  winner: "papa" | null;
  victoryStartedAt: number | null;
};
export type ClientMessage =
  | { type: "join"; role: Role; roomCode: string }
  | { type: "attack"; attack: "punch" | "kick" | "beam" }
  | { type: "faces"; faces: FaceSet }
  | { type: "reset" }
  | { type: "ping" };
export type ServerMessage =
  | { type: "state"; state: GameState }
  | { type: "attack"; attacker: Role; attack: "punch" | "kick" | "beam"; damage: number }
  | { type: "victory"; winner: "papa" };
export const DAMAGE = { punch: 20, kick: 26, beam: 34 } as const;
