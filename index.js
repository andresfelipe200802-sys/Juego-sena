import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getFirestore, doc, setDoc, onSnapshot, updateDoc, increment } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

// =========================================================================
// CONFIGURACIÓN DE CREDENCIALES DE PRODUCCIÓN - DEBES REEMPLAZAR ESTO
// =========================================================================
const firebaseConfig = {
    apiKey: "AIzaSyD-EjemploDeKeyRealSENA2026_Xyz",
    authDomain: "tu-proyecto-sena.firebaseapp.com",
    projectId: "tu-proyecto-sena",
    storageBucket: "tu-proyecto-sena.appspot.com",
    messagingSenderId: "123456789012",
    appId: "1:123456789012:web:abcdef123456"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// Estado de la Simulación en Memoria Local
let currentSalaId = null;
let currentImperio = null;
let currentRol = null;
let currentPlayerName = null;
let isHost = false;
let localTimer = null;

const EVENTOS_EONES = [
    { titulo: "Eón I: Plaga de Langostas", desc: "El suministro de alimentos se reduce severamente a escala continental.", penalizacion: "alimento", cantidad: -25 },
    { titulo: "Eón II: Fiebre del Oro", desc: "Descubrimiento de venas mineras vírgenes. Oportunidad comercial.", penalizacion: "oro", cantidad: 35 },
    { titulo: "Eón III: Ola de Espionaje", desc: "Secretos de estado vulnerados en las fronteras tecnológicas.", penalizacion: "tecnologia", cantidad: -20 },
    { titulo: "Eón IV: Cierre de Rutas", desc: "Aranceles severos reducen la liquidez internacional drásticamente.", penalizacion: "oro", cantidad: -30 },
    { titulo: "Eón V: Renacimiento Científico", desc: "Un avance compartido permite optimizar las matrices industriales.", penalizacion: "tecnologia", cantidad: 45 },
    { titulo: "Eón VI: Gran Glaciación Extrema", desc: "Invierno total. Los consumos básicos de supervivencia se triplican.", penalizacion: "alimento", cantidad: -45 }
];

const IMPERIOS_INICIALES = {
    Aethelgard: { recursos: { alimento: 100, oro: 100, tecnologia: 80 }, metricas: { coop: 0, hostil: 0 } },
    Ophir: { recursos: { alimento: 80, oro: 150, tecnologia: 60 }, metricas: { coop: 0, hostil: 0 } },
    Vulcania: { recursos: { alimento: 70, oro: 90, tecnologia: 110 }, metricas: { coop: 0, hostil: 0 } },
    Zion: { recursos: { alimento: 120, oro: 70, tecnologia: 70 }, metricas: { coop: 0, hostil: 0 } },
    Kallisto: { recursos: { alimento: 90, oro: 90, tecnologia: 90 }, metricas: { coop: 0, hostil: 0 } }
};

window.addEventListener('DOMContentLoaded', () => {
    // Recuperar sesión para prevenir pérdidas por desconexión móvil
    if(localStorage.getItem('sena_sala_id')) {
        currentSalaId = localStorage.getItem('sena_sala_id');
        currentImperio = localStorage.getItem('sena_imperio');
        currentRol = localStorage.getItem('sena_rol');
        currentPlayerName = localStorage.getItem('sena_nombre');
        
        document.getElementById('input-sala-id').value = currentSalaId;
        document.getElementById('input-player-name').value = currentPlayerName;
    }

    const params = new URLSearchParams(window.location.search);
    const salaParam = params.get('sala');
    if (salaParam) document.getElementById('input-sala-id').value = salaParam;
    
    setupListeners();
});

function setupListeners() {
    document.getElementById('btn-create-host').addEventListener('click', crearSalaHost);
    document.getElementById('btn-join-player').addEventListener('click', unirseJugador);
    document.getElementById('btn-start-game').addEventListener('click', iniciarPartidaHost);
    document.getElementById('btn-submit-action').addEventListener('click', registrarAccionEquipo);
    document.getElementById('btn-restart').addEventListener('click', () => {
        localStorage.clear();
        window.location.href = window.location.origin + window.location.pathname;
    });
}

// =========================================================================
// MOTOR ANFITRIÓN (PROFESOR)
// =========================================================================
async function crearSalaHost() {
    isHost = true;
    currentSalaId = "SENA-" + Math.floor(100 + Math.random() * 899);
    
    const estructuraSala = {
        id_sala: currentSalaId,
        estado_global: {
            fase_actual: "LOBBY",
            ronda_index: 0,
            timestamp_limite: 0,
            evento_actual: "Esperando inicio oficial de la simulación geopolítica."
        },
        imperios: JSON.parse(JSON.stringify(IMPERIOS_INICIALES))
    };

    await setDoc(doc(db, "salas", currentSalaId), estructuraSala);
    document.getElementById('host-sala-display').innerText = currentSalaId;
    
    const qrUrl = `${window.location.origin}${window.location.pathname}?sala=${currentSalaId}`;
    document.getElementById('qrcode-container').innerHTML = "";
    new QRCode(document.getElementById('qrcode-container'), { text: qrUrl, width: 140, height: 140 });

    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    document.getElementById('screen-host').classList.add('active');
    sincronizarSalaRealtime(currentSalaId);
}

function iniciarPartidaHost() {
    document.getElementById('btn-start-game').style.display = "none";
    ejecutarEonHost(0);
}

async function ejecutarEonHost(indexRonda) {
    if (indexRonda >= EVENTOS_EONES.length) {
        await updateDoc(doc(db, "salas", currentSalaId), { "estado_global.fase_actual": "TERMINADO" });
        return;
    }

    const evento = EVENTOS_EONES[indexRonda];
    const timestampLimite = Date.now() + (240 * 1000); // 4 minutos exactos a futuro

    await updateDoc(doc(db, "salas", currentSalaId), {
        "estado_global.fase_actual": "JUGANDO",
        "estado_global.ronda_index": indexRonda,
        "estado_global.timestamp_limite": timestampLimite,
        "estado_global.evento_actual": `${evento.titulo}: ${evento.desc}`
    });

    ejecutarRelojLocal(timestampLimite, () => {
        procesarTransicionEon(indexRonda);
    });
}

async function procesarTransicionEon(indexRonda) {
    const salaRef = doc(db, "salas", currentSalaId);
    const ev = EVENTOS_EONES[indexRonda];
    const updates = {};

    // Resolución matemática pura en backend simulada de forma segura por el host
    for (const imp of Object.keys(IMPERIOS_INICIALES)) {
        const factorRuido = Math.floor(Math.random() * 15);
        updates[`imperios.${imp}.recursos.${ev.penalizacion}`] = increment(ev.cantidad + factorRuido);
    }
    await updateDoc(salaRef, updates);
    ejecutarEonHost(indexRonda + 1);
}

// =========================================================================
// MOTOR ESTUDIANTE (MÓVIL DISCRETO)
// =========================================================================
async function unirseJugador() {
    const salaInput = document.getElementById('input-sala-id').value.trim().toUpperCase();
    const nameInput = document.getElementById('input-player-name').value.trim();
    
    if(!salaInput || !nameInput) {
        alert("Campos incompletos."); 
        return;
    }

    currentSalaId = salaInput;
    currentPlayerName = nameInput;
    currentImperio = document.getElementById('select-imperio').value;
    currentRol = document.getElementById('select-rol').value;

    // Preservar datos en almacenamiento local del terminal
    localStorage.setItem('sena_sala_id', currentSalaId);
    localStorage.setItem('sena_nombre', currentPlayerName);
    localStorage.setItem('sena_imperio', currentImperio);
    localStorage.setItem('sena_rol', currentRol);

    document.getElementById('player-name-display').innerText = currentPlayerName;
    document.getElementById('player-imperio-display').innerText = `Imperio de ${currentImperio}`;
    document.getElementById('player-rol-display').innerText = currentRol;

    inyectarConsolaOptimizadaRol(currentRol);
    
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    document.getElementById('screen-player').classList.add('active');
    sincronizarSalaRealtime(currentSalaId);
}

function inyectarConsolaOptimizadaRol(rol) {
    const container = document.getElementById('role-mechanic-container');
    container.innerHTML = "";

    // Eliminados Sliders táctiles problemáticos por botones e inputs de paso numérico directo
    if(rol === "Emperador") {
        container.innerHTML = `<label>Línea Geopolítica:</label>
        <select id="action-input"><option value="coop">Alianza Integral Internacional</option><option value="hostil">Hostigamiento Militar y Cierre</option></select>`;
    } else if(rol === "Tesorero") {
        container.innerHTML = `<label>Inversión Pública en Alimentos (Elegir Unidad):</label>
        <select id="action-input"><option value="coop">Invertir 40% de Reservas de Oro</option><option value="hostil">Retener Capitales (Austeridad)</option></select>`;
    } else if(rol === "Diplomatico") {
        container.innerHTML = `<label>Estrategia Exterior:</label>
        <select id="action-input"><option value="coop">Firmar Tratado Multilateral</option><option value="hostil">Pacto Secreto de Exclusividad</option></select>`;
    } else {
        container.innerHTML = `<label>Operación de Contingencia:</label>
        <select id="action-input"><option value="coop">Desplegar Ayuda Humanitaria</option><option value="hostil">Ejecutar Sabotaje Silencioso</option></select>`;
    }
}

async function registrarAccionEquipo() {
    const btn = document.getElementById('btn-submit-action');
    btn.disabled = true;
    btn.innerText = "Enviado a Ministros ✔️";
    btn.style.backgroundColor = "var(--success)";

    const decision = document.getElementById('action-input').value;
    const salaRef = doc(db, "salas", currentSalaId);
    
    // Incremento atómico directo corregido para el SDK v10 libre de bugs de referencia
    const nodoMetrica = `imperios.${currentImperio}.metricas.${decision}`;
    await updateDoc(salaRef, { [nodoMetrica]: increment(1) });
}

// =========================================================================
// SINCRONIZACIÓN REACTIVA Y LÓGICA DE TRABAJO (onSnapshot Único)
// =========================================================================
function sincronizarSalaRealtime(salaId) {
    onSnapshot(doc(db, "salas", salaId), (snapshot) => {
        if (!snapshot.exists()) return;
        const data = snapshot.data();
        const est = data.estado_global;

        // Gestión asíncrona del reloj compartido
        if (est.timestamp_limite > 0) {
            ejecutarRelojLocal(est.timestamp_limite, null);
        }

        if (!isHost) {
            document.getElementById('event-player-info').innerText = est.evento_actual;
            const impData = data.imperios[currentImperio];
            document.getElementById('res-alimento').innerText = Math.max(0, impData.recursos.alimento);
            document.getElementById('res-oro').innerText = Math.max(0, impData.recursos.oro);
            document.getElementById('res-tecnologia').innerText = Math.max(0, impData.recursos.tecnologia);

            if (btnEnviadoYFaseAbierta(est.fase_actual)) {
                const btn = document.getElementById('btn-submit-action');
                btn.disabled = false;
                btn.innerText = "🔒 Confirmar Acción del Eón";
                btn.style.backgroundColor = "var(--primary)";
            }
        } else {
            document.getElementById('host-current-fase').innerText = `Eón en Curso: ${est.ronda_index + 1} / 6`;
            document.getElementById('host-event-text').innerText = est.evento_actual;
            
            for (const imp of Object.keys(data.imperios)) {
                const im = data.imperios[imp];
                document.getElementById(`card-${imp}`).innerHTML = `<h3>🏛️ Reinos de ${imp}</h3>
                <p>🌾 Alimento: <strong>${Math.max(0, im.recursos.alimento)}</strong></p>
                <p>🪙 Oro: <strong>${Math.max(0, im.recursos.oro)}</strong></p>
                <p>⚔️ Tecnología: <strong>${Math.max(0, im.recursos.tecnologia)}</strong></p>`;
            }
        }

        if (est.fase_actual === "TERMINADO") {
            clearInterval(localTimer);
            procesarDebriefingFinal(data.imperios);
        }
    });
}

function btnEnviadoYFaseAbierta(fase) {
    return fase === "JUGANDO" && document.getElementById('btn-submit-action').disabled;
}

// =========================================================================
// SISTEMA AUTOMÁTICO REVOLUCIONARIO DE REFLEXIÓN INTERACTIVA
// =========================================================================
function procesarDebriefingFinal(imperios) {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    document.getElementById('screen-debriefing').classList.add('active');

    const rankingList = document.getElementById('ranking-list');
    const insightsContainer = document.getElementById('insights-container');
    rankingList.innerHTML = "";
    insightsContainer.innerHTML = "";

    let totalCoop = 0;
    let totalHostil = 0;

    const arrCalculados = Object.keys(imperios).map(key => {
        const imp = imperios[key];
        const calculoBienestar = Math.max(0, Math.floor((imp.recursos.alimento * 0.4) + (imp.recursos.oro * 0.3) + (imp.recursos.tecnologia * 0.3)));
        
        totalCoop += imp.metricas.coop || 0;
        totalHostil += imp.metricas.hostil || 0;

        return { nombre: key, score: calculoBienestar };
    });

    arrCalculados.sort((a,b) => b.score - a.score);

    arrCalculados.forEach((item, index) => {
        const li = document.createElement('li');
        li.innerHTML = `<strong>${index + 1}° Lugar: ${item.nombre}</strong> — Balance Integral: ${item.score} Puntos de Estabilidad.`;
        rankingList.appendChild(li);
    });

    // Diagnóstico Pedagógico basado en métricas analíticas del comportamiento del aula
    let HTMLInsight = "";
    if (totalHostil > totalCoop) {
        HTMLInsight = `<div class="insight-item"><strong>⚠️ Paradoja de los Bienes Comunes (Tragedia de las Decisiones):</strong> Se detectaron ${totalHostil} acciones de carácter hostil/retención frente a un pobre ${totalCoop} de intentos de negociación colectiva.</div>
        <div class="insight-item"><strong>📌 Análisis del Liderazgo:</strong> El aula operó bajo el sesgo del individualismo estratégico. A corto plazo, algunos imperios acumularon recursos, pero al llegar el Eón VI (Gran Glaciación), la falta de redes de apoyo mutuo generó un desplome masivo de indicadores de supervivencia. El egocentrismo geopolítico aceleró el colapso.</div>`;
    } else {
        HTMLInsight = `<div class="insight-item"><strong>🤝 Triunfo de la Cooperación Compleja:</strong> El grupo sumó un total de ${totalCoop} decisiones de coordinación bilateral, superando los incidentes agresivos.</div>
        <div class="insight-item"><strong>📌 Análisis del Liderazgo:</strong> Los estudiantes desarrollaron dinámicas de escucha y pensamiento a largo plazo. Al sacrificar pequeños márgenes de ganancia inmediata en favor de tratados estables, lograron mitigar los impactos negativos de las plagas y bloqueos globales. Una victoria clara en negociación y resolución de conflictos.</div>`;
    }

    insightsContainer.innerHTML = HTMLInsight;
}

// =========================================================================
// UTILIDADES DEL CRONÓMETRO CLIENTE-SERVIDOR SIN ESCRITURA CONSTANTE
// =========================================================================
function ejecutarRelojLocal(timestampTarget, callbackTermino) {
    clearInterval(localTimer);
    
    localTimer = setInterval(() => {
        const delta = Math.floor((timestampTarget - Date.now()) / 1000);
        
        if (delta <= 0) {
            clearInterval(localTimer);
            document.getElementById('host-timer').innerText = "00:00";
            if(!isHost) document.getElementById('player-timer').innerText = "00:00";
            if (callbackTermino) callbackTermino();
        } else {
            const min = Math.floor(delta / 60).toString().padStart(2, '0');
            const seg = (delta % 60).toString().padStart(2, '0');
            const strTiempo = `${min}:${seg}`;
            
            document.getElementById('host-timer').innerText = strTiempo;
            if(!isHost) document.getElementById('player-timer').innerText = strTiempo;
        }
    }, 1000);
}