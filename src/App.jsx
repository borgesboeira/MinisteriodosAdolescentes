import "./App.css";
import { useEffect, useMemo, useRef, useState } from "react";

const BASE = import.meta.env.BASE_URL; // ex: "/" ou "/nome-do-repo/"

const BG_MAIN = Array.from({ length: 17 }, (_, i) => {
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

const RANKING_BG_WEBP = `${BASE}img/world/ranking-bg.webp`;
const RANKING_BG_PNG  = `${BASE}img/world/ranking-bg.png`;




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
  const [rankBgReady, setRankBgReady] = useState(false);      // webp pronto
const [rankPngReady, setRankPngReady] = useState(false);    // png pronto



useEffect(() => {
  let cancelled = false;
  let linkLow = null;
  let linkHigh = null;

  async function setRatioFrom(src) {
    const img = new Image();
    img.src = src;
    await new Promise((res) => {
      img.onload = res;
      img.onerror = res;
    });
    try { await img.decode?.(); } catch {}
    if (img.naturalWidth && img.naturalHeight) {
      const ratio = img.naturalHeight / img.naturalWidth;
      document.documentElement.style.setProperty("--rankBgRatio", String(ratio));
    }
  }

  // 1) Preload do WEBP (rápido)
  linkLow = document.createElement("link");
  linkLow.rel = "preload";
  linkLow.as = "image";
  linkLow.href = RANKING_BG_WEBP;
  document.head.appendChild(linkLow);

  (async () => {
    // garante webp carregado e decodificado
    const okWebp = await preloadAndDecode(RANKING_BG_WEBP, 2).catch(() => false);
    if (cancelled) return;

    if (okWebp) await setRatioFrom(RANKING_BG_WEBP);
    setRankBgReady(true);

    // 2) Depois que o webp está ok, começa PNG (nítido) em “low priority”
    const startHigh = async () => {
      linkHigh = document.createElement("link");
      linkHigh.rel = "preload";
      linkHigh.as = "image";
      linkHigh.href = RANKING_BG_PNG;
      document.head.appendChild(linkHigh);

      const okPng = await preloadAndDecode(RANKING_BG_PNG, 2).catch(() => false);
      if (cancelled) return;

      if (okPng) await setRatioFrom(RANKING_BG_PNG);
      setRankPngReady(!!okPng);
    };

    if ("requestIdleCallback" in window) {
      requestIdleCallback(() => startHigh(), { timeout: 2000 });
    } else {
      setTimeout(() => startHigh(), 900);
    }
  })();

  return () => {
    cancelled = true;
    linkLow?.remove();
    linkHigh?.remove();
  };
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, []);





function handleSpotlight(e) {
  const r = e.currentTarget.getBoundingClientRect();
  const x = ((e.clientX - r.left) / r.width) * 100;
  const y = ((e.clientY - r.top) / r.height) * 100;
  e.currentTarget.style.setProperty("--mx", `${x}%`);
  e.currentTarget.style.setProperty("--my", `${y}%`);
}


function setSpotlight(e) {
  const el = e.currentTarget;
  const r = el.getBoundingClientRect();
  const x = ((e.clientX - r.left) / r.width) * 100;
  const y = ((e.clientY - r.top) / r.height) * 100;
  el.style.setProperty("--mx", `${x}%`);
  el.style.setProperty("--my", `${y}%`);
}


    // ===== Background por imagens (com crossfade) =====
  const isHome = route === "home";
  const showHomeBg = isHome;


const frameSetKey =
  !isHome
    ? "static" // fora do home não tem slideshow
    : hoverSide === "left"
    ? "hover-left"
    : hoverSide === "right"
    ? "hover-right"
    : "main";


const frameSet =
  frameSetKey === "hover-left"
    ? BG_HOVER_LEFT
    : frameSetKey === "hover-right"
    ? BG_HOVER_RIGHT
    : frameSetKey === "main"
    ? BG_MAIN
    : []; // static => nenhum frame



  const [frameIndex, setFrameIndex] = useState(0);
const [layers, setLayers] = useState(() => ({
  a: BG_MAIN[0] || "",
  b: BG_MAIN[0] || "",
  active: "a", // "a" | "b"
}));

// cache de loads/decodes + controle de “último pedido”
const loadPromisesRef = useRef(new Map());
const lastWantedRef = useRef("");
const activeRef = useRef("a");
const currentSrcRef = useRef(BG_MAIN[0] || "");

useEffect(() => {
  activeRef.current = layers.active;
  currentSrcRef.current = layers[layers.active];
}, [layers]);


function preloadAndDecode(src, retries = 1) {
  if (!src) return Promise.resolve(false);

  const cache = loadPromisesRef.current;
  if (cache.has(src)) return cache.get(src);

  const p = new Promise((resolve) => {
    const img = new Image();

    img.onload = async () => {
      try {
        if (img.decode) await img.decode();
        resolve(true);
      } catch {
        resolve(false);
      }
    };

    img.onerror = () => resolve(false);
    img.src = src;
  }).then(async (ok) => {
    if (!ok) {
      cache.delete(src); // <- não “envenena” o cache
      if (retries > 0) {
        await new Promise((r) => setTimeout(r, 120));
        return preloadAndDecode(src, retries - 1);
      }
    }
    return ok;
  });

  cache.set(src, p);
  return p;
}

async function swapTo(src) {
  if (!src) return;

  // evita re-trocar pro mesmo frame (isso parece “piscada”)
  if (currentSrcRef.current === src) return;

  lastWantedRef.current = src;

  const ok = await preloadAndDecode(src);
  if (!ok) {
    console.warn("[BG] falhou carregar/decodificar:", src);
    return;
  }
  if (lastWantedRef.current !== src) return;

  const next = activeRef.current === "a" ? "b" : "a";

  // Etapa 1: coloca a imagem nova na camada escondida (sem trocar active)
  setLayers((prev) => ({ ...prev, [next]: src }));

  // Etapa 2: no próximo frame, troca o active e faz o crossfade suave
  requestAnimationFrame(() => {
    if (lastWantedRef.current !== src) return;
    setLayers((prev) => ({ ...prev, active: next }));
  });
}


  // preload (evita piscadas na primeira vez)
  useEffect(() => {
  const all = [...BG_MAIN, ...BG_HOVER_LEFT, ...BG_HOVER_RIGHT, RANKING_BG_WEBP, RANKING_BG_PNG].filter(Boolean);
  all.forEach((src) => preloadAndDecode(src, 2)); // 2 tentativas
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, []);

  // quando troca o "conjunto" (hover on/off), mantém o índice e faz um crossfade pro equivalente
  // quando muda o “conjunto” (main/hover), só garante que o index é válido
useEffect(() => {
  if (frameSetKey === "static") return; // <- não faz nada no ranking
  if (!frameSet.length) return;
  setFrameIndex(0);
}, [frameSetKey, frameSet.length]);



// sempre que (set ou index) mudar, faz swap com decode-guard
useEffect(() => {
  if (frameSetKey === "static") return; // <- trava no ranking
  if (!frameSet.length) return;
  const src = frameSet[frameIndex % frameSet.length];
  swapTo(src);
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, [frameSet, frameIndex, frameSetKey]);


  // roda o slideshow
  useEffect(() => {
  if (frameSetKey === "static") return; // <- não cria timer no ranking
  if (frameSet.length <= 1) return;

  const id = setInterval(() => {
    setFrameIndex((i) => (i + 1) % frameSet.length);
  }, ROTATE_MS);

  return () => clearInterval(id);
}, [frameSetKey, frameSet.length]);


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
  route === "ranking" ? "isRanking" : "",
  route === "ranking" && rankPngReady ? "rankPngReady" : "",
  hoverSide === "left" ? "hoverLeft" : "",
  hoverSide === "right" ? "hoverRight" : "",
].join(" ")}

>

{showHomeBg && (
  <>
    {/* Base (nítida) */}
    <div className="bgVideo bgVideoBase" aria-hidden="true">
      <div
        className={["bgFrame", layers.active === "a" ? "isActive" : ""].join(" ")}
        style={{ backgroundImage: `url(${layers.a})` }}
      />
      <div
        className={["bgFrame", layers.active === "b" ? "isActive" : ""].join(" ")}
        style={{ backgroundImage: `url(${layers.b})` }}
      />
    </div>

    {/* Blur ESQUERDA */}
    <div className="bgVideo bgVideoBlurLeft" aria-hidden="true">
      <div
        className={["bgFrame", layers.active === "a" ? "isActive" : ""].join(" ")}
        style={{ backgroundImage: `url(${layers.a})` }}
      />
      <div
        className={["bgFrame", layers.active === "b" ? "isActive" : ""].join(" ")}
        style={{ backgroundImage: `url(${layers.b})` }}
      />
    </div>

    {/* Blur DIREITA */}
    <div className="bgVideo bgVideoBlurRight" aria-hidden="true">
      <div
        className={["bgFrame", layers.active === "a" ? "isActive" : ""].join(" ")}
        style={{ backgroundImage: `url(${layers.a})` }}
      />
      <div
        className={["bgFrame", layers.active === "b" ? "isActive" : ""].join(" ")}
        style={{ backgroundImage: `url(${layers.b})` }}
      />
    </div>
  </>
)}


      <div className="overlay" aria-hidden="true" />

      {isHome && <div className="topLeftTitle">Ministério dos Adolescentes</div>}


      {route === "home" ? (
  <div className="optionsPremium">
  <button
    className="optionLeft optionPremium"
    type="button"
    onMouseEnter={() => setHoverSide("left")}
    onMouseLeave={(e) => {
      setHoverSide(null);
      e.currentTarget.style.setProperty("--mx", "50%");
      e.currentTarget.style.setProperty("--my", "50%");
    }}
    onMouseMove={setSpotlight}
    onClick={() => alert("Pré-adolescentes: depois a gente cria essa tela também 😉")}
  >
    <span className="optionSheen" aria-hidden="true" />
    <div className="optionTopRow">
      <div className="optionKicker">11–13</div>
      <div className="optionBadge">Entrada</div>
    </div>

    <div className="optionTitle">Pré-adolescentes</div>
    <div className="optionDesc">Acompanhamento, presença e desafios leves.</div>

    <div className="optionCTA">
      Entrar <span className="optionArrow">→</span>
    </div>
  </button>

  <button
    className="optionRight optionPremium"
    type="button"
    onMouseEnter={() => {
  setHoverSide("right");
  preloadAndDecode(RANKING_BG_WEBP, 2).then(() => preloadAndDecode(RANKING_BG_PNG, 1));
}}

    onMouseLeave={(e) => {
      setHoverSide(null);
      e.currentTarget.style.setProperty("--mx", "50%");
      e.currentTarget.style.setProperty("--my", "50%");
    }}
    onMouseMove={handleSpotlight}
    onClick={() => {
  setHoverSide(null);
  setRoute("ranking");
  window.scrollTo(0, 0);
}}


  >
    <span className="optionSheen" aria-hidden="true" />
    <div className="optionTopRow">
      <div className="optionKicker">14–17</div>
      <div className="optionBadge optionBadgeLive">Ranking</div>
    </div>

    <div className="optionTitle">Adolescentes</div>
    <div className="optionDesc">Pontos, participação e Tabula Honoris.</div>

    <div className="optionCTA">
      Entrar <span className="optionArrow">→</span>
    </div>
  </button>
</div>

      ) : (
        <main
  className="rankPage"
  style={{
  "--rankBgLow": `url(${RANKING_BG_WEBP})`,
  "--rankBgHigh": `url(${RANKING_BG_PNG})`,
  "--rankBgOffsetY": "-110px",
}}

>
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
{/* HERO do ranking (imagem estática) */}
<div className="rankHeroSpace" aria-hidden="true" />
          <section className="rankCard">
  <div className="rankCardHeader">
    <div className="rankTitle">Tabula Honoris</div>
    <div className="rankSubtitle">
      {bulkMode
        ? "Marque as categorias para somar pontos e clique em Aplicar."
        : "Ranking atualizado automaticamente conforme você soma pontos."}
    </div>
  </div>

  <div className="addTeenRow">
    <input
      className="textInput"
      placeholder="Nome do adolescente…"
      value={newTeenName}
      onChange={(e) => setNewTeenName(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === "Enter") addTeen();
      }}
    />

    <button className="smallBtn smallBtnPrimary" type="button" onClick={addTeen}>
      Adicionar
    </button>

    <button className="smallBtn dangerBtn" type="button" onClick={resetAllScores}>
      Zerar pontos
    </button>
  </div>

  {bulkMode ? (
    <div className="bulkGrid">
      <div className="bulkHeader">
        <div className="bulkNameCol">
          <div className="bulkCat">Adolescente</div>
          <div className="bulkPts">Marque para somar</div>
        </div>

        {categories.map((c) => (
          <div key={c.key} className="bulkNameCol">
            <div className="bulkCat">{c.label}</div>
            <div className="bulkPts">{c.points} pts</div>
          </div>
        ))}
      </div>

      {teens.map((t) => (
        <div key={t.id} className="bulkRow">
          <div className="bulkNameCol">
            <div className="bulkName">{t.name}</div>
            <div className="bulkCurrent">Total atual: {getTeenTotal(t.id)}</div>
          </div>

          {categories.map((c) => {
            const checked = !!bulkMarks?.[t.id]?.[c.key];
            return (
              <label
                key={c.key}
                className={["bulkCell", checked ? "bulkChecked" : ""].join(" ")}
              >
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => toggleBulkMark(t.id, c.key)}
                />
                <span className="checkLabel">+{c.points}</span>
              </label>
            );
          })}
        </div>
      ))}
    </div>
  ) : (
    <div className="rankList">
      {ranked.length === 0 ? (
        <div className="rankSubtitle" style={{ padding: 6 }}>
          Nenhum adolescente ainda. Adicione o primeiro acima.
        </div>
      ) : (
        ranked.map((t, i) => (
          <div key={t.id} className="rankRow">
            <div className="rankPos">#{i + 1}</div>

            <div>
              <div className="rankName">{t.name}</div>
            </div>

            <div className="rankTotal">{t.total}</div>

            <div className="rankBreakdown">
              {categories.map((c) => (
                <span key={c.key} className="pill">
                  {c.label}: {getTeenScoreByCategory(t.id, c.key)}
                </span>
              ))}
            </div>

            <button className="tinyBtn dangerBtn" type="button" onClick={() => removeTeen(t.id)}>
              remover
            </button>
          </div>
        ))
      )}
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
