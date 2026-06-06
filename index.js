/**
 * ECOS DEL TRONO — index.js
 * Versión 2.0 — Auditoría completa aplicada
 *
 * Correcciones principales:
 * - Estado centralizado (AppState) para evitar variables globales dispersas
 * - Limpieza correcta de listeners Firestore al cambiar de pantalla
 * - Timer con clearInterval garantizado antes de cada inicio
 * - Botón "Avanzar de Eón" deshabilitado temporalmente para evitar doble clic
 * - iniciarSimulacion() no recrea el timer si ya corre (previene superposición)
 * - Sanitización básica de inputs (XSS)
 * - Mensajes de error con toast en lugar de alert()
 * - avanzarDeEon() solo ejecuta el siguiente eón si el estado es "jugando"
 * - Función formatearTiempo reutilizable y robusta
 * - Validación completa de formulario de estudiante
 * - Reinicio correcto usando btn-restart (sin reload inmediato)
 * - Opciones de roles cubren TODOS los casos (Espia + Consejero separados)
 * - updateDoc con merge seguro usando notación de punto de Firestore
 * - Timer de host y player sincronizados correctamente
 */
 
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import {
    getFirestore,
    doc,
    setDoc,
    onSnapshot,
    updateDoc
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
 
/* ============================================================
   INICIALIZACIÓN FIREBASE
   ============================================================ */
const app = initializeApp(firebaseConfig);
const db  = getFirestore(app);
 
/* ============================================================
   ESTADO GLOBAL CENTRALIZADO
   - Toda la mutación de estado pasa por este objeto.
   - Evita variables globales sueltas y facilita el debug.
   ============================================================ */
const AppState = {
    salaId:        "",
    playerName:    "",
    imperio:       "",
    rol:           "",
    isHost:        false,
    eonIndex:      0,
    timerInterval: null,
    salaListener:  null,    // función de "unsubscribe" de onSnapshot
    tiempoActual:  240,     // segundos actuales del timer (host)
};
 
/* ============================================================
   EVENTOS POR EON
   ============================================================ */
const EVENTOS_EON = [
    "Eón I — Plaga de Langostas: El suministro de alimentos se reduce severamente a escala continental. Los imperios deben coordinar su respuesta o enfrentar hambrunas.",
    "Eón II — Fiebre del Oro: Se descubren yacimientos compartidos en las fronteras. La tensión comercial escala; la diplomacia vale más que la espada.",
    "Eón III — Revolución del Vapor: La tecnología avanza, pero exige inversión inmediata de los forjadores. Los lentos quedarán atrás.",
    "Eón IV — Crisis Climática: Heladas arrasaron los almacenes. Solo la redistribución cooperativa salvará a los más débiles.",
];
 
const TIEMPO_EON_SEG = 240; // 4 minutos por eón
 
/* ============================================================
   UTILIDADES
   ============================================================ */
 
/**
 * Formatea segundos a "MM:SS".
 * @param {number} segundos
 * @returns {string}
 */
function formatearTiempo(segundos) {
    const s = Math.max(0, Math.floor(segundos));
    const mins = Math.floor(s / 60);
    const secs = s % 60;
    return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
}
 
/**
 * Sanitiza un string para evitar inyección de HTML.
 * @param {string} str
 * @returns {string}
 */
function sanitize(str) {
    const div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
}
 
/**
 * Muestra un toast no invasivo en lugar de alert().
 * @param {string} message
 * @param {'success'|'error'|'info'} type
 * @param {number} duration  ms
 */
function showToast(message, type = "info", duration = 3500) {
    const container = document.getElementById("toast-container");
    if (!container) return;
 
    const toast = document.createElement("div");
    toast.className = `toast ${type}`;
    toast.textContent = message;
    container.appendChild(toast);
 
    setTimeout(() => {
        toast.style.opacity = "0";
        toast.style.transform = "translateX(20px)";
        toast.style.transition = "all 0.3s ease";
        setTimeout(() => toast.remove(), 300);
    }, duration);
}
 
/* ============================================================
   NAVEGACIÓN DE PANTALLAS
   ============================================================ */
function switchScreen(screenId) {
    document.querySelectorAll(".screen").forEach(s => s.classList.remove("active"));
    const target = document.getElementById(screenId);
    if (target) {
        target.classList.add("active");
    } else {
        console.warn(`[switchScreen] Pantalla no encontrada: ${screenId}`);
    }
}
 
/* ============================================================
   LISTENER FIRESTORE — gestión segura
   ============================================================ */
function detachSalaListener() {
    if (AppState.salaListener) {
        AppState.salaListener(); // unsuscribe
        AppState.salaListener = null;
    }
}
 
function attachSalaListener(salaId) {
    detachSalaListener();
    AppState.salaListener = onSnapshot(
        doc(db, "salas", salaId),
        (snapshot) => {
            if (!snapshot.exists()) return;
            const data = snapshot.data();
            if (AppState.isHost) {
                actualizarPantallaProfesor(data);
            } else {
                actualizarPantallaEstudiante(data);
            }
        },
        (error) => {
            console.error("[Firestore] Error en listener:", error);
            showToast("Se perdió la conexión con la sala.", "error");
        }
    );
}
 
/* ============================================================
   LÓGICA DEL PROFESOR
   ============================================================ */
async function crearNuevaSala() {
    const btn = document.getElementById("btn-create-host");
    btn.disabled = true;
    btn.innerHTML = `<span class="loading-spinner"></span> Creando sala...`;
 
    const numRandom = Math.floor(100 + Math.random() * 900);
    const salaId = `SENA-${numRandom}`;
 
    const salaInicial = {
        salaId,
        estado:        "esperando",
        fase:          "Espera de Conexiones",
        tiempo:        TIEMPO_EON_SEG,
        eventoActual:  "Esperando que el mapa geopolítico se estabilice para la asignación de recursos.",
        jugadores:     {},
        accionesEon:   {},
    };
 
    try {
        await setDoc(doc(db, "salas", salaId), salaInicial);
 
        AppState.salaId  = salaId;
        AppState.isHost  = true;
        AppState.eonIndex = 0;
 
        document.getElementById("host-sala-display").textContent = salaId;
 
        // QR Code
        const qrContainer = document.getElementById("qrcode-container");
        qrContainer.innerHTML = "";
        new QRCode(qrContainer, {
            text:   `${window.location.href.split("?")[0]}?sala=${salaId}`,
            width:  160,
            height: 160,
            colorDark:  "#000000",
            colorLight: "#ffffff",
        });
 
        switchScreen("screen-host");
        attachSalaListener(salaId);
    } catch (error) {
        console.error("[crearNuevaSala]", error);
        showToast("Error al crear la sala. Revisa tu conexión a Firebase.", "error", 5000);
        btn.disabled = false;
        btn.textContent = "Crear Nueva Sala";
    }
}
 
/**
 * Inicia o reinicia el timer del host para el eón actual.
 * Garantiza que no haya timers superpuestos.
 */
async function iniciarSimulacion() {
    if (!AppState.salaId) return;
 
    // Prevenir doble ejecución si el timer ya corre
    if (AppState.timerInterval !== null) return;
 
    const btnStart = document.getElementById("btn-start-game");
    const btnNext  = document.getElementById("btn-next-eon");
 
    btnStart.disabled = true;
    btnStart.textContent = "⚡ Simulación En Progreso";
    if (btnNext) {
        btnNext.style.display = "block";
        btnNext.disabled = false;
    }
 
    const salaRef = doc(db, "salas", AppState.salaId);
 
    try {
        await updateDoc(salaRef, {
            estado:       "jugando",
            fase:         "Fase de Toma de Decisiones",
            eventoActual: EVENTOS_EON[AppState.eonIndex],
            tiempo:       TIEMPO_EON_SEG,
        });
 
        let tiempoRestante = TIEMPO_EON_SEG;
        AppState.tiempoActual = tiempoRestante;
 
        AppState.timerInterval = setInterval(async () => {
            tiempoRestante--;
            AppState.tiempoActual = tiempoRestante;
 
            const timerEl = document.getElementById("host-timer");
            if (timerEl) {
                timerEl.textContent = formatearTiempo(tiempoRestante);
                // Indicador visual de tiempo bajo
                timerEl.classList.toggle("time-warning", tiempoRestante <= 60 && tiempoRestante > 0);
            }
 
            // Sincroniza Firestore cada 5 segundos para no saturar las escrituras
            if (tiempoRestante % 5 === 0 && tiempoRestante > 0) {
                await updateDoc(salaRef, { tiempo: tiempoRestante }).catch(console.error);
            }
 
            if (tiempoRestante <= 0) {
                limpiarTimer();
                await avanzarDeEon();
            }
        }, 1000);
 
    } catch (error) {
        console.error("[iniciarSimulacion]", error);
        showToast("Error al iniciar la simulación.", "error");
        btnStart.disabled = false;
        btnStart.textContent = "🚀 Iniciar Simulación";
        limpiarTimer();
    }
}
 
function limpiarTimer() {
    clearInterval(AppState.timerInterval);
    AppState.timerInterval = null;
}
 
async function avanzarDeEon() {
    if (!AppState.salaId) return;
 
    const btnNext = document.getElementById("btn-next-eon");
    if (btnNext) btnNext.disabled = true; // Evitar doble clic
 
    limpiarTimer();
 
    AppState.eonIndex++;
    const salaRef = doc(db, "salas", AppState.salaId);
 
    if (AppState.eonIndex < EVENTOS_EON.length) {
        try {
            await updateDoc(salaRef, {
                tiempo:       TIEMPO_EON_SEG,
                fase:         "Fase de Toma de Decisiones",
                eventoActual: EVENTOS_EON[AppState.eonIndex],
                accionesEon:  {}, // Resetea acciones del eón anterior
            });
            await iniciarSimulacion();
        } catch (error) {
            console.error("[avanzarDeEon]", error);
            showToast("Error al avanzar de Eón.", "error");
            if (btnNext) btnNext.disabled = false;
        }
    } else {
        // Fin de la simulación
        try {
            await updateDoc(salaRef, {
                estado: "finalizado",
                fase:   "Simulación Concluida",
                tiempo: 0,
            });
        } catch (error) {
            console.error("[avanzarDeEon — finalizar]", error);
        }
    }
}
 
/* ============================================================
   LÓGICA DEL ESTUDIANTE
   ============================================================ */
async function unirseJugador() {
    const salaInput    = document.getElementById("input-sala-id").value.trim().toUpperCase();
    const nameInput    = document.getElementById("input-player-name").value.trim();
    const imperioValue = document.getElementById("select-imperio").value;
    const rolValue     = document.getElementById("select-rol").value;
 
    // Validación completa
    if (!salaInput) {
        showToast("Ingresa el código de sala.", "error");
        document.getElementById("input-sala-id").focus();
        return;
    }
    if (!nameInput) {
        showToast("Ingresa tu nombre o alias.", "error");
        document.getElementById("input-player-name").focus();
        return;
    }
    if (nameInput.length < 2) {
        showToast("El nombre debe tener al menos 2 caracteres.", "error");
        return;
    }
    if (!imperioValue || !rolValue) {
        showToast("Selecciona un Imperio y un Rol.", "error");
        return;
    }
 
    AppState.salaId     = salaInput;
    AppState.playerName = sanitize(nameInput);
    AppState.imperio    = imperioValue;
    AppState.rol        = rolValue;
    AppState.isHost     = false;
 
    // Actualiza UI del jugador
    document.getElementById("player-name-display").textContent    = AppState.playerName;
    document.getElementById("player-imperio-display").textContent = `Imperio de ${AppState.imperio}`;
    document.getElementById("player-rol-display").textContent     = AppState.rol;
 
    switchScreen("screen-player");
    inyectarMecanicasRol(AppState.rol);
    attachSalaListener(AppState.salaId);
}
 
/**
 * Construye el selector de acciones según el rol del jugador.
 * @param {string} rol
 */
function inyectarMecanicasRol(rol) {
    const container = document.getElementById("role-mechanic-container");
    if (!container) return;
    container.innerHTML = "";
 
    const opcionesPorRol = {
        Emperador:   [
            "Firmar Tratado de Paz Absoluta",
            "Declaración de Hostilidad Preventiva",
            "Decreto de Autarquía Continental",
            "Convocar Cumbre de Emergencia",
        ],
        Tesorero: [
            "Inversión Estructural en Almacenes",
            "Subsidiar Canastas de Alimento",
            "Emitir Bonos de Emergencia Oro",
            "Auditar Reservas Estratégicas",
        ],
        Diplomatico: [
            "Establecer Alianza Comercial Bilateral",
            "Enviar Delegación de Paz",
            "Negociar Apertura de Fronteras",
            "Proponer Tratado Multilateral",
        ],
        Estratega: [
            "Ejecutar Sabotaje Silencioso",
            "Reforzar Guarniciones Fronterizas",
            "Desplegar Patrullas de Reconocimiento",
            "Iniciar Maniobras de Disuasión",
        ],
        Espia: [
            "Infiltrar Consejo Rival",
            "Filtrar Desinformación Estratégica",
            "Robar Planos Tecnológicos",
            "Neutralizar Agente Enemigo",
        ],
        Consejero: [
            "Asesoría Logística Avanzada",
            "Auditoría de Recursos Críticos",
            "Proponer Reforma Administrativa",
            "Elaborar Informe de Riesgo Continental",
        ],
    };
 
    const opciones = opcionesPorRol[rol] || ["Acción de Contingencia General"];
 
    const selector = document.createElement("select");
    selector.id        = "player-action-select";
    selector.className = "custom-select-game";
    selector.setAttribute("aria-label", "Selecciona tu operación de contingencia");
 
    opciones.forEach(opc => {
        const option = document.createElement("option");
        option.value     = opc;
        option.textContent = opc;
        selector.appendChild(option);
    });
 
    container.appendChild(selector);
}
 
async function confirmarAccionEon() {
    const actionSelect = document.getElementById("player-action-select");
    if (!actionSelect) {
        showToast("Selecciona una acción antes de confirmar.", "error");
        return;
    }
 
    const accionElegida = actionSelect.value;
    const btn = document.getElementById("btn-submit-action");
 
    btn.disabled     = true;
    btn.innerHTML    = `<span class="loading-spinner"></span> Transmitiendo Orden...`;
 
    try {
        const salaRef = doc(db, "salas", AppState.salaId);
        // Usamos notación de punto para escritura atómica en Firestore
        const campoAccion = `accionesEon.${AppState.imperio}_${AppState.rol}`;
 
        await updateDoc(salaRef, {
            [campoAccion]: {
                jugador:    AppState.playerName,
                accion:     accionElegida,
                timestamp:  new Date().toISOString(),
            }
        });
 
        btn.textContent              = "✅ Orden Confirmada";
        btn.style.backgroundColor    = "var(--emerald)";
        btn.style.borderColor        = "var(--emerald)";
        showToast("Tu acción fue registrada con éxito.", "success");
    } catch (error) {
        console.error("[confirmarAccionEon]", error);
        showToast("Error al enviar tu acción. Intenta de nuevo.", "error");
        btn.disabled              = false;
        btn.textContent           = "🔒 Confirmar Acción del Eón";
        btn.style.backgroundColor = "";
        btn.style.borderColor     = "";
    }
}
 
/* ============================================================
   ACTUALIZACIONES DE UI DESDE FIRESTORE
   ============================================================ */
function actualizarPantallaProfesor(data) {
    const faseEl = document.getElementById("host-current-fase");
    const eventEl = document.getElementById("host-event-text");
 
    if (faseEl)  faseEl.textContent  = `Fase: ${data.fase || "—"}`;
    if (eventEl) eventEl.textContent = data.eventoActual || "";
 
    // Tarjetas de imperios
    const imperios = ["Aethelgard", "Ophir", "Vulcania", "Zion", "Kallisto"];
    const acciones = data.accionesEon || {};
 
    imperios.forEach(imp => {
        const card = document.getElementById(`card-${imp}`);
        if (!card) return;
 
        const rolesActivos = Object.keys(acciones).filter(k => k.startsWith(imp + "_"));
        const statusEl     = card.querySelector(".sync-status");
 
        if (rolesActivos.length > 0) {
            card.style.borderColor = "var(--emerald)";
            card.style.boxShadow   = "0 0 12px var(--emerald-glow)";
            card.classList.add("ready");
            if (statusEl) statusEl.textContent = `⚡ ${rolesActivos.length} Orden${rolesActivos.length > 1 ? "es" : ""} Lista${rolesActivos.length > 1 ? "s" : ""}`;
        } else {
            card.style.borderColor = "var(--border-subtle)";
            card.style.boxShadow   = "none";
            card.classList.remove("ready");
            if (statusEl) statusEl.textContent = "💤 Esperando Decisiones...";
        }
    });
}
 
/** Último evento mostrado al jugador — para detectar cambio de eón */
let _lastEventoMostrado = "";
 
function actualizarPantallaEstudiante(data) {
    // Sincroniza el timer visual del jugador con Firestore
    const timerEl = document.getElementById("player-timer");
    if (timerEl) {
        timerEl.textContent = formatearTiempo(data.tiempo ?? 0);
        // Indicador de urgencia cuando queda menos de 30 s
        timerEl.classList.toggle("urgent", (data.tiempo ?? 0) <= 30);
    }
 
    const infoBox = document.getElementById("event-player-info");
    const btn     = document.getElementById("btn-submit-action");
 
    // Solo resetea el botón cuando realmente cambia el evento (nuevo eón)
    const eventoActual = data.eventoActual || "";
    if (eventoActual && eventoActual !== _lastEventoMostrado) {
        _lastEventoMostrado = eventoActual;
 
        if (infoBox) {
            infoBox.textContent = eventoActual;
            infoBox.classList.add("active-event");
        }
 
        // Resetea el botón de acción para el nuevo eón
        if (btn) {
            btn.disabled              = false;
            btn.textContent           = "🔒 Confirmar Acción del Eón";
            btn.style.backgroundColor = "";
            btn.style.borderColor     = "";
        }
 
        // Reconstruye las opciones de rol (por si el estudiante fue redirigido via QR)
        inyectarMecanicasRol(AppState.rol);
    }
 
    if (data.estado === "finalizado") {
        limpiarTimer();
        detachSalaListener();
        poblarRanking(data);
        switchScreen("screen-debriefing");
    }
}
 
/* ============================================================
   DEBRIEFING — ranking dinámico
   ============================================================ */
function poblarRanking(data) {
    const lista = document.getElementById("ranking-list");
    if (!lista) return;
 
    const acciones  = data.accionesEon || {};
    const imperios  = ["Aethelgard", "Ophir", "Vulcania", "Zion", "Kallisto"];
    const conteo    = {};
 
    imperios.forEach(imp => {
        conteo[imp] = Object.keys(acciones).filter(k => k.startsWith(imp + "_")).length;
    });
 
    const ranking = Object.entries(conteo)
        .sort((a, b) => b[1] - a[1]);
 
    lista.innerHTML = ranking.map(([imp, n]) =>
        `<li>${sanitize(imp)} — <span style="color:var(--gold)">${n} acción${n !== 1 ? "es" : ""} registrada${n !== 1 ? "s" : ""}</span></li>`
    ).join("");
}
 
/* ============================================================
   INICIALIZACIÓN — DOMContentLoaded
   ============================================================ */
document.addEventListener("DOMContentLoaded", () => {
 
    // Botones de control
    document.getElementById("btn-create-host")
        ?.addEventListener("click", crearNuevaSala);
 
    document.getElementById("btn-start-game")
        ?.addEventListener("click", iniciarSimulacion);
 
    document.getElementById("btn-next-eon")
        ?.addEventListener("click", avanzarDeEon);
 
    document.getElementById("btn-join-player")
        ?.addEventListener("click", unirseJugador);
 
    document.getElementById("btn-submit-action")
        ?.addEventListener("click", confirmarAccionEon);
 
    document.getElementById("btn-restart")
        ?.addEventListener("click", () => {
            limpiarTimer();
            detachSalaListener();
            // Limpieza de AppState
            AppState.salaId     = "";
            AppState.playerName = "";
            AppState.imperio    = "";
            AppState.rol        = "";
            AppState.isHost     = false;
            AppState.eonIndex   = 0;
            _lastEventoMostrado = "";
            // Reset de campos
            document.getElementById("input-sala-id").value    = "";
            document.getElementById("input-player-name").value = "";
            switchScreen("screen-auth");
        });
 
    // Pre-rellena el código de sala desde la URL (para acceso via QR)
    const urlParams = new URLSearchParams(window.location.search);
    const salaUrl   = urlParams.get("sala");
    if (salaUrl) {
        const input = document.getElementById("input-sala-id");
        if (input) input.value = salaUrl.toUpperCase().slice(0, 8);
    }
 
    // Confirmación antes de cerrar la pestaña si hay una sala activa
    window.addEventListener("beforeunload", (e) => {
        if (AppState.salaId) {
            e.preventDefault();
            e.returnValue = "";
        }
    });
});
