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
let timerInterval = null; // Controla el reloj del Profesor

// Eventos que se lanzarán automáticamente en cada Eón
const eventosEon = [
    "Eón I: Plaga de Langostas. El suministro de alimentos se reduce severamente a escala continental.",
    "Eón II: Fiebre del Oro. Descubren yacimientos compartidos en las fronteras. La tensión comercial aumenta.",
    "Eón III: Revolución del Vapor. La tecnología avanza, pero exige inversión inmediata de los forjadores.",
    "Eón IV: Crisis Climática. Heladas destruyen almacenes. Se requiere diplomacia para redistribuir recursos."
];
let eonActualIndex = 0;

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
        tiempo: 240, // 4 minutos en segundos
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

// 🔥 FUNCIÓN QUE ACTIVA LA SIMULACIÓN Y ARRANCA EL RELOJ
async function iniciarSimulacion() {
    if (!currentSalaId) return;
    
    const btnStart = document.getElementById('btn-start-game');
    btnStart.disabled = true;
    btnStart.innerText = "⚡ Simulación En Progreso";

    try {
        const salaRef = doc(db, "salas", currentSalaId);
        
        // Actualizar estado en Firebase
        await updateDoc(salaRef, {
            estado: "jugando",
            fase: "Fase de Toma de Decisiones",
            eventoActual: eventosEon[eonActualIndex]
        });

        // Arrancar el temporizador local en la pantalla del Profesor
        let tiempoRestante = 240;
        
        clearInterval(timerInterval);
        timerInterval = setInterval(async () => {
            tiempoRestante--;
            
            // Actualizar el tiempo visible en la pantalla del Profesor
            document.getElementById('host-timer').innerText = formatearTiempo(tiempoRestante);
            
            // Cada 5 segundos sincroniza el tiempo en Firebase para que los alumnos lo vean en su cel
            if (tiempoRestante % 5 === 0 && tiempoRestante > 0) {
                await updateDoc(salaRef, { tiempo: tiempoRestante });
            }

            // Al acabarse el tiempo del Eón
            if (tiempoRestante <= 0) {
                clearInterval(timerInterval);
                await avanzarDeEon();
            }
        }, 1000);

    } catch (error) {
        console.error("Error al iniciar simulación: ", error);
        btnStart.disabled = false;
        btnStart.innerText = "🚀 Iniciar Simulación";
    }
}

// Controlar el cambio de eones automáticamente
async function avanzarDeEon() {
    eonActualIndex++;
    const salaRef = doc(db, "salas", currentSalaId);

    if (eonActualIndex < eventosEon.length) {
        // Siguiente ronda
        await updateDoc(salaRef, {
            tiempo: 240,
            fase: "Fase de Toma de Decisiones",
            eventoActual: eventosEon[eonActualIndex],
            accionesEon: {} // Limpia las acciones del eón anterior
        });
        iniciarSimulacion(); // Reinicia el reloj para el nuevo eón
    } else {
        // Fin del juego, manda a todos a la pantalla de informe
        await updateDoc(salaRef, {
            estado: "finalizado",
            fase: "Simulación Concluida"
        });
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

    document.getElementById('player-name-display').innerText = currentPlayerName;
    document.getElementById('player-imperio-display').innerText = `Imperio de ${currentImperio}`;
    document.getElementById('player-rol-display').innerText = currentRol;

    switchScreen('screen-player');
    inyectarMecanicasRol(currentRol);
    escucharSala(currentSalaId, false);
}

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
        btn.innerText = "✅ Orden Confirmada";
        btn.style.backgroundColor = "#28a745";
    } catch (e) {
        console.error(e);
        alert("Error al enviar acción.");
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
    // El host maneja su propio intervalo para fluidez, pero sincroniza fases
    document.getElementById('host-current-fase').innerText = `Fase: ${data.fase}`;
    document.getElementById('host-event-text').innerText = data.eventoActual;

    const acciones = data.accionesEon || {};
    const listaImperios = ["Aethelgard", "Ophir", "Vulcania", "Zion", "Kallisto"];
    
    listaImperios.forEach(imp => {
        const card = document.getElementById(`card-${imp}`);
        if (card) {
            const rolesActivos = Object.keys(acciones).filter(k => k.startsWith(imp));
            if (rolesActivos.length > 0) {
                card.style.borderColor = "#28a745";
                card.querySelector('.sync-status').innerText = `⚡ ${rolesActivos.length} Órdenes Listas`;
            } else {
                card.style.borderColor = "rgba(255,255,255,0.1)";
                card.querySelector('.sync-status').innerText = "💤 Esperando Decisiones...";
            }
        }
    });
}

function actualizarPantallaEstudiante(data) {
    // Sincronizar el temporizador en el celular del alumno
    document.getElementById('player-timer').innerText = formatearTiempo(data.tiempo);
    document.getElementById('event-player-info').innerText = data.eventoActual;

    // Si el profesor cambia el eón, restaurar el botón de acción
    const btn = document.getElementById('btn-submit-action');
    if (data.fase === "Fase de Toma de Decisiones" && btn.disabled && btn.innerText === "✅ Orden Confirmada") {
        btn.disabled = false;
        btn.innerText = "🔒 Confirmar Acción del Eón";
        btn.style.backgroundColor = ""; 
    }

    // Si el juego llega a su fin, saltar a la pantalla final
    if (data.estado === "finalizado") {
        switchScreen('screen-debriefing');
    }
}

function formatearTiempo(segundos) {
    const mins = Math.floor(segundos / 60);
    const secs = segundos % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

// ==========================================
// ASIGNACIÓN DE EVENTOS DE INTERFAZ
// ==========================================
document.addEventListener("DOMContentLoaded", () => {
    document.getElementById('btn-create-host').addEventListener('click', crearNuevaSala);
    document.getElementById('btn-start-game').addEventListener('click', iniciarSimulacion);
    document.getElementById('btn-join-player').addEventListener('click', unirseJugador);
    document.getElementById('btn-submit-action').addEventListener('click', confirmarAccionEon);
    
    // Auto-completar sala desde enlace QR
    const urlParams = new URLSearchParams(window.location.search);
    const salaUrl = urlParams.get('sala');
    if (salaUrl) {
        document.getElementById('input-sala-id').value = salaUrl;
    }
});
