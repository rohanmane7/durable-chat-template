import { Server, routePartykitRequest, type Connection, type WSMessage } from "partyserver";
import type { ClientMessage, FaceSet, GameState, Role, ServerMessage } from "../shared";
import { DAMAGE } from "../shared";

const freshState = (roomCode: string): GameState => ({ roomCode, hostId: null, players: { papa: null, villain: null }, hp: { papa: 100, villain: 100 }, faces: {}, phase: "lobby", winner: null, victoryStartedAt: null });

export class Chat extends Server<Env> {
  static options = { hibernate: true };
  state!: GameState;

  onStart() {
    this.ctx.storage.sql.exec("CREATE TABLE IF NOT EXISTS game_state (id INTEGER PRIMARY KEY, data TEXT NOT NULL)");
    const row = this.ctx.storage.sql.exec("SELECT data FROM game_state WHERE id = 1").toArray()[0] as { data?: string } | undefined;
    this.state = row?.data ? JSON.parse(row.data) as GameState : freshState(this.name);
  }

  private save() {
    this.ctx.storage.sql.exec("INSERT INTO game_state (id, data) VALUES (1, ?) ON CONFLICT(id) DO UPDATE SET data = ?", JSON.stringify(this.state), JSON.stringify(this.state));
  }
  private send(connection: Connection, message: ServerMessage) { connection.send(JSON.stringify(message)); }
  private broadcastState() { this.broadcast(JSON.stringify({ type: "state", state: this.state } satisfies ServerMessage)); this.save(); }

  onConnect(connection: Connection) { this.send(connection, { type: "state", state: this.state }); }

  onClose(connection: Connection) {
    const role = (connection.state as { role?: Role } | null)?.role;
    if (role === "papa" && this.state.players.papa === connection.id) this.state.players.papa = null;
    if (role === "villain" && this.state.players.villain === connection.id) this.state.players.villain = null;
    if (this.state.phase === "fight" && !this.state.players.villain) this.state.phase = "lobby";
    this.broadcastState();
  }

  onMessage(connection: Connection, raw: WSMessage) {
    if (typeof raw !== "string") return;
    let msg: ClientMessage;
    try { msg = JSON.parse(raw); } catch { return; }

    if (msg.type === "join") {
      if (msg.role === "papa") {
        if (this.state.players.papa && this.state.players.papa !== connection.id) return;
        this.state.hostId ||= connection.id;
        this.state.players.papa = connection.id;
        connection.setState({ role: "papa" });
      } else {
        if (!this.state.players.papa || (this.state.players.villain && this.state.players.villain !== connection.id)) return;
        this.state.players.villain = connection.id;
        connection.setState({ role: "villain" });
      }
      if (this.state.players.papa && this.state.players.villain && this.state.phase === "lobby") this.state.phase = "fight";
      this.broadcastState();
      return;
    }

    const role = this.roles.get(connection.id);
    if (!role) return;

    if (msg.type === "faces") {
      if (role !== "papa" || connection.id !== this.state.hostId) return;
      const faces: FaceSet = {};
      for (const key of ["papa", "villain", "heroine"] as const) {
        const value = msg.faces[key];
        if (typeof value === "string" && value.startsWith("data:image/")) faces[key] = value.slice(0, 1500000);
      }
      this.state.faces = faces;
      this.broadcastState();
      return;
    }

    if (msg.type === "attack") {
      if (this.state.phase !== "fight") return;
      const damage = DAMAGE[msg.attack];
      const target: Role = role === "papa" ? "villain" : "papa";
      this.state.hp[target] = Math.max(0, this.state.hp[target] - damage);
      this.broadcast(JSON.stringify({ type: "attack", attacker: role, attack: msg.attack, damage } satisfies ServerMessage));
      if (this.state.hp.villain <= 0) {
        this.state.phase = "victory"; this.state.winner = "papa"; this.state.victoryStartedAt = Date.now();
        this.broadcast(JSON.stringify({ type: "victory", winner: "papa" } satisfies ServerMessage));
      }
      this.broadcastState();
      return;
    }

    if (msg.type === "reset") {
      if (role !== "papa" || connection.id !== this.state.hostId) return;
      const faces = this.state.faces;
      this.state = { ...freshState(this.state.roomCode), hostId: connection.id, players: { papa: connection.id, villain: null }, faces };
      connection.setState({ role: "papa" });
      this.broadcastState();
    }
  }
}

export default {
  async fetch(request, env) {
    return (await routePartykitRequest(request, { ...env })) || env.ASSETS.fetch(request);
  },
} satisfies ExportedHandler<Env>;