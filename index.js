/**
 * ECOS DEL TRONO v3.0 — index.js
 * Sistema completo de gobierno medieval por gremios
 *
 * Características nuevas:
 * - 6 gremios (máx. 5 jugadores cada uno = 30 total)
 * - 9 situaciones de 2 min = 18 min de partida
 * - Situaciones individuales por gremio + situaciones multi-gremio
 * - Chat en tiempo real por gremio
 * - Elección de líder por votación
 * - Rey Temporal para decisiones multi-gremio
 * - Recursos del reino que cambian según decisiones
 * - Moraleja final según resultado
 */
 
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import {
    getFirestore, doc, setDoc, onSnapshot,
    updateDoc, getDoc, arrayUnion
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
 
const firebaseConfig = {
  apiKey: "AIzaSyC2aGcaFnSL-aSp5XvFjb0WTiJFrEWJko0",
  authDomain: "ecos-del-trono.firebaseapp.com",
  projectId: "ecos-del-trono",
  storageBucket: "ecos-del-trono.firebasestorage.app",
  messagingSenderId: "916346464912",
  appId: "1:916346464912:web:3932c51cc83cfc330d8615",
  measurementId: "G-1EVTFCPC51"
};
 
const app = initializeApp(firebaseConfig);
const db  = getFirestore(app);
 
/* ============================================================
   CONSTANTES DEL JUEGO
   ============================================================ */
const GRUPOS = ["Campesinos","Guardia","Herreros","Mercaderes","Clerigos","Nobles"];
const MAX_POR_GRUPO   = 5;
const TIEMPO_RONDA    = 120; // 2 minutos en segundos
const TOTAL_RONDAS    = 9;   // 9 × 2 min = 18 min
 
const GRUPO_ICONS = {
    Campesinos: "🌾",
    Guardia:    "⚔️",
    Herreros:   "🔨",
    Mercaderes: "💰",
    Clerigos:   "📖",
    Nobles:     "🏰"
};
 
/* ============================================================
   SITUACIONES DEL REINO
   Tipos: "individual" (solo un gremio) | "multi" (varios gremios)
   
   efectos: qué recursos cambian según la opción elegida.
     formato: { food:±n, gold:±n, order:±n, morale:±n }
   
   afecta: qué gremios reciben la situación (en multi, todos los listados
           deben llegar a una decisión coordinada via Rey Temporal).
   ============================================================ */
const SITUACIONES = [
    // ── RONDA 1 — Individual: Campesinos ──
    {
        ronda: 1,
        tipo: "individual",
        afecta: ["Campesinos"],
        titulo: "🌾 La Plaga Silenciosa",
        texto: `Una extraña enfermedad está pudriendo los cultivos de trigo antes de la cosecha. 
Ya se perdió el 30% del grano. Si no actúan, el hambre llegará al reino en semanas. 
Sin embargo, quemar los campos infectados implica perder también la semilla para el próximo ciclo. 
¿Cuál es la decisión del gremio?`,
        opciones: [
            {
                texto: "🔥 Quemar los campos infectados ahora para salvar al reino",
                efectos: { food: -15, gold: 0, order: +5, morale: -5 },
                buena: true
            },
            {
                texto: "🌱 Esperar y tratar los cultivos con hierbas medicinales (arriesgado)",
                efectos: { food: -25, gold: -5, order: 0, morale: +5 },
                buena: false
            },
            {
                texto: "🏪 Comprar grano de emergencia al reino vecino con las reservas",
                efectos: { food: +10, gold: -20, order: 0, morale: +10 },
                buena: true
            }
        ]
    },
 
    // ── RONDA 2 — Individual: Guardia ──
    {
        ronda: 2,
        tipo: "individual",
        afecta: ["Guardia"],
        titulo: "⚔️ El Prisionero del Camino",
        texto: `La Guardia capturó a un hombre acusado de robar pan para sus hijos hambrientos. 
La ley del reino dice que el robo se castiga con cárcel. 
Pero el pueblo lo ve como un padre desesperado, no un criminal. 
Liberarlo podría debilitar el respeto a la ley. Encarcelarlo podría encender el descontento popular.`,
        opciones: [
            {
                texto: "⛓️ Aplicar la ley: encarcelarlo según las normas del reino",
                efectos: { food: 0, gold: 0, order: +10, morale: -15 },
                buena: false
            },
            {
                texto: "🤲 Liberarlo con advertencia pública y compensación a la víctima",
                efectos: { food: 0, gold: -5, order: -5, morale: +15 },
                buena: true
            },
            {
                texto: "📋 Crear un fondo de emergencia para familias sin alimento",
                efectos: { food: +5, gold: -15, order: +5, morale: +20 },
                buena: true
            }
        ]
    },
 
    // ── RONDA 3 — Individual: Herreros ──
    {
        ronda: 3,
        tipo: "individual",
        afecta: ["Herreros"],
        titulo: "🔨 El Puente Que Se Hunde",
        texto: `El único puente de piedra que conecta el mercado con los campos de cultivo 
está cediendo. Si colapsa, el comercio y el transporte de alimentos se paralizarán semanas. 
Repararlo ahora cuesta mucho hierro y tiempo. 
Construir uno temporal de madera es más rápido pero durará poco. 
No hacer nada es el mayor riesgo.`,
        opciones: [
            {
                texto: "🪵 Construir un puente temporal de madera (rápido pero frágil)",
                efectos: { food: +5, gold: -10, order: 0, morale: +5 },
                buena: false
            },
            {
                texto: "🪨 Reparación completa de piedra (lenta pero permanente)",
                efectos: { food: -5, gold: -20, order: +10, morale: +15 },
                buena: true
            },
            {
                texto: "🚫 Cerrar el puente y desviar el tráfico por la ruta larga",
                efectos: { food: -15, gold: -5, order: -10, morale: -10 },
                buena: false
            }
        ]
    },
 
    // ── RONDA 4 — Individual: Mercaderes ──
    {
        ronda: 4,
        tipo: "individual",
        afecta: ["Mercaderes"],
        titulo: "💰 El Comerciante Extranjero",
        texto: `Un mercader de un reino lejano ofrece vender seda y especias raras a precios 
muy bajos. Pero los artesanos locales dicen que eso los arruinará porque nadie comprará 
sus productos si hay algo más barato. El pueblo quiere los precios bajos. 
Los gremios locales amenazan con cerrar sus talleres.`,
        opciones: [
            {
                texto: "🌍 Abrir el mercado al comerciante extranjero libremente",
                efectos: { food: 0, gold: +20, order: -10, morale: +5 },
                buena: false
            },
            {
                texto: "🚧 Prohibir su entrada para proteger a los artesanos locales",
                efectos: { food: 0, gold: -10, order: +5, morale: -5 },
                buena: false
            },
            {
                texto: "🤝 Negociar: el extranjero paga impuesto y solo vende lo que no producimos",
                efectos: { food: 0, gold: +10, order: +5, morale: +10 },
                buena: true
            }
        ]
    },
 
    // ── RONDA 5 — Individual: Clérigos ──
    {
        ronda: 5,
        tipo: "individual",
        afecta: ["Clerigos"],
        titulo: "📖 La Enfermedad del Agua",
        texto: `Varios aldeanos llegaron con fiebre alta y diarrea. 
Los clérigos sospechan que el pozo principal está contaminado. 
Cerrar el pozo evita más enfermos, pero deja al pueblo sin agua inmediata. 
Usar hierbas medicinales toma días y no todos sobrevivirán. 
Hay una fuente limpia a 2 horas de camino pero hay que organizar el transporte.`,
        opciones: [
            {
                texto: "🚫 Cerrar el pozo de inmediato y racionar el agua almacenada",
                efectos: { food: -10, gold: 0, order: +5, morale: -10 },
                buena: true
            },
            {
                texto: "🌿 Tratar a los enfermos con lo que hay y seguir usando el pozo con cuidado",
                efectos: { food: 0, gold: 0, order: -10, morale: -20 },
                buena: false
            },
            {
                texto: "🐴 Organizar brigadas para traer agua limpia de la fuente lejana",
                efectos: { food: -5, gold: -10, order: +10, morale: +15 },
                buena: true
            }
        ]
    },
 
    // ── RONDA 6 — Individual: Nobles ──
    {
        ronda: 6,
        tipo: "individual",
        afecta: ["Nobles"],
        titulo: "🏰 El Impuesto Impopular",
        texto: `Las arcas del reino están casi vacías. El consejo de nobles debe decidir 
si aumenta los impuestos. Cobrarle más a los ricos conserva el apoyo del pueblo, 
pero los nobles poderosos pueden rebelarse. Cobrarle más a los pobres llenará las arcas 
rápido pero generará revueltas. No cobrar más lleva a la quiebra del reino.`,
        opciones: [
            {
                texto: "👑 Aumentar impuestos solo a las tierras más ricas y grandes",
                efectos: { food: 0, gold: +20, order: -10, morale: +15 },
                buena: true
            },
            {
                texto: "🪙 Impuesto parejo a todos, ricos y pobres por igual",
                efectos: { food: 0, gold: +15, order: -5, morale: -15 },
                buena: false
            },
            {
                texto: "📊 Reducir el gasto del palacio y vender tierras reales no usadas",
                efectos: { food: 0, gold: +10, order: +5, morale: +20 },
                buena: true
            }
        ]
    },
 
    // ── RONDA 7 — MULTI: Campesinos + Guardia ──
    {
        ronda: 7,
        tipo: "multi",
        afecta: ["Campesinos","Guardia"],
        titulo: "🌾⚔️ La Marcha del Hambre",
        texto: `Cientos de campesinos hambrientos marchan hacia el castillo exigiendo alimento. 
La Guardia debe decidir si los detiene o los deja pasar. 
Los Campesinos deben decidir si siguen la marcha o aceptan negociar. 
Esta decisión afecta tanto el orden del reino como la producción de alimentos. 
Ambos gremios deben llegar a un acuerdo.`,
        opciones: [
            {
                texto: "🤝 Campesinos detienen la marcha, Guardia garantiza reparto de pan",
                efectos: { food: -15, gold: -10, order: +10, morale: +20 },
                buena: true
            },
            {
                texto: "🛡️ Guardia bloquea la marcha y promete investigar el hambre",
                efectos: { food: 0, gold: 0, order: +5, morale: -25 },
                buena: false
            },
            {
                texto: "📣 Ambos grupos marchan juntos al palacio para exigir solución real",
                efectos: { food: +5, gold: -15, order: -15, morale: +25 },
                buena: true
            }
        ]
    },
 
    // ── RONDA 8 — MULTI: Herreros + Mercaderes + Nobles ──
    {
        ronda: 8,
        tipo: "multi",
        afecta: ["Herreros","Mercaderes","Nobles"],
        titulo: "🔨💰🏰 La Crisis del Hierro",
        texto: `Las minas de hierro se agotaron. Sin hierro no hay herramientas, sin herramientas 
no hay producción, sin producción no hay comercio, y sin comercio el reino no recauda impuestos. 
Los Herreros quieren explorar nuevas minas (costoso), 
los Mercaderes quieren importar hierro (más caro), 
los Nobles quieren reciclar armas viejas del ejército (compromete la seguridad). 
Los tres gremios deben llegar a UNA sola decisión.`,
        opciones: [
            {
                texto: "⛏️ Explorar nuevas minas: inversión larga pero solución permanente",
                efectos: { food: -5, gold: -25, order: +5, morale: +10 },
                buena: true
            },
            {
                texto: "🚢 Importar hierro del extranjero: rápido pero crea dependencia",
                efectos: { food: 0, gold: -20, order: 0, morale: +5 },
                buena: false
            },
            {
                texto: "♻️ Reciclar armas + racionar herramientas mientras se buscan alternativas",
                efectos: { food: 0, gold: -10, order: -15, morale: -5 },
                buena: false
            }
        ]
    },
 
    // ── RONDA 9 — MULTI: TODOS LOS GREMIOS (decisión final del reino) ──
    {
        ronda: 9,
        tipo: "multi",
        afecta: ["Campesinos","Guardia","Herreros","Mercaderes","Clerigos","Nobles"],
        titulo: "👑 El Gran Concilio del Reino",
        texto: `Un reino vecino poderoso envía un ultimátum: o el reino se une a su alianza 
(pagando tributo anual y cediendo tierras fronterizas) o declaran guerra en 30 días. 
El pueblo está dividido. La guerra puede destruir todo lo construido, 
pero ceder tierras y pagar tributo debilita al reino para siempre. 
Existe una tercera opción: buscar aliados propios entre otros reinos pequeños. 
Todos los gremios deben unirse en UNA decisión. El Rey Temporal tendrá la última palabra.`,
        opciones: [
            {
                texto: "⚔️ Rechazar el ultimátum y preparar la defensa del reino",
                efectos: { food: -20, gold: -25, order: +20, morale: +30 },
                buena: true
            },
            {
                texto: "🏳️ Aceptar la alianza y pagar el tributo para evitar la guerra",
                efectos: { food: +5, gold: -30, order: -10, morale: -25 },
                buena: false
            },
            {
                texto: "🌐 Enviar emisarios urgentes a reinos vecinos para formar coalición",
                efectos: { food: -5, gold: -15, order: +10, morale: +20 },
                buena: true
            }
        ]
    }
];
 
/* ============================================================
   ESTADO GLOBAL
   ============================================================ */
const S = {
    salaId:          "",
    playerName:      "",
    grupo:           "",
    isHost:          false,
    isLeader:        false,
    rondaActual:     0,          // índice 0-8
    timerInterval:   null,
    salaListener:    null,
    chatListener:    null,
    selectedOption:  null,       // índice de opción seleccionada
    electionDone:    false,      // ¿ya se eligió líder para esta ronda?
    tempKingDone:    false,      // ¿ya se eligió Rey Temporal para esta multi-ronda?
    recursos: { food:70, gold:60, order:75, morale:65 },
};
 
/* ============================================================
   UTILIDADES
   ============================================================ */
const fmt = (seg) => {
    const s = Math.max(0, Math.floor(seg));
    return `${String(Math.floor(s/60)).padStart(2,"0")}:${String(s%60).padStart(2,"0")}`;
};
 
const san = (str) => {
    const d = document.createElement("div");
    d.textContent = str;
    return d.innerHTML;
};
 
function toast(msg, type="info", ms=3500) {
    const c = document.getElementById("toast-container");
    if (!c) return;
    const t = document.createElement("div");
    t.className = `toast ${type}`;
    t.textContent = msg;
    c.appendChild(t);
    setTimeout(() => { t.style.opacity="0"; t.style.transform="translateX(18px)"; t.style.transition="all .3s"; setTimeout(()=>t.remove(),310); }, ms);
}
 
function setBar(barId, valId, val) {
    const bar = document.getElementById(barId);
    const txt = document.getElementById(valId);
    const clamped = Math.max(0, Math.min(100, Math.round(val)));
    if (bar) bar.style.width = clamped + "%";
    if (txt) txt.textContent = clamped;
}
 
function updateAllBars(recursos, prefix) {
    setBar(`${prefix}bar-food`,   `${prefix}val-food`,   recursos.food);
    setBar(`${prefix}bar-gold`,   `${prefix}val-gold`,   recursos.gold);
    setBar(`${prefix}bar-order`,  `${prefix}val-order`,  recursos.order);
    setBar(`${prefix}bar-morale`, `${prefix}val-morale`, recursos.morale);
}
 
/* ============================================================
   NAVEGACIÓN DE PANTALLAS
   ============================================================ */
function switchScreen(id) {
    document.querySelectorAll(".screen").forEach(s=>s.classList.remove("active"));
    const t = document.getElementById(id);
    if (t) t.classList.add("active");
}
 
/* ============================================================
   LISTENERS FIRESTORE
   ============================================================ */
function detachAll() {
    if (S.salaListener) { S.salaListener(); S.salaListener = null; }
    if (S.chatListener) { S.chatListener(); S.chatListener = null; }
}
 
function attachSalaListener() {
    if (S.salaListener) { S.salaListener(); S.salaListener = null; }
    S.salaListener = onSnapshot(
        doc(db, "salas", S.salaId),
        snap => { if (!snap.exists()) return; const d=snap.data(); S.isHost ? actualizarHost(d) : actualizarPlayer(d); },
        err  => { console.error(err); toast("Conexión perdida con el reino.", "error"); }
    );
}
 
function attachChatListener(grupo) {
    if (S.chatListener) { S.chatListener(); S.chatListener = null; }
    S.chatListener = onSnapshot(
        doc(db, "salas", S.salaId, "chats", grupo),
        snap => {
            if (!snap.exists()) return;
            const msgs = snap.data().mensajes || [];
            renderChat(msgs);
        }
    );
}
 
/* ============================================================
   CREAR SALA (PROFESOR)
   ============================================================ */
async function crearSala() {
    const btn = document.getElementById("btn-create-host");
    btn.disabled = true;
    btn.innerHTML = `<span class="spinner"></span> Fundando el Reino...`;
 
    const num    = Math.floor(100 + Math.random()*900);
    const salaId = `REINO-${num}`;
 
    const salaDoc = {
        salaId,
        estado:        "esperando",
        ronda:         0,
        tiempo:        TIEMPO_RONDA,
        eventoActual:  "",
        situacion:     null,
        recursos:      { food:70, gold:60, order:75, morale:65 },
        jugadores:     {},
        decisiones:    {},  // { grupo: { opcionIndex, jugador, timestamp } }
        votos:         {},  // { grupo: { votante: candidato } } para elección de líder
        lideres:       {},  // { grupo: nombre }
        reyTemporal:   null,
        gruposTemporal:[],
        votosRey:      {},  // { nombre_votante: candidato }
    };
 
    try {
        await setDoc(doc(db,"salas",salaId), salaDoc);
        // Inicializar chats por grupo
        for (const g of GRUPOS) {
            await setDoc(doc(db,"salas",salaId,"chats",g), { mensajes:[] });
        }
 
        S.salaId  = salaId;
        S.isHost  = true;
        document.getElementById("host-sala-display").textContent = salaId;
 
        const qrc = document.getElementById("qrcode-container");
        qrc.innerHTML = "";
        new QRCode(qrc, {
            text:       `${window.location.href.split("?")[0]}?sala=${salaId}`,
            width:      150, height:150,
            colorDark:  "#000", colorLight: "#fff"
        });
 
        switchScreen("screen-host");
        attachSalaListener();
        toast("¡Reino fundado! Comparte el código.", "success");
    } catch(e) {
        console.error(e);
        toast("Error al conectar con Firebase.", "error", 5000);
        btn.disabled = false;
        btn.textContent = "⚜️ Fundar el Reino";
    }
}
 
/* ============================================================
   INICIAR SIMULACIÓN (PROFESOR)
   ============================================================ */
async function iniciarSimulacion() {
    if (!S.salaId || S.timerInterval) return;
    const btnS = document.getElementById("btn-start-game");
    const btnN = document.getElementById("btn-next-round");
    btnS.disabled = true; btnS.textContent = "⚡ Simulación en curso";
    if (btnN) { btnN.style.display="block"; btnN.disabled=false; }
    await lanzarRonda(0);
}
 
async function lanzarRonda(idx) {
    if (idx >= TOTAL_RONDAS) { await finalizarSimulacion(); return; }
 
    S.rondaActual = idx;
    limpiarTimer();
 
    const sit = SITUACIONES[idx];
    const salaRef = doc(db,"salas",S.salaId);
 
    await updateDoc(salaRef, {
        estado:         "jugando",
        ronda:          idx,
        tiempo:         TIEMPO_RONDA,
        eventoActual:   sit.titulo,
        situacion:      sit,
        decisiones:     {},
        votos:          {},
        votosRey:       {},
        reyTemporal:    null,
        gruposTemporal: sit.afecta,
        eleccionPendiente: true,
    });
 
    let t = TIEMPO_RONDA;
    S.timerInterval = setInterval(async () => {
        t--;
        const el = document.getElementById("host-timer");
        if (el) { el.textContent = fmt(t); el.classList.toggle("warning", t<=30); }
        if (t % 10 === 0 && t > 0) await updateDoc(salaRef, { tiempo: t }).catch(console.error);
        if (t <= 0) { limpiarTimer(); await avanzarRonda(); }
    }, 1000);
}
 
async function avanzarRonda() {
    const btnN = document.getElementById("btn-next-round");
    if (btnN) btnN.disabled = true;
    limpiarTimer();
    const snap = await getDoc(doc(db,"salas",S.salaId));
    if (!snap.exists()) return;
    const data = snap.data();
    await lanzarRonda((data.ronda || 0) + 1);
    if (btnN) btnN.disabled = false;
}
 
async function finalizarSimulacion() {
    limpiarTimer();
    const salaRef = doc(db,"salas",S.salaId);
    const snap = await getDoc(salaRef);
    const r = snap.data().recursos;
    const survived = r.food>20 && r.gold>10 && r.order>20 && r.morale>20;
    await updateDoc(salaRef, { estado:"finalizado", ronda: TOTAL_RONDAS, survived });
}
 
function limpiarTimer() {
    clearInterval(S.timerInterval);
    S.timerInterval = null;
}
 
/* ============================================================
   UNIRSE COMO JUGADOR (ESTUDIANTE)
   ============================================================ */
async function unirseJugador() {
    const sala   = document.getElementById("input-sala-id").value.trim().toUpperCase();
    const nombre = document.getElementById("input-player-name").value.trim();
    const grupo  = document.getElementById("select-grupo").value;
 
    if (!sala)   { toast("Ingresa el código del reino.", "error"); return; }
    if (!nombre || nombre.length<2) { toast("Ingresa un nombre de al menos 2 caracteres.", "error"); return; }
 
    // Verificar sala existe
    const snap = await getDoc(doc(db,"salas",sala));
    if (!snap.exists()) { toast("Ese código de reino no existe.", "error"); return; }
 
    const data = snap.data();
 
    // Verificar límite del grupo
    const miembrosGrupo = Object.values(data.jugadores||{}).filter(j=>j.grupo===grupo);
    if (miembrosGrupo.length >= MAX_POR_GRUPO) {
        toast(`El gremio ${grupo} ya tiene ${MAX_POR_GRUPO} miembros. Elige otro.`, "error", 4000);
        return;
    }
 
    // Verificar nombre único en la sala
    if (data.jugadores && data.jugadores[nombre]) {
        toast("Ese nombre ya está en uso en esta sala.", "error");
        return;
    }
 
    S.salaId     = sala;
    S.playerName = san(nombre);
    S.grupo      = grupo;
    S.isHost     = false;
    S.isLeader   = false;
 
    // Registrar jugador en Firestore
    await updateDoc(doc(db,"salas",sala), {
        [`jugadores.${S.playerName}`]: { grupo, nombre:S.playerName, timestamp: new Date().toISOString() }
    });
 
    // Actualizar UI
    document.getElementById("player-group-display").textContent = `${GRUPO_ICONS[grupo]} ${grupo}`;
    document.getElementById("player-name-display").textContent  = S.playerName;
    document.getElementById("chat-group-label").textContent     = `Gremio: ${grupo}`;
    document.getElementById("player-member-badge").textContent  = "Miembro";
 
    switchScreen("screen-player");
    attachSalaListener();
    attachChatListener(grupo);
}
 
/* ============================================================
   ACTUALIZAR PANTALLA DEL PROFESOR
   ============================================================ */
function actualizarHost(data) {
    // Fase
    const faseEl = document.getElementById("host-current-fase");
    if (faseEl) faseEl.textContent = `Ronda ${(data.ronda||0)+1} / ${TOTAL_RONDAS}`;
 
    // Evento
    const evEl = document.getElementById("host-event-text");
    if (evEl && data.situacion) {
        evEl.textContent = data.situacion.texto;
        const afEl = document.getElementById("host-afecta");
        const afGr = document.getElementById("host-afecta-grupos");
        if (afEl && afGr) {
            afEl.style.display = "inline-flex";
            afGr.textContent = (data.situacion.afecta||[]).join(", ");
        }
    }
 
    // Recursos
    if (data.recursos) {
        S.recursos = data.recursos;
        updateAllBars(data.recursos, "");
    }
 
    // Conteo y estado de grupos
    const jugadores = data.jugadores || {};
    const decisiones = data.decisiones || {};
    GRUPOS.forEach(g => {
        const card     = document.getElementById(`card-${g}`);
        const statusEl = card?.querySelector(".group-status");
        const countEl  = document.getElementById(`count-${g}`);
        const miembros = Object.values(jugadores).filter(j=>j.grupo===g).length;
        if (countEl) countEl.textContent = `${miembros} / ${MAX_POR_GRUPO} miembros`;
        if (!card) return;
        if (decisiones[g]) {
            card.classList.add("ready");
            if (statusEl) statusEl.textContent = "✅ Decisión tomada";
        } else {
            card.classList.remove("ready");
            if (statusEl) statusEl.textContent = miembros>0 ? "🗣️ Deliberando..." : "💤 Esperando...";
        }
    });
 
    if (data.estado === "finalizado") mostrarDebriefing(data);
}
 
/* ============================================================
   ACTUALIZAR PANTALLA DEL JUGADOR
   ============================================================ */
let _lastRonda = -1;
let _lastEleccionKey = "";
 
function actualizarPlayer(data) {
    // Timer
    const tEl = document.getElementById("player-timer");
    if (tEl) { tEl.textContent = fmt(data.tiempo||0); tEl.classList.toggle("urgent",(data.tiempo||0)<=30); }
 
    // Recursos
    if (data.recursos) { S.recursos = data.recursos; updateAllBars(data.recursos, "p-"); }
 
    // Lideres
    const lideres = data.lideres || {};
    S.isLeader = lideres[S.grupo] === S.playerName;
    const lbadge = document.getElementById("player-leader-badge");
    const mbadge = document.getElementById("player-member-badge");
    if (lbadge && mbadge) {
        lbadge.style.display = S.isLeader ? "inline-block" : "none";
        mbadge.style.display = S.isLeader ? "none"         : "inline-block";
    }
 
    const sit = data.situacion;
    if (!sit) return;
 
    const rondaActual = data.ronda ?? 0;
    const miAfecta    = (sit.afecta||[]).includes(S.grupo);
 
    // Nueva ronda: resetear estado local
    if (rondaActual !== _lastRonda) {
        _lastRonda = rondaActual;
        S.selectedOption  = null;
        S.electionDone    = false;
        S.tempKingDone    = false;
        _lastEleccionKey  = "";
        renderSituacion(sit, data, miAfecta);
    }
 
    // Detectar inicio de proceso de elección (eleccionPendiente)
    if (data.eleccionPendiente && !S.electionDone && miAfecta) {
        const eleccionKey = `${rondaActual}-${sit.tipo}`;
        if (eleccionKey !== _lastEleccionKey) {
            _lastEleccionKey = eleccionKey;
            if (sit.tipo === "multi") {
                // Primero advertencia, luego elección de Rey Temporal
                mostrarAdvertenciaMulti(sit, data);
            } else {
                // Elección normal de líder de gremio
                mostrarEleccionLider(data);
            }
        }
    }
 
    // Si la elección ya terminó, cerrar modales y actualizar líder
    if ((lideres[S.grupo] || data.reyTemporal) && S.electionDone) {
        cerrarModales();
    }
 
    // Estado final
    if (data.estado === "finalizado") {
        limpiarTimer();
        detachAll();
        mostrarDebriefing(data);
        switchScreen("screen-debriefing");
    }
}
 
/* ============================================================
   RENDERIZAR SITUACIÓN EN PANEL DEL JUGADOR
   ============================================================ */
function renderSituacion(sit, data, miAfecta) {
    const infoBox = document.getElementById("event-player-info");
    const optsCont = document.getElementById("options-container");
    const prevCont = document.getElementById("consequences-preview");
    const lnote    = document.getElementById("leader-note");
    const btnS     = document.getElementById("btn-submit-action");
 
    if (!infoBox || !optsCont) return;
 
    if (!miAfecta) {
        infoBox.textContent = `📭 Tu gremio no participa en esta decisión. Observa y apoya a los demás.`;
        infoBox.classList.add("active");
        optsCont.innerHTML = "";
        if (prevCont) prevCont.style.display = "none";
        if (lnote)    lnote.style.display    = "none";
        if (btnS)     btnS.disabled          = true;
        return;
    }
 
    infoBox.innerHTML = `<strong>${san(sit.titulo)}</strong><br><br>${san(sit.texto).replace(/\n/g,"<br>")}`;
    infoBox.classList.add("active");
    if (prevCont) prevCont.style.display = "none";
 
    // Botones de opción
    optsCont.innerHTML = "";
    sit.opciones.forEach((op, i) => {
        const btn = document.createElement("button");
        btn.type      = "button";
        btn.className = "option-btn";
        btn.textContent = op.texto;
        btn.dataset.index = i;
        btn.addEventListener("click", () => seleccionarOpcion(i, sit, btn));
        optsCont.appendChild(btn);
    });
 
    // Nota de líder
    if (lnote) lnote.style.display = "block";
    if (btnS) {
        btnS.disabled = true;
        btnS.textContent = "🔒 Confirmar Decisión Final";
        btnS.style.backgroundColor = "";
        btnS.style.borderColor     = "";
    }
}
 
function seleccionarOpcion(i, sit, btnEl) {
    if (!S.isLeader) { toast("Solo el Líder del gremio puede seleccionar la decisión.", "info"); return; }
    S.selectedOption = i;
 
    // Highlight visual
    document.querySelectorAll(".option-btn").forEach(b => b.classList.remove("selected"));
    btnEl.classList.add("selected");
 
    // Mostrar preview de consecuencias
    const prevCont = document.getElementById("consequences-preview");
    const ef       = sit.opciones[i].efectos;
    if (prevCont) {
        prevCont.style.display = "flex";
        prevCont.innerHTML = Object.entries(ef).map(([k,v]) => {
            const label = {food:"🌾 Alimento",gold:"🪙 Tesoro",order:"⚔️ Orden",morale:"💜 Moral"}[k];
            const cls   = v >= 0 ? "good" : "bad";
            const sign  = v >= 0 ? "+" : "";
            return `<span class="consequence-tag ${cls}">${label} ${sign}${v}</span>`;
        }).join("");
    }
 
    const btnS = document.getElementById("btn-submit-action");
    if (btnS) btnS.disabled = false;
}
 
/* ============================================================
   CONFIRMAR DECISIÓN
   ============================================================ */
async function confirmarDecision() {
    if (!S.isLeader)            { toast("Solo el Líder puede confirmar.", "info"); return; }
    if (S.selectedOption===null){ toast("Selecciona una opción primero.", "error"); return; }
 
    const sit = SITUACIONES[S.rondaActual];
    if (!sit) return;
 
    // Para multi, verificar que este es el Rey Temporal
    const snap = await getDoc(doc(db,"salas",S.salaId));
    const data  = snap.data();
    if (sit.tipo === "multi" && data.reyTemporal !== S.playerName) {
        toast("Solo el Rey Temporal puede confirmar la decisión multi-gremio.", "info");
        return;
    }
 
    const btnS = document.getElementById("btn-submit-action");
    btnS.disabled = true;
    btnS.innerHTML = `<span class="spinner"></span> Sellando la decisión...`;
 
    const op      = sit.opciones[S.selectedOption];
    const ef      = op.efectos;
    const nuevosR = {
        food:   Math.max(0, Math.min(100, S.recursos.food   + (ef.food  ||0))),
        gold:   Math.max(0, Math.min(100, S.recursos.gold   + (ef.gold  ||0))),
        order:  Math.max(0, Math.min(100, S.recursos.order  + (ef.order ||0))),
        morale: Math.max(0, Math.min(100, S.recursos.morale + (ef.morale||0))),
    };
 
    try {
        await updateDoc(doc(db,"salas",S.salaId), {
            [`decisiones.${S.grupo}`]: {
                jugador:      S.playerName,
                opcionIndex:  S.selectedOption,
                opcionTexto:  op.texto,
                efectos:      ef,
                timestamp:    new Date().toISOString(),
            },
            recursos: nuevosR,
            eleccionPendiente: false,
        });
        btnS.textContent = "✅ Decisión Sellada";
        btnS.style.backgroundColor = "var(--emerald)";
        toast("Decisión confirmada para el reino.", "success");
    } catch(e) {
        console.error(e);
        toast("Error al confirmar la decisión.", "error");
        btnS.disabled = false;
        btnS.textContent = "🔒 Confirmar Decisión Final";
    }
}
 
/* ============================================================
   ELECCIÓN DE LÍDER DE GREMIO
   ============================================================ */
async function mostrarEleccionLider(data) {
    S.electionDone = true;
    const jugadores = Object.values(data.jugadores||{}).filter(j=>j.grupo===S.grupo);
    if (jugadores.length === 0) return;
 
    const modal = document.getElementById("modal-election");
    const title = document.getElementById("modal-election-title");
    const desc  = document.getElementById("modal-election-desc");
    const grid  = document.getElementById("vote-grid");
    const result= document.getElementById("vote-result");
 
    title.textContent = `Elige al Líder de los ${S.grupo}`;
    desc.textContent  = "Vota por quién guiará las decisiones de tu gremio.";
    result.style.display = "none";
    grid.innerHTML    = "";
 
    jugadores.forEach(j => {
        const btn = document.createElement("button");
        btn.className = "vote-btn";
        btn.type = "button";
        btn.innerHTML = `<span class="vote-crown">👤</span> ${san(j.nombre)}`;
        btn.addEventListener("click", () => emitirVotoLider(j.nombre, jugadores.length));
        grid.appendChild(btn);
    });
 
    modal.classList.add("active");
}
 
async function emitirVotoLider(candidato, total) {
    await updateDoc(doc(db,"salas",S.salaId), {
        [`votos.${S.grupo}.${S.playerName}`]: candidato
    });
 
    // Verificar si ya hay mayoría
    const snap  = await getDoc(doc(db,"salas",S.salaId));
    const votos = snap.data().votos?.[S.grupo] || {};
    const conteo= {};
    Object.values(votos).forEach(v => { conteo[v]=(conteo[v]||0)+1; });
    const ganador = Object.entries(conteo).sort((a,b)=>b[1]-a[1])[0];
 
    if (ganador && ganador[1] >= Math.ceil(total/2)) {
        await updateDoc(doc(db,"salas",S.salaId), { [`lideres.${S.grupo}`]: ganador[0] });
        mostrarResultadoEleccion(ganador[0]);
    } else {
        toast("Voto registrado. Esperando más votos...", "info");
    }
}
 
function mostrarResultadoEleccion(ganador) {
    const grid   = document.getElementById("vote-grid");
    const result = document.getElementById("vote-result");
    if (grid)   grid.style.display   = "none";
    if (result) {
        result.style.display = "block";
        result.innerHTML = `
            <span class="crown-big">👑</span>
            <h3>${san(ganador)} es el nuevo Líder</h3>
            <p>Guiará las decisiones del gremio en esta ronda.</p>
        `;
    }
    setTimeout(() => cerrarModales(), 2500);
}
 
/* ============================================================
   ADVERTENCIA Y ELECCIÓN DE REY TEMPORAL (multi-gremio)
   ============================================================ */
function mostrarAdvertenciaMulti(sit, data) {
    S.electionDone = true;
    const wModal = document.getElementById("modal-warning-multi");
    const wTitle = document.getElementById("modal-warning-title");
    const wDesc  = document.getElementById("modal-warning-desc");
 
    wTitle.textContent = sit.titulo;
    wDesc.textContent  = `A continuación vendrá una decisión muy importante sobre el destino del reino. Los gremios involucrados (${sit.afecta.join(", ")}) deben elegir a su Rey Temporal, quien tomará la decisión final tras dialogar.`;
 
    wModal.classList.add("active");
}
 
async function iniciarEleccionReyTemporal(data) {
    const wModal = document.getElementById("modal-warning-multi");
    wModal.classList.remove("active");
 
    const sit    = data.situacion || SITUACIONES[S.rondaActual];
    const grupos = sit.afecta || [];
    if (!grupos.includes(S.grupo)) return;
 
    // Candidatos: todos los líderes de los grupos afectados
    const lideres  = data.lideres || {};
    const candidatos = grupos.map(g => lideres[g]).filter(Boolean);
 
    if (candidatos.length === 0) {
        toast("Los líderes de los grupos aún no han sido elegidos.", "info");
        return;
    }
 
    const modal = document.getElementById("modal-election");
    const title = document.getElementById("modal-election-title");
    const desc  = document.getElementById("modal-election-desc");
    const grid  = document.getElementById("vote-grid");
    const result= document.getElementById("vote-result");
 
    title.textContent = "⚔️ Elige al Rey Temporal del Reino";
    desc.textContent  = `Solo los líderes de los gremios afectados (${grupos.join(", ")}) votarán. El Rey Temporal tomará la decisión final.`;
    result.style.display = "none";
    grid.innerHTML = "";
 
    candidatos.forEach(c => {
        const btn = document.createElement("button");
        btn.className = "vote-btn";
        btn.type = "button";
        btn.innerHTML = `<span class="vote-crown">👑</span> ${san(c)}`;
        // Solo votan los líderes de grupos afectados
        if (lideres[S.grupo] !== S.playerName) {
            btn.disabled = true;
            btn.style.opacity = ".4";
        }
        btn.addEventListener("click", () => emitirVotoRey(c, candidatos.length));
        grid.appendChild(btn);
    });
 
    if (lideres[S.grupo] !== S.playerName) {
        const note = document.createElement("p");
        note.style.cssText = "color:var(--text-mid);font-size:.82rem;text-align:center;margin-top:12px;font-style:italic;";
        note.textContent = "Solo los Líderes de los gremios afectados pueden votar.";
        grid.appendChild(note);
    }
 
    modal.classList.add("active");
}
 
async function emitirVotoRey(candidato, totalCandidatos) {
    const snap     = await getDoc(doc(db,"salas",S.salaId));
    const data     = snap.data();
    const lideres  = data.lideres || {};
    if (lideres[S.grupo] !== S.playerName) return; // Solo líderes votan
 
    await updateDoc(doc(db,"salas",S.salaId), {
        [`votosRey.${S.playerName}`]: candidato
    });
 
    const snap2   = await getDoc(doc(db,"salas",S.salaId));
    const votos   = snap2.data().votosRey || {};
    const conteo  = {};
    Object.values(votos).forEach(v=>{conteo[v]=(conteo[v]||0)+1;});
    const ganador = Object.entries(conteo).sort((a,b)=>b[1]-a[1])[0];
 
    if (ganador && ganador[1] >= Math.ceil(totalCandidatos/2)) {
        await updateDoc(doc(db,"salas",S.salaId), { reyTemporal: ganador[0], eleccionPendiente:false });
        mostrarResultadoEleccion(ganador[0]);
        // Actualizar líder del grupo del Rey Temporal para que pueda confirmar
        S.isLeader = (ganador[0] === S.playerName);
    } else {
        toast("Voto registrado. Esperando más votos...", "info");
    }
}
 
function cerrarModales() {
    document.querySelectorAll(".modal-overlay").forEach(m=>m.classList.remove("active"));
}
 
/* ============================================================
   CHAT
   ============================================================ */
async function enviarMensaje() {
    const input = document.getElementById("chat-input");
    const msg   = input?.value.trim();
    if (!msg || !S.salaId || !S.grupo) return;
    input.value = "";
 
    try {
        await updateDoc(doc(db,"salas",S.salaId,"chats",S.grupo), {
            mensajes: arrayUnion({
                quien:     S.playerName,
                texto:     san(msg),
                esLider:   S.isLeader,
                timestamp: new Date().toISOString()
            })
        });
    } catch(e) {
        console.error(e);
        toast("Error al enviar mensaje.", "error");
    }
}
 
function renderChat(msgs) {
    const box = document.getElementById("chat-messages");
    if (!box) return;
    box.innerHTML = msgs.slice(-60).map(m => {
        const cls = m.esLider ? "chat-msg leader-msg" : "chat-msg";
        return `<div class="${cls}"><span class="chat-who">${san(m.quien||"?")}</span>${san(m.texto||"")}</div>`;
    }).join("");
    box.scrollTop = box.scrollHeight;
}
 
/* ============================================================
   DEBRIEFING FINAL
   ============================================================ */
function mostrarDebriefing(data) {
    const r        = data.recursos || S.recursos;
    const survived = data.survived ?? (r.food>20 && r.gold>10 && r.order>20 && r.morale>20);
 
    // Banner
    const banner = document.getElementById("survival-banner");
    if (banner) {
        banner.className = `survival-banner ${survived ? "survived" : "collapsed"}`;
        banner.textContent = survived
            ? "🏰 El reino sobrevivió — Las decisiones del pueblo lo sostuvieron"
            : "💀 El reino colapsó — Las malas decisiones pasaron factura";
    }
 
    // Moraleja
    const mor = document.getElementById("moraleja-box");
    if (mor) {
        mor.textContent = survived
            ? `"Un pueblo que delibera con sabiduría y coopera en los momentos difíciles construye un legado que perdura más que cualquier muro. Las decisiones correctas no son siempre las más fáciles, pero sí las más justas."`
            : `"El reino que actúa dividido, que prioriza el interés propio sobre el bien común, cae más rápido que cualquier enemigo externo. Recuerda: las grandes crisis no las vence un rey, las vence un pueblo unido."`;
    }
 
    // Barras finales
    updateAllBars(r, "f-");
 
    // Grid de grupos con sus decisiones
    const grid = document.getElementById("final-groups-grid");
    const decisiones = data.decisiones || {};
    if (grid) {
        grid.innerHTML = GRUPOS.map(g => {
            const d   = decisiones[g];
            const icon= GRUPO_ICONS[g];
            return `
                <div class="final-group-card">
                    <span class="group-icon">${icon}</span>
                    <h4>${san(g)}</h4>
                    <p class="decisions-count">${d ? `✅ "${san(d.opcionTexto)}"` : "❌ Sin decisión"}</p>
                </div>`;
        }).join("");
    }
 
    if (!S.isHost) switchScreen("screen-debriefing");
}
 
/* ============================================================
   REINICIAR
   ============================================================ */
function reiniciar() {
    limpiarTimer();
    detachAll();
    Object.assign(S, {
        salaId:"", playerName:"", grupo:"", isHost:false, isLeader:false,
        rondaActual:0, selectedOption:null, electionDone:false, tempKingDone:false,
        recursos:{ food:70, gold:60, order:75, morale:65 }
    });
    _lastRonda=-1; _lastEleccionKey="";
    document.getElementById("input-sala-id").value="";
    document.getElementById("input-player-name").value="";
    switchScreen("screen-auth");
}
 
/* ============================================================
   DOM READY
   ============================================================ */
document.addEventListener("DOMContentLoaded", () => {
 
    document.getElementById("btn-create-host")  ?.addEventListener("click", crearSala);
    document.getElementById("btn-start-game")   ?.addEventListener("click", iniciarSimulacion);
    document.getElementById("btn-next-round")   ?.addEventListener("click", avanzarRonda);
    document.getElementById("btn-join-player")  ?.addEventListener("click", unirseJugador);
    document.getElementById("btn-submit-action")?.addEventListener("click", confirmarDecision);
    document.getElementById("btn-send-chat")    ?.addEventListener("click", enviarMensaje);
    document.getElementById("btn-restart")      ?.addEventListener("click", reiniciar);
 
    // Advertencia multi: botón "Entendido"
    document.getElementById("btn-warning-ok")?.addEventListener("click", async () => {
        const snap = await getDoc(doc(db, S.salaId ? "salas" : "_", S.salaId || "_"));
        if (snap.exists()) iniciarEleccionReyTemporal(snap.data());
    });
 
    // Chat con Enter
    document.getElementById("chat-input")?.addEventListener("keydown", e => {
        if (e.key === "Enter") { e.preventDefault(); enviarMensaje(); }
    });
 
    // Pre-rellenar código desde URL (QR)
    const salaUrl = new URLSearchParams(window.location.search).get("sala");
    if (salaUrl) {
        const inp = document.getElementById("input-sala-id");
        if (inp) inp.value = salaUrl.toUpperCase().slice(0,9);
    }
 
    // Prevenir cierre accidental
    window.addEventListener("beforeunload", e => {
        if (S.salaId) { e.preventDefault(); e.returnValue=""; }
    });
});
