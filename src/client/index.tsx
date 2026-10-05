import { createRoot } from "react-dom/client";
import { usePartySocket } from "partysocket/react";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { BrowserRouter, Routes, Route, Navigate, useNavigate, useParams } from "react-router";
import type { FaceSet, GameState, Role, ServerMessage } from "../shared";

function makeCode() { return String(Math.floor(100000 + Math.random() * 900000)); }

function App() {
  const { room = "" } = useParams();
  const navigate = useNavigate();
  const isRoom = /^\d{6}$/.test(room);
  const [role, setRole] = useState<Role>(() => {
    const saved = sessionStorage.getItem("papa-role");
    return saved === "papa" ? "papa" : "villain";
  });
  const [joined, setJoined] = useState(false);
  const [state, setState] = useState<GameState | null>(null);
  const [joinCode, setJoinCode] = useState("");
  const [copied, setCopied] = useState(false);
  const [victory, setVictory] = useState(false);
  const [flash, setFlash] = useState<Role | null>(null);
  const [error, setError] = useState("");
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
      const msg = JSON.parse(evt.data as string) as ServerMessage;
      if (msg.type === "state") {
        setState(msg.state);
        if (msg.state.players[role]) setJoined(true);
      } else if (msg.type === "attack") {
        setFlash(msg.attacker);
        window.setTimeout(() => setFlash(null), 280);
      } else if (msg.type === "victory") {
        setVictory(true);
      }
    },
    onError: () => setError("Connection problem. Please refresh and try again."),
  });

  useEffect(() => {
    if (isRoom) setJoined(true);
  }, [isRoom]);

  useEffect(() => {
    if (isRoom && joined) socket.send(JSON.stringify({ type: "join", role, roomCode: room }));
  }, [isRoom, joined, role, room]);

  if (!isRoom) return <main className="landing"><section className="card">
    <h1>❤️ LOVE & VILLAIN</h1><p>Real-time 2-player battle</p>
    <button onClick={() => { const c = makeCode(); sessionStorage.setItem("papa-role", "papa"); setRole("papa"); navigate("/" + c); setJoined(true); }}>CREATE ROOM</button>
    <div className="divider">OR</div>
    <input value={joinCode} onChange={e => setJoinCode(e.target.value.replace(/\D/g, "").slice(0, 6))} placeholder="Enter 6-digit room code" inputMode="numeric" />
    <button className="secondary" disabled={joinCode.length !== 6} onClick={() => { sessionStorage.setItem("papa-role", "villain"); setRole("villain"); navigate("/" + joinCode); setJoined(true); }}>JOIN AS VILLAIN</button>
  </section></main>;

  const send = (message: object) => socket.send(JSON.stringify(message));
  const attack = (name: "punch" | "kick" | "beam") => send({ type: "attack", attack: name });
  const readFace = (file: File, key: keyof FaceSet) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const size = Math.min(img.width, img.height);
        const sx = Math.max(0, (img.width - size) / 2);
        const sy = Math.max(0, (img.height - size) * 0.12);
        const canvas = document.createElement("canvas"); canvas.width = 500; canvas.height = 500;
        canvas.getContext("2d")!.drawImage(img, sx, sy, size, size, 0, 0, 500, 500);
        const faces = { ...(state?.faces || {}), [key]: canvas.toDataURL("image/jpeg", 0.82) };
        send({ type: "faces", faces });
      };
      img.src = String(reader.result);
    };
    reader.readAsDataURL(file);
  };
  const Face = ({ src, label }: { src?: string; label: string }) => src ? <img className="face" src={src} alt={label} /> : <div className="face placeholder">{label}</div>;
  const hpPapa = state?.hp.papa ?? 100; const hpVillain = state?.hp.villain ?? 100;

  return <main className="game">
    <header><div><b>ROOM</b> <span className="code">{room}</span><button className="copy" onClick={() => { navigator.clipboard.writeText(room); setCopied(true); window.setTimeout(() => setCopied(false), 1200); }}>{copied ? "COPIED" : "COPY CODE"}</button></div>
      <div className={state?.players.villain ? "online" : "waiting"}>{state?.players.villain ? "● VILLAIN CONNECTED" : "● WAITING FOR VILLAIN"}</div></header>
    {error && <div className="error">{error}</div>}
    <section className="arena">
      <div className={"fighter papa " + (flash === "papa" ? "hit" : "")}><Face src={state?.faces.papa} label="HERO" /><h2>🦸 HERO</h2><div className="hp"><i style={{ width: hpPapa + "%" }} /></div><b>{hpPapa} HP</b></div>
      <div className="vs">VS</div>
      <div className={"fighter villain " + (flash === "villain" ? "hit" : "")}><Face src={state?.faces.villain} label="VILLAIN" /><h2>😈 VILLAIN</h2><div className="hp"><i style={{ width: hpVillain + "%" }} /></div><b>{hpVillain} HP</b></div>
    </section>
    {role === "papa" && <section className="controls"><h3>{state?.phase === "lobby" ? "WAITING FOR YOUR FRIEND…" : "PAPA ATTACKS"}</h3>
      <div className="buttons"><button disabled={state?.phase !== "fight"} onClick={() => attack("punch")}>👊 PUNCH <small>20</small></button><button disabled={state?.phase !== "fight"} onClick={() => attack("kick")}>🦵 KICK <small>26</small></button><button disabled={state?.phase !== "fight"} onClick={() => attack("beam")}>⚡ BEAM <small>34</small></button></div>
      <div className="uploads"><label>PAPA FACE<input ref={papaInput} type="file" accept="image/*" onChange={e => e.target.files?.[0] && readFace(e.target.files[0], "papa")} /></label><label>VILLAIN FACE<input ref={villainInput} type="file" accept="image/*" onChange={e => e.target.files?.[0] && readFace(e.target.files[0], "villain")} /></label><label>HEROINE FACE<input ref={heroineInput} type="file" accept="image/*" onChange={e => e.target.files?.[0] && readFace(e.target.files[0], "heroine")} /></label></div>
    </section>}
    {role === "villain" && <section className="controls villain-controls"><h3>😈 VILLAIN</h3><div className="buttons"><button disabled={state?.phase !== "fight"} onClick={() => attack("punch")}>👊 PUNCH <small>20</small></button><button disabled={state?.phase !== "fight"} onClick={() => attack("kick")}>🦵 KICK <small>26</small></button><button disabled={state?.phase !== "fight"} onClick={() => attack("beam")}>⚡ BEAM <small>34</small></button></div></section>}
    {(victory || state?.phase === "victory") && <div className="victory"><div className="winText">🏆 PAPA WINS! ❤️</div><div className="hearts">❤️ 💕 ❤️ 💕 ❤️</div><div className="rescue"><Face src={state?.faces.papa} label="HERO" /><span>➡️</span><div className="cage">🔓 💕</div><span>➡️</span><Face src={state?.faces.heroine} label="HEROINE" /></div>{role === "papa" && <button onClick={() => { setVictory(false); send({ type: "reset" }); }}>PLAY AGAIN</button>}</div>}
  </main>;
}
function Root() { return <BrowserRouter><Routes><Route path="/" element={<App />} /><Route path="/:room" element={<App />} /><Route path="*" element={<Navigate to="/" replace />} /></Routes></BrowserRouter>; }
createRoot(document.getElementById("root")!).render(<Root />);
