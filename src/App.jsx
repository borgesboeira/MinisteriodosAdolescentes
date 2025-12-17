import "./App.css";
import { useEffect, useMemo, useRef, useState } from "react";

const BASE = import.meta.env.BASE_URL; // ex: "/" ou "/nome-do-repo/"

const BG_MAIN = Array.from({ length: 10 }, (_, i) => {
  const n = String(i + 1).padStart(2, "0");
  return `${BASE}bg/main/${n}.png`;
});

const BG_HOVER_LEFT = Array.from({ length: 3 }, (_, i) => {
  const n = String(i + 1).padStart(2, "0");
  return `${BASE}bg/hover-left/${n}.png`;
});

const BG_HOVER_RIGHT = Array.from({ length: 3 }, (_, i) => {
  const n = String(i + 1).padStart(2, "0");
  return `${BASE}bg/hover-right/${n}.png`;
});

const ROTATE_MS = 3500; // velocidade da troca


/** ====== defaults (você pode mudar depois nas Configurações) ====== */
const DEFAULT_CATEGORIES = [
  { key: "presenca", label: "Presença", defaultPoints: 2 },
  { key: "biblia", label: "Bíblia", defaultPoints: 2 },
  { key: "licao", label: "Estudo da Lição", defaultPoints: 3 },
  { key: "kahoot", label: "Kahoot", defaultPoints: 1 },
  { key: "participacao", label: "Participação", defaultPoints: 1 },
  { key: "amigo", label: "Trouxe um amigo", defaultPoints: 4 },
];

const DEFAULT_TEENS = [
  { id: "t1", name: "Ana" },
  { id: "t2", name: "Bruno" },
  { id: "t3", name: "Carla" },
  { id: "t4", name: "Diego" },
];

function loadJSON(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}
function saveJSON(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // se der erro (modo privado etc.), só ignora
  }
}

