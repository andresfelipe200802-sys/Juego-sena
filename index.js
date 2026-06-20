/**
 * ECOS DEL TRONO v4.0 — index.js
 *
 * CAMBIOS PRINCIPALES v4:
 * - 15 rondas totales (2 min c/u = 30 min partida)
 * - TODAS las rondas tienen situación para TODOS los grupos simultáneamente
 * - 4 rondas especiales tipo "Rey" donde además hay una crisis global que requiere Rey Temporal
 * - Profesor bloqueado: no puede avanzar si algún grupo no ha decidido
 * - Resultado individual por grupo SOLO visible para el profesor
 * - Moraleja + resultado general visible para todos
 * - Re-elección de Rey Temporal opcional en cada ronda Rey
 */

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import {
    getFirestore, doc, setDoc, onSnapshot,
    updateDoc, getDoc, arrayUnion, runTransaction
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
   CONSTANTES
   ============================================================ */
const GRUPOS = ["Campesinos","Guardia","Herreros","Mercaderes","Clerigos","Nobles"];
const MAX_POR_GRUPO = 5;
const TIEMPO_RONDA  = 120; // 2 minutos
const TOTAL_RONDAS  = 15;

const GRUPO_ICONS = {
    Campesinos:"🌾", Guardia:"⚔️", Herreros:"🔨",
    Mercaderes:"💰", Clerigos:"📖", Nobles:"🏰"
};

/* ============================================================
   SITUACIONES — 15 RONDAS
   
   Cada ronda tiene:
     - Un objeto por cada grupo (situación individual)
     - Opcionalmente un objeto "crisis" (tipo "rey") con su propia
       situación global que ADEMÁS requiere elección de Rey Temporal.
   
   Las rondas 4, 7, 11 y 14 son rondas "rey":
   en esas rondas los grupos resuelven su problema individual Y
   además deben elegir un Rey Temporal para decidir la crisis global.
   
   efectos individuales afectan solo al grupo.
   efectos de crisis afectan a TODO el reino.
   ============================================================ */
const RONDAS = [

    // ══════════════════════════════════════════════════════════
    // RONDA 1
    // ══════════════════════════════════════════════════════════
    {
        ronda: 1, tipo: "normal",
        grupos: {
            Campesinos: {
                titulo: "🌾 Semillas envenenadas",
                texto: "Un lote de semillas que compraron resultó contaminado con un hongo. Si las siembran, la cosecha entera podría pudrirse. Si las desechan, pierden dinero y tiempo de siembra. ¿Qué hacen?",
                opciones: [
                    { texto: "🔥 Destruir todas las semillas contaminadas y empezar de cero", efectos:{ food:-10, gold:-5, order:0, morale:+5 }, buena:true },
                    { texto: "🌱 Sembrar igual y rezar porque no todas estén dañadas", efectos:{ food:-25, gold:0, order:0, morale:-10 }, buena:false },
                    { texto: "🧪 Pagar a los Clérigos para que analicen cuáles sirven", efectos:{ food:-5, gold:-10, order:0, morale:+10 }, buena:true }
                ]
            },
            Guardia: {
                titulo: "⚔️ Guardia corrupta",
                texto: "Un soldado de confianza fue visto aceptando soborno para dejar pasar contrabando en la noche. Si lo expulsan públicamente, se debilita la imagen del cuerpo. Si lo encubren y el pueblo lo descubre, el daño es mayor.",
                opciones: [
                    { texto: "📢 Juicio público y expulsión inmediata del soldado", efectos:{ food:0, gold:0, order:+10, morale:+10 }, buena:true },
                    { texto: "🤫 Amonestación privada y mantenerlo en servicio", efectos:{ food:0, gold:0, order:-15, morale:-10 }, buena:false },
                    { texto: "🔍 Investigación interna para descubrir si hay más implicados", efectos:{ food:0, gold:-5, order:+5, morale:+5 }, buena:true }
                ]
            },
            Herreros: {
                titulo: "🔨 El horno que no enciende",
                texto: "El horno principal de la forja lleva 3 días apagado por una falla en el conducto de aire. Sin herramientas nuevas, agricultores y constructores están paralizados. La reparación es cara y lenta.",
                opciones: [
                    { texto: "🛠️ Contratar maestro externo para reparación rápida aunque caro", efectos:{ food:0, gold:-15, order:+5, morale:+10 }, buena:true },
                    { texto: "⏳ Intentar reparar solos aunque tome más tiempo", efectos:{ food:-5, gold:0, order:-5, morale:-5 }, buena:false },
                    { texto: "🔥 Usar el horno secundario a media capacidad mientras se repara", efectos:{ food:-3, gold:-5, order:0, morale:+5 }, buena:true }
                ]
            },
            Mercaderes: {
                titulo: "💰 El deudor influyente",
                texto: "Un noble poderoso debe una gran cantidad de oro al gremio desde hace 6 meses y se niega a pagar. Si lo denuncian, pueden perder contratos futuros. Si no cobran, otros deudores harán lo mismo.",
                opciones: [
                    { texto: "⚖️ Llevar el caso ante el Consejo de Nobles formalmente", efectos:{ food:0, gold:+15, order:+5, morale:+10 }, buena:true },
                    { texto: "🤐 Perdonar la deuda para mantener la relación comercial", efectos:{ food:0, gold:-15, order:0, morale:-10 }, buena:false },
                    { texto: "🤝 Negociar pago parcial en especie (tierras o bienes)", efectos:{ food:+5, gold:+5, order:0, morale:+5 }, buena:true }
                ]
            },
            Clerigos: {
                titulo: "📖 El libro prohibido",
                texto: "Un estudiante llegó con un manuscrito que describe nuevas técnicas de medicina, pero también cuestiona algunas tradiciones del reino. El conocimiento podría salvar vidas, pero genera conflicto con las costumbres.",
                opciones: [
                    { texto: "📚 Aceptar y estudiar el libro: el conocimiento no debe censurarse", efectos:{ food:0, gold:0, order:-5, morale:+15 }, buena:true },
                    { texto: "🔒 Confiscar el libro para evitar conflictos sociales", efectos:{ food:0, gold:0, order:+5, morale:-15 }, buena:false },
                    { texto: "🔬 Extraer solo las técnicas médicas y guardar el resto", efectos:{ food:+5, gold:0, order:+5, morale:+5 }, buena:true }
                ]
            },
            Nobles: {
                titulo: "🏰 La tierra en disputa",
                texto: "Dos familias nobles pelean por la propiedad de un valle fértil. Si no se resuelve, la disputa puede volverse violenta. El Consejo debe tomar partido o buscar solución neutral.",
                opciones: [
                    { texto: "⚖️ Dividir el valle en partes iguales entre ambas familias", efectos:{ food:+10, gold:0, order:+10, morale:+10 }, buena:true },
                    { texto: "👑 Dárselo a quien pague más al tesoro real", efectos:{ food:0, gold:+20, order:-10, morale:-15 }, buena:false },
                    { texto: "🏛️ Declarar el valle propiedad del reino para beneficio común", efectos:{ food:+15, gold:-5, order:+5, morale:+15 }, buena:true }
                ]
            }
        }
    },

    // ══════════════════════════════════════════════════════════
    // RONDA 2
    // ══════════════════════════════════════════════════════════
    {
        ronda: 2, tipo: "normal",
        grupos: {
            Campesinos: {
                titulo: "🌾 La sequía se acerca",
                texto: "Los pozos del campo llevan semanas bajando de nivel. Los astrólogos anuncian que no lloverá en meses. Si no actúan ahora, la cosecha se perderá. Prepararse cuesta tiempo y dinero.",
                opciones: [
                    { texto: "💧 Construir sistema de canales de riego con el río cercano", efectos:{ food:+15, gold:-20, order:+5, morale:+10 }, buena:true },
                    { texto: "🌵 Sembrar cultivos resistentes a la sequía aunque den menos", efectos:{ food:+5, gold:-5, order:0, morale:0 }, buena:true },
                    { texto: "🙏 Esperar y confiar en que las lluvias lleguen", efectos:{ food:-20, gold:0, order:-5, morale:-15 }, buena:false }
                ]
            },
            Guardia: {
                titulo: "⚔️ El prisionero fugado",
                texto: "Un preso peligroso escapó aprovechando un descuido nocturno. El pueblo está asustado. Buscarlos toma recursos. Si no aparece pronto, la confianza en la Guardia colapsa.",
                opciones: [
                    { texto: "🔦 Movilizar guardia completa en búsqueda masiva 24 horas", efectos:{ food:0, gold:-10, order:+15, morale:+10 }, buena:true },
                    { texto: "📣 Pedir ayuda a la ciudadanía con recompensa en oro", efectos:{ food:0, gold:-15, order:+10, morale:+15 }, buena:true },
                    { texto: "📋 Reportar el escape y esperar que aparezca solo", efectos:{ food:0, gold:0, order:-20, morale:-20 }, buena:false }
                ]
            },
            Herreros: {
                titulo: "🔨 Pedido imposible",
                texto: "El ejército solicitó 500 espadas en 2 semanas, algo que normalmente toma 2 meses. Para lograrlo necesitarían trabajar de noche, gastar el doble de carbón y arriesgarse a errores de calidad.",
                opciones: [
                    { texto: "⚙️ Aceptar el pedido: contratar ayudantes temporales y trabajar doble turno", efectos:{ food:0, gold:+20, order:+10, morale:-10 }, buena:true },
                    { texto: "🛑 Rechazar: la calidad no puede comprometerse por tiempo", efectos:{ food:0, gold:-5, order:-10, morale:+5 }, buena:false },
                    { texto: "📦 Negociar: entregar 250 espadas de calidad en el plazo dado", efectos:{ food:0, gold:+10, order:+5, morale:+5 }, buena:true }
                ]
            },
            Mercaderes: {
                titulo: "💰 La ruta bloqueada",
                texto: "Bandidos controlan el camino principal de comercio. Los transportes llevan semanas sin pasar. Pagar escolta cuesta mucho. Usar la ruta alternativa es el doble de largo.",
                opciones: [
                    { texto: "🛡️ Contratar escolta armada y mantener la ruta principal", efectos:{ food:0, gold:-15, order:0, morale:+5 }, buena:true },
                    { texto: "🗺️ Usar la ruta alterna aunque sea más lenta", efectos:{ food:-5, gold:-5, order:0, morale:0 }, buena:true },
                    { texto: "⛔ Parar el comercio hasta que la Guardia limpie la ruta", efectos:{ food:-10, gold:-25, order:+5, morale:-15 }, buena:false }
                ]
            },
            Clerigos: {
                titulo: "📖 Paciente o prisión",
                texto: "Un criminal violento llegó gravemente herido al hospital. La ley dice que deben reportarlo a la Guardia, lo que significaría su arresto. Pero curarlo primero es deber médico. ¿Qué hace el gremio?",
                opciones: [
                    { texto: "🏥 Curarlo primero, luego reportarlo como exige la ley médica", efectos:{ food:0, gold:0, order:+10, morale:+15 }, buena:true },
                    { texto: "🚨 Reportar a la Guardia antes de atenderlo", efectos:{ food:0, gold:0, order:+5, morale:-15 }, buena:false },
                    { texto: "🤝 Curar y notificar simultáneamente con acuerdo humanitario", efectos:{ food:0, gold:0, order:+15, morale:+10 }, buena:true }
                ]
            },
            Nobles: {
                titulo: "🏰 La ley injusta",
                texto: "Una ley de hace 50 años obliga a los campesinos a trabajar gratis 10 días al año en tierras nobles. El pueblo la llama esclavitud. Derogarla enriquece al pueblo pero enfurece a los nobles tradicionales.",
                opciones: [
                    { texto: "📜 Derogar la ley: es una injusticia histórica", efectos:{ food:+10, gold:-10, order:-5, morale:+25 }, buena:true },
                    { texto: "🔒 Mantener la ley: cambiar las tradiciones genera inestabilidad", efectos:{ food:-10, gold:+10, order:-10, morale:-20 }, buena:false },
                    { texto: "💼 Compensar a los nobles y eliminar la ley gradualmente", efectos:{ food:+5, gold:-15, order:+5, morale:+15 }, buena:true }
                ]
            }
        }
    },

    // ══════════════════════════════════════════════════════════
    // RONDA 3
    // ══════════════════════════════════════════════════════════
    {
        ronda: 3, tipo: "normal",
        grupos: {
            Campesinos: {
                titulo: "🌾 El animal invasor",
                texto: "Una plaga de jabalíes destruye sembrados por las noches. Cazarlos requiere dejar los campos sin vigilancia de día. No actuar significa perder más cosecha cada noche.",
                opciones: [
                    { texto: "🏹 Organizar grupos de caza nocturna rotativa", efectos:{ food:+10, gold:-5, order:0, morale:+10 }, buena:true },
                    { texto: "🚧 Construir cercas alrededor de todos los sembrados", efectos:{ food:+5, gold:-15, order:0, morale:+5 }, buena:true },
                    { texto: "😴 No hacer nada, esperar que migren solos", efectos:{ food:-20, gold:0, order:0, morale:-15 }, buena:false }
                ]
            },
            Guardia: {
                titulo: "⚔️ Dos reinos, una frontera",
                texto: "Un reino vecino está moviendo tropas cerca de la frontera. No han cruzado pero la amenaza es clara. Reforzar la frontera cuesta soldados y recursos. No reforzarla puede verse como debilidad.",
                opciones: [
                    { texto: "🛡️ Enviar refuerzos a la frontera discretamente", efectos:{ food:0, gold:-15, order:+15, morale:+5 }, buena:true },
                    { texto: "📨 Enviar emisario diplomático antes de movilizar tropas", efectos:{ food:0, gold:-5, order:+5, morale:+15 }, buena:true },
                    { texto: "👁️ Ignorar: son maniobras normales, no hay que sobreactuar", efectos:{ food:0, gold:0, order:-20, morale:-10 }, buena:false }
                ]
            },
            Herreros: {
                titulo: "🔨 El aprendiz talentoso",
                texto: "El mejor aprendiz de la forja recibió una oferta de un reino extranjero que le pagará el triple. Si se va, el gremio pierde años de formación. Si lo retienen contra su voluntad, habrá resentimiento.",
                opciones: [
                    { texto: "💰 Igualar la oferta extranjera para retenerlo", efectos:{ food:0, gold:-20, order:0, morale:+15 }, buena:true },
                    { texto: "🤝 Dejarlo ir con honor y empezar a formar dos nuevos aprendices", efectos:{ food:0, gold:-10, order:0, morale:+10 }, buena:true },
                    { texto: "🔒 Presionarlo para que se quede alegando lealtad al reino", efectos:{ food:0, gold:0, order:0, morale:-20 }, buena:false }
                ]
            },
            Mercaderes: {
                titulo: "💰 El mercado negro",
                texto: "Se descubrió una red de vendedores ilegales que venden más barato sin pagar impuestos. Los comerciantes honestos están quebrando. Denunciarlos a la ley es lento. Bajar precios competitivos también duele.",
                opciones: [
                    { texto: "⚖️ Reportar formalmente a la Guardia con pruebas", efectos:{ food:0, gold:+10, order:+10, morale:+5 }, buena:true },
                    { texto: "📉 Bajar precios temporalmente para competir y arruinarlos", efectos:{ food:0, gold:-15, order:0, morale:0 }, buena:false },
                    { texto: "🏷️ Hacer campaña: 'Compra justo, apoya al reino'", efectos:{ food:0, gold:+5, order:+5, morale:+15 }, buena:true }
                ]
            },
            Clerigos: {
                titulo: "📖 La falsa cura",
                texto: "Un curandero ambulante está vendiendo pociones inútiles afirmando que curan enfermedades graves. El pueblo les cree porque es más barato. Los enfermos no buscan ayuda real y empeoran.",
                opciones: [
                    { texto: "🚫 Exigir a la Guardia que lo expulse del reino", efectos:{ food:0, gold:0, order:+5, morale:+10 }, buena:true },
                    { texto: "📣 Campaña de información pública sobre los riesgos", efectos:{ food:0, gold:-5, order:+5, morale:+15 }, buena:true },
                    { texto: "🤷 No intervenir: la gente elige libremente", efectos:{ food:0, gold:0, order:0, morale:-20 }, buena:false }
                ]
            },
            Nobles: {
                titulo: "🏰 El heredero no apto",
                texto: "El hijo mayor de un noble importante heredará su título, pero todos saben que es irresponsable y cruel. La tradición exige respetar la herencia. Ignorarla sienta un precedente peligroso.",
                opciones: [
                    { texto: "📜 Respetar la tradición: la ley de herencia es sagrada", efectos:{ food:0, gold:+5, order:+5, morale:-15 }, buena:false },
                    { texto: "⚖️ Crear un Consejo de supervisión obligatoria para el nuevo noble", efectos:{ food:0, gold:-5, order:+10, morale:+10 }, buena:true },
                    { texto: "🔄 Proponer ley de revisión de aptitud antes de otorgar títulos", efectos:{ food:0, gold:-10, order:+5, morale:+20 }, buena:true }
                ]
            }
        }
    },

    // ══════════════════════════════════════════════════════════
    // RONDA 4 — TIPO REY (todos deciden su problema + crisis global)
    // ══════════════════════════════════════════════════════════
    {
        ronda: 4, tipo: "rey",
        grupos: {
            Campesinos: {
                titulo: "🌾 La cosecha robada",
                texto: "Alguien está robando grano de los almacenes comunales en la madrugada. Ya falta el 15% de las reservas. Si denuncian, tardará semanas. Si ponen guardia propia, descuidan los campos.",
                opciones: [
                    { texto: "🔒 Poner guardia nocturna propia en los almacenes", efectos:{ food:+10, gold:-5, order:0, morale:+5 }, buena:true },
                    { texto: "🚨 Pedir ayuda formal a la Guardia Real", efectos:{ food:+5, gold:0, order:+10, morale:+10 }, buena:true },
                    { texto: "🤷 Esperar: robar es pecado, solo Dios castiga", efectos:{ food:-15, gold:0, order:-10, morale:-10 }, buena:false }
                ]
            },
            Guardia: {
                titulo: "⚔️ La trampa del espía",
                texto: "Capturaron a alguien sospechoso de ser espía extranjero. No hay pruebas concretas pero el comportamiento es muy sospechoso. Torturarlo para obtener información viola el código de honor. Liberarlo puede ser un error fatal.",
                opciones: [
                    { texto: "🔍 Interrogatorio intensivo SIN violencia durante 72 horas", efectos:{ food:0, gold:0, order:+10, morale:+10 }, buena:true },
                    { texto: "⚡ Usar métodos de presión extrema para obtener información ya", efectos:{ food:0, gold:0, order:+5, morale:-20 }, buena:false },
                    { texto: "🕵️ Soltarlo vigilado y seguirlo para descubrir su red", efectos:{ food:0, gold:-10, order:+15, morale:+5 }, buena:true }
                ]
            },
            Herreros: {
                titulo: "🔨 Materiales falsos",
                texto: "Descubrieron que su principal proveedor de hierro les ha estado vendiendo metal de mala calidad mezclado. Las herramientas ya entregadas podrían fallar. ¿Retirarlas todas o callarse?",
                opciones: [
                    { texto: "📢 Retirar voluntariamente todas las herramientas y disculparse", efectos:{ food:0, gold:-20, order:0, morale:+20 }, buena:true },
                    { texto: "🤫 No decir nada y cambiar de proveedor silenciosamente", efectos:{ food:0, gold:0, order:-15, morale:-20 }, buena:false },
                    { texto: "⚖️ Demandar al proveedor y usar las ganancias para compensar", efectos:{ food:0, gold:+10, order:+10, morale:+15 }, buena:true }
                ]
            },
            Mercaderes: {
                titulo: "💰 La especulación del pan",
                texto: "Varios mercaderes están comprando todo el grano disponible para venderlo más caro cuando escasee. Es legal pero inmoral. El pueblo ya siente el alza de precios. ¿Intervienen como gremio?",
                opciones: [
                    { texto: "🛑 Sancionar internamente a los especuladores del gremio", efectos:{ food:+10, gold:-10, order:+5, morale:+20 }, buena:true },
                    { texto: "📈 Dejar actuar: el mercado libre es la base del comercio", efectos:{ food:-15, gold:+15, order:-10, morale:-20 }, buena:false },
                    { texto: "⚖️ Proponer ley de precio máximo temporal al grano", efectos:{ food:+5, gold:-5, order:+10, morale:+15 }, buena:true }
                ]
            },
            Clerigos: {
                titulo: "📖 El hospital sin fondos",
                texto: "El hospital del reino quedó sin fondos para medicinas básicas. Hay enfermos esperando. Pedir donaciones toma tiempo. Usar fondos destinados a educación es tentador pero irresponsable.",
                opciones: [
                    { texto: "🙏 Campaña de donaciones urgente en la plaza pública", efectos:{ food:0, gold:+10, order:0, morale:+15 }, buena:true },
                    { texto: "📚 Redirigir temporalmente fondos de educación a salud", efectos:{ food:0, gold:0, order:-5, morale:+5 }, buena:false },
                    { texto: "📝 Presentar solicitud formal de emergencia al Consejo de Nobles", efectos:{ food:0, gold:+15, order:+5, morale:+10 }, buena:true }
                ]
            },
            Nobles: {
                titulo: "🏰 El Consejo dividido",
                texto: "El Consejo está dividido en dos bandos que no se hablan. Ninguna ley ha pasado en 3 semanas. El reino necesita decisiones urgentes. ¿Quién da el primer paso?",
                opciones: [
                    { texto: "🤝 Convocar reunión de reconciliación obligatoria mediada", efectos:{ food:0, gold:-5, order:+15, morale:+15 }, buena:true },
                    { texto: "👑 El bando mayoritario actúa solo ignorando al otro", efectos:{ food:0, gold:0, order:-10, morale:-15 }, buena:false },
                    { texto: "📜 Crear comité neutral con representantes de ambos bandos", efectos:{ food:0, gold:-10, order:+10, morale:+20 }, buena:true }
                ]
            }
        },
        crisis: {
            titulo: "🔥 CRISIS GLOBAL — El Dilema del Mercado en Llamas",
            texto: `El mercado central ha estallado en llamas. Se pierden almacenes de grano, puestos de comercio, herramientas y registros médicos. El fuego avanza. Todos los gremios están afectados.
DILEMA DE TEORÍA DE JUEGOS: Si cada gremio actúa solo protegiendo lo suyo, el incendio se expande y todos pierden más. Solo la cooperación total minimiza el daño colectivo. Pero cooperar significa que cada quien sacrifica algo. ¿Confían en que los demás también cooperarán?
El Rey Temporal debe decidir la estrategia del reino.`,
            opciones: [
                { texto: "🚒 Cooperación total: todos los gremios aportan recursos para apagar el fuego", efectos:{ food:-5, gold:-20, order:+25, morale:+20 } },
                { texto: "🌾 Cada gremio protege primero sus propios almacenes, luego ayuda", efectos:{ food:+10, gold:-5, order:-10, morale:-15 } },
                { texto: "💾 Prioridad a registros médicos y semillas: la vida futura importa más", efectos:{ food:+15, gold:-10, order:-5, morale:+10 } },
                { texto: "🏗️ Evacuar personas, dejar arder bienes: reconstruir con deuda externa", efectos:{ food:-10, gold:-15, order:+10, morale:+5 } },
                { texto: "⚖️ Crear un fondo de emergencia colectivo y distribuir tareas por gremio", efectos:{ food:+5, gold:-25, order:+20, morale:+25 } },
                { texto: "📋 Subasta de recursos: quien más pague, más protección recibe su zona", efectos:{ food:-5, gold:+10, order:-20, morale:-25 } }
            ]
        }
    },

    // ══════════════════════════════════════════════════════════
    // RONDA 5
    // ══════════════════════════════════════════════════════════
    {
        ronda: 5, tipo: "normal",
        grupos: {
            Campesinos: {
                titulo: "🌾 El niño trabajador",
                texto: "Muchas familias campesinas mandan a sus hijos a trabajar en el campo en vez de ir a la escuela porque necesitan el ingreso. El gremio puede prohibirlo, pero las familias pasarían hambre.",
                opciones: [
                    { texto: "📚 Prohibir el trabajo infantil y pedir subsidio al Consejo", efectos:{ food:-5, gold:-5, order:+5, morale:+20 }, buena:true },
                    { texto: "⏰ Permitirlo solo medio día si el niño también estudia", efectos:{ food:+5, gold:0, order:+5, morale:+10 }, buena:true },
                    { texto: "🤷 No intervenir: cada familia sabe lo que necesita", efectos:{ food:+5, gold:0, order:-5, morale:-15 }, buena:false }
                ]
            },
            Guardia: {
                titulo: "⚔️ La protesta pacífica",
                texto: "Cientos de ciudadanos se reúnen frente al palacio exigiendo mejores condiciones. Es pacífico pero bloquea calles vitales. Dispersarlos generaría violencia. Ignorarlos da fuerza al movimiento.",
                opciones: [
                    { texto: "🤝 Crear canal de diálogo con los líderes de la protesta", efectos:{ food:0, gold:0, order:+5, morale:+20 }, buena:true },
                    { texto: "🛑 Dispersar con fuerza mínima para restablecer el orden", efectos:{ food:0, gold:0, order:+5, morale:-25 }, buena:false },
                    { texto: "⏳ Custodiar y proteger la protesta hasta que termine sola", efectos:{ food:0, gold:-5, order:0, morale:+15 }, buena:true }
                ]
            },
            Herreros: {
                titulo: "🔨 La innovación peligrosa",
                texto: "Un herrero joven inventó una técnica de fundición 3 veces más rápida, pero libera humo tóxico. Adoptarla aumentaría la producción enormemente pero enfermaría a los trabajadores.",
                opciones: [
                    { texto: "🚫 Prohibir la técnica hasta investigar sus efectos", efectos:{ food:0, gold:-5, order:+5, morale:+10 }, buena:true },
                    { texto: "⚗️ Usar la técnica con turnos cortos y ventilación máxima", efectos:{ food:0, gold:+10, order:-5, morale:0 }, buena:false },
                    { texto: "🔬 Invertir en investigar cómo hacer la técnica segura", efectos:{ food:0, gold:-15, order:0, morale:+15 }, buena:true }
                ]
            },
            Mercaderes: {
                titulo: "💰 El monopolio del sal",
                texto: "Un solo mercader controla toda la sal del reino. Sin sal no se conservan alimentos. Está subiendo el precio arbitrariamente. Romper su monopolio requiere traer competidores, lo que lo enemistará.",
                opciones: [
                    { texto: "🌍 Abrir importación de sal de otros reinos para competir", efectos:{ food:+10, gold:+5, order:0, morale:+15 }, buena:true },
                    { texto: "🤝 Negociar precio máximo de sal a cambio de otros privilegios", efectos:{ food:+5, gold:-5, order:+5, morale:+5 }, buena:true },
                    { texto: "👑 Permitir el monopolio: es suyo, puede hacer lo que quiera", efectos:{ food:-10, gold:0, order:-5, morale:-20 }, buena:false }
                ]
            },
            Clerigos: {
                titulo: "📖 La epidemia que llega",
                texto: "Informes de otros reinos reportan una fiebre que mata en 5 días. Aún no ha llegado, pero podría. Cerrar fronteras evita el contagio pero paraliza el comercio. Preparar cuarentenas cuesta mucho.",
                opciones: [
                    { texto: "🔒 Proponer cierre preventivo de fronteras al Consejo", efectos:{ food:-10, gold:-15, order:+15, morale:+10 }, buena:true },
                    { texto: "🏥 Preparar hospitales de cuarentena sin cerrar fronteras", efectos:{ food:0, gold:-20, order:+10, morale:+15 }, buena:true },
                    { texto: "🤷 No actuar: puede que nunca llegue", efectos:{ food:0, gold:0, order:-15, morale:-20 }, buena:false }
                ]
            },
            Nobles: {
                titulo: "🏰 La alianza con el diablo",
                texto: "Un reino poderoso ofrece protección militar a cambio de que sus comerciantes no paguen impuestos en el territorio. Es ventajoso en seguridad pero arruina la economía local a largo plazo.",
                opciones: [
                    { texto: "🚫 Rechazar: la soberanía económica no se negocia", efectos:{ food:0, gold:0, order:+10, morale:+15 }, buena:true },
                    { texto: "✅ Aceptar: la seguridad primero, la economía después", efectos:{ food:0, gold:-20, order:+20, morale:-10 }, buena:false },
                    { texto: "📝 Negociar términos: protección sí, pero con impuesto reducido", efectos:{ food:0, gold:-10, order:+15, morale:+10 }, buena:true }
                ]
            }
        }
    },

    // ══════════════════════════════════════════════════════════
    // RONDA 6
    // ══════════════════════════════════════════════════════════
    {
        ronda: 6, tipo: "normal",
        grupos: {
            Campesinos: {
                titulo: "🌾 El veneno del suelo",
                texto: "Las pruebas muestran que el suelo más productivo del reino está siendo contaminado por los desechos de la forja. Si siguen usando ese suelo, la cosecha eventualmente será tóxica. Parar la producción perjudica a los Herreros.",
                opciones: [
                    { texto: "🛑 Exigir al gremio Herrero que solucione sus desechos ya", efectos:{ food:+10, gold:0, order:+5, morale:+10 }, buena:true },
                    { texto: "🌾 Rotar cultivos a tierras menos productivas por ahora", efectos:{ food:-10, gold:0, order:0, morale:+5 }, buena:true },
                    { texto: "🤷 Ignorarlo: el suelo aún da, ya veremos después", efectos:{ food:-20, gold:0, order:0, morale:-10 }, buena:false }
                ]
            },
            Guardia: {
                titulo: "⚔️ El hijo del noble",
                texto: "El hijo de un noble influyente fue arrestado en una pelea donde hirió a dos personas. La familia presiona para que lo liberen sin juicio. La Guardia sabe que la ley no distingue apellidos.",
                opciones: [
                    { texto: "⚖️ Procesarlo igual que a cualquier ciudadano", efectos:{ food:0, gold:0, order:+20, morale:+20 }, buena:true },
                    { texto: "🤫 Liberarlo discretamente para no crear problemas políticos", efectos:{ food:0, gold:+10, order:-20, morale:-20 }, buena:false },
                    { texto: "📋 Juicio rápido con mediación para reducir tensión política", efectos:{ food:0, gold:0, order:+10, morale:+10 }, buena:true }
                ]
            },
            Herreros: {
                titulo: "🔨 Los desechos del reino",
                texto: "Los desperdicios de metal de la forja están siendo arrojados cerca del río, contaminando el agua que usan los Campesinos y los Clérigos. Cambiar el sistema de desechos cuesta mucho dinero.",
                opciones: [
                    { texto: "♻️ Invertir en sistema de reciclaje y tratamiento de desechos", efectos:{ food:+10, gold:-20, order:+10, morale:+20 }, buena:true },
                    { texto: "📦 Contratar empresa que se lleve los desechos lejos del reino", efectos:{ food:+5, gold:-10, order:+5, morale:+10 }, buena:true },
                    { texto: "🙈 Continuar igual: la forja es demasiado importante para frenarla", efectos:{ food:-15, gold:0, order:-10, morale:-15 }, buena:false }
                ]
            },
            Mercaderes: {
                titulo: "💰 Falsificación de moneda",
                texto: "Se detectaron monedas falsas circulando en el mercado. Si el pueblo pierde confianza en la moneda, el comercio colapsa. Retirar monedas para verificarlas paralizaría el mercado días.",
                opciones: [
                    { texto: "🔒 Cierre temporal del mercado para verificar toda la moneda", efectos:{ food:-5, gold:-15, order:+15, morale:+5 }, buena:true },
                    { texto: "🔍 Verificación discreta sin cierre: solo lotes sospechosos", efectos:{ food:0, gold:-5, order:+10, morale:+5 }, buena:true },
                    { texto: "🤐 No anunciar nada: el pánico es peor que las monedas falsas", efectos:{ food:0, gold:-20, order:-15, morale:-20 }, buena:false }
                ]
            },
            Clerigos: {
                titulo: "📖 La superstición mortal",
                texto: "Una creencia popular dice que cierta enfermedad se cura bebiendo agua del río contaminado. Los Clérigos saben que es falso y peligroso, pero cuestionar la creencia popular tiene coste social.",
                opciones: [
                    { texto: "📢 Campaña pública directa: 'Eso es falso, puede matarlos'", efectos:{ food:0, gold:-5, order:0, morale:+15 }, buena:true },
                    { texto: "🤝 Hablar con los líderes de la comunidad primero, con tacto", efectos:{ food:0, gold:-5, order:+5, morale:+20 }, buena:true },
                    { texto: "😶 Guardar silencio para no ofender creencias tradicionales", efectos:{ food:0, gold:0, order:-5, morale:-20 }, buena:false }
                ]
            },
            Nobles: {
                titulo: "🏰 El esclavo que no existe",
                texto: "Se descubrió que varios nobles tienen personas trabajando en condiciones de esclavitud disfrazada de contrato. Es técnicamente legal pero violenta los principios del reino. ¿El Consejo actúa?",
                opciones: [
                    { texto: "⚖️ Crear ley que tipifique como ilegal ese tipo de contrato", efectos:{ food:+5, gold:-10, order:+5, morale:+25 }, buena:true },
                    { texto: "📋 Investigar caso por caso sin hacer ley general", efectos:{ food:0, gold:0, order:+5, morale:+5 }, buena:false },
                    { texto: "🚫 No intervenir: es un asunto privado entre nobles", efectos:{ food:0, gold:0, order:-10, morale:-20 }, buena:false }
                ]
            }
        }
    },

    // ══════════════════════════════════════════════════════════
    // RONDA 7 — TIPO REY
    // ══════════════════════════════════════════════════════════
    {
        ronda: 7, tipo: "rey",
        grupos: {
            Campesinos: {
                titulo: "🌾 La hambruna silenciosa",
                texto: "Las estadísticas muestran que el 20% de los niños del campo tienen desnutrición severa, pero los padres tienen vergüenza de pedir ayuda. El gremio puede crear comedores comunales, pero requiere organización y fondos.",
                opciones: [
                    { texto: "🍲 Crear red de comedores comunales gratuitos para familias", efectos:{ food:+15, gold:-15, order:+5, morale:+20 }, buena:true },
                    { texto: "🛒 Distribuir canastas de alimento mensual sin preguntar", efectos:{ food:+10, gold:-10, order:0, morale:+15 }, buena:true },
                    { texto: "📋 Hacer censo oficial para identificar quién necesita ayuda", efectos:{ food:-5, gold:-5, order:+10, morale:+5 }, buena:false }
                ]
            },
            Guardia: {
                titulo: "⚔️ La guardia agotada",
                texto: "Los soldados llevan 4 meses sin descanso por las múltiples crisis. Varios ya cometieron errores graves por cansancio. Dar descanso reduce la seguridad temporalmente. No darlo puede llevar al colapso del cuerpo.",
                opciones: [
                    { texto: "😴 Rotación de descanso obligatoria aunque quede menos guardia activa", efectos:{ food:0, gold:-5, order:-10, morale:+20 }, buena:true },
                    { texto: "💰 Contratar guardias temporales mientras los titulares descansan", efectos:{ food:0, gold:-20, order:+5, morale:+15 }, buena:true },
                    { texto: "😤 Seguir igual: el deber viene antes que el cansancio", efectos:{ food:0, gold:0, order:-20, morale:-15 }, buena:false }
                ]
            },
            Herreros: {
                titulo: "🔨 La huelga se acerca",
                texto: "Los trabajadores de la forja amenazan con huelga si no mejoran las condiciones laborales: jornadas de 14 horas, sin días libres y pago irregular. Si paran, el reino se queda sin herramientas.",
                opciones: [
                    { texto: "✅ Aceptar sus demandas: jornada de 10 h, un día libre, pago fijo", efectos:{ food:0, gold:-20, order:+5, morale:+25 }, buena:true },
                    { texto: "🤝 Negociar: mejorar parcialmente a cambio de no hacer huelga", efectos:{ food:0, gold:-10, order:+5, morale:+15 }, buena:true },
                    { texto: "⚡ Amenazar con reemplazarlos si hacen huelga", efectos:{ food:0, gold:0, order:-15, morale:-25 }, buena:false }
                ]
            },
            Mercaderes: {
                titulo: "💰 El préstamo trampa",
                texto: "Un banco extranjero ofrece un préstamo enorme con intereses 'razonables'. El reino lo necesita urgentemente. Pero las letras pequeñas del contrato dan al banco derecho sobre tierras del reino si no se paga en plazo.",
                opciones: [
                    { texto: "🔍 Rechazar y buscar financiamiento interno aunque sea lento", efectos:{ food:0, gold:-10, order:+5, morale:+15 }, buena:true },
                    { texto: "📝 Aceptar pero negociar retirar la cláusula de tierras", efectos:{ food:0, gold:+20, order:+5, morale:+5 }, buena:true },
                    { texto: "✍️ Aceptar sin negociar: necesitamos el dinero ahora", efectos:{ food:0, gold:+20, order:-10, morale:-15 }, buena:false }
                ]
            },
            Clerigos: {
                titulo: "📖 El médico extranjero",
                texto: "Un médico de otro reino con técnicas avanzadas quiere trabajar aquí, pero los Clérigos locales temen perder influencia. Sus métodos salvarían muchas vidas pero generan resistencia interna.",
                opciones: [
                    { texto: "🤝 Integrarlo al gremio y aprender de sus técnicas", efectos:{ food:0, gold:0, order:+5, morale:+20 }, buena:true },
                    { texto: "📋 Permitirle trabajar bajo supervisión estricta del gremio", efectos:{ food:0, gold:0, order:+10, morale:+10 }, buena:true },
                    { texto: "🚫 Rechazarlo: las tradiciones locales son suficientes", efectos:{ food:0, gold:0, order:0, morale:-20 }, buena:false }
                ]
            },
            Nobles: {
                titulo: "🏰 El testamento envenenado",
                texto: "Un noble murió y dejó toda su riqueza a los pobres del reino, desheredando a su familia. La familia impugna el testamento. El Consejo debe decidir si lo respeta o anula. Hay precedente en ambos lados.",
                opciones: [
                    { texto: "📜 Respetar el testamento tal como fue escrito", efectos:{ food:+10, gold:+15, order:-5, morale:+20 }, buena:true },
                    { texto: "⚖️ División: 50% familia, 50% pobres como compromiso", efectos:{ food:+5, gold:+5, order:+5, morale:+10 }, buena:true },
                    { texto: "👨‍👩‍👧 Anular el testamento: la familia siempre tiene prioridad", efectos:{ food:0, gold:0, order:+5, morale:-20 }, buena:false }
                ]
            }
        },
        crisis: {
            titulo: "⚔️ CRISIS GLOBAL — El Dilema de Seguridad y Cooperación",
            texto: `Una banda organizada de 300 invasores cruzó la frontera y ya saqueó dos aldeas. Avanzan hacia la capital. El tiempo es crítico.
DILEMA DE RELACIONES INTERNACIONALES: Este es el clásico "dilema del prisionero" a escala nacional. Si el reino muestra fuerza, puede disuadir futuros ataques pero genera más enemigos. Si negocia, puede resolver esto pero invita a otros a probar la misma táctica. ¿Qué señal quiere enviar el reino al mundo?
También hay un dilema económico: cada opción consume recursos que hacen falta en otros frentes.`,
            opciones: [
                { texto: "⚔️ Fuerza disuasiva total: respuesta militar contundente como mensaje al mundo", efectos:{ food:-5, gold:-25, order:+30, morale:+10 } },
                { texto: "🤝 Negociación estratégica: ofrecerles integración laboral a cambio de rendición", efectos:{ food:-10, gold:-15, order:0, morale:+25 } },
                { texto: "🏰 Defensa pasiva: fortalecer muros y esperar — conservar recursos", efectos:{ food:-5, gold:-5, order:+10, morale:-15 } },
                { texto: "🌐 Pedir ayuda a reinos aliados: problema regional, solución regional", efectos:{ food:0, gold:-10, order:+15, morale:+20 } },
                { texto: "💰 Pagar rescate por las aldeas afectadas y expulsarlos con compensación", efectos:{ food:0, gold:-30, order:-5, morale:+5 } },
                { texto: "🕵️ Operación encubierta: infiltrar y desmantelar su liderazgo sin confrontación abierta", efectos:{ food:0, gold:-20, order:+20, morale:+15 } }
            ]
        }
    },

    // ══════════════════════════════════════════════════════════
    // RONDA 8
    // ══════════════════════════════════════════════════════════
    {
        ronda: 8, tipo: "normal",
        grupos: {
            Campesinos: {
                titulo: "🌾 La tierra agotada",
                texto: "Años de cultivo intensivo agotaron los nutrientes del suelo principal. Los expertos dicen que hay que dejarlo descansar 2 años. Pero si no siembran, ¿de dónde sale el alimento del reino?",
                opciones: [
                    { texto: "🌿 Rotar cultivos y dejar descansar la mitad del suelo cada año", efectos:{ food:-5, gold:-5, order:0, morale:+10 }, buena:true },
                    { texto: "🧪 Comprar fertilizantes costosos para recuperar el suelo rápido", efectos:{ food:+10, gold:-20, order:0, morale:+5 }, buena:true },
                    { texto: "🔄 Sembrar igual: el suelo aguantará, siempre ha aguantado", efectos:{ food:-20, gold:0, order:0, morale:-10 }, buena:false }
                ]
            },
            Guardia: {
                titulo: "⚔️ La vigilancia total",
                texto: "El Consejo propone instalar puestos de revisión en todas las entradas del reino para evitar entrada de criminales. Mejora la seguridad, pero los ciudadanos sienten que se les trata como sospechosos.",
                opciones: [
                    { texto: "✅ Implementar la vigilancia con protocolos de respeto", efectos:{ food:0, gold:-10, order:+15, morale:-5 }, buena:true },
                    { texto: "🤝 Solo en las zonas de alta incidencia de crimen", efectos:{ food:0, gold:-5, order:+10, morale:+5 }, buena:true },
                    { texto: "🚫 Rechazar: la libertad no se sacrifica por seguridad", efectos:{ food:0, gold:0, order:-15, morale:+10 }, buena:false }
                ]
            },
            Herreros: {
                titulo: "🔨 La competencia desleal",
                texto: "Un noble empezó a fabricar herramientas usando trabajo barato en sus tierras, vendiendo por debajo del precio de mercado. Los Herreros no pueden competir. ¿Qué hacer sin infringir la ley?",
                opciones: [
                    { texto: "⚖️ Llevar el caso al Consejo de Nobles como práctica desleal", efectos:{ food:0, gold:+10, order:+10, morale:+10 }, buena:true },
                    { texto: "🏷️ Diferenciarse: marketing de calidad artesanal premium", efectos:{ food:0, gold:+5, order:0, morale:+15 }, buena:true },
                    { texto: "📉 Bajar precios hasta arruinar al competidor", efectos:{ food:0, gold:-25, order:0, morale:-5 }, buena:false }
                ]
            },
            Mercaderes: {
                titulo: "💰 El cliente moroso masivo",
                texto: "La sequía dejó a cientos de pequeños comerciantes sin poder pagar sus deudas al gremio. Si cobran a la fuerza, quiebran al comercio local. Si perdonan, pierden mucho capital.",
                opciones: [
                    { texto: "⏳ Dar plazo extendido de 6 meses sin intereses", efectos:{ food:0, gold:-10, order:0, morale:+20 }, buena:true },
                    { texto: "💼 Plan de pago gradual ajustado a cada comerciante", efectos:{ food:0, gold:+5, order:0, morale:+15 }, buena:true },
                    { texto: "⚖️ Cobrar todo por la vía legal sin excepción", efectos:{ food:-5, gold:+15, order:-5, morale:-20 }, buena:false }
                ]
            },
            Clerigos: {
                titulo: "📖 La escuela o el templo",
                texto: "Solo hay fondos para construir uno: una escuela o un hospital. La escuela beneficia a largo plazo; el hospital salva vidas ahora. La comunidad está dividida casi en partes iguales.",
                opciones: [
                    { texto: "🏥 El hospital: las vidas presentes primero", efectos:{ food:0, gold:-20, order:+5, morale:+15 }, buena:true },
                    { texto: "🏫 La escuela: la ignorancia mata más lentamente pero más seguro", efectos:{ food:0, gold:-20, order:+5, morale:+10 }, buena:true },
                    { texto: "🏗️ Construir ambos a medias: ni uno queda bien", efectos:{ food:0, gold:-20, order:-5, morale:-10 }, buena:false }
                ]
            },
            Nobles: {
                titulo: "🏰 El espía en el Consejo",
                texto: "Hay evidencias de que uno de los miembros del Consejo está filtrando información al reino enemigo. No se sabe quién es exactamente. Suspender a todos temporalmente mientras se investiga paralizaría el gobierno.",
                opciones: [
                    { texto: "🕵️ Investigación secreta interna sin suspensiones", efectos:{ food:0, gold:-5, order:+10, morale:+5 }, buena:true },
                    { texto: "🔒 Suspender todo el Consejo hasta aclarar la situación", efectos:{ food:-5, gold:-10, order:-15, morale:-10 }, buena:false },
                    { texto: "📢 Anunciar la investigación públicamente para demostrar transparencia", efectos:{ food:0, gold:0, order:+5, morale:+20 }, buena:true }
                ]
            }
        }
    },

    // ══════════════════════════════════════════════════════════
    // RONDA 9
    // ══════════════════════════════════════════════════════════
    {
        ronda: 9, tipo: "normal",
        grupos: {
            Campesinos: {
                titulo: "🌾 La cosecha colectiva",
                texto: "Los ancianos proponen que todas las familias campesinas trabajen juntas y repartan la cosecha por igual, independientemente de cuánto trabajó cada quien. Los jóvenes se niegan: 'quien más trabaja, más merece'.",
                opciones: [
                    { texto: "🤝 Sistema colectivo: solidaridad ante las crisis", efectos:{ food:+15, gold:0, order:+5, morale:+15 }, buena:true },
                    { texto: "⚖️ Sistema mixto: base igual para todos + bono por producción", efectos:{ food:+10, gold:0, order:+5, morale:+20 }, buena:true },
                    { texto: "🏆 Sistema individual puro: cada quien vive de lo que produce", efectos:{ food:+5, gold:0, order:-10, morale:-15 }, buena:false }
                ]
            },
            Guardia: {
                titulo: "⚔️ La delación recompensada",
                texto: "Se propone pagar oro a ciudadanos que denuncien crímenes. Aumentaría las capturas, pero también las falsas denuncias por venganza y el espionaje entre vecinos. El ambiente social cambiaría.",
                opciones: [
                    { texto: "💰 Implementar el sistema con verificación estricta", efectos:{ food:0, gold:-10, order:+15, morale:-10 }, buena:false },
                    { texto: "🤝 Solo recompensas por crímenes graves con pruebas", efectos:{ food:0, gold:-5, order:+10, morale:+5 }, buena:true },
                    { texto: "🚫 Rechazar: destruye la confianza entre ciudadanos", efectos:{ food:0, gold:0, order:-5, morale:+15 }, buena:true }
                ]
            },
            Herreros: {
                titulo: "🔨 El puente o las armas",
                texto: "Solo hay hierro para uno: reparar el puente principal que une el mercado con los campos, o fabricar armas para reforzar la defensa ante amenazas externas. El tiempo presiona.",
                opciones: [
                    { texto: "🌉 Reparar el puente: sin él la economía se corta", efectos:{ food:+10, gold:+10, order:-5, morale:+10 }, buena:true },
                    { texto: "⚔️ Fabricar armas: sin defensa no hay nada que proteger", efectos:{ food:-10, gold:-5, order:+20, morale:+5 }, buena:true },
                    { texto: "🎲 Dividir: la mitad para el puente, la mitad para armas", efectos:{ food:+2, gold:+2, order:+5, morale:0 }, buena:false }
                ]
            },
            Mercaderes: {
                titulo: "💰 El impuesto que salva",
                texto: "Los Nobles proponen un impuesto temporal sobre las ganancias comerciales para financiar el hospital. Los Mercaderes consideran que ya pagan suficiente. Pero el hospital está en crisis real.",
                opciones: [
                    { texto: "✅ Aceptar el impuesto temporal: la salud del pueblo es prioridad", efectos:{ food:0, gold:-15, order:+5, morale:+20 }, buena:true },
                    { texto: "🤝 Aceptar la mitad del impuesto propuesto como compromiso", efectos:{ food:0, gold:-8, order:+5, morale:+10 }, buena:true },
                    { texto: "🚫 Rechazar: ya hay suficientes impuestos, que busquen otra fuente", efectos:{ food:0, gold:0, order:-10, morale:-15 }, buena:false }
                ]
            },
            Clerigos: {
                titulo: "📖 El enfermo en el campo de batalla",
                texto: "En un conflicto fronterizo, hay heridos de ambos bandos. Las tradiciones dicen que solo se atiende a los propios. Pero los Clérigos saben que curar al enemigo herido puede abrir una negociación de paz.",
                opciones: [
                    { texto: "💊 Atender a todos los heridos, independientemente del bando", efectos:{ food:0, gold:-5, order:-5, morale:+25 }, buena:true },
                    { texto: "🏥 Atender primero a los propios y luego a los rivales si hay recursos", efectos:{ food:0, gold:0, order:+5, morale:+10 }, buena:true },
                    { texto: "⚔️ Solo atender a los del reino: son el enemigo", efectos:{ food:0, gold:0, order:+5, morale:-20 }, buena:false }
                ]
            },
            Nobles: {
                titulo: "🏰 La reforma electoral",
                texto: "Se propone que todos los ciudadanos (incluidos campesinos y artesanos) puedan votar para elegir consejeros. Históricamente solo los nobles votan. Democratizar el poder los debilita a ellos.",
                opciones: [
                    { texto: "✅ Aprobar: el pueblo debe tener voz en quién los gobierna", efectos:{ food:+5, gold:-5, order:-5, morale:+30 }, buena:true },
                    { texto: "⏳ Aprobarlo solo para decisiones locales de cada pueblo", efectos:{ food:+5, gold:0, order:+5, morale:+15 }, buena:true },
                    { texto: "🚫 Rechazar: gobernar requiere educación y experiencia que no todos tienen", efectos:{ food:0, gold:0, order:+5, morale:-25 }, buena:false }
                ]
            }
        }
    },

    // ══════════════════════════════════════════════════════════
    // RONDA 10
    // ══════════════════════════════════════════════════════════
    {
        ronda: 10, tipo: "normal",
        grupos: {
            Campesinos: {
                titulo: "🌾 El agua que se vende",
                texto: "Un mercader compró los derechos del río principal y ahora cobra a los campesinos por cada litro que usan para riego. Sin agua, no hay cosecha. Pagar empobrece a las familias.",
                opciones: [
                    { texto: "⚖️ Llevar el caso al Consejo: el agua es del pueblo", efectos:{ food:+10, gold:-5, order:+5, morale:+20 }, buena:true },
                    { texto: "💧 Construir pozos propios del gremio para independizarse", efectos:{ food:+5, gold:-20, order:+5, morale:+15 }, buena:true },
                    { texto: "💸 Pagar lo que cobra: no hay opción, necesitamos el agua", efectos:{ food:+5, gold:-20, order:0, morale:-15 }, buena:false }
                ]
            },
            Guardia: {
                titulo: "⚔️ El arma de dos filos",
                texto: "La Guardia tiene información sobre un ataque planificado. Para evitarlo deben actuar antes de que ocurra, arrestando personas que aún no han hecho nada. ¿Es justo arrestar a alguien por lo que podría hacer?",
                opciones: [
                    { texto: "🔍 Vigilancia intensa sin arrestos preventivos hasta tener pruebas", efectos:{ food:0, gold:-5, order:+5, morale:+15 }, buena:true },
                    { texto: "🔒 Arresto preventivo con detención temporal y liberación rápida", efectos:{ food:0, gold:0, order:+15, morale:-10 }, buena:false },
                    { texto: "🤝 Contactar a los sospechosos y ofrecer salida no violenta", efectos:{ food:0, gold:-5, order:+10, morale:+20 }, buena:true }
                ]
            },
            Herreros: {
                titulo: "🔨 La fórmula secreta",
                texto: "Un herrero viejo tiene la fórmula de un acero 10 veces más resistente, pero quiere llevársela a la tumba para que nadie la robe. Persuadirlo podría cambiar el destino del reino.",
                opciones: [
                    { texto: "🗣️ Convencerlo con honor: que su legado beneficie al pueblo", efectos:{ food:0, gold:+20, order:+10, morale:+15 }, buena:true },
                    { texto: "💰 Ofrecerle una pensión vitalicia a cambio de compartir la fórmula", efectos:{ food:0, gold:-15, order:+5, morale:+20 }, buena:true },
                    { texto: "🔓 Robar la fórmula mientras duerme: el reino lo necesita", efectos:{ food:0, gold:+20, order:-15, morale:-20 }, buena:false }
                ]
            },
            Mercaderes: {
                titulo: "💰 El fraude en los impuestos",
                texto: "Una auditoría interna reveló que varios Mercaderes importantes han falsificado sus libros para pagar menos impuestos. Son pilares del comercio local. ¿Cómo actúa el gremio?",
                opciones: [
                    { texto: "⚖️ Reportarlos y que enfrenten las consecuencias legales", efectos:{ food:0, gold:+15, order:+15, morale:+10 }, buena:true },
                    { texto: "🤝 Acuerdo interno: pagar lo que deben + multa sin hacerlo público", efectos:{ food:0, gold:+10, order:+5, morale:+5 }, buena:true },
                    { texto: "🤐 Ignorarlo: denunciarlos arruinaría el comercio", efectos:{ food:0, gold:0, order:-15, morale:-20 }, buena:false }
                ]
            },
            Clerigos: {
                titulo: "📖 La droga que cura",
                texto: "Una planta controlada por el reino resulta ser extremadamente eficaz como anestesia. Usarla salvaría vidas en operaciones. Pero está prohibida y su legalización puede abrir una puerta de abuso.",
                opciones: [
                    { texto: "📋 Solicitar autorización especial solo para uso médico estrictamente controlado", efectos:{ food:0, gold:0, order:+10, morale:+15 }, buena:true },
                    { texto: "🔬 Usarla clandestinamente mientras se gestiona el permiso", efectos:{ food:0, gold:0, order:-10, morale:+5 }, buena:false },
                    { texto: "📢 Campaña pública para cambiar la ley formalmente", efectos:{ food:0, gold:-5, order:+5, morale:+20 }, buena:true }
                ]
            },
            Nobles: {
                titulo: "🏰 La traición del aliado",
                texto: "El reino aliado con el que firmaron un tratado de paz les está vendiendo armas al enemigo. Romper la alianza los deja solos; mantenerla hace cómplices al Consejo.",
                opciones: [
                    { texto: "📜 Romper la alianza formalmente y buscar nuevos aliados", efectos:{ food:0, gold:-10, order:+10, morale:+20 }, buena:true },
                    { texto: "🤫 Confrontarlos en privado y exigir que paren", efectos:{ food:0, gold:0, order:+5, morale:+5 }, buena:true },
                    { texto: "😶 Ignorarlo: la alianza nos conviene demasiado para perderla", efectos:{ food:0, gold:+5, order:-10, morale:-20 }, buena:false }
                ]
            }
        }
    },

    // ══════════════════════════════════════════════════════════
    // RONDA 11 — TIPO REY
    // ══════════════════════════════════════════════════════════
    {
        ronda: 11, tipo: "rey",
        grupos: {
            Campesinos: {
                titulo: "🌾 La migración masiva",
                texto: "Cientos de familias campesinas de un reino arrasado por la guerra quieren refugiarse y trabajar la tierra del reino. Recibirlos daría más manos para producir, pero también más bocas que alimentar inicialmente.",
                opciones: [
                    { texto: "🤝 Recibirlos con plan de integración laboral en los campos", efectos:{ food:+15, gold:-10, order:0, morale:+20 }, buena:true },
                    { texto: "🔍 Recibirlos con proceso de verificación lento pero seguro", efectos:{ food:+5, gold:-5, order:+10, morale:+10 }, buena:true },
                    { texto: "🚫 Cerrar fronteras: primero hay que resolver los problemas propios", efectos:{ food:0, gold:0, order:+5, morale:-20 }, buena:false }
                ]
            },
            Guardia: {
                titulo: "⚔️ El arma química",
                texto: "Se descubrió que el reino enemigo está desarrollando un veneno de guerra masivo. La Guardia tiene la opción de atacar primero y destruir el laboratorio antes de que lo terminen, pero sería un acto de guerra.",
                opciones: [
                    { texto: "⚡ Ataque preventivo: destruir el laboratorio antes de que sea tarde", efectos:{ food:0, gold:-20, order:+10, morale:-10 } ,buena:false },
                    { texto: "🌐 Denunciar ante otros reinos para presión diplomática conjunta", efectos:{ food:0, gold:-10, order:+5, morale:+20 }, buena:true },
                    { texto: "🛡️ Preparar defensas propias contra el veneno y esperar", efectos:{ food:0, gold:-15, order:+20, morale:+5 }, buena:true }
                ]
            },
            Herreros: {
                titulo: "🔨 La máquina que reemplaza",
                texto: "Un inventor creó una máquina que puede hacer el trabajo de 20 herreros. Adoptarla duplica la producción, pero dejaría a la mitad del gremio sin empleo. El progreso vs el bienestar de las familias.",
                opciones: [
                    { texto: "🤖 Adoptar la máquina y reentrenar a los trabajadores en nuevos oficios", efectos:{ food:0, gold:+20, order:0, morale:+5 }, buena:true },
                    { texto: "⏳ Adoptarla gradualmente en 5 años para dar tiempo de adaptación", efectos:{ food:0, gold:+10, order:+5, morale:+15 }, buena:true },
                    { texto: "🚫 Rechazar: las máquinas no pueden reemplazar el trabajo humano", efectos:{ food:0, gold:-10, order:0, morale:-5 }, buena:false }
                ]
            },
            Mercaderes: {
                titulo: "💰 El contrato de 100 años",
                texto: "Una empresa extranjera ofrece extraer los minerales del reino por 100 años a cambio de un pago enorme ahora. El reino necesita el dinero urgentemente, pero perderá el control de sus riquezas naturales por un siglo.",
                opciones: [
                    { texto: "🚫 Rechazar: los recursos del reino no se venden", efectos:{ food:0, gold:0, order:+5, morale:+20 }, buena:true },
                    { texto: "📝 Negociar a 20 años con revisión y porcentaje sobre ganancias", efectos:{ food:0, gold:+15, order:+5, morale:+10 }, buena:true },
                    { texto: "✍️ Aceptar los 100 años: necesitamos ese dinero hoy", efectos:{ food:0, gold:+30, order:-5, morale:-20 }, buena:false }
                ]
            },
            Clerigos: {
                titulo: "📖 La eutanasia del rey",
                texto: "El rey anciano está en agonía sin esperanza de recuperación. Su familia pide que los Clérigos aceleren su muerte para terminar su sufrimiento. La ley lo prohíbe, pero el sufrimiento es real.",
                opciones: [
                    { texto: "💊 Aplicar cuidados paliativos máximos sin acelerar la muerte", efectos:{ food:0, gold:-5, order:+10, morale:+10 }, buena:true },
                    { texto: "🤝 Reunir al Consejo para cambiar la ley ante casos extremos", efectos:{ food:0, gold:0, order:+5, morale:+15 }, buena:true },
                    { texto: "😶 No hacer nada diferente: la ley es la ley", efectos:{ food:0, gold:0, order:+5, morale:-15 }, buena:false }
                ]
            },
            Nobles: {
                titulo: "🏰 La constitución del reino",
                texto: "Se propone escribir por primera vez una constitución que limite el poder de los nobles y garantice derechos para todos. Muchos nobles se oponen porque perderían privilegios históricos.",
                opciones: [
                    { texto: "✅ Aprobar la constitución: el derecho sobre el privilegio", efectos:{ food:+10, gold:-10, order:+5, morale:+30 }, buena:true },
                    { texto: "📋 Constitución parcial: solo derechos básicos, sin tocar privilegios nobles", efectos:{ food:+5, gold:0, order:+10, morale:+15 }, buena:true },
                    { texto: "🚫 Bloquearla: los nobles son quienes mantienen el orden del reino", efectos:{ food:0, gold:0, order:+5, morale:-25 }, buena:false }
                ]
            }
        },
        crisis: {
            titulo: "🌊 CRISIS GLOBAL — El Dilema de los Recursos Escasos",
            texto: `Las lluvias desbordaron el río. Tres aldeas inundadas, almacenes bajo el agua, forjas apagadas, caminos cortados. El reino está paralizado.
DILEMA DE ECONOMÍA Y ÉTICA: Los recursos de emergencia son insuficientes para todo. Hay que elegir qué salvar primero, lo que implica elegir qué (o quién) se pierde. Este es el problema central de la microeconomía: asignación de recursos escasos con necesidades ilimitadas. ¿Qué criterio usa el reino? ¿Eficiencia (maximizar lo salvado), equidad (distribuir igual) o necesidad (salvar a quien más lo necesita)?`,
            opciones: [
                { texto: "👥 Criterio de necesidad: evacuar primero a ancianos, niños y enfermos", efectos:{ food:-15, gold:-15, order:+10, morale:+30 } },
                { texto: "📦 Criterio de eficiencia: salvar lo que genere más valor a largo plazo (semillas y herramientas)", efectos:{ food:+10, gold:-10, order:-5, morale:-10 } },
                { texto: "⚖️ Criterio de equidad: distribuir los recursos de emergencia igualmente entre todas las aldeas", efectos:{ food:0, gold:-20, order:+10, morale:+15 } },
                { texto: "🏗️ Criterio técnico: construir diques ahora para parar la pérdida antes de rescatar", efectos:{ food:-10, gold:-25, order:+25, morale:+5 } },
                { texto: "💼 Criterio de mercado: quien pueda pagar por la ayuda, la recibe primero", efectos:{ food:+5, gold:+10, order:-10, morale:-30 } }
            ]
        }
    },

    // ══════════════════════════════════════════════════════════
    // RONDA 12
    // ══════════════════════════════════════════════════════════
    {
        ronda: 12, tipo: "normal",
        grupos: {
            Campesinos: {
                titulo: "🌾 El alquiler imposible",
                texto: "Los dueños de la tierra (nobles) subieron el alquiler al doble. Las familias campesinas no pueden pagar y producir al mismo tiempo. Si no pagan, los echan. Si pagan, no les queda para comer.",
                opciones: [
                    { texto: "⚖️ Huelga de alquiler colectiva hasta que bajen los precios", efectos:{ food:+5, gold:-10, order:-15, morale:+20 }, buena:true },
                    { texto: "📋 Petición formal al Consejo para regular el precio de alquiler", efectos:{ food:+5, gold:0, order:+5, morale:+15 }, buena:true },
                    { texto: "💸 Pagar como sea aunque signifique menos comida", efectos:{ food:-15, gold:-15, order:0, morale:-15 }, buena:false }
                ]
            },
            Guardia: {
                titulo: "⚔️ La guardia privatizada",
                texto: "Una empresa privada ofrece servicios de seguridad más baratos que mantener la Guardia Real. Contratarlos ahorraría mucho dinero. Pero significaría que la seguridad dependería de quién pague más.",
                opciones: [
                    { texto: "🚫 Rechazar: la seguridad pública no puede privatizarse", efectos:{ food:0, gold:-5, order:+15, morale:+15 }, buena:true },
                    { texto: "🤝 Contratarlos solo para zonas de bajo riesgo, mantener la Guardia en las críticas", efectos:{ food:0, gold:+5, order:+5, morale:+5 }, buena:true },
                    { texto: "💰 Privatizar todo: el ahorro es demasiado importante", efectos:{ food:0, gold:+20, order:-25, morale:-20 }, buena:false }
                ]
            },
            Herreros: {
                titulo: "🔨 El niño prodigio",
                texto: "Un niño de 10 años demuestra un talento extraordinario para la forja. Su familia quiere que empiece a trabajar ya y aporte dinero al hogar. Los maestros dicen que debe estudiar 5 años más primero.",
                opciones: [
                    { texto: "📚 El niño estudia primero: el talento sin formación se desperdicia", efectos:{ food:0, gold:-5, order:+5, morale:+15 }, buena:true },
                    { texto: "⚗️ Aprendizaje mixto: estudia y aprende el oficio a la vez", efectos:{ food:0, gold:+5, order:+5, morale:+10 }, buena:true },
                    { texto: "🔨 Que trabaje ya: el talento natural es suficiente", efectos:{ food:0, gold:+10, order:-5, morale:-15 }, buena:false }
                ]
            },
            Mercaderes: {
                titulo: "💰 La feria internacional",
                texto: "Un evento comercial masivo de reinos lejanos quiere celebrarse en el reino. Traería enormes ganancias pero también miles de extraños y competencia para los negocios locales.",
                opciones: [
                    { texto: "✅ Aceptar con regulación: zona designada, impuesto de entrada", efectos:{ food:+5, gold:+25, order:-5, morale:+15 }, buena:true },
                    { texto: "🤝 Aceptar solo a reinos aliados, no a todos", efectos:{ food:+5, gold:+15, order:+5, morale:+10 }, buena:true },
                    { texto: "🚫 Rechazar: no queremos competencia externa en nuestro territorio", efectos:{ food:0, gold:0, order:+5, morale:-10 }, buena:false }
                ]
            },
            Clerigos: {
                titulo: "📖 El milagro falso",
                texto: "Un sacerdote muy querido por el pueblo ha estado fingiendo milagros para mantener la fe y la moral en tiempos difíciles. Los Clérigos descubrieron el engaño. Exponerlo destruiría la esperanza del pueblo.",
                opciones: [
                    { texto: "📢 Revelar la verdad: la fe no puede basarse en mentiras", efectos:{ food:0, gold:0, order:+5, morale:-20 }, buena:true },
                    { texto: "🤝 Hablar privadamente con él y exigir que pare los fraudes", efectos:{ food:0, gold:0, order:+10, morale:+5 }, buena:true },
                    { texto: "😶 No decir nada: si la gente tiene esperanza, ¿cuál es el daño?", efectos:{ food:0, gold:0, order:-10, morale:-10 }, buena:false }
                ]
            },
            Nobles: {
                titulo: "🏰 El impuesto de la guerra",
                texto: "La amenaza militar es real. Preparar la defensa requiere una cantidad enorme de dinero. La única forma de obtenerla rápido es un impuesto extraordinario que dolerá a todos los sectores del reino.",
                opciones: [
                    { texto: "💰 Aprobar el impuesto de guerra: la seguridad tiene precio", efectos:{ food:-5, gold:+25, order:+15, morale:-10 }, buena:true },
                    { texto: "🏦 Tomar préstamo del tesoro real y pagar después", efectos:{ food:0, gold:+20, order:+10, morale:0 }, buena:true },
                    { texto: "🤷 No actuar: tal vez la amenaza se disuelva sola", efectos:{ food:0, gold:0, order:-25, morale:-15 }, buena:false }
                ]
            }
        }
    },

    // ══════════════════════════════════════════════════════════
    // RONDA 13
    // ══════════════════════════════════════════════════════════
    {
        ronda: 13, tipo: "normal",
        grupos: {
            Campesinos: {
                titulo: "🌾 El último árbol",
                texto: "El bosque que protege los campos del viento y da madera ha sido talado casi completamente por los Herreros. Sin árboles, los campos quedan expuestos y la erosión destruirá el suelo en años.",
                opciones: [
                    { texto: "🌳 Exigir veda total de tala y programa de reforestación urgente", efectos:{ food:+10, gold:-10, order:+5, morale:+15 }, buena:true },
                    { texto: "📋 Acuerdo de tala controlada: por cada árbol talado, plantar tres", efectos:{ food:+5, gold:-5, order:+10, morale:+10 }, buena:true },
                    { texto: "🤷 Los Herreros pagan impuestos, es su derecho usar la madera", efectos:{ food:-20, gold:0, order:-5, morale:-15 }, buena:false }
                ]
            },
            Guardia: {
                titulo: "⚔️ La celda desbordada",
                texto: "La cárcel del reino tiene el triple de presos de los que puede sostener. Las condiciones son inhumanas. Liberar a los de delitos menores resuelve el espacio pero genera temor en el pueblo.",
                opciones: [
                    { texto: "🔓 Liberar condicional a delitos menores con seguimiento", efectos:{ food:0, gold:+10, order:-5, morale:+15 }, buena:true },
                    { texto: "🏗️ Construir una nueva cárcel con trabajo comunitario", efectos:{ food:0, gold:-20, order:+15, morale:+5 }, buena:true },
                    { texto: "🤷 El hacinamiento es su castigo: que sufran", efectos:{ food:0, gold:0, order:+5, morale:-20 }, buena:false }
                ]
            },
            Herreros: {
                titulo: "🔨 La deuda del bosque",
                texto: "Los Campesinos exigen que los Herreros paguen por la deforestación. Los Herreros argumentan que nadie les advirtió del límite. ¿Quién tiene la razón y cómo se repara el daño?",
                opciones: [
                    { texto: "✅ Asumir la responsabilidad y financiar la reforestación completa", efectos:{ food:+10, gold:-20, order:+10, morale:+20 }, buena:true },
                    { texto: "🤝 Compartir el costo de reforestación entre Herreros y Nobles", efectos:{ food:+5, gold:-10, order:+10, morale:+15 }, buena:true },
                    { texto: "⚖️ Negar responsabilidad: nadie les dijo que había un límite", efectos:{ food:-10, gold:0, order:-15, morale:-20 }, buena:false }
                ]
            },
            Mercaderes: {
                titulo: "💰 El producto dañino",
                texto: "Un producto muy rentable que el gremio vende masivamente resulta causar problemas de salud a largo plazo. Los Clérigos tienen la evidencia. Retirarlo costará una fortuna.",
                opciones: [
                    { texto: "🛑 Retirar el producto inmediatamente y compensar a afectados", efectos:{ food:0, gold:-25, order:+5, morale:+20 }, buena:true },
                    { texto: "📋 Retirar gradualmente mientras se reformula el producto", efectos:{ food:0, gold:-10, order:+5, morale:+10 }, buena:true },
                    { texto: "🤫 Ignorar la evidencia: los daños son a largo plazo y nadie lo sabrá", efectos:{ food:0, gold:+10, order:-15, morale:-25 }, buena:false }
                ]
            },
            Clerigos: {
                titulo: "📖 La plaga del espíritu",
                texto: "Un número alarmante de personas presenta tristeza profunda, ansiedad severa y abandono del trabajo. No es enfermedad física. Los Clérigos no tienen experiencia en salud mental.",
                opciones: [
                    { texto: "📚 Estudiar y crear el primer programa de salud mental del reino", efectos:{ food:0, gold:-15, order:+5, morale:+25 }, buena:true },
                    { texto: "🤝 Traer especialistas de otros reinos que sí saben tratar esto", efectos:{ food:0, gold:-10, order:+5, morale:+20 }, buena:true },
                    { texto: "🙏 Rezar y practicar más: la tristeza es debilidad del alma", efectos:{ food:0, gold:0, order:0, morale:-20 }, buena:false }
                ]
            },
            Nobles: {
                titulo: "🏰 El oro envenenado",
                texto: "Se descubrió que parte del tesoro real fue construido con dinero de actividades ilegales de hace 200 años. Técnicamente es pasado, pero moralmente mancha al reino. Devolverlo significaría empobrecerse.",
                opciones: [
                    { texto: "✅ Usar ese dinero en obras sociales como reparación histórica", efectos:{ food:+10, gold:-20, order:+5, morale:+25 }, buena:true },
                    { texto: "🤝 Crear comisión histórica para decidir colectivamente qué hacer", efectos:{ food:0, gold:0, order:+10, morale:+15 }, buena:true },
                    { texto: "🤫 Guardarlo: son hechos del pasado, ya nadie vive", efectos:{ food:0, gold:+5, order:-5, morale:-20 }, buena:false }
                ]
            }
        }
    },

    // ══════════════════════════════════════════════════════════
    // RONDA 14 — TIPO REY (última gran crisis antes del final)
    // ══════════════════════════════════════════════════════════
    {
        ronda: 14, tipo: "rey",
        grupos: {
            Campesinos: {
                titulo: "🌾 La última semilla",
                texto: "Solo quedan semillas para una cosecha más. Si esta falla, no habrá nada para el próximo año. El gremio debe decidir si sembrar todo ahora (más riesgo) o guardar la mitad como seguro del futuro.",
                opciones: [
                    { texto: "🎯 Sembrar todo: el riesgo vale si hay buena preparación", efectos:{ food:+20, gold:0, order:0, morale:+10 }, buena:true },
                    { texto: "🛡️ Sembrar la mitad y guardar la otra mitad como reserva", efectos:{ food:+8, gold:0, order:+10, morale:+5 }, buena:true },
                    { texto: "🙏 Sembrar todo sin preparación y esperar que el clima ayude", efectos:{ food:-10, gold:0, order:-5, morale:-15 }, buena:false }
                ]
            },
            Guardia: {
                titulo: "⚔️ La traición interna",
                texto: "El capitán de la Guardia, figura respetada por todos, resultó ser el espía que filtró información al enemigo durante meses. Las pruebas son irrefutables. ¿Cómo actúa el cuerpo?",
                opciones: [
                    { texto: "⚖️ Juicio público completo sin importar su rango ni historia", efectos:{ food:0, gold:0, order:+20, morale:+15 }, buena:true },
                    { texto: "🤝 Acuerdo secreto: se va del reino a cambio de no juzgarlo", efectos:{ food:0, gold:0, order:-10, morale:-10 }, buena:false },
                    { texto: "📋 Tribunal interno solo del gremio, sin involucrar al pueblo", efectos:{ food:0, gold:0, order:+10, morale:+5 }, buena:true }
                ]
            },
            Herreros: {
                titulo: "🔨 El último maestro",
                texto: "El último herrero maestro con el conocimiento de técnicas ancestrales está en sus últimos días de vida. Nunca quiso enseñar porque temía que sus secretos fueran mal usados. Ahora el tiempo se acaba.",
                opciones: [
                    { texto: "🤝 Ganarse su confianza y lograr que enseñe voluntariamente", efectos:{ food:0, gold:+25, order:+10, morale:+25 }, buena:true },
                    { texto: "📹 Documentar todo lo que se pueda observando su trabajo", efectos:{ food:0, gold:+10, order:0, morale:+10 }, buena:true },
                    { texto: "⚡ Exigirle legalmente que transmita el conocimiento antes de morir", efectos:{ food:0, gold:+5, order:-5, morale:-20 }, buena:false }
                ]
            },
            Mercaderes: {
                titulo: "💰 El banco que quiebra",
                texto: "El banco principal del reino está a punto de quebrar por malas inversiones. Si cae, arruinará a miles de familias que tienen ahorros allí. Rescatarlo con fondos públicos sale del bolsillo de todos.",
                opciones: [
                    { texto: "🏦 Rescate público: el Estado salva el banco y protege los ahorros", efectos:{ food:0, gold:-25, order:+10, morale:+5 }, buena:true },
                    { texto: "⚖️ Dejar que quiebre y compensar solo a las familias más pobres", efectos:{ food:0, gold:-10, order:-10, morale:-5 }, buena:true },
                    { texto: "🤷 No intervenir: las inversiones malas tienen sus consecuencias", efectos:{ food:0, gold:-20, order:-20, morale:-20 }, buena:false }
                ]
            },
            Clerigos: {
                titulo: "📖 El precio de la cura",
                texto: "Los Clérigos desarrollaron una medicina que cura una enfermedad mortal común. Un mercader quiere comprar los derechos exclusivos y venderla caro. Si aceptan, se financia el hospital. Si no, ¿cómo cubren los costos?",
                opciones: [
                    { texto: "🚫 Rechazar: la medicina debe ser accesible para todos", efectos:{ food:0, gold:-10, order:+5, morale:+25 }, buena:true },
                    { texto: "📝 Licencia con precio máximo regulado y fondos al hospital", efectos:{ food:0, gold:+15, order:+5, morale:+15 }, buena:true },
                    { texto: "💰 Aceptar la venta exclusiva: el hospital necesita ese dinero", efectos:{ food:0, gold:+25, order:-5, morale:-20 }, buena:false }
                ]
            },
            Nobles: {
                titulo: "🏰 La abdicación del rey",
                texto: "El rey en funciones quiere abdicar voluntariamente porque considera que su salud ya no le permite gobernar bien. Hay dos candidatos: un noble reformista joven y un noble conservador mayor con más experiencia.",
                opciones: [
                    { texto: "🔄 Apoyar al reformista: el reino necesita cambio y nuevas ideas", efectos:{ food:+5, gold:-5, order:-5, morale:+20 }, buena:true },
                    { texto: "🏛️ Apoyar al conservador: la estabilidad es más importante que el cambio", efectos:{ food:0, gold:+5, order:+10, morale:-10 }, buena:false },
                    { texto: "⚖️ Convocar elección abierta donde todos los gremios tengan voz", efectos:{ food:+5, gold:-10, order:+5, morale:+25 }, buena:true }
                ]
            }
        },
        crisis: {
            titulo: "⚔️ CRISIS GLOBAL — El Gran Dilema: Soberanía vs Supervivencia",
            texto: `Un reino enemigo poderoso envía su ultimátum definitivo: rendición incondicional en 48 horas o guerra total. Han esperado el momento de mayor debilidad del reino.
DILEMA DE GEOPOLÍTICA Y ÉTICA POLÍTICA: Esta es la tensión más antigua del poder: ¿Tiene un gobernante derecho a arriesgar vidas por conservar la soberanía? ¿O la soberanía es exactamente lo que protege las vidas a largo plazo? Los psicólogos llaman a esto el "sesgo del presente": los seres humanos tienden a sobrevaluar el costo inmediato (la guerra) versus el costo diferido (la pérdida de libertad). El Rey Temporal debe pensar no solo en hoy, sino en las generaciones que vienen.
Esta es la decisión más importante de toda la simulación.`,
            opciones: [
                { texto: "⚔️ Resistencia total: rechazar el ultimátum y preparar defensa militar completa", efectos:{ food:-20, gold:-25, order:+30, morale:+35 } },
                { texto: "🏳️ Rendición negociada: autonomía interna a cambio de tributo económico anual", efectos:{ food:+5, gold:-30, order:-15, morale:-20 } },
                { texto: "🌐 Coalición urgente: 24 horas para conseguir aliados que equilibren la fuerza", efectos:{ food:-5, gold:-15, order:+20, morale:+25 } },
                { texto: "🕊️ Propuesta de federación: unirse como estado autónomo, no como colonia", efectos:{ food:+10, gold:-10, order:0, morale:-5 } },
                { texto: "💣 Disuasión asimétrica: amenazar con destruir los propios recursos si invaden", efectos:{ food:-25, gold:-25, order:+5, morale:+10 } },
                { texto: "📜 Referéndum popular: dejar que TODOS los ciudadanos voten la decisión en 12 horas", efectos:{ food:-5, gold:-5, order:-5, morale:+40 } }
            ]
        }
    },

    // ══════════════════════════════════════════════════════════
    // RONDA 15 — RONDA FINAL
    // ══════════════════════════════════════════════════════════
    {
        ronda: 15, tipo: "normal",
        grupos: {
            Campesinos: {
                titulo: "🌾 El legado del campo",
                texto: "Terminada la crisis, los Campesinos deben decidir qué tipo de agricultura construirán para el futuro: una que maximice producción a cualquier costo o una que cuide el suelo para las próximas generaciones.",
                opciones: [
                    { texto: "🌱 Agricultura sostenible: menos producción ahora, más para siempre", efectos:{ food:+10, gold:-5, order:+5, morale:+20 }, buena:true },
                    { texto: "⚗️ Agricultura tecnológica: ciencia + naturaleza juntas", efectos:{ food:+15, gold:-15, order:+5, morale:+15 }, buena:true },
                    { texto: "🏭 Máxima producción: el presente primero, el futuro después", efectos:{ food:+20, gold:0, order:-5, morale:-15 }, buena:false }
                ]
            },
            Guardia: {
                titulo: "⚔️ La guardia del pueblo",
                texto: "Terminadas las guerras, la Guardia debe definir su nuevo rol. ¿Seguir siendo una fuerza de control o transformarse en un cuerpo de servicio comunitario que prevenga antes que castigue?",
                opciones: [
                    { texto: "🤝 Guardia comunitaria: prevención, mediación y servicio social", efectos:{ food:0, gold:-10, order:+10, morale:+25 }, buena:true },
                    { texto: "⚖️ Modelo mixto: seguridad y comunidad en partes iguales", efectos:{ food:0, gold:-5, order:+15, morale:+15 }, buena:true },
                    { texto: "🛡️ Mantener el modelo de fuerza y control: la debilidad invita al caos", efectos:{ food:0, gold:0, order:+10, morale:-15 }, buena:false }
                ]
            },
            Herreros: {
                titulo: "🔨 La forja del futuro",
                texto: "Con las crisis superadas, los Herreros pueden definir si el gremio se mantiene como artesanos tradicionales o evolucionan hacia ingeniería e industria moderna que cambiará al reino para siempre.",
                opciones: [
                    { texto: "🏭 Industrialización: más producción, más empleo, más cambio", efectos:{ food:0, gold:+20, order:0, morale:+10 }, buena:true },
                    { texto: "⚗️ Fusión: tecnología al servicio del artesanado, no en su contra", efectos:{ food:0, gold:+15, order:+5, morale:+20 }, buena:true },
                    { texto: "🔨 Tradición pura: los ancestros supieron lo que hacían", efectos:{ food:0, gold:+5, order:0, morale:-10 }, buena:false }
                ]
            },
            Mercaderes: {
                titulo: "💰 El mercado justo",
                texto: "Reconstruyendo el reino, los Mercaderes pueden definir si el mercado del futuro favorece la ganancia máxima o establece reglas que protejan tanto al comerciante como al comprador y al medio ambiente.",
                opciones: [
                    { texto: "⚖️ Código de ética mercantil obligatorio para todos los gremios", efectos:{ food:+5, gold:+10, order:+10, morale:+20 }, buena:true },
                    { texto: "🌍 Comercio abierto con reglas claras de protección al consumidor", efectos:{ food:+5, gold:+15, order:+5, morale:+15 }, buena:true },
                    { texto: "💰 Mercado completamente libre: sin reglas, máxima ganancia", efectos:{ food:-5, gold:+25, order:-15, morale:-20 }, buena:false }
                ]
            },
            Clerigos: {
                titulo: "📖 La educación universal",
                texto: "Con el reino estabilizado, los Clérigos tienen la oportunidad histórica de proponer educación gratuita y obligatoria para todos. Costará mucho, pero podría ser la mejor inversión del reino.",
                opciones: [
                    { texto: "📚 Educación universal gratuita desde la infancia: es un derecho", efectos:{ food:0, gold:-25, order:+10, morale:+30 }, buena:true },
                    { texto: "🏫 Educación básica gratis, avanzada con becas según mérito", efectos:{ food:0, gold:-15, order:+10, morale:+20 }, buena:true },
                    { texto: "💰 Educación para quien pueda pagarla: el conocimiento tiene valor", efectos:{ food:0, gold:0, order:0, morale:-25 }, buena:false }
                ]
            },
            Nobles: {
                titulo: "🏰 El tipo de reino que seremos",
                texto: "Esta es la decisión final y más importante del Consejo. ¿Qué tipo de reino quieren construir para las generaciones que vienen? Esta decisión define el carácter del reino para siempre.",
                opciones: [
                    { texto: "🌱 Reino justo: igualdad, derechos para todos, menos privilegios", efectos:{ food:+10, gold:-10, order:+5, morale:+30 }, buena:true },
                    { texto: "⚖️ Reino equilibrado: tradición + modernidad + justicia social", efectos:{ food:+5, gold:+5, order:+10, morale:+20 }, buena:true },
                    { texto: "👑 Reino fuerte: poder centralizado, orden antes que libertad", efectos:{ food:0, gold:+10, order:+20, morale:-20 }, buena:false }
                ]
            }
        }
    }
];

/* ============================================================
   ESTADO GLOBAL
   ============================================================ */
const S = {
    salaId:         "",
    playerName:     "",
    grupo:          "",
    isHost:         false,
    rondaActual:    0,
    votoPropio:     null,   // indice de opcion que este jugador voto
    timerInterval:  null,
    salaListener:   null,
    chatListener:   null,
    selectedOption: null,
    electionDone:   false,
    decisionConfirmada: false,
    recursos: { food:70, gold:60, order:75, morale:65 },
};

let _lastRondaRendered = -1;
let _lastEleccionKey   = "";

/* ============================================================
   UTILIDADES
   ============================================================ */
const fmt = s => { const v=Math.max(0,Math.floor(s)); return `${String(Math.floor(v/60)).padStart(2,"0")}:${String(v%60).padStart(2,"0")}`; };
const san = s => { const d=document.createElement("div"); d.textContent=s; return d.innerHTML; };
// Normaliza nombres para comparación robusta (sin espacios extra, minúsculas)
const normNombre = s => (s||"").trim().toLowerCase();

function toast(msg, type="info", ms=3500) {
    const c=document.getElementById("toast-container"); if(!c) return;
    const t=document.createElement("div"); t.className=`toast ${type}`; t.textContent=msg; c.appendChild(t);
    setTimeout(()=>{ t.style.opacity="0"; t.style.transform="translateX(18px)"; t.style.transition="all .3s"; setTimeout(()=>t.remove(),310); }, ms);
}

function setBar(bid, vid, val) {
    const b=document.getElementById(bid), v=document.getElementById(vid);
    const cl=Math.max(0,Math.min(100,Math.round(val)));
    if(b) b.style.width=cl+"%"; if(v) v.textContent=cl;
}
function updateBars(r, px) {
    setBar(`${px}bar-food`,`${px}val-food`,r.food);
    setBar(`${px}bar-gold`,`${px}val-gold`,r.gold);
    setBar(`${px}bar-order`,`${px}val-order`,r.order);
    setBar(`${px}bar-morale`,`${px}val-morale`,r.morale);
}

/* ============================================================
   NAVEGACIÓN
   ============================================================ */
function switchScreen(id) {
    document.querySelectorAll(".screen").forEach(s=>s.classList.remove("active"));
    document.getElementById(id)?.classList.add("active");
}

/* ============================================================
   LISTENERS FIRESTORE
   ============================================================ */
function detachAll() {
    if(S.salaListener){ S.salaListener(); S.salaListener=null; }
    if(S.chatListener){ S.chatListener(); S.chatListener=null; }
}

function attachSalaListener() {
    if(S.salaListener){ S.salaListener(); S.salaListener=null; }
    S.salaListener = onSnapshot(
        doc(db,"salas",S.salaId),
        snap=>{ if(!snap.exists()) return; S.isHost ? actualizarHost(snap.data()) : actualizarPlayer(snap.data()); },
        err=>{ console.error(err); toast("Conexión perdida.","error"); }
    );
}

function attachChatListener(grupo) {
    if(S.chatListener){ S.chatListener(); S.chatListener=null; }
    S.chatListener = onSnapshot(
        doc(db,"salas",S.salaId,"chats",grupo),
        snap=>{ if(!snap.exists()) return; renderChat(snap.data().mensajes||[]); }
    );
}

/* ============================================================
   CREAR SALA (PROFESOR)
   ============================================================ */
async function crearSala() {
    const btn=document.getElementById("btn-create-host");
    btn.disabled=true; btn.innerHTML=`<span class="spinner"></span> Fundando el Reino...`;
    const salaId=`REINO-${Math.floor(100+Math.random()*900)}`;
    const doc0={
        salaId, estado:"esperando", ronda:0, tiempo:TIEMPO_RONDA,
        recursos:{ food:70, gold:60, order:75, morale:65 },
        jugadores:{}, decisiones:{}, decisionCrisis:null,
        reyTemporal:null, votosRey:{}, votosGrupo:{},
        eleccionReyPendiente:false,
        situacion:null, puedeAvanzar:false,
    };
    try {
        await setDoc(doc(db,"salas",salaId), doc0);
        for(const g of GRUPOS) await setDoc(doc(db,"salas",salaId,"chats",g),{mensajes:[]});
        await setDoc(doc(db,"salas",salaId,"chats","consejo-real"),{mensajes:[]});
        S.salaId=salaId; S.isHost=true;
        document.getElementById("host-sala-display").textContent=salaId;
        const qrc=document.getElementById("qrcode-container"); qrc.innerHTML="";
        new QRCode(qrc,{ text:`${window.location.href.split("?")[0]}?sala=${salaId}`, width:150, height:150, colorDark:"#000", colorLight:"#fff" });
        switchScreen("screen-host"); attachSalaListener();
        toast("¡Reino fundado!","success");
    } catch(e) {
        console.error(e); toast("Error al conectar con Firebase.","error",5000);
        btn.disabled=false; btn.textContent="⚜️ Fundar el Reino";
    }
}

/* ============================================================
   INICIAR / AVANZAR RONDA (PROFESOR)
   ============================================================ */
async function iniciarSimulacion() {
    if(!S.salaId||S.timerInterval) return;
    const snap=await getDoc(doc(db,"salas",S.salaId));
    const totalJug=Object.keys(snap.data().jugadores||{}).length;
    if(totalJug===0){ toast("No hay ningun jugador conectado aun.","error"); return; }
    document.getElementById("btn-start-game").disabled=true;
    document.getElementById("btn-start-game").textContent="⚡ En progreso";
    const btnN=document.getElementById("btn-next-round");
    if(btnN){ btnN.style.display="block"; btnN.disabled=true; }
    await lanzarRonda(0);
}

async function avanzarRonda() {
    const snap=await getDoc(doc(db,"salas",S.salaId));
    if(!snap.exists()) return;
    const data=snap.data();
    const rondaData=RONDAS[data.ronda];
    const jug=data.jugadores||{};
    const decisiones=data.decisiones||{};

    // Solo son obligatorios los grupos que tienen al menos 1 jugador
    const gruposActivos=Object.keys(rondaData.grupos).filter(g=>
        Object.values(jug).some(j=>j.grupo===g)
    );
    const faltantes=gruposActivos.filter(g=>!decisiones[g]);

    if(faltantes.length>0){
        toast(`Aun faltan decisiones de: ${faltantes.join(", ")}.`,"error",5000);
        return;
    }
    if(rondaData.tipo==="rey" && !data.decisionCrisis){
        toast("Falta la decision de crisis del Rey Temporal.","error",4000);
        return;
    }

    limpiarTimer();
    const btnN=document.getElementById("btn-next-round");
    if(btnN) btnN.disabled=true;
    const siguiente=(data.ronda||0)+1;
    if(siguiente>=TOTAL_RONDAS){ await finalizarSimulacion(); return; }
    await lanzarRonda(siguiente);
    if(btnN) btnN.disabled=false;
}

async function lanzarRonda(idx) {
    limpiarTimer();
    S.rondaActual=idx;
    const sit=RONDAS[idx];
    const salaRef=doc(db,"salas",S.salaId);
    await updateDoc(salaRef,{
        estado:"jugando", ronda:idx, tiempo:TIEMPO_RONDA,
        situacion:sit, decisiones:{}, decisionCrisis:null,
        votosRey:{}, votosGrupo:{}, reyTemporal:null,
        eleccionReyPendiente: sit.tipo==="rey",
        puedeAvanzar:false,
        tiempoAgotado:false,
        penalizacion:[],
        consejoBloqueado:false,
    });
    let t=TIEMPO_RONDA;
    S.timerInterval=setInterval(async()=>{
        t--;
        const el=document.getElementById("host-timer");
        if(el){ el.textContent=fmt(t); el.classList.toggle("warning",t<=30); }
        if(t%10===0&&t>0) await updateDoc(salaRef,{tiempo:t}).catch(console.error);
        if(t<=0){
            limpiarTimer();
            // Aplicar penalizacion a grupos que no decidieron
            await aplicarPenalidadTiempo(idx);
            // Mostrar overlay "Tiempo agotado" en Firestore (todos lo ven)
            await updateDoc(salaRef,{ tiempoAgotado:true, tiempo:0 });
            // Avanzar automaticamente tras 3 segundos
            setTimeout(async()=>{
                await updateDoc(salaRef,{ tiempoAgotado:false });
                const siguiente=idx+1;
                if(siguiente>=TOTAL_RONDAS){ await finalizarSimulacion(); }
                else { await lanzarRonda(siguiente); }
            }, 3000);
        }
    },1000);
}

/* Aplica penalizacion de -10 a todos los recursos por cada grupo que no decidio */
async function aplicarPenalidadTiempo(idxRonda) {
    const snap=await getDoc(doc(db,"salas",S.salaId));
    if(!snap.exists()) return;
    const data=snap.data();
    const sit=RONDAS[idxRonda];
    const decisiones=data.decisiones||{};
    const gruposRonda=Object.keys(sit.grupos||{});
    const sinDecision=gruposRonda.filter(g=>!decisiones[g]);
    if(!sinDecision.length) return;          // todos decidieron, sin penalizacion
    const r=data.recursos;
    const penaltyPorGrupo=5;                 // -5 por cada grupo sin decision
    const total=sinDecision.length*penaltyPorGrupo;
    const nuevosR={
        food:  Math.max(0,(r.food||0)  -total),
        gold:  Math.max(0,(r.gold||0)  -total),
        order: Math.max(0,(r.order||0) -total),
        morale:Math.max(0,(r.morale||0)-total),
    };
    await updateDoc(doc(db,"salas",S.salaId),{
        recursos: nuevosR,
        penalizacion: sinDecision,           // guardamos quienes no decidieron para el host
    });
}

async function finalizarSimulacion() {
    limpiarTimer();
    const snap=await getDoc(doc(db,"salas",S.salaId));
    const r=snap.data().recursos;
    const survived=r.food>15&&r.gold>10&&r.order>15&&r.morale>15;
    await updateDoc(doc(db,"salas",S.salaId),{ estado:"finalizado", ronda:TOTAL_RONDAS, survived });
}

function limpiarTimer(){ clearInterval(S.timerInterval); S.timerInterval=null; }

/* ============================================================
   UNIRSE (ESTUDIANTE)
   ============================================================ */
async function unirseJugador() {
    const sala  =document.getElementById("input-sala-id").value.trim().toUpperCase();
    const nombre=document.getElementById("input-player-name").value.trim();
    const grupo =document.getElementById("select-grupo").value;
    if(!sala)                 { toast("Ingresa el código del reino.","error"); return; }
    if(!nombre||nombre.length<2){ toast("Ingresa un nombre de al menos 2 caracteres.","error"); return; }
    const snap=await getDoc(doc(db,"salas",sala));
    if(!snap.exists())         { toast("Ese código de reino no existe.","error"); return; }
    const data=snap.data();
    const miembros=Object.values(data.jugadores||{}).filter(j=>j.grupo===grupo);
    if(miembros.length>=MAX_POR_GRUPO){ toast(`El gremio ${grupo} ya está lleno (${MAX_POR_GRUPO} máx.).`,"error",4000); return; }
    const nombreNorm=san(nombre).trim().toLowerCase();
    const nombresExistentes=Object.keys(data.jugadores||{}).map(n=>n.trim().toLowerCase());
    if(nombresExistentes.includes(nombreNorm)){
        toast(`El nombre "${nombre}" ya está en uso en esta sala. Elige otro nombre.`,"error",4000); return;
    }
    S.salaId=sala; S.playerName=san(nombre); S.grupo=grupo; S.isHost=false;
    await updateDoc(doc(db,"salas",sala),{
        [`jugadores.${S.playerName}`]:{ grupo, nombre:S.playerName, timestamp:new Date().toISOString() }
    });
    document.getElementById("player-group-display").textContent=`${GRUPO_ICONS[grupo]} ${grupo}`;
    document.getElementById("player-name-display").textContent=S.playerName;
    document.getElementById("chat-group-label").textContent=`Gremio: ${grupo}`;
    switchScreen("screen-player"); attachSalaListener(); attachChatListener(grupo);
}

/* ============================================================
   ACTUALIZAR HOST
   ============================================================ */
function actualizarHost(data) {
    const fase=document.getElementById("host-current-fase");
    if(fase) fase.textContent=data.estado==="esperando"
        ? "Esperando jugadores..."
        : `Ronda ${(data.ronda||0)+1} / ${TOTAL_RONDAS}`;
    if(data.recursos){ S.recursos=data.recursos; updateBars(data.recursos,""); }

    const jug=data.jugadores||{};
    const dec=data.decisiones||{};
    const totalJug=Object.keys(jug).length;

    // ── Fase de espera: mostrar boton iniciar y conteo ──
    const btnStart=document.getElementById("btn-start-game");
    if(data.estado==="esperando"){
        if(btnStart){
            btnStart.disabled=totalJug===0;
            btnStart.title=totalJug===0?"Espera al menos un jugador":"Iniciar con los jugadores actuales";
        }
        const evEl=document.getElementById("host-event-text");
        if(evEl) evEl.textContent=`${totalJug} jugador(es) conectado(s). Puedes iniciar cuando quieras.`;
    }

    // ── Overlay de tiempo agotado (todos lo ven via Firestore) ──
    const ovEl=document.getElementById("host-timeout-overlay");
    if(ovEl) ovEl.style.display=data.tiempoAgotado?"flex":"none";

    const sit=data.situacion;
    if(sit){
        const esRey=sit.tipo==="rey";
        const evEl=document.getElementById("host-event-text");
        if(evEl){
            let txt=`Todos los gremios deliberan.`;
            if(esRey) txt+=` ⚠️ Ronda Rey Temporal — hay crisis global.`;
            if(data.penalizacion?.length) txt+=` ⚠️ Penalizacion aplicada a: ${data.penalizacion.join(", ")}.`;
            evEl.textContent=txt;
        }
        const afEl=document.getElementById("host-afecta");
        const afGr=document.getElementById("host-afecta-grupos");
        if(afEl&&afGr){ afEl.style.display="inline-flex"; afGr.textContent=esRey?"Rey Temporal + crisis global":"Todos los gremios"; }
        const btnToggle=document.getElementById("btn-toggle-situations");
        if(btnToggle) btnToggle.style.display="block";
        renderSituacionesHost(sit, dec);
    }

    // ── Tarjetas de gremios: integrantes, votos, lider ──
    GRUPOS.forEach(g=>{
        const card=document.getElementById(`card-${g}`);
        const statusEl=card?.querySelector(".group-status");
        const countEl=document.getElementById(`count-${g}`);
        const miembros=Object.values(jug).filter(j=>j.grupo===g);
        const n=miembros.length;
        if(countEl) countEl.textContent=`${n} / ${MAX_POR_GRUPO} miembros`;
        if(!card) return;

        // Estado de decision (modo democrático)
        if(dec[g]){
            card.classList.add("ready");
            if(statusEl) statusEl.innerHTML=`✅ Decidido por votación`;
        } else {
            card.classList.remove("ready");
            const vGrupo=data.votosGrupo?.[g]||{};
            const nVotos=Object.keys(vGrupo).length;
            if(nVotos>0){
                if(statusEl) statusEl.innerHTML=`🗳️ ${nVotos}/${n} votaron`;
            } else {
                if(statusEl) statusEl.textContent=n>0?"🗣️ Deliberando...":"💤 Sin jugadores";
            }
        }
    });

    // ── Panel de votos para Rey Temporal (solo en fases rey) ──
    renderVotosReyHost(data);

    // ── Habilitar btn siguiente ronda ──
    const btnN=document.getElementById("btn-next-round");
    if(btnN&&sit){
        const gruposActivos=Object.keys(sit.grupos||{}).filter(g=>Object.values(jug).some(j=>j.grupo===g));
        const faltantes=gruposActivos.filter(g=>!dec[g]);
        const crisisOk=sit.tipo!=="rey"||!!data.decisionCrisis;
        const todoListo=faltantes.length===0&&crisisOk;
        btnN.disabled=!todoListo;
        btnN.title=todoListo?"Todos decidieron. Puedes avanzar.":`Aun faltan: ${faltantes.join(", ")}`;
    }

    if(data.estado==="finalizado") mostrarDebriefingHost(data);
}

/* ── Panel democrático: votos individuales por gremio + votación Rey Temporal ── */
function renderVotosReyHost(data) {
    let panel=document.getElementById("host-votes-panel");
    const sit=data.situacion;
    const esRey=sit?.tipo==="rey";
    const votosRey=data.votosRey||{};
    const votosGrupo=data.votosGrupo||{};
    const jug=data.jugadores||{};
    const reyTemporal=data.reyTemporal;

    // Mostrar si hay votos en algún gremio o votos para Rey
    const hayVotos=Object.values(votosGrupo).some(g=>Object.keys(g).length>0);
    const hayVotosRey=Object.keys(votosRey).length>0||reyTemporal;
    const mostrar=hayVotos||(esRey&&hayVotosRey);

    if(!mostrar){
        if(panel) panel.style.display="none";
        return;
    }

    if(!panel){
        panel=document.createElement("div");
        panel.id="host-votes-panel";
        panel.style.cssText="background:var(--bg-card);border:1px solid var(--border-faint);border-radius:var(--r-lg);padding:20px;margin-top:16px;";
        document.querySelector(".host-main")?.appendChild(panel);
    }
    panel.style.display="block";

    let html=`<h3 style="font-size:.8rem;letter-spacing:.1em;text-transform:uppercase;color:var(--gold);margin-bottom:14px;">
        🗳️ Votos por Gremio (Tiempo Real)</h3>`;

    // Votos individuales por gremio
    html+=`<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:10px;margin-bottom:14px;">`;
    GRUPOS.forEach(g=>{
        const miembros=Object.values(jug).filter(j=>j.grupo===g);
        if(!miembros.length) return;
        const grupoVotos=votosGrupo[g]||{};
        const totalMiembros=miembros.length;
        const totalVotos=Object.keys(grupoVotos).length;
        const icon=GRUPO_ICONS[g];
        const dec=data.decisiones?.[g];

        // Conteo por opcion
        const conteoOpc={};
        Object.values(grupoVotos).forEach(v=>{conteoOpc[v]=(conteoOpc[v]||0)+1;});

        let contenido="";
        if(dec){
            contenido=`<div style="color:#5dd9a8;font-size:.8rem;margin-top:5px;">✅ Decidido: <em>${san(dec.opcionTexto||"").slice(0,35)}...</em></div>
            <div style="font-size:.75rem;color:var(--text-dim);margin-top:2px;">${dec.votos||"?"}/${dec.totalVotos||"?"} votos${dec.fueEmpate?" — empate resuelto":""}</div>`;
        } else if(totalVotos>0){
            // Mostrar barra de progreso de votos
            contenido=`<div style="font-size:.75rem;color:var(--text-mid);margin-top:4px;">🗳️ ${totalVotos}/${totalMiembros} han votado</div>`;
            if(sit?.grupos?.[g]){
                contenido+=sit.grupos[g].opciones.map((op,i)=>{
                    const v=conteoOpc[i]||0;
                    const pct=totalMiembros>0?Math.round(v/totalMiembros*100):0;
                    return v>0?`<div style="font-size:.72rem;color:var(--text-mid);margin-top:2px;display:flex;align-items:center;gap:6px;">
                        <div style="flex:1;background:rgba(255,255,255,.06);border-radius:4px;height:5px;">
                            <div style="width:${pct}%;background:var(--gold);border-radius:4px;height:5px;"></div>
                        </div>
                        <span style="color:var(--gold);min-width:18px;">${v}</span>
                        <span style="color:var(--text-dim);font-size:.68rem;">${san(op.texto.slice(0,20))}…</span>
                    </div>`:"";
                }).join("");
            }
        } else {
            contenido=`<div style="font-size:.78rem;color:var(--text-dim);margin-top:4px;">⏳ Sin votos aún</div>`;
        }

        html+=`<div style="background:rgba(0,0,0,.25);border-radius:8px;padding:10px;border:1px solid var(--border-faint);">
            <div style="font-size:.82rem;font-weight:700;color:var(--text-light);">${icon} ${san(g)}</div>
            ${contenido}
        </div>`;
    });
    html+=`</div>`;

    // Votación para Rey Temporal
    if(esRey){
        html+=`<div style="border-top:1px solid var(--border-faint);padding-top:12px;margin-top:4px;">
            <p style="font-size:.78rem;letter-spacing:.08em;text-transform:uppercase;color:var(--gold);margin-bottom:8px;">
                ⚔️ Votación Rey Temporal (todos los jugadores)</p>`;
        if(reyTemporal){
            html+=`<p style="color:var(--gold-bright);font-size:.95rem;font-weight:700;">👑 Rey Temporal elegido: ${san(reyTemporal)}</p>`;
        } else if(Object.keys(votosRey).length>0){
            const conteoRey={};
            Object.values(votosRey).forEach(v=>{conteoRey[v]=(conteoRey[v]||0)+1;});
            const totalJug=Object.keys(jug).length;
            const totalVotosRey=Object.keys(votosRey).length;
            html+=`<div style="font-size:.8rem;color:var(--text-mid);margin-bottom:6px;">🗳️ ${totalVotosRey}/${totalJug} han votado</div>`;
            html+=Object.entries(conteoRey).sort((a,b)=>b[1]-a[1]).map(([k,v])=>{
                const pct=totalJug>0?Math.round(v/totalJug*100):0;
                return `<div style="display:flex;align-items:center;gap:8px;margin-bottom:5px;">
                    <span style="font-size:.8rem;color:var(--text-light);min-width:80px;">${san(k)}</span>
                    <div style="flex:1;background:rgba(255,255,255,.06);border-radius:4px;height:8px;">
                        <div style="width:${pct}%;background:var(--gold);border-radius:4px;height:8px;transition:width .5s;"></div>
                    </div>
                    <span style="color:var(--gold);font-size:.82rem;min-width:30px;">${v} voto${v!==1?"s":""}</span>
                </div>`;
            }).join("");
        } else {
            html+=`<p style="font-size:.82rem;color:var(--text-dim);">Los jugadores aún no han votado por el Rey Temporal.</p>`;
        }
        html+=`</div>`;
    }
    panel.innerHTML=html;
}

/* ============================================================
   PANEL DE SITUACIONES (PROFESOR) — toggle ver/ocultar
   ============================================================ */
let _situacionesPanelVisible = false;

function toggleSituacionesPanel() {
    const panel=document.getElementById("situations-panel");
    const btn  =document.getElementById("btn-toggle-situations");
    if(!panel||!btn) return;
    _situacionesPanelVisible=!_situacionesPanelVisible;
    panel.style.display=_situacionesPanelVisible?"block":"none";
    btn.textContent=_situacionesPanelVisible?"📋 Ocultar Situaciones":"📋 Ver Situaciones";
}

function renderSituacionesHost(sit, decisiones) {
    const grid=document.getElementById("situations-grid");
    if(!grid) return;
    grid.innerHTML=GRUPOS.map(g=>{
        const gs=sit.grupos?.[g];
        if(!gs) return "";
        const dec=decisiones[g];
        const icon=GRUPO_ICONS[g];
        const opcionesHTML=gs.opciones.map((op,i)=>{
            const elegida=dec&&dec.opcionIndex===i;
            return `<div class="situation-option${elegida?" chosen":""}">${icon} ${san(op.texto)}</div>`;
        }).join("");
        return `<div class="situation-card">
            <div class="situation-card-header">
                <span class="situation-group-icon">${icon}</span>
                <span class="situation-group-name">${san(g)}</span>
            </div>
            <div class="situation-title">${san(gs.titulo)}</div>
            <div class="situation-text">${san(gs.texto)}</div>
            <div class="situation-options">${opcionesHTML}</div>
        </div>`;
    }).join("");
}

/* ============================================================
   ACTUALIZAR JUGADOR
   ============================================================ */
function actualizarPlayer(data) {
    const tEl=document.getElementById("player-timer");
    if(tEl){ tEl.textContent=fmt(data.tiempo||0); tEl.classList.toggle("urgent",(data.tiempo||0)<=30); }
    if(data.recursos){ S.recursos=data.recursos; updateBars(data.recursos,"p-"); }

    // Overlay de tiempo agotado
    const ovEl=document.getElementById("player-timeout-overlay");
    if(ovEl) ovEl.style.display=data.tiempoAgotado?"flex":"none";

    // En modo democrático no hay líder — todos votan individualmente
    document.getElementById("player-leader-badge").style.display="none";
    document.getElementById("player-member-badge").style.display="inline-block";

    const sit=data.situacion;
    if(!sit) return;

    const ronda=data.ronda??0;

    // Nueva ronda: re-renderizar
    if(ronda!==_lastRondaRendered){
        _lastRondaRendered=ronda;
        S.selectedOption=null; S.electionDone=false; S.votoPropio=null; _lastEleccionKey="";
        // Limpiar bloqueo visual de la ronda anterior
        document.querySelectorAll(".option-btn").forEach(b=>{
            b.disabled=false; b.style.cursor="pointer"; b.style.opacity="1"; b.classList.remove("selected");
        });
        renderSituacionJugador(sit, data);
    }

    // Elección de Rey Temporal pendiente (rondas rey)
    // Cualquier jugador puede iniciar el proceso — ya no se requiere ser líder
    if(sit.tipo==="rey"&&data.eleccionReyPendiente&&!data.reyTemporal){
        const wKey=`warning-${ronda}`;
        if(wKey!==_lastEleccionKey){
            _lastEleccionKey=wKey;
            mostrarAdvertenciaRey(sit);
        }
    }

    // Abrir o actualizar el Consejo Real según Firestore (fuente de verdad)
    // Se llama en CADA snapshot mientras consejoBloqueado sea true para
    // re-evaluar soyRey correctamente cuando reyTemporal llega desfasado.
    if(data.consejoBloqueado) {
        abrirConsejoReal(data);
    } else if(!data.consejoBloqueado) {
        cerrarConsejoReal();
    }

    if(data.estado==="finalizado"){ limpiarTimer(); detachAll(); mostrarDebriefingPlayer(data); switchScreen("screen-debriefing"); }
}

/* ============================================================
   RENDER SITUACIÓN DEL JUGADOR — MODO DEMOCRÁTICO
   Cada jugador vota individualmente. La mayoría decide.
   ============================================================ */
function renderSituacionJugador(sit, data) {
    const grupoSit=sit.grupos?.[S.grupo];
    const infoBox =document.getElementById("event-player-info");
    const optsCont=document.getElementById("options-container");
    const prevCont=document.getElementById("consequences-preview");
    const lnote   =document.getElementById("leader-note");
    const btnS    =document.getElementById("btn-submit-action");

    prevCont.style.display="none";
    optsCont.innerHTML="";

    if(!grupoSit){
        infoBox.textContent="Tu gremio no participa en esta situación. Observa y apoya en el chat.";
        if(lnote) lnote.style.display="none";
        if(btnS) btnS.disabled=true;
        return;
    }

    infoBox.innerHTML=`<strong>${san(grupoSit.titulo)}</strong><br><br>${san(grupoSit.texto).replace(/\n/g,"<br>")}`;
    infoBox.classList.add("active");

    // Mostrar nota democrática
    if(lnote){
        lnote.style.display="block";
        lnote.textContent="🗳️ Cada miembro del gremio vota. La opción con más votos será la decisión final.";
    }

    // Mostrar conteo de votos del grupo
    const votosGrupo=data.votosGrupo?.[S.grupo]||{};
    const miVoto=votosGrupo[S.playerName];

    // Mostrar si la decisión grupal ya fue calculada y aplicada
    if(data.decisiones?.[S.grupo]){
        const d=data.decisiones[S.grupo];
        optsCont.innerHTML=`
            <div class="option-btn selected" style="cursor:default;opacity:1;">
                ✅ Decisión del grupo: ${san(d.opcionTexto)}
            </div>
            <p style="font-size:.8rem;color:var(--text-mid);margin-top:8px;text-align:center;">
                Ganó por ${d.votos||"?"}/${d.totalVotos||"?"} votos
                ${d.fueEmpate?" — ⚡ hubo empate: se eligió por orden de llegada":""}
            </p>`;
        if(btnS){ btnS.disabled=true; btnS.textContent="✅ Tu grupo ya decidió"; btnS.style.backgroundColor="var(--emerald)"; }
        return;
    }

    // Renderizar opciones — cada jugador puede votar
    grupoSit.opciones.forEach((op,i)=>{
        const votosEstaOpcion=Object.values(votosGrupo).filter(v=>v===i).length;
        const esmiVoto=miVoto===i;
        const b=document.createElement("button");
        b.type="button";
        b.className="option-btn"+(esmiVoto?" selected":"");
        b.dataset.index=i;
        b.innerHTML=`${san(op.texto)}<span style="float:right;font-size:.8rem;color:var(--gold);margin-left:8px;">${votosEstaOpcion>0?`🗳️ ${votosEstaOpcion}`:""}</span>`;
        if(miVoto!==undefined){
            // Ya votó — bloquear cambio
            b.disabled=true; b.style.cursor="default";
            if(!esmiVoto) b.style.opacity=".4";
        } else {
            b.addEventListener("click",()=>emitirVotoIndividual(i, grupoSit, b));
        }
        optsCont.appendChild(b);
    });

    if(btnS){
        if(miVoto!==undefined){
            btnS.disabled=true;
            btnS.textContent="⏳ Esperando votos de tu gremio...";
            btnS.style.backgroundColor="var(--gold-dim)";
        } else {
            btnS.disabled=true;
            btnS.textContent="👆 Selecciona tu opción para votar";
            btnS.style.backgroundColor=""; btnS.style.borderColor="";
        }
    }
}

/* ============================================================
   VOTO INDIVIDUAL (MODO DEMOCRÁTICO)
   Cada jugador registra su voto. Cuando todos votaron,
   se calcula la mayoría y se aplica la decisión.
   ============================================================ */
async function emitirVotoIndividual(i, grupoSit, btnEl) {
    if(S.votoPropio!==null){ toast("Ya emitiste tu voto en esta ronda.","info"); return; }
    S.votoPropio=i; // bloqueo optimista local

    // Bloquear UI inmediatamente
    document.querySelectorAll(".option-btn").forEach(b=>{
        b.disabled=true; b.style.cursor="default";
        if(b.dataset.index!=i) b.style.opacity=".4";
    });
    btnEl.classList.add("selected");
    const btnS=document.getElementById("btn-submit-action");
    if(btnS){ btnS.disabled=true; btnS.textContent="⏳ Esperando votos de tu gremio..."; btnS.style.backgroundColor="var(--gold-dim)"; }

    const salaRef=doc(db,"salas",S.salaId);
    try {
        await runTransaction(db, async (tx) => {
            const snap=await tx.get(salaRef);
            if(!snap.exists()) throw new Error("sala");
            const data=snap.data();

            // Si ya hay decisión para este grupo, no hacer nada
            if(data.decisiones?.[S.grupo]) throw new Error("YA_DECIDIDO");
            // Si este jugador ya votó, no permitir
            if(data.votosGrupo?.[S.grupo]?.[S.playerName]!==undefined) throw new Error("YA_VOTO");

            const nuevosVotos={
                ...(data.votosGrupo?.[S.grupo]||{}),
                [S.playerName]: i
            };

            // Calcular cuántos miembros del grupo hay
            const miembros=Object.values(data.jugadores||{}).filter(j=>j.grupo===S.grupo);
            const totalMiembros=miembros.length;
            const totalVotos=Object.keys(nuevosVotos).length;

            // Calcular conteo
            const conteo={};
            Object.values(nuevosVotos).forEach(v=>{conteo[v]=(conteo[v]||0)+1;});
            const sorted=Object.entries(conteo).sort((a,b)=>b[1]-a[1]);
            const maxVotos=sorted[0][1];
            const empatados=sorted.filter(e=>e[1]===maxVotos);
            const hayMayoriaAbsoluta=maxVotos>totalMiembros/2;
            const todosVotaron=totalVotos>=totalMiembros;

            // Guardar el voto
            tx.update(salaRef,{ [`votosGrupo.${S.grupo}`]: nuevosVotos });

            // Tomar decisión si: todos votaron O hay mayoría absoluta ya
            if(todosVotaron||hayMayoriaAbsoluta){
                // Resolver empate: ganador es el primero en orden de índice (más conservador)
                const ganadorIdx=parseInt(empatados[0][0]);
                const fueEmpate=empatados.length>1&&!hayMayoriaAbsoluta;
                const op=grupoSit.opciones[ganadorIdx];
                const ef=op.efectos;
                const r=data.recursos||{food:70,gold:60,order:75,morale:65};
                const nuevosR={
                    food:  Math.max(0,Math.min(100,(r.food||0)+(ef.food||0))),
                    gold:  Math.max(0,Math.min(100,(r.gold||0)+(ef.gold||0))),
                    order: Math.max(0,Math.min(100,(r.order||0)+(ef.order||0))),
                    morale:Math.max(0,Math.min(100,(r.morale||0)+(ef.morale||0))),
                };
                tx.update(salaRef,{
                    [`decisiones.${S.grupo}`]:{
                        jugador:    "Democracia del gremio",
                        opcionIndex:ganadorIdx,
                        opcionTexto:op.texto,
                        efectos:    ef,
                        buena:      op.buena,
                        votos:      maxVotos,
                        totalVotos: totalVotos,
                        fueEmpate,
                        timestamp:  new Date().toISOString()
                    },
                    recursos:nuevosR,
                });
            }
        });
    } catch(e){
        if(e.message==="YA_DECIDIDO"||e.message==="YA_VOTO"){
            toast("Tu voto ya fue registrado.","info");
        } else {
            console.error(e);
            toast("Error al registrar voto. Intenta de nuevo.","error");
            // Revertir bloqueo local
            S.votoPropio=null;
            document.querySelectorAll(".option-btn").forEach(b=>{
                b.disabled=false; b.style.cursor="pointer"; b.style.opacity="1";
                b.classList.remove("selected");
            });
            if(btnS){ btnS.textContent="👆 Selecciona tu opción"; btnS.style.backgroundColor=""; }
        }
    }
}

// Función confirmarDecision ahora es alias de emitirVotoIndividual
// El botón "Confirmar" ya no existe en modo democrático — el voto es inmediato al elegir.
async function confirmarDecision() {
    // En modo democrático el voto se emite al hacer click en la opción.
    // Este handler queda como fallback por si el botón sigue presente en el HTML.
    toast("Selecciona directamente una opción para votar.","info");
}

/* ============================================================
   ELECCIÓN DE LÍDER
   ============================================================ */
async function mostrarEleccionLider(data) {
    S.electionDone=true;
    const jugadores=Object.values(data.jugadores||{}).filter(j=>j.grupo===S.grupo);
    if(!jugadores.length) return;
    const modal=document.getElementById("modal-election");
    document.getElementById("modal-election-title").textContent=`Elige el Líder de los ${S.grupo}`;
    document.getElementById("modal-election-desc").textContent="Vota quién tomará las decisiones finales de tu gremio en esta ronda.";
    document.getElementById("vote-result").style.display="none";
    const grid=document.getElementById("vote-grid");
    grid.style.display="";
    grid.innerHTML="";
    jugadores.forEach(j=>{
        const b=document.createElement("button"); b.type="button"; b.className="vote-btn";
        b.innerHTML=`<span class="vote-crown">👤</span> ${san(j.nombre)}`;
        b.addEventListener("click",()=>emitirVotoLider(j.nombre, jugadores.length));
        grid.appendChild(b);
    });
    modal.classList.add("active");
}

async function emitirVotoLider(candidato, total) {
    await updateDoc(doc(db,"salas",S.salaId),{ [`votos.${S.grupo}.${S.playerName}`]: candidato });
    const snap=await getDoc(doc(db,"salas",S.salaId));
    const votos=snap.data().votos?.[S.grupo]||{};
    const conteo={};
    Object.values(votos).forEach(v=>{conteo[v]=(conteo[v]||0)+1;});
    const ganador=Object.entries(conteo).sort((a,b)=>b[1]-a[1])[0];
    if(ganador&&ganador[1]>=Math.ceil(total/2)){
        await updateDoc(doc(db,"salas",S.salaId),{ [`lideres.${S.grupo}`]:ganador[0], eleccionPendiente:false });
        mostrarResultadoEleccion(ganador[0]);
    } else { toast("Voto registrado. Esperando más votos...","info"); }
}

/* ============================================================
   ADVERTENCIA REY TEMPORAL
   ============================================================ */
function mostrarAdvertenciaRey(sit) {
    const wM=document.getElementById("modal-warning-multi");
    document.getElementById("modal-warning-title").textContent=sit.crisis?.titulo||"Crisis Global";
    document.getElementById("modal-warning-desc").textContent=
        "A continuacion vendra una decision muy importante sobre el destino del reino. "+
        "Los lideres de todos los gremios elegiran un Rey Temporal. "+
        "Todos debatiran en el Consejo Real antes de que el Rey decida.";
    wM.classList.add("active");
}

/* ============================================================
   ELECCION DE REY TEMPORAL
   ============================================================ */
async function iniciarEleccionReyTemporal() {
    document.getElementById("modal-warning-multi").classList.remove("active");
    const snap=await getDoc(doc(db,"salas",S.salaId));
    const data=snap.data();

    // En modo democrático, TODOS los jugadores votan por el Rey Temporal
    const jugadores=Object.values(data.jugadores||{});
    const candidatos=[...new Set(jugadores.map(j=>j.nombre))];
    if(!candidatos.length){ toast("No hay jugadores conectados aún.","info"); return; }

    const modal=document.getElementById("modal-election");
    document.getElementById("modal-election-title").textContent="⚔️ Elige al Rey Temporal";
    document.getElementById("modal-election-desc").textContent=
        "Todos los jugadores votan. El candidato con más votos será el Rey Temporal y tomará la decisión final tras el debate en el Consejo Real.";
    document.getElementById("vote-result").style.display="none";
    const grid=document.getElementById("vote-grid");
    grid.style.display=""; grid.innerHTML="";

    // Verificar si ya votó este jugador
    const yaVote=data.votosRey?.[S.playerName]!==undefined;

    candidatos.forEach(c=>{
        const votosC=Object.values(data.votosRey||{}).filter(v=>v===c).length;
        const b=document.createElement("button"); b.type="button"; b.className="vote-btn";
        b.innerHTML=`<span class="vote-crown">&#x1F451;</span> ${san(c)} ${votosC>0?`<span style="float:right;color:var(--gold);font-size:.8rem;">🗳️ ${votosC}</span>`:""}`;
        if(yaVote){ b.disabled=true; b.style.opacity=".5"; }
        else b.addEventListener("click",()=>emitirVotoRey(c, jugadores.length));
        grid.appendChild(b);
    });
    if(yaVote){
        const p=document.createElement("p");
        p.style.cssText="color:var(--text-mid);font-size:.82rem;text-align:center;margin-top:12px;font-style:italic;";
        p.textContent="Ya emitiste tu voto. Esperando a los demás...";
        grid.appendChild(p);
    }
    modal.classList.add("active");
}

async function emitirVotoRey(candidato, total) {
    const salaRef=doc(db,"salas",S.salaId);

    // Usar runTransaction para: verificar que soy líder, registrar voto
    // y, si hay mayoría, escribir reyTemporal + consejoBloqueado atómicamente
    // en UNA sola operación, eliminando el estado intermedio donde
    // consejoBloqueado=true pero reyTemporal aún no existe.
    let ganadorFinal = null;
    try {
        await runTransaction(db, async (tx) => {
            const snap=await tx.get(salaRef);
            const data=snap.data();

            // En modo democrático todos votan — solo bloquear si ya hay Rey o ya votó
            if(data.reyTemporal) return;
            if(data.votosRey?.[S.playerName]!==undefined) return;

            const nuevoVotos={...(data.votosRey||{}), [S.playerName]:candidato};
            const conteo={};
            Object.values(nuevoVotos).forEach(v=>{conteo[v]=(conteo[v]||0)+1;});
            const sorted=Object.entries(conteo).sort((a,b)=>b[1]-a[1]);
            const ganador=sorted[0];
            const hayMayoria=ganador&&ganador[1]>=Math.ceil(total/2);

            if(hayMayoria){
                // Escritura ATÓMICA: reyTemporal + consejoBloqueado en la misma tx
                tx.update(salaRef,{
                    votosRey:             nuevoVotos,
                    reyTemporal:          ganador[0],
                    eleccionReyPendiente: false,
                    consejoBloqueado:     true,
                });
                ganadorFinal=ganador[0];
            } else {
                tx.update(salaRef,{ votosRey: nuevoVotos });
            }
        });

        if(ganadorFinal){
            mostrarResultadoEleccion(ganadorFinal);
        } else {
            toast("Voto registrado. Esperando más votos...","info");
        }
    } catch(e){
        console.error(e); toast("Error al votar. Intenta de nuevo.","error");
    }
}

function mostrarResultadoEleccion(ganador) {
    document.getElementById("vote-grid").style.display="none";
    const result=document.getElementById("vote-result");
    result.style.display="block";
    result.innerHTML=`<span class="crown-big">&#x1F451;</span><h3>${san(ganador)} elegido Rey Temporal</h3><p>El Consejo Real se abrira en un momento para todos.</p>`;
    setTimeout(()=>cerrarModales(), 2400);
}

/* ============================================================
   CONSEJO REAL — OVERLAY DE DEBATE Y DECISION
   Se abre via Firestore (consejoBloqueado:true) para TODOS.
   El Rey ve y puede elegir opciones; los demas solo chatean.
   ============================================================ */
let _consejoChatListener = null;

function abrirConsejoReal(data) {
    const sit=data.situacion;
    if(!sit?.crisis) return;
    const overlay=document.getElementById("royal-council-overlay");
    if(!overlay) return;

    // ── Sin guard de "active" — re-evalúa soyRey en CADA snapshot ──
    // Esto corrige el bug donde el Rey veía solo el chat porque el primer
    // snapshot llegó antes de que reyTemporal estuviera escrito.
    const primerAbrir = !overlay.classList.contains("active");

    // Comparación normalizada para evitar fallos por mayúsculas/espacios
    const soyRey = normNombre(data.reyTemporal) === normNombre(S.playerName);

    document.getElementById("council-crisis-text").textContent=sit.crisis.texto;
    const badge=document.getElementById("council-king-badge");
    badge.style.display=soyRey?"inline-flex":"none";
    document.getElementById("council-crisis-subtitle").textContent=
        data.reyTemporal
            ? "Rey Temporal: "+san(data.reyTemporal)+". Debatan y luego el Rey decide."
            : "Eligiendo Rey Temporal... espera un momento.";

    const decSection=document.getElementById("royal-decision-section");
    const confirmRow=document.getElementById("royal-confirm-row");
    const waitMsg   =document.getElementById("member-waiting-msg");
    const optsDiv   =document.getElementById("royal-options");

    if(soyRey){
        decSection.style.display="block";
        confirmRow.style.display="block";
        waitMsg.style.display="none";
        // Solo re-pintar opciones si el Rey aún no confirmó la crisis
        if(!data.decisionCrisis){
            // Evitar duplicar botones si ya los pintó antes
            if(optsDiv.children.length===0){
                S.selectedOption=null;
                sit.crisis.opciones.forEach((op,i)=>{
                    const b=document.createElement("button"); b.type="button"; b.className="royal-option-btn";
                    b.textContent=op.texto; b.dataset.index=i;
                    b.addEventListener("click",()=>seleccionarOpcionCrisis(i,b));
                    optsDiv.appendChild(b);
                });
                const btnConf=document.getElementById("btn-royal-confirm");
                if(btnConf){ btnConf.disabled=true; btnConf.textContent="Selecciona una opcion primero"; }
            }
        } else {
            // El Rey ya decidió — mostrar resultado
            optsDiv.innerHTML=`<div class="option-btn selected" style="cursor:default;opacity:1;">✅ ${san(data.decisionCrisis.opcionTexto)}</div>`;
            const btnConf=document.getElementById("btn-royal-confirm");
            if(btnConf){ btnConf.disabled=true; btnConf.textContent="✅ Decisión del Reino Sellada"; btnConf.style.backgroundColor="var(--emerald)"; }
        }
    } else {
        decSection.style.display="none";
        confirmRow.style.display="none";
        waitMsg.style.display= data.reyTemporal ? "block" : "none";
        // Si no hay Rey aún, mostrar spinner de espera
        if(!data.reyTemporal){
            waitMsg.style.display="block";
            waitMsg.textContent="Esperando que se elija al Rey Temporal...";
        } else {
            waitMsg.textContent="Comparte tu punto de vista con el Rey Temporal. El tomará la decisión final.";
        }
    }

    // Mostrar overlay si no está activo
    if(primerAbrir){
        overlay.classList.add("active");
        // Iniciar listener de chat solo una vez
        if(_consejoChatListener){ _consejoChatListener(); _consejoChatListener=null; }
        _consejoChatListener=onSnapshot(
            doc(db,"salas",S.salaId,"chats","consejo-real"),
            snap=>{ if(!snap.exists()) return; renderConsejoChat(snap.data().mensajes||[]); }
        );
        enviarMensajeSistemaConsejo(S.playerName+" ("+S.grupo+") entro al Consejo Real.");
    }
}

function seleccionarOpcionCrisis(i, btnEl) {
    S.selectedOption=i;
    document.querySelectorAll(".royal-option-btn").forEach(b=>b.classList.remove("selected"));
    btnEl.classList.add("selected");
    const btnConf=document.getElementById("btn-royal-confirm");
    if(btnConf){ btnConf.disabled=false; btnConf.textContent="Confirmar Decision del Reino"; }
}

async function confirmarDecisionCrisis() {
    if(S.selectedOption===null){ toast("Selecciona una opcion primero.","error"); return; }

    const btnConf=document.getElementById("btn-royal-confirm");
    if(btnConf){ btnConf.disabled=true; btnConf.textContent="Sellando decision..."; }

    const salaRef=doc(db,"salas",S.salaId);
    try {
        await runTransaction(db, async (tx) => {
            const snap=await tx.get(salaRef);
            const data=snap.data();
            // Verificar server-side que soy el Rey y que no se ha decidido ya
            if(normNombre(data.reyTemporal)!==normNombre(S.playerName))
                throw new Error("NO_REY");
            if(data.decisionCrisis)
                throw new Error("YA_DECIDIDO");

            const sit=data.situacion;
            const op=sit.crisis.opciones[S.selectedOption];
            const ef=op.efectos;
            const r=data.recursos||{food:70,gold:60,order:75,morale:65};
            const nuevosR={
                food:  Math.max(0,Math.min(100,(r.food||0)  +(ef.food||0))),
                gold:  Math.max(0,Math.min(100,(r.gold||0)  +(ef.gold||0))),
                order: Math.max(0,Math.min(100,(r.order||0) +(ef.order||0))),
                morale:Math.max(0,Math.min(100,(r.morale||0)+(ef.morale||0))),
            };
            tx.update(salaRef,{
                decisionCrisis:{ jugador:S.playerName, opcionIndex:S.selectedOption, opcionTexto:op.texto, efectos:ef, timestamp:new Date().toISOString() },
                recursos:   nuevosR,
                consejoBloqueado: false,
            });
        });
        await enviarMensajeSistemaConsejo("El Rey Temporal "+san(S.playerName)+" ha decidido: "+san((RONDAS[S.rondaActual]?.crisis?.opciones||[])[S.selectedOption]?.texto||""));
        toast("Decision del Consejo Real registrada.","success",4000);
    } catch(e){
        if(e.message==="NO_REY"){ toast("Solo el Rey Temporal puede confirmar.","info"); }
        else if(e.message==="YA_DECIDIDO"){ toast("La crisis ya fue resuelta.","info"); }
        else { console.error(e); toast("Error al confirmar. Intenta de nuevo.","error"); }
        if(btnConf){ btnConf.disabled=false; btnConf.textContent="Confirmar Decision del Reino"; }
    }
}

async function enviarMensajeConsejo() {
    const input=document.getElementById("royal-chat-input");
    const msg=input?.value.trim();
    if(!msg||!S.salaId) return;
    input.value="";
    const snap=await getDoc(doc(db,"salas",S.salaId));
    const esRey=snap.data().reyTemporal===S.playerName;
    const entry={ quien:S.playerName, grupo:S.grupo, texto:san(msg), esRey, timestamp:new Date().toISOString() };
    try {
        await updateDoc(doc(db,"salas",S.salaId,"chats","consejo-real"),{ mensajes:arrayUnion(entry) });
    } catch(e){
        await setDoc(doc(db,"salas",S.salaId,"chats","consejo-real"),{ mensajes:[entry] });
    }
}

async function enviarMensajeSistemaConsejo(texto) {
    const entry={ quien:"SISTEMA", grupo:"", texto, esRey:false, esSystem:true, timestamp:new Date().toISOString() };
    try {
        await updateDoc(doc(db,"salas",S.salaId,"chats","consejo-real"),{ mensajes:arrayUnion(entry) });
    } catch(e){
        await setDoc(doc(db,"salas",S.salaId,"chats","consejo-real"),{ mensajes:[entry] });
    }
}

function renderConsejoChat(msgs) {
    const box=document.getElementById("royal-chat-messages"); if(!box) return;
    box.innerHTML=msgs.slice(-80).map(m=>{
        if(m.esSystem) return `<div class="royal-msg system-msg">${san(m.texto)}</div>`;
        const icon=GRUPO_ICONS[m.grupo]||"";
        return `<div class="royal-msg${m.esRey?" is-king":""}">
            <span class="who">${icon} ${san(m.quien)}</span>${san(m.texto)}
        </div>`;
    }).join("");
    box.scrollTop=box.scrollHeight;
}

function cerrarConsejoReal() {
    const overlay=document.getElementById("royal-council-overlay");
    if(overlay){
        overlay.classList.remove("active");
        // Limpiar opciones para que se repinten la próxima vez
        const optsDiv=document.getElementById("royal-options");
        if(optsDiv) optsDiv.innerHTML="";
    }
    if(_consejoChatListener){ _consejoChatListener(); _consejoChatListener=null; }
    S.selectedOption=null;
    S.votoPropio=null;
}

function cerrarModales(){ document.querySelectorAll(".modal-overlay").forEach(m=>m.classList.remove("active")); }

/* ============================================================
   CHAT
   ============================================================ */
async function enviarMensaje() {
    const input=document.getElementById("chat-input");
    const msg=input?.value.trim();
    if(!msg||!S.salaId||!S.grupo) return;
    input.value="";
    try {
        await updateDoc(doc(db,"salas",S.salaId,"chats",S.grupo),{
            mensajes: arrayUnion({ quien:S.playerName, texto:san(msg), esLider:S.isLeader, timestamp:new Date().toISOString() })
        });
    } catch(e){ console.error(e); toast("Error al enviar.","error"); }
}

function renderChat(msgs) {
    const box=document.getElementById("chat-messages"); if(!box) return;
    box.innerHTML=msgs.slice(-60).map(m=>
        `<div class="${m.esLider?"chat-msg leader-msg":"chat-msg"}"><span class="chat-who">${san(m.quien||"?")}</span>${san(m.texto||"")}</div>`
    ).join("");
    box.scrollTop=box.scrollHeight;
}

/* ============================================================
   DEBRIEFING — PROFESOR (detallado, solo para él)
   ============================================================ */
function mostrarDebriefingHost(data) {
    const r=data.recursos||S.recursos;
    const survived=r.food>15&&r.gold>10&&r.order>15&&r.morale>15;
    poblarDebriefingComun(data, survived, r);

    // Panel exclusivo del profesor
    const existing=document.getElementById("host-only-results");
    if(existing) existing.remove();

    const hostPanel=document.createElement("div");
    hostPanel.id="host-only-results";
    hostPanel.style.cssText="margin-top:20px;text-align:left;";
    hostPanel.innerHTML=`
        <div style="background:rgba(212,168,67,.08);border:1px solid rgba(212,168,67,.3);border-radius:10px;padding:16px;margin-bottom:16px;">
            <p style="color:var(--gold);font-size:.75rem;font-weight:700;letter-spacing:.1em;text-transform:uppercase;margin-bottom:4px;">🔒 SOLO VISIBLE PARA EL PROFESOR</p>
            <p style="color:var(--text-mid);font-size:.85rem;">Estos resultados son para que puedas identificar el desempeño individual de cada gremio, detectar errores y guiar la reflexión con el grupo.</p>
        </div>
        <h3 style="font-family:'Times New Roman',Times,serif;font-size:.9rem;letter-spacing:.08em;text-transform:uppercase;color:var(--gold);margin-bottom:12px;">📊 Resultado por Gremio</h3>
        ${GRUPOS.map(g=>{
            const dec=data.decisiones?.[g];
            const icon=GRUPO_ICONS[g];
            const buena=dec?.buena;
            const color=dec?(buena?"var(--emerald)":"var(--crimson)"):"var(--text-dim)";
            const etiqueta=dec?(buena?"✅ Buena decisión":"⚠️ Decisión cuestionable"):"❌ No decidió";
            return `<div style="background:rgba(0,0,0,.25);border-radius:8px;padding:12px;margin-bottom:8px;border-left:3px solid ${color};">
                <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">
                    <strong style="color:var(--text-light);">${icon} ${g}</strong>
                    <span style="font-size:.78rem;font-weight:700;color:${color};">${etiqueta}</span>
                </div>
                ${dec?`<p style="font-size:.82rem;color:var(--text-mid);margin-bottom:4px;">Decisión: "${san(dec.opcionTexto)}"</p>
                <p style="font-size:.78rem;color:var(--text-dim);">Tomada por: ${san(dec.jugador||"—")}</p>`
                :`<p style="font-size:.82rem;color:var(--text-dim);">Este gremio no registró decisión.</p>`}
            </div>`;
        }).join("")}
        ${data.decisionCrisis?`
        <h3 style="font-family:'Times New Roman',Times,serif;font-size:.9rem;letter-spacing:.08em;text-transform:uppercase;color:var(--gold);margin:16px 0 12px;">⚔️ Última Decisión del Rey Temporal</h3>
        <div style="background:rgba(0,0,0,.25);border-radius:8px;padding:12px;border-left:3px solid var(--gold);">
            <p style="font-size:.9rem;color:var(--text-light);">"${san(data.decisionCrisis.opcionTexto)}"</p>
            <p style="font-size:.78rem;color:var(--text-dim);margin-top:4px;">Rey Temporal: ${san(data.decisionCrisis.jugador||"—")}</p>
        </div>`:""}
    `;
    const card=document.querySelector("#screen-debriefing .card");
    if(card) card.appendChild(hostPanel);
}

/* ============================================================
   DEBRIEFING — JUGADOR (solo resultado general)
   ============================================================ */
function mostrarDebriefingPlayer(data) {
    const r=data.recursos||S.recursos;
    const survived=r.food>15&&r.gold>10&&r.order>15&&r.morale>15;
    poblarDebriefingComun(data, survived, r);
}

function poblarDebriefingComun(data, survived, r) {
    updateBars(r,"f-");

    const banner=document.getElementById("survival-banner");
    if(banner){
        banner.className=`survival-banner ${survived?"survived":"collapsed"}`;
        banner.textContent=survived
            ?"🏰 El reino sobrevivió — Las decisiones del pueblo lo sostuvieron"
            :"💀 El reino colapsó — Las malas decisiones pasaron factura";
    }

    const morBox=document.getElementById("moraleja-box");
    if(morBox){
        morBox.textContent=survived
            ?`"Un pueblo que delibera con sabiduría, que coopera cuando la crisis aprieta y que pone el bien común sobre el interés propio, construye un legado que perdura más allá de cualquier muro. Las decisiones correctas no son siempre las más fáciles, pero sí las más justas."`
            :leyendaMoraleja(r);
    }

    const grid=document.getElementById("final-groups-grid");
    if(grid){
        const dec=data.decisiones||{};
        grid.innerHTML=GRUPOS.map(g=>{
            const d=dec[g]; const icon=GRUPO_ICONS[g];
            return `<div class="final-group-card">
                <span class="group-icon">${icon}</span>
                <h4>${san(g)}</h4>
                <p class="decisions-count">${d?`"${san(d.opcionTexto)}"`:""}</p>
            </div>`;
        }).join("");
    }
}

function leyendaMoraleja(r){
    if(r.food<=15) return `"El hambre no espera decretos ni debates. Un reino que descuida la tierra que lo alimenta está firmando su sentencia de muerte. La primera responsabilidad de todo gobernante es asegurar que su pueblo coma."`;
    if(r.morale<=15) return `"Ningún muro aguanta cuando los que viven detrás han perdido la esperanza. Un reino de personas sin moral no es un reino: es una prisión sin guardas. El alma del pueblo es su recurso más valioso."`;
    if(r.order<=15) return `"La libertad sin orden se convierte en caos, y el caos devora a los más débiles primero. Gobernar es encontrar el equilibrio entre la justicia y la norma, no elegir uno e ignorar el otro."`;
    return `"El dinero del reino es el reflejo de sus decisiones: cada moneda gastada en injusticia, cada impuesto mal usado o cada negocio corrupto deja al tesoro más vacío que cualquier guerra."`;
}

/* ============================================================
   REINICIAR
   ============================================================ */
function reiniciar() {
    limpiarTimer(); detachAll();
    Object.assign(S,{ salaId:"",playerName:"",grupo:"",isHost:false,rondaActual:0,selectedOption:null,votoPropio:null,electionDone:false, recursos:{food:70,gold:60,order:75,morale:65} });
    _lastRondaRendered=-1; _lastEleccionKey="";
    document.getElementById("input-sala-id").value="";
    document.getElementById("input-player-name").value="";
    switchScreen("screen-auth");
}

/* ============================================================
   DOM READY
   ============================================================ */
document.addEventListener("DOMContentLoaded",()=>{
    document.getElementById("btn-create-host")      ?.addEventListener("click",crearSala);
    document.getElementById("btn-start-game")       ?.addEventListener("click",iniciarSimulacion);
    document.getElementById("btn-next-round")       ?.addEventListener("click",avanzarRonda);
    document.getElementById("btn-join-player")      ?.addEventListener("click",unirseJugador);
    document.getElementById("btn-submit-action")    ?.addEventListener("click",confirmarDecision);
    document.getElementById("btn-send-chat")        ?.addEventListener("click",enviarMensaje);
    document.getElementById("btn-restart")          ?.addEventListener("click",reiniciar);
    document.getElementById("btn-warning-ok")       ?.addEventListener("click",iniciarEleccionReyTemporal);
    document.getElementById("btn-toggle-situations")?.addEventListener("click",toggleSituacionesPanel);
    document.getElementById("btn-royal-chat-send")  ?.addEventListener("click",enviarMensajeConsejo);
    document.getElementById("btn-royal-confirm")    ?.addEventListener("click",confirmarDecisionCrisis);

    document.getElementById("chat-input")?.addEventListener("keydown",e=>{
        if(e.key==="Enter"){e.preventDefault();enviarMensaje();}
    });
    document.getElementById("royal-chat-input")?.addEventListener("keydown",e=>{
        if(e.key==="Enter"){e.preventDefault();enviarMensajeConsejo();}
    });

    const salaUrl=new URLSearchParams(window.location.search).get("sala");
    if(salaUrl){ const inp=document.getElementById("input-sala-id"); if(inp) inp.value=salaUrl.toUpperCase().slice(0,9); }
    window.addEventListener("beforeunload",e=>{ if(S.salaId){e.preventDefault();e.returnValue="";} });
});
