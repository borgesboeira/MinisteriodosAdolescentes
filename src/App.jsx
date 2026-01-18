import "./App.css";
import { useEffect, useMemo, useRef, useState } from "react";
import { db, auth } from "./lib/firebase";
import { doc, setDoc, onSnapshot, serverTimestamp, getDoc } from "firebase/firestore";
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
} from "firebase/auth";

const ADMIN_EMAIL = import.meta.env.VITE_ADMIN_EMAIL;

async function doLogout() {
  await signOut(auth);
}

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

const RANKING_BG_PNG  = `${BASE}img/world/ranking-bg.png`;
const RANKING_BG_WEBP = RANKING_BG_PNG;

const PRE_RANKING_BG_PNG  = `${BASE}img/world/pre-ranking-bg.png`;
const PRE_RANKING_BG_WEBP = PRE_RANKING_BG_PNG;





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

function useStoredState(storageKey, fallbackFactory) {
  const getFallback = () =>
    typeof fallbackFactory === "function" ? fallbackFactory() : fallbackFactory;

  const [value, setValue] = useState(() => loadJSON(storageKey, getFallback()));
  const lastKeyRef = useRef(storageKey);

  // quando muda a chave (troca de grupo), carrega o conjunto certo
  useEffect(() => {
    setValue(loadJSON(storageKey, getFallback()));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storageKey]);

  // salva, mas NÃO salva o valor antigo na chave nova
  useEffect(() => {
    if (lastKeyRef.current !== storageKey) {
      lastKeyRef.current = storageKey;
      return;
    }
    saveJSON(storageKey, value);
  }, [storageKey, value]);

  return [value, setValue];
}



