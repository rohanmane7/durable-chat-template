import { createRoot } from "react-dom/client";
import { usePartySocket } from "partysocket/react";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { BrowserRouter, Routes, Route, Navigate, useNavigate, useParams } from "react-router";
import type { CharacterNames, FaceSet, GameState, Role, ServerMessage } from "../shared";

function makeCode() { return String(Math.floor(100000 + Math.random() * 900000)); }

function App() {
  const { room = "" } = useParams();
  const navigate = useNavigate();
  const isRoom = /^\d{6}$/.test(room);
  const [role, setRole] = useState<Role>(() => sessionStorage.getItem("papa-role") === "papa" ? "papa" : "villain");
  const [joined, setJoined] = useState(false);
  const [state, setState] = useState<GameState | null>(null);
  const [joinCode, setJoinCode] = useState("");
  const [copied, setCopied] = useState(false);
  const [attackFx, setAttackFx] = useState<{ role: Role; attack: string } | null>(null);
  const [error, setError] = useState("");
  const [now, setNow] = useState(Date.now());
  const [draftNames, setDraftNames] = useState<CharacterNames>({ papa: "HERO", villain: "VILLAIN", heroine: "HEROINE" });
  const papaInput = useRef<HTMLInputElement>(null);
  const villainInput = useRef<HTMLInputElement>(null);
  const heroineInput = useRef<HTMLInputElement>(null);

  const socket = usePartySocket({
    party: "chat",
    room: isRoom ? room : "invalid",
    onOpen: () => {
      if (isRoom && joined) socket.send(JSON.stringify({ type: "join", role, roomCode: room }));
    },
    onMessage: (evt) => {
      try {
        const msg = JSON.parse(evt.data as string) as ServerMessage;
        if (msg.type === "state") {
          setState(msg.state);
          if (msg.state.players[role]) setJoined(true);
        }
        if (msg.type === "attack") {
          setAttackFx({ role: msg.attacker, attack: msg.attack });
          window.setTimeout(() => setAttackFx(null), 700);
        }
      } catch { setError("Connection data error. Please refresh."); }
    },
    onError: () => setError("Connection problem. Please refresh and try again."),
  });

  useEffect(() => { if (isRoom) setJoined(true); }, [isRoom]);
  useEffect(() => { if (isRoom && joined) socket.send(JSON.stringify({ type: "join", role, roomCode: room })); }, [isRoom, joined, role, room]);

  useEffect(() => {
    if (state?.phase !== "victory") return;
    const timer = window.setInterval(() => setNow(Date.now()), 80);
    return () => window.clearInterval(timer);
  }, [state?.phase]);

  if (!isRoom) return <main className="landing"><section className="start-card">
    <div className="game-mark">❤️</div>
    <h1>LOVE &amp; VILLAIN</h1>
    <p>Real-time 2-player rescue battle</p>
    <button onClick={() => { const code = makeCode(); sessionStorage.setItem("papa-role", "papa"); setRole("papa"); navigate("/" + code); setJoined(true); }}>CREATE ROOM</button>
    <div className="or">OR</div>
    <input value={joinCode} onChange={e => setJoinCode(e.target.value.replace(/\D/g, "").slice(0, 6))} placeholder="6-digit room code" inputMode="numeric" />
    <button className="dark-button" disabled={joinCode.length !== 6} onClick={() => { sessionStorage.setItem("papa-role", "villain"); setRole("villain"); navigate("/" + joinCode); setJoined(true); }}>JOIN AS VILLAIN</button>
  </section></main>;

  const send = (message: object) => socket.send(JSON.stringify(message));
  const attack = (name: "punch" | "kick" | "beam") => send({ type: "attack", attack: name });

  const cropFace = (file: File, key: keyof FaceSet) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const size = Math.min(img.width, img.height);
        const sx = Math.max(0, (img.width - size) / 2);
        const sy = Math.max(0, (img.height - size) * 0.08);
        const canvas = document.createElement("canvas");
        canvas.width = 500; canvas.height = 500;
        canvas.getContext("2d")?.drawImage(img, sx, sy, size, size, 0, 0, 500, 500);
        send({ type: "faces", faces: { ...(state?.faces || {}), [key]: canvas.toDataURL("image/jpeg", .84) } });
      };
      img.src = String(reader.result);
    };
    reader.readAsDataURL(file);
  };

  const names = state?.names ?? { papa: "HERO", villain: "VILLAIN", heroine: "HEROINE" };
  useEffect(() => { if (state?.names) setDraftNames(state.names); }, [state?.names?.papa, state?.names?.villain, state?.names?.heroine]);

  const saveNames = () => send({ type: "names", names: draftNames });
  const hpPapa = state?.hp.papa ?? 100;
  const hpVillain = state?.hp.villain ?? 100;
  const victoryElapsed = state?.phase === "victory" && state.victoryStartedAt ? now - state.victoryStartedAt : 0;
  const victoryStep = victoryElapsed < 1100 ? 0 : victoryElapsed < 2500 ? 1 : victoryElapsed < 4100 ? 2 : victoryElapsed < 5600 ? 3 : 4;
  const waiting = !state || (!state.players.villain && state.phase !== "victory");
  const won = state?.phase === "victory" && victoryStep >= 4;

  const Character = ({ characterRole, face, name }: { characterRole: "papa" | "villain" | "heroine"; face?: string; name: string }) => {
    const acting = attackFx?.role === characterRole && state?.phase === "fight";
    const fallen = characterRole === "villain" && state?.phase === "victory" && victoryStep >= 1;
    const rescued = characterRole === "heroine" && victoryStep >= 3;
    return <div className={"character " + characterRole + (acting ? " attack-" + attackFx?.attack : "") + (fallen ? " fallen" : "") + (rescued ? " rescued" : "")}>
      <div className="shadow" />
      <div className="head"><div className="face-wrap">{face ? <img src={face} className="face" alt={name} /> : <div className="face empty">FACE</div>}</div></div>
      <div className="torso"><span>{name}</span></div>
      <div className="arm left" /><div className="arm right" />
      <div className="leg left" /><div className="leg right" />
      {acting && <div className="hit-fx">{attackFx?.attack === "beam" ? "⚡" : attackFx?.attack === "kick" ? "💥" : "👊"}</div>}
    </div>;
  };

  return <main className="game">
    <header className="topbar">
      <div><span className="muted">ROOM</span> <b>{room}</b><button className="copy" onClick={() => { navigator.clipboard.writeText(room); setCopied(true); window.setTimeout(() => setCopied(false), 1000); }}>{copied ? "COPIED" : "COPY"}</button></div>
      <div className={state?.players.villain ? "connected" : "waiting-status"}>{state?.players.villain ? "● VILLAIN CONNECTED" : "● WAITING FOR VILLAIN"}</div>
    </header>

    {error && <div className="error">{error}</div>}

    {waiting && <section className="waiting-screen">
      <div className="waiting-card">
        <div className="small-logo">❤️</div>
        <h1>LOVE &amp; VILLAIN</h1>
        <h2>WAITING FOR YOUR FRIEND</h2>
        <p>Send this room code to your friend.</p>
        <strong className="room-code">{room}</strong>
        <button onClick={() => { navigator.clipboard.writeText(room); setCopied(true); window.setTimeout(() => setCopied(false), 1000); }}>{copied ? "✓ COPIED" : "COPY ROOM CODE"}</button>
        {role === "papa" && <div className="setup">
          <h3>CHARACTER SETUP</h3>
          <div className="name-fields">
            <label>HERO NAME<input value={draftNames.papa} onChange={e => setDraftNames(v => ({ ...v, papa: e.target.value }))} onBlur={saveNames} /></label>
            <label>VILLAIN NAME<input value={draftNames.villain} onChange={e => setDraftNames(v => ({ ...v, villain: e.target.value }))} onBlur={saveNames} /></label>
            <label>HEROINE NAME<input value={draftNames.heroine} onChange={e => setDraftNames(v => ({ ...v, heroine: e.target.value }))} onBlur={saveNames} /></label>
          </div>
          <div className="face-fields">
            <label>HERO FACE<input ref={papaInput} type="file" accept="image/*" onChange={e => e.target.files?.[0] && cropFace(e.target.files[0], "papa")} /></label>
            <label>VILLAIN FACE<input ref={villainInput} type="file" accept="image/*" onChange={e => e.target.files?.[0] && cropFace(e.target.files[0], "villain")} /></label>
            <label>HEROINE FACE<input ref={heroineInput} type="file" accept="image/*" onChange={e => e.target.files?.[0] && cropFace(e.target.files[0], "heroine")} /></label>
          </div>
        </div>}
        <div className="dot">● Waiting for friend…</div>
      </div>
    </section>}

    {!waiting && <section className={"battle-layout " + (state?.phase === "victory" ? "victory-stage-" + victoryStep : "")}>
      <div className="ring-area">
        <div className="ring-title">LOVE &amp; VILLAIN</div>
        <div className="ring">
          <div className="rope r1" /><div className="rope r2" /><div className="rope r3" />
          <div className="corner c1" /><div className="corner c2" /><div className="corner c3" /><div className="corner c4" />
          <div className="fighter hero-fighter">
            <Character characterRole="papa" face={state?.faces.papa} name={names.papa} />
            <div className="fighter-name hero-name">{names.papa}</div>
            <div className="health"><i style={{ width: hpPapa + "%" }} /></div><b>{hpPapa} HP</b>
          </div>
          <div className="ring-vs">{state?.phase === "victory" ? "💥" : "VS"}</div>
          <div className="fighter villain-fighter">
            <Character characterRole="villain" face={state?.faces.villain} name={names.villain} />
            <div className="fighter-name villain-name">{names.villain}</div>
            <div className="health villain-health"><i style={{ width: hpVillain + "%" }} /></div><b>{hpVillain} HP</b>
          </div>
        </div>
      </div>

      <aside className={"cage-panel " + (victoryStep >= 3 ? "opened" : "")}>
        <h3>❤️ {names.heroine}</h3>
        <div className="cage">
          <div className="bars" />
          <div className="lock">{victoryStep >= 3 ? "🔓" : "🔒"}</div>
          <Character characterRole="heroine" face={state?.faces.heroine} name={names.heroine} />
        </div>
        <p>{victoryStep >= 3 ? "Rescued! ❤️" : "Waiting for her hero…"}</p>
      </aside>
    </section>}

    {state?.phase === "fight" && <section className="controls">
      <h2>{role === "papa" ? names.papa : names.villain} ATTACKS</h2>
      <div className="attack-buttons">
        <button onClick={() => attack("punch")}>👊<span>PUNCH</span><small>20</small></button>
        <button onClick={() => attack("kick")}>🦵<span>KICK</span><small>26</small></button>
        <button onClick={() => attack("beam")}>⚡<span>BEAM</span><small>34</small></button>
      </div>
    </section>}

    {won && <div className="win-overlay">
      <div className="win-burst">❤️ ✦ ❤️</div>
      <div className="win-title">🏆 PAPA WINS!</div>
      <div className="win-subtitle">LOVE CONQUERS ALL ❤️</div>
      {role === "papa" && <button onClick={() => send({ type: "reset" })}>PLAY AGAIN</button>}
    </div>}
  </main>;
}

function Root() { return <BrowserRouter><Routes><Route path="/" element={<App />} /><Route path="/:room" element={<App />} /><Route path="*" element={<Navigate to="/" replace />} /></Routes></BrowserRouter>; }
createRoot(document.getElementById("root")!).render(<Root />);