export default function App() {
  const [hoverSide, setHoverSide] = useState(null); // "left" | "right" | null
  const [route, setRoute] = useState("home"); // "home" | "ranking"

    // ===== Background por imagens (com crossfade) =====
  const frameSet =
    route === "home" && hoverSide === "left"
      ? BG_HOVER_LEFT
      : route === "home" && hoverSide === "right"
      ? BG_HOVER_RIGHT
      : BG_MAIN;

  const [frameIndex, setFrameIndex] = useState(0);
const [bgA, setBgA] = useState(() => BG_MAIN[0] || "");
const [bgB, setBgB] = useState(() => BG_MAIN[0] || "");
const [isAActive, setIsAActive] = useState(true);

// cache de loads/decodes + controle de “último pedido”
const loadPromisesRef = useRef(new Map());
const lastWantedRef = useRef("");

function preloadAndDecode(src) {
  if (!src) return Promise.resolve(false);

  const cache = loadPromisesRef.current;
  if (cache.has(src)) return cache.get(src);

  const p = new Promise((resolve) => {
    const img = new Image();
    img.src = src;

    if (img.decode) {
      img.decode().then(() => resolve(true)).catch(() => resolve(false));
    } else {
      img.onload = () => resolve(true);
      img.onerror = () => resolve(false);
    }
  });

  cache.set(src, p);
  return p;
}

async function swapTo(src) {
  if (!src) return;

  lastWantedRef.current = src;

  const ok = await preloadAndDecode(src);
  if (!ok) {
  console.warn("[BG] falhou carregar/decodificar:", src);
  return;
}
  if (lastWantedRef.current !== src) return; // pedido antigo, ignora

  setIsAActive((prev) => {
    if (prev) setBgB(src);
    else setBgA(src);
    return !prev;
  });
}


  // preload (evita piscadas na primeira vez)
  useEffect(() => {
  const all = [...BG_MAIN, ...BG_HOVER_LEFT, ...BG_HOVER_RIGHT].filter(Boolean);
  all.forEach((src) => preloadAndDecode(src));
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, []);

  // quando troca o "conjunto" (hover on/off), mantém o índice e faz um crossfade pro equivalente
  // quando muda o “conjunto” (main/hover), só garante que o index é válido
useEffect(() => {
  if (!frameSet.length) return;
  setFrameIndex((i) => i % frameSet.length);
}, [frameSet.length]);

// sempre que (set ou index) mudar, faz swap com decode-guard
useEffect(() => {
  if (!frameSet.length) return;
  const src = frameSet[frameIndex % frameSet.length];
  swapTo(src);
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, [frameSet, frameIndex]);


  // roda o slideshow
  useEffect(() => {
  if (frameSet.length <= 1) return;
  const id = setInterval(() => {
    setFrameIndex((i) => (i + 1) % frameSet.length);
  }, ROTATE_MS);
  return () => clearInterval(id);
}, [frameSet.length]);

  // dados (persistidos)
  const [teens, setTeens] = useState(() => loadJSON("md_teens", DEFAULT_TEENS));
  const [categoryPoints, setCategoryPoints] = useState(() => {
    const saved = loadJSON("md_categoryPoints", null);
    if (saved) return saved;
    const obj = {};
    for (const c of DEFAULT_CATEGORIES) obj[c.key] = c.defaultPoints;
    return obj;
  });
  const [scores, setScores] = useState(() => loadJSON("md_scores", {})); // { [id]: { [catKey]: number } }

  // UI
  const [bulkMode, setBulkMode] = useState(false);
  const [bulkMarks, setBulkMarks] = useState({}); // { [id]: { [catKey]: boolean } }
  const [showSettings, setShowSettings] = useState(false);
  const [newTeenName, setNewTeenName] = useState("");

  // persistência
  useEffect(() => saveJSON("md_teens", teens), [teens]);
  useEffect(() => saveJSON("md_categoryPoints", categoryPoints), [categoryPoints]);
  useEffect(() => saveJSON("md_scores", scores), [scores]);

  const categories = DEFAULT_CATEGORIES.map((c) => ({
    ...c,
    points: Number(categoryPoints[c.key] ?? c.defaultPoints),
  }));

  function getTeenScoreByCategory(teenId, catKey) {
    return Number(scores?.[teenId]?.[catKey] ?? 0);
  }

  function getTeenTotal(teenId) {
    return categories.reduce((sum, c) => sum + getTeenScoreByCategory(teenId, c.key), 0);
  }

  const ranked = useMemo(() => {
    const arr = teens.map((t) => ({ ...t, total: getTeenTotal(t.id) }));
    arr.sort((a, b) => b.total - a.total || a.name.localeCompare(b.name));
    return arr;
  }, [teens, scores, categoryPoints]); // eslint-disable-line

  function ensureTeenScoreShape(teenId) {
    setScores((prev) => {
      const next = { ...(prev || {}) };
      next[teenId] = { ...(next[teenId] || {}) };
      // garante chaves
      for (const c of categories) {
        if (typeof next[teenId][c.key] !== "number") next[teenId][c.key] = 0;
      }
      return next;
    });
  }

  function addTeen() {
    const name = newTeenName.trim();
    if (!name) return;
    const id = `t_${Date.now()}`;
    setTeens((prev) => [...prev, { id, name }]);
    setNewTeenName("");
    // cria estrutura de pontuação
    setScores((prev) => ({
      ...(prev || {}),
      [id]: Object.fromEntries(categories.map((c) => [c.key, 0])),
    }));
  }

  function removeTeen(id) {
    setTeens((prev) => prev.filter((t) => t.id !== id));
    setScores((prev) => {
      const next = { ...(prev || {}) };
      delete next[id];
      return next;
    });
    setBulkMarks((prev) => {
      const next = { ...(prev || {}) };
      delete next[id];
      return next;
    });
  }

  function toggleBulkMark(teenId, catKey) {
    setBulkMarks((prev) => {
      const next = { ...(prev || {}) };
      next[teenId] = { ...(next[teenId] || {}) };
      next[teenId][catKey] = !next[teenId][catKey];
      return next;
    });
  }

  function applyBulkPoints() {
    // soma pontos padrão por categoria marcada
    setScores((prev) => {
      const next = { ...(prev || {}) };

      for (const t of teens) {
        const marks = bulkMarks?.[t.id];
        if (!marks) continue;

        next[t.id] = { ...(next[t.id] || {}) };

        for (const c of categories) {
          if (marks[c.key]) {
            next[t.id][c.key] = Number(next[t.id][c.key] || 0) + Number(c.points || 0);
          }
        }
      }
      return next;
    });

    // limpa seleção e sai do modo
    setBulkMarks({});
    setBulkMode(false);
  }

  function resetAllScores() {
    setScores({});
    setBulkMarks({});
    setBulkMode(false);
  }

  /** ====== UI pages ====== */
  return (
    <div
      className={[
        "page",
        hoverSide === "left" ? "hoverLeft" : "",
        hoverSide === "right" ? "hoverRight" : "",
      ].join(" ")}
    >
            {/* Base (nítida) */}
      <div className="bgVideo bgVideoBase" aria-hidden="true">
        <div
          className={["bgFrame", isAActive ? "isActive" : ""].join(" ")}
          style={{ backgroundImage: `url(${bgA})` }}
        />
        <div
          className={["bgFrame", !isAActive ? "isActive" : ""].join(" ")}
          style={{ backgroundImage: `url(${bgB})` }}
        />
      </div>

      {/* Blur ESQUERDA (aparece quando hover no botão direito) */}
      <div className="bgVideo bgVideoBlurLeft" aria-hidden="true">
        <div
          className={["bgFrame", isAActive ? "isActive" : ""].join(" ")}
          style={{ backgroundImage: `url(${bgA})` }}
        />
        <div
          className={["bgFrame", !isAActive ? "isActive" : ""].join(" ")}
          style={{ backgroundImage: `url(${bgB})` }}
        />
      </div>

      {/* Blur DIREITA (aparece quando hover no botão esquerdo) */}
      <div className="bgVideo bgVideoBlurRight" aria-hidden="true">
        <div
          className={["bgFrame", isAActive ? "isActive" : ""].join(" ")}
          style={{ backgroundImage: `url(${bgA})` }}
        />
        <div
          className={["bgFrame", !isAActive ? "isActive" : ""].join(" ")}
          style={{ backgroundImage: `url(${bgB})` }}
        />
      </div>

      <div className="overlay" aria-hidden="true" />

      <div className="topLeftTitle">
        {route === "home" ? "Ministério dos Adolescentes" : "Ranking — Adolescentes"}
      </div>

      {route === "home" ? (
        <div className="options">
          <button
            className="optionCard optionLeft"
            type="button"
            onMouseEnter={() => setHoverSide("left")}
            onMouseLeave={() => setHoverSide(null)}
            onClick={() => alert("Pré-adolescentes: depois a gente cria essa tela também 😉")}
          >
            <div className="optionTitle">Pré-adolescentes</div>
          </button>

          <button
            className="optionCard optionRight"
            type="button"
            onMouseEnter={() => setHoverSide("right")}
            onMouseLeave={() => setHoverSide(null)}
            onClick={() => {
              setHoverSide(null);
              setRoute("ranking");
            }}
          >
            <div className="optionTitle">Adolescentes</div>
          </button>
        </div>
      ) : (
        <main className="rankPage">
          <div className="rankTopBar">
            <button className="smallBtn" type="button" onClick={() => setRoute("home")}>
              ← Voltar
            </button>

            <div className="rankActions">
              <button
                className={["smallBtn", bulkMode ? "smallBtnActive" : ""].join(" ")}
                type="button"
                onClick={() => {
                  // garante formato antes de marcar
                  for (const t of teens) ensureTeenScoreShape(t.id);
                  setBulkMode((v) => !v);
                  setBulkMarks({});
                }}
              >
                {bulkMode ? "Cancelar" : "Adicionar pontos"}
              </button>

              {bulkMode ? (
                <button className="smallBtn smallBtnPrimary" type="button" onClick={applyBulkPoints}>
                  Aplicar
                </button>
              ) : (
                <button className="smallBtn" type="button" onClick={() => setShowSettings(true)}>
                  Configurações
                </button>
              )}
            </div>
          </div>

          <section className="rankCard">
            <div className="rankCardHeader">
              <div className="rankTitle">Tabula Honoris</div>
              <div className="rankSubtitle">Pontos por presença, Bíblia, lição, kahoot… e glória eterna.</div>
            </div>

            <div className="addTeenRow">
              <input
                className="textInput"
                value={newTeenName}
                onChange={(e) => setNewTeenName(e.target.value)}
                placeholder="Adicionar adolescente… (ex: João)"
              />
              <button className="smallBtn smallBtnPrimary" type="button" onClick={addTeen}>
                Adicionar
              </button>
              <button className="smallBtn dangerBtn" type="button" onClick={resetAllScores}>
                Zerar pontos
              </button>
            </div>

            {!bulkMode ? (
              <div className="rankList">
                {ranked.map((t, idx) => (
                  <div key={t.id} className="rankRow">
                    <div className="rankPos">#{idx + 1}</div>
                    <div className="rankName">{t.name}</div>
                    <div className="rankTotal">{t.total}</div>

                    <div className="rankBreakdown">
                      {categories.map((c) => (
                        <span key={c.key} className="pill">
                          {c.label}: {getTeenScoreByCategory(t.id, c.key)}
                        </span>
                      ))}
                    </div>

                    <button className="tinyBtn" type="button" onClick={() => removeTeen(t.id)}>
                      remover
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <div className="bulkGrid">
                <div className="bulkHeader">
                  <div className="bulkNameCol">Adolescente</div>
                  {categories.map((c) => (
                    <div key={c.key} className="bulkCol">
                      <div className="bulkCat">{c.label}</div>
                      <div className="bulkPts">+{c.points}</div>
                    </div>
                  ))}
                </div>

                {ranked.map((t) => (
                  <div key={t.id} className="bulkRow">
                    <div className="bulkNameCol">
                      <div className="bulkName">{t.name}</div>
                      <div className="bulkCurrent">Total atual: {getTeenTotal(t.id)}</div>
                    </div>

                    {categories.map((c) => {
                      const checked = !!bulkMarks?.[t.id]?.[c.key];
                      return (
                        <label key={c.key} className={["bulkCell", checked ? "bulkChecked" : ""].join(" ")}>
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => toggleBulkMark(t.id, c.key)}
                          />
                          <span className="checkLabel">marcar</span>
                        </label>
                      );
                    })}
                  </div>
                ))}
              </div>
            )}
          </section>

          {showSettings ? (
            <div className="modalOverlay" role="dialog" aria-modal="true">
              <div className="modalCard">
                <div className="modalHeader">
                  <div className="modalTitle">Configurações de Pontuação</div>
                  <button className="tinyBtn" type="button" onClick={() => setShowSettings(false)}>
                    fechar
                  </button>
                </div>

                <div className="settingsGrid">
                  {categories.map((c) => (
                    <div key={c.key} className="settingsRow">
                      <div className="settingsLabel">{c.label}</div>
                      <input
                        className="numInput"
                        type="number"
                        value={categoryPoints[c.key] ?? c.defaultPoints}
                        onChange={(e) =>
                          setCategoryPoints((prev) => ({
                            ...(prev || {}),
                            [c.key]: Number(e.target.value),
                          }))
                        }
                      />
                    </div>
                  ))}
                </div>

                <div className="modalFooter">
                  <button className="smallBtn smallBtnPrimary" type="button" onClick={() => setShowSettings(false)}>
                    OK
                  </button>
                </div>
              </div>
            </div>
          ) : null}
        </main>
      )}
    </div>
  );
}
