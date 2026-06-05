import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getFirestore, doc, setDoc, onSnapshot, updateDoc } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyC2aGcaFnSL-aSp5XvFjb0WTiJFrEWJko0",
  authDomain: "ecos-del-trono.firebaseapp.com",
  projectId: "ecos-del-trono",
  storageBucket: "ecos-del-trono.firebasestorage.app",
  messagingSenderId: "916346464912",
  appId: "1:916346464912:web:3932c51cc83cfc330d8615",
  measurementId: "G-1EVTFCPC51"
};

// Inicialización de Servicios
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// Variables Globales de Control de Estado
let currentSalaId = "";
let currentPlayerName = "";
let currentImperio = "";
let currentRol = "";
let salaListener = null;

// ==========================================
// CONTROL DE NAVEGACIÓN DE PANTALLAS
// ==========================================
function switchScreen(screenId) {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    const targetScreen = document.getElementById(screenId);
    if (targetScreen) {
        targetScreen.classList.add('active');
    }
}

// ==========================================
// LÓGICA DEL PROFESOR (HOST)
// ==========================================
async function crearNuevaSala() {
    const numRandom = Math.floor(100 + Math.random() * 900);
    currentSalaId = `SENA-${numRandom}`;
    
    const salaInicial = {
        salaId: currentSalaId,
        estado: "esperando",
        fase: "Espera de Conexiones",
        tiempo: 240,
        eventoActual: "Esperando estabilización del mapa geopolítico continental.",
        jugadores: {},
        accionesEon: {}
    };

    try {
        await setDoc(doc(db, "salas", currentSalaId), salaInicial);
        document.getElementById('host-sala-display').innerText = currentSalaId;
        
        // Generar Código QR Dinámico
        const qrContainer = document.getElementById('qrcode-container');
        qrContainer.innerHTML = "";
        new QRCode(qrContainer, {
            text: window.location.href + `?sala=${currentSalaId}`,
            width: 160,
            height: 160
        });

        switchScreen('screen-host');
        escucharSala(currentSalaId, true);
    } catch (error) {
        console.error("Error al crear la sala en Firebase: ", error);
        alert("Error de conexión. Verifica las reglas de tu Firebase.");
    }
}

// ==========================================
// LÓGICA DEL ESTUDIANTE (JUGADOR)
// ==========================================
async function unirseJugador() {
    const salaInput = document.getElementById('input-sala-id').value.trim().toUpperCase();
    const nameInput = document.getElementById('input-player-name').value.trim();
    const imperioSelect = document.getElementById('select-imperio').value;
    const rolSelect = document.getElementById('select-rol').value;

    if (!salaInput || !nameInput) {
        alert("Por favor completa el código de sala y tu nombre.");
        return;
    }

    currentSalaId = salaInput;
    currentPlayerName = nameInput;
    currentImperio = imperioSelect;
    currentRol = rolSelect;

    // Actualizar visualmente la cabecera del estudiante
    document.getElementById('player-name-display').innerText = currentPlayerName;
    document.getElementById('player-imperio-display').innerText = `Imperio de ${currentImperio}`;
    document.getElementById('player-rol-display').innerText = currentRol;

    switchScreen('screen-player');
    inyectarMecanicasRol(currentRol);
    escucharSala(currentSalaId, false);
}

// Inyección de opciones dinámicas según el Rol del Alumno
function inyectarMecanicasRol(rol) {
    const container = document.getElementById('role-mechanic-container');
    container.innerHTML = "";

    const selector = document.createElement('select');
    selector.id = "player-action-select";
    selector.className = "custom-select-game";

    let opciones = [];
    if (rol === "Emperador") {
        opciones = ["Firmar Tratado de Paz Absoluta", "Declaración de Hostilidad Preventiva", "Decreto de Autarquía Continental"];
    } else if (rol === "Tesorero") {
        opciones = ["Inversión Estructural en Almacenes", "Subsidiar Canastas de Alimento", "Emitir Bonos de Emergencia Oro"];
    } else if (rol === "Diplomatico") {
        opciones = ["Establecer Alianza Comercial Bilateral", "Enviar Delegación de Paz", "Negociar Apertura de Fronteras"];
    } else if (rol === "Estratega") {
        opciones = ["Ejecutar Sabotaje Silencioso", "Reforzar Guarniciones Fronterizas", "Desplegar Patrullas de Reconocimiento"];
    } else {
        opciones = ["Asesoría Logística Avanzada", "Auditoría de Recursos Críticos"];
    }

    opciones.forEach(opc => {
        const o = document.createElement('option');
        o.value = opc;
        o.innerText = opc;
        selector.appendChild(o);
    });

    container.appendChild(selector);
}