export default function App() {
  const [hoverSide, setHoverSide] = useState(null); // "left" | "right" | null
  const [route, setRoute] = useState("home"); // "home" | "ranking"
  const [rankBgReady, setRankBgReady] = useState(false);      // webp pronto
const [rankPngReady, setRankPngReady] = useState(false);    // png pronto
const [rankGroup, setRankGroup] = useState("teens"); // "teens" | "pre"
const [newCategoryLabel, setNewCategoryLabel] = useState("");
const [newCategoryPoints, setNewCategoryPoints] = useState(1);
// dentro de export default function App() { ... }
// onde você já tem outros useState
const [user, setUser] = useState(null);
const [showLogin, setShowLogin] = useState(false);

// ADICIONE ISTO:
const [adminPass, setAdminPass] = useState("");

// e mantenha o loginError
const [loginError, setLoginError] = useState("");
const isAdmin = !!user;


const ACTIVE_RANK_WEBP = rankGroup === "pre" ? PRE_RANKING_BG_WEBP : RANKING_BG_WEBP;
const ACTIVE_RANK_PNG  = rankGroup === "pre" ? PRE_RANKING_BG_PNG  : RANKING_BG_PNG;

useEffect(() => {
  const unsub = onAuthStateChanged(auth, (u) => {
    setUser(u || null);
  });
  return () => unsub();
}, []);

async function doLogout() {
  await signOut(auth);
  setBulkMode(false);
  setBulkMarks({});
  setShowSettings(false);
}

useEffect(() => {
  setBulkMode(false);
  setBulkMarks({});
  setShowSettings(false);
  setNewTeenName("");
}, [rankGroup]);

const STORE_PREFIX = rankGroup === "pre" ? "md_pre" : "md";


function slugifyKey(label) {
  return label
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

// (REMOVE COMPLETAMENTE)
// agora isAdmin vem do Auth real:

function addCategory() {
  if (!isAdmin) return;

  const label = newCategoryLabel.trim();
  const pts = Number(newCategoryPoints || 0);

  if (!label) return;

  let keyBase = slugifyKey(label) || `cat_${Date.now()}`;
  let key = keyBase;

  // garantir key única
  let i = 2;
  while (categoriesConfig.some((c) => c.key === key)) {
    key = `${keyBase}_${i++}`;
  }

  const nextCategories = [
    ...categoriesConfig,
    { key, label, defaultPoints: pts },
  ];

  const nextCategoryPoints = { ...(categoryPoints || {}), [key]: pts };

  // garante que scores tenham essa chave (0 inicial)
  const nextScores = { ...(scores || {}) };
  for (const t of teens) {
    nextScores[t.id] = { ...(nextScores[t.id] || {}) };
    if (typeof nextScores[t.id][key] !== "number") nextScores[t.id][key] = 0;
  }

  setCategoriesConfig(nextCategories);
  setCategoryPoints(nextCategoryPoints);
  setScores(nextScores);

  setNewCategoryLabel("");
  setNewCategoryPoints(1);

  saveRankingRemote(teens, nextCategories, nextCategoryPoints, nextScores);
}

function removeCategory(catKey) {
  if (!isAdmin) return;

  const cat = categoriesConfig.find((c) => c.key === catKey);
  const name = cat?.label || catKey;

  if (!window.confirm(`Excluir a categoria "${name}"?`)) return;
  if (!window.confirm(`CONFIRMA EXCLUSÃO DEFINITIVA da categoria "${name}"?`)) return;

  const nextCategories = categoriesConfig.filter((c) => c.key !== catKey);

  // remove do categoryPoints
  const nextCategoryPoints = { ...(categoryPoints || {}) };
  delete nextCategoryPoints[catKey];

  // remove de scores de todos
  const nextScores = { ...(scores || {}) };
  for (const teenId of Object.keys(nextScores)) {
    if (nextScores[teenId]) {
      const copy = { ...(nextScores[teenId] || {}) };
      delete copy[catKey];
      nextScores[teenId] = copy;
    }
  }

  setCategoriesConfig(nextCategories);
  setCategoryPoints(nextCategoryPoints);
  setScores(nextScores);

  saveRankingRemote(teens, nextCategories, nextCategoryPoints, nextScores);
}


useEffect(() => {
  let cancelled = false;
  let linkLow = null;
  let linkHigh = null;
    
  setRankBgReady(false);
  setRankPngReady(false);

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
  linkLow.href = ACTIVE_RANK_WEBP;
  document.head.appendChild(linkLow);

  (async () => {
    // garante webp carregado e decodificado
    const okWebp = await preloadAndDecode(ACTIVE_RANK_WEBP, 2).catch(() => false);
    if (cancelled) return;

    if (okWebp) await setRatioFrom(ACTIVE_RANK_WEBP);
    setRankBgReady(true);

    // 2) Depois que o webp está ok, começa PNG (nítido) em “low priority”
    const startHigh = async () => {
      linkHigh = document.createElement("link");
      linkHigh.rel = "preload";
      linkHigh.as = "image";
      linkHigh.href = ACTIVE_RANK_PNG;
      document.head.appendChild(linkHigh);

      const okPng = await preloadAndDecode(ACTIVE_RANK_PNG, 2).catch(() => false);
      if (cancelled) return;

      if (okPng) await setRatioFrom(ACTIVE_RANK_PNG);
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
}, [rankGroup]);

useEffect(() => {
  if (route !== "ranking") return;

  const isTouch = window.matchMedia("(hover: none) and (pointer: coarse)").matches;
if (!isTouch) return;

  const root = document.documentElement;
  let raf = 0;

  const strength = 0.32; // quanto desloca por pixel de scroll
  let maxShift = 260;    // será recalculado
  let pad = 900;         // será recalculado

  const readZoom = () => {
    const z = parseFloat(getComputedStyle(root).getPropertyValue("--rankBgZoom"));
    return Number.isFinite(z) && z > 1 ? z : 2.0; // fallback
  };

  const recalc = () => {
    const zoom = readZoom();

    // ✅ quanto "sobra" de imagem com zoom (aprox). Com zoom 2, dá ~1 tela extra.
    const ratio = parseFloat(getComputedStyle(root).getPropertyValue("--rankBgRatio")) || 3.125;
const vw = window.innerWidth;
const vh = window.innerHeight;

/* altura real da imagem “cover” antes do zoom */
const coverH = Math.max(vh, vw * ratio);

/* depois do zoom, quanto sobra além da tela */
maxShift = Math.max(260, Math.round(coverH * zoom - vh));


    // ✅ cria scroll extra suficiente pra atingir o maxShift
    pad = Math.ceil(maxShift / strength) + 240;

    root.style.setProperty("--rankScrollPad", `${pad}px`);
  };

  const tick = () => {
    const y = window.scrollY || 0;

    // ✅ conforme você rola pra baixo, você "vai descendo" na imagem (vê partes mais de baixo)
    const shift = Math.min(maxShift, Math.round(y * strength));
    root.style.setProperty("--rankBgParallax", `${-shift}px`);
  };

  const onScroll = () => {
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(tick);
  };

  recalc();
  tick();

  window.addEventListener("scroll", onScroll, { passive: true });
  window.addEventListener("resize", recalc);

  return () => {
    window.removeEventListener("scroll", onScroll);
    window.removeEventListener("resize", recalc);
    cancelAnimationFrame(raf);
    root.style.removeProperty("--rankBgParallax");
    root.style.removeProperty("--rankScrollPad");
  };
}, [route]);








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

useEffect(() => {
  const all = [
  ...BG_MAIN,
  ...BG_HOVER_LEFT,
  ...BG_HOVER_RIGHT,
  RANKING_BG_WEBP,
  RANKING_BG_PNG,
  PRE_RANKING_BG_WEBP,
  PRE_RANKING_BG_PNG,
].filter(Boolean);

  all.forEach((src) => {
  preloadAndDecode(src, 2).catch(() => {});
});
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
  const [teens, setTeens] = useStoredState(`${STORE_PREFIX}_teens`, () => DEFAULT_TEENS);

const [categoriesConfig, setCategoriesConfig] = useStoredState(
  `${STORE_PREFIX}_categoriesConfig`,
  () => DEFAULT_CATEGORIES
);


const [categoryPoints, setCategoryPoints] = useStoredState(
  `${STORE_PREFIX}_categoryPoints`,
  () => {
    const obj = {};
    for (const c of DEFAULT_CATEGORIES) obj[c.key] = c.defaultPoints;
    return obj;
  }
);

const [scores, setScores] = useStoredState(`${STORE_PREFIX}_scores`, () => ({}));
/* ---------- Firestore sync (insira aqui) ---------- */
const saveTimerRef = useRef(null);
const saveInProgressRef = useRef(false); // usaRef *dentro* do componente — CORRETO

/**
 * Troque isto por isto: salveRankingRemote(teens, categoryPoints, scores)
 * - só grava quando isAdmin === true (você usa PIN)
 * - debounce para evitar flood de writes
 */
function saveRankingRemote(nextTeens, nextCategoriesConfig, nextCategoryPoints, nextScores) {
  if (!isAdmin) return; // só admins podem enviar mudanças

  // limpa debounce anterior
  if (saveTimerRef.current) clearTimeout(saveTimerRef.current);

  // agenda gravação (debounce)
  saveTimerRef.current = setTimeout(async () => {
    saveInProgressRef.current = true; // sinaliza que estamos gravando (para onSnapshot ignorar)
    try {
      await setDoc(
        doc(db, "rankings", rankGroup),
        {
          teens: Array.isArray(nextTeens) ? nextTeens : [],
          categoriesConfig: Array.isArray(nextCategoriesConfig) ? nextCategoriesConfig : [],
          categoryPoints: nextCategoryPoints || {},
          scores: nextScores || {},
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );
      // opcional: console.log("Ranking salvo no Firestore");
    } catch (err) {
      console.error("Erro salvando no Firestore:", err);
    } finally {
      // mantemos o flag true por um curtíssimo tempo para evitar race com o snapshot
      setTimeout(() => {
        saveInProgressRef.current = false;
      }, 250);
    }
  }, 300); // debounce 300ms
}

/**
 * Live listener: quando o documento remoto mudar, atualiza estados locais.
 * Coloquei rankGroup como doc id (teens | pre).
 */
useEffect(() => {
  const ref = doc(db, "rankings", rankGroup);

  const unsub = onSnapshot(
    ref,
    (snap) => {
      if (saveInProgressRef.current) return; // ignora updates causados pelo próprio setDoc
      if (!snap.exists()) return;
      const data = snap.data();
      if (Array.isArray(data.categoriesConfig)) setCategoriesConfig(data.categoriesConfig);
      if (Array.isArray(data.teens)) setTeens(data.teens);
      if (data.categoryPoints) setCategoryPoints(data.categoryPoints);
      if (data.scores) setScores(data.scores);
    },
    (err) => {
      console.error("Erro no onSnapshot:", err);
    }
  );

  return () => unsub();
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, [rankGroup]);

/* ---------- fim Firestore sync ---------- */


  // UI
  const [bulkMode, setBulkMode] = useState(false);
  const [bulkMarks, setBulkMarks] = useState({}); // { [id]: { [catKey]: boolean } }
  const [showSettings, setShowSettings] = useState(false);
  const [newTeenName, setNewTeenName] = useState("");

useEffect(() => {
  console.log("[DEBUG] isAdmin:", isAdmin, "showSettings:", showSettings, "bulkMode:", bulkMode);
  console.log("[DEBUG] categoriesConfig:", categoriesConfig);
}, [isAdmin, showSettings, bulkMode, categoriesConfig]);


  async function doLogin() {
  setLoginError("");
  try {
    await signInWithEmailAndPassword(auth, ADMIN_EMAIL, adminPass);
    setShowLogin(false);
    setAdminPass("");
  } catch (err) {
    console.error(err);
    setLoginError("Senha incorreta.");
  }
}

  async function doLogout() {
  await signOut(auth);
  setBulkMode(false);
  setBulkMarks({});
  setShowSettings(false);
}


 const categories = categoriesConfig.map((c) => ({
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
  if (!isAdmin) return;

  const name = newTeenName.trim();
  if (!name) return;
  const id = `t_${Date.now()}`;

  const nextTeens = [...teens, { id, name }];

  const nextScores = {
    ...(scores || {}),
    [id]: Object.fromEntries(categories.map((c) => [c.key, 0])),
  };

  setTeens(nextTeens);
  setScores(nextScores);
  setNewTeenName("");

  // salva remoto
  saveRankingRemote(nextTeens, categoriesConfig, categoryPoints, nextScores);
}


  function removeTeen(id) {
  if (!isAdmin) return;

  const teen = teens.find((t) => t.id === id);
  const teenName = teen?.name || "este adolescente";

  // Confirmação 1
  if (!window.confirm(`Excluir ${teenName}?`)) return;

  // Confirmação 2 (mais enfática)
  if (!window.confirm(`CONFIRMA EXCLUSÃO DEFINITIVA de ${teenName}?`)) return;

  const nextTeens = teens.filter((t) => t.id !== id);

  const nextScores = { ...(scores || {}) };
  delete nextScores[id];

  setTeens(nextTeens);
  setScores(nextScores);

  setBulkMarks((prev) => {
    const next = { ...(prev || {}) };
    delete next[id];
    return next;
  });

  saveRankingRemote(nextTeens, categoriesConfig, categoryPoints, nextScores);
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
  if (!isAdmin) return;

  const nextScores = { ...(scores || {}) };

  for (const t of teens) {
    const marks = bulkMarks?.[t.id];
    if (!marks) continue;

    nextScores[t.id] = { ...(nextScores[t.id] || {}) };

    for (const c of categories) {
      if (marks[c.key]) {
        nextScores[t.id][c.key] =
          Number(nextScores[t.id][c.key] || 0) + Number(c.points || 0);
      }
    }
  }

  setScores(nextScores);

  setBulkMarks({});
  setBulkMode(false);

  saveRankingRemote(teens, categoriesConfig, categoryPoints, nextScores);
}


  function resetAllScores() {
  if (!isAdmin) return;

  const empty = {};
  setScores(empty);
  setBulkMarks({});
  setBulkMode(false);
  saveRankingRemote(teens, categoriesConfig, categoryPoints, empty);
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
    onMouseEnter={() => {
  setHoverSide("left");
  preloadAndDecode(PRE_RANKING_BG_WEBP, 2)
    .then(() => preloadAndDecode(PRE_RANKING_BG_PNG, 1))
    .catch(() => {});
}}
    onMouseMove={setSpotlight}
    onClick={() => {
  setHoverSide(null);
  setRankGroup("pre");
  setRoute("ranking");
  window.scrollTo(0, 0);
}}

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
  preloadAndDecode(RANKING_BG_WEBP, 2)
  .then(() => preloadAndDecode(RANKING_BG_PNG, 1))
  .catch(() => {});
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
  "--rankBgLow": `url(${ACTIVE_RANK_WEBP})`,
  "--rankBgHigh": `url(${ACTIVE_RANK_PNG})`,
}}

>

          <div className="rankTopBar">
  <button className="smallBtn" type="button" onClick={() => setRoute("home")}>
    ← Voltar
  </button>

{showLogin && (
  <div className="modalOverlay" role="dialog" aria-modal="true">
    <div className="modalCard">
      <div className="modalHeader">
        <div className="modalTitle">Login (Admin)</div>
        <button className="tinyBtn" type="button" onClick={() => setShowLogin(false)}>
          fechar
        </button>
      </div>

      <div className="settingsGrid">
        <div className="settingsRow" style={{ gridTemplateColumns: "1fr" }}>
          <div className="settingsLabel">Senha do Administrador</div>

<input
  className="textInput"
  type="password"
  value={adminPass}
  onChange={(e) => setAdminPass(e.target.value)}
  onKeyDown={(e) => {
    if (e.key === "Enter") doLogin();
  }}
  placeholder="••••••••"
/>

{loginError ? (
  <div style={{ color: "rgba(255,140,140,.95)", fontSize: 13 }}>
    {loginError}
  </div>
) : null}
        </div>
      </div>

      <div className="modalFooter">
        <button className="smallBtn smallBtnPrimary" type="button" onClick={doLogin}>
          Entrar
        </button>
      </div>
    </div>
  </div>
)}

  <div className="rankActions">
    {!isAdmin ? (
      <button className="smallBtn smallBtnPrimary" type="button" onClick={() => setShowLogin(true)}>
        Login
      </button>
    ) : (
      <>
        <button className="smallBtn" type="button" onClick={doLogout}>
          Sair
        </button>

        <button
          className={["smallBtn", bulkMode ? "smallBtnActive" : ""].join(" ")}
          type="button"
          onClick={() => {
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
          <button className="smallBtn" type="button" onClick={() => setShowSettings((v) => !v)}>
            Configurações
          </button>
        )}
      </>
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
{isAdmin && showSettings && !bulkMode && (
  <div className="settingsInline">
    <div className="settingsInlineHeader">
      <div className="settingsInlineTitle">Configurações de Pontuação</div>
      <button className="tinyBtn" type="button" onClick={() => setShowSettings(false)}>
        fechar
      </button>
    </div>

<div className="addTeenRow" style={{ borderTop: "1px solid rgba(255,255,255,.10)" }}>
  <input
    className="textInput"
    placeholder="Nova categoria (ex: Visita Missionária)"
    value={newCategoryLabel}
    onChange={(e) => setNewCategoryLabel(e.target.value)}
  />

  <input
    className="numInput"
    type="number"
    value={newCategoryPoints}
    onChange={(e) => setNewCategoryPoints(Number(e.target.value))}
    style={{ maxWidth: 120 }}
  />

  <button className="smallBtn smallBtnPrimary" type="button" onClick={addCategory}>
    Adicionar
  </button>
</div>


    <div className="settingsInline"></div>

    <div className="settingsGrid">
  {categories.map((c) => (
    <div key={c.key} className="settingsRow" style={{ gridTemplateColumns: "1fr 120px 90px" }}>
      {/* editar label */}
      <input
        className="textInput"
        value={c.label}
        onChange={(e) => {
          const label = e.target.value;

          setCategoriesConfig((prev) => {
            const next = prev.map((x) => (x.key === c.key ? { ...x, label } : x));
            saveRankingRemote(teens, next, categoryPoints, scores);
            return next;
          });
        }}
      />

      {/* editar pontos */}
      <input
        className="numInput"
        type="number"
        value={categoryPoints[c.key] ?? c.defaultPoints}
        onChange={(e) => {
          const val = Number(e.target.value);
          setCategoryPoints((prev) => {
            const next = { ...(prev || {}), [c.key]: val };
            saveRankingRemote(teens, categoriesConfig, next, scores);
            return next;
          });
        }}
      />

      {/* remover */}
      <button
        className="tinyBtn dangerBtn"
        type="button"
        onClick={() => removeCategory(c.key)}
      >
        remover
      </button>
    </div>
  ))}
</div>
  </div>
)}

{isAdmin && (
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
)}


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

            {isAdmin && (
  <button className="tinyBtn dangerBtn" type="button" onClick={() => removeTeen(t.id)}>
    remover
  </button>
)}

          </div>
        ))
      )}
    </div>
  )}
</section>
        
<div className="rankScrollPad" aria-hidden="true" />


        </main>
      )}
    </div>
  );
}

async function testFirestore() {
  try {
    const ref = doc(db, "debug", "hello");
    await setDoc(ref, { msg: "salve do Firestore", at: Date.now() });
    const snap = await getDoc(ref);
    console.log("Firestore leu:", snap.data());
    alert("Teste Firestore concluído. Veja console.");
  } catch (err) {
    console.error("Erro no testFirestore:", err);
    alert("Erro no teste. Veja console.");
  }
}

