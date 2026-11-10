// tests/test_event_remito.js
// Prueba hostil de propagación de eventos y delegación en el botón de remito

console.log('=== TEST EVENT DELEGATION: Ataque a commit 0bd0caf ===');

// Simulador simplificado del árbol DOM y Event Dispatcher
class MockNode {
    constructor(tagName, className = '', dataset = {}, parent = null) {
        this.tagName = tagName;
        this.className = className;
        this.dataset = dataset;
        this.parentNode = parent;
        this.children = [];
        if (parent) parent.children.push(this);
    }

    closest(selector) {
        let curr = this;
        while (curr) {
            if (selector.startsWith('.') && curr.className.split(' ').includes(selector.slice(1))) {
                return curr;
            }
            if (selector.startsWith('#') && curr.id === selector.slice(1)) {
                return curr;
            }
            curr = curr.parentNode;
        }
        return null;
    }
}

// Estructura DOM creada por app.js
const listaViajes = new MockNode('DIV', 'lista-viajes');
listaViajes.id = 'lista-viajes';

const card = new MockNode('DIV', 'viaje-card-v2', { id: '1' }, listaViajes);
const btnDownload = new MockNode('BUTTON', 'btn-download', { id: '1' }, card);
const svg = new MockNode('SVG', 'icon-print', {}, btnDownload);
const path = new MockNode('PATH', '', {}, svg);

let comprobanteGeneradoId = null;
let detalleAbiertoId = null;
let eventStoppedPropagation = false;

// Event Listener registrado en app.js línea 1516:
function onListaViajesClick(e) {
    const dlBtn = e.target.closest('.btn-download');
    if (dlBtn) {
        e.stopPropagation();
        comprobanteGeneradoId = Number(dlBtn.dataset.id);
        return;
    }
    const card = e.target.closest('.viaje-card-v2');
    if (card) {
        detalleAbiertoId = Number(card.dataset.id);
    }
}

function dispatchClick(targetNode) {
    comprobanteGeneradoId = null;
    detalleAbiertoId = null;
    eventStoppedPropagation = false;

    const event = {
        target: targetNode,
        stopPropagation: () => { eventStoppedPropagation = true; }
    };

    onListaViajesClick(event);
}

// 1. Clic directo en el <path> del botón de descarga
dispatchClick(path);
console.log('1. Clic en el <path> interno del botón:');
console.log('   comprobanteGeneradoId:', comprobanteGeneradoId);
console.log('   detalleAbiertoId:', detalleAbiertoId);
console.log('   ¿Se abrió el modal sin querer?:', detalleAbiertoId !== null);
console.log('   ¿Se llamó stopPropagation?:', eventStoppedPropagation);

// 2. ¿Qué pasa si el clic es un milímetro afuera del botón (padding/borde de la tarjeta)?
dispatchClick(card);
console.log('\n2. Clic en la tarjeta (usuario le erró al botón de 32x32px):');
console.log('   comprobanteGeneradoId:', comprobanteGeneradoId);
console.log('   detalleAbiertoId:', detalleAbiertoId);

// 3. Accesibilidad de teclado (Enter / Espacio)
console.log('\n3. Teclado en tarjeta (role="button", tabindex="0"):');
console.log('   app.js NO tiene listener de keydown en lista-viajes ni en viaje-card-v2.');
console.log('   Un usuario invidente o navegando con tabulador que presione Enter en viaje-card-v2 NO activa el detalle.');
console.log('   Anidar <button> dentro de <div role="button"> viola la especificación W3C ARIA (Interactive Controls Must Not Be Nested).');

// 4. Paradoja de e.stopPropagation():
console.log('\n4. Análisis crítico de e.stopPropagation() en app.js línea 1519:');
console.log('   En app.js línea 1519: `e.stopPropagation()` se ejecuta cuando el evento YA LLEGÓ a #lista-viajes.');
console.log('   No evita que el evento haya pasado por viaje-card-v2. Lo que evitó abrir el detalle fue el `return;`, NO stopPropagation.');
console.log('   Por el contrario, stopPropagation() a nivel #lista-viajes destruye la delegación de eventos globales en document (por ejemplo analytics, cierres de dropdowns globales o monitores de actividad).');