// Enviar la Acción a Firebase (El botón que fallaba)
async function confirmarAccionEon() {
    const actionSelect = document.getElementById('player-action-select');
    if (!actionSelect) return;
    
    const accionElegida = actionSelect.value;
    const btn = document.getElementById('btn-submit-action');
    
    try {
        btn.disabled = true;
        btn.innerText = "⏳ Transmitiendo Orden...";

        const salaRef = doc(db, "salas", currentSalaId);
        const updates = {};
        updates[`accionesEon.${currentImperio}_${currentRol}`] = {
            jugador: currentPlayerName,
            accion: accionElegida,
            timestamp: new Date().toISOString()
        };

        await updateDoc(salaRef, updates);
        btn.innerText = "✅ Orden Confirmada de Forma Segura";
        btn.classList.add('btn-locked');
    } catch (e) {
        console.error("Error al transmitir la orden: ", e);
        alert("Error al enviar acción. Verifica tu internet o las reglas de Firebase.");
        btn.disabled = false;
        btn.innerText = "🔒 Confirmar Acción del Eón";
    }
}

// ==========================================
// RECEPTOR EN TIEMPO REAL (SNAPSHOTS)
// ==========================================
function escucharSala(salaId, isHost) {
    if (salaListener) salaListener();

    salaListener = onSnapshot(doc(db, "salas", salaId), (snapshot) => {
        if (!snapshot.exists()) return;
        const data = snapshot.data();

        if (isHost) {
            actualizarPantallaProfesor(data);
        } else {
            actualizarPantallaEstudiante(data);
        }
    });
}

function actualizarPantallaProfesor(data) {
    document.getElementById('host-timer').innerText = formatearTiempo(data.tiempo);
    document.getElementById('host-current-fase').innerText = `Fase: ${data.fase}`;
    document.getElementById('host-event-text').innerText = data.eventoActual;

    // Mostrar qué imperios ya enviaron acciones
    const acciones = data.accionesEon || {};
    const listaImperios = ["Aethelgard", "Ophir", "Vulcania", "Zion", "Kallisto"];
    
    listaImperios.forEach(imp => {
        const card = document.getElementById(`card-${imp}`);
        if (card) {
            // Verificar si algún rol de ese imperio ya ejecutó acción
            const rolesActivos = Object.keys(acciones).filter(k => k.startsWith(imp));
            if (rolesActivos.length > 0) {
                card.className = "imperio-card ready-glow";
                card.querySelector('p, .sync-status').innerText = `⚡ ${rolesActivos.length} Órdenes Listas`;
            } else {
                card.className = "imperio-card";
                card.querySelector('p, .sync-status').innerText = "💤 Esperando Decisiones...";
            }
        }
    });
}

function actualizarPantallaEstudiante(data) {
    document.getElementById('player-timer').innerText = formatearTiempo(data.tiempo);
    document.getElementById('event-player-info').innerText = data.eventoActual;

    // Reiniciar botón si el profesor cambia de fase o eón
    const btn = document.getElementById('btn-submit-action');
    if (data.fase === "Procesamiento de Datos") {
        btn.disabled = true;
        btn.innerText = "🚫 Eón Bloqueado - Profesor Evaluando Impacto";
    }
}

function formatearTiempo(segundos) {
    const mins = Math.floor(segundos / 60);
    const secs = segundos % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

// ==========================================
// ASIGNACIÓN DE ENVENTOS DE INTERFAZ
// ==========================================
document.addEventListener("DOMContentLoaded", () => {
    document.getElementById('btn-create-host').addEventListener('click', crearNuevaSala);
    document.getElementById('btn-join-player').addEventListener('click', unirseJugador);
    document.getElementById('btn-submit-action').addEventListener('click', confirmarAccionEon);
    
    // Auto-completar sala si viene en el enlace QR
    const urlParams = new URLSearchParams(window.location.search);
    const salaUrl = urlParams.get('sala');
    if (salaUrl) {
        document.getElementById('input-sala-id').value = salaUrl;
    }
});
