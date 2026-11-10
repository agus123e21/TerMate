// tests/test_viaje_temporal.js
// Prueba hostil de viajeTemporal, fuga de marcadores y mutación prematura de estado

console.log('=== TEST VIAJE TEMPORAL: Ataque a commit 3995af4 y flujo de edición ===');

// 1. Simulación del estado y referencias del mapa
let envios = [
    { id: 1, origen: 'Buenos Aires', destino: 'Rosario', estado: 'Pendiente', distancia: 300 }
];
let marcadoresInline = {};
let polylinesInline = {};
let idEnvioEditando = null;
let rutaPendiente = null;

function mockActualizarMapa(refMarcadores, refPolylines, viajeTemporal) {
    // app.js línea 547
    for (const k in refMarcadores) delete refMarcadores[k];
    for (const k in refPolylines) delete refPolylines[k];

    const enviosAMapear = viajeTemporal ? [viajeTemporal] : envios.slice(-1);
    enviosAMapear.forEach(e => {
        refMarcadores[e.id] = `Marker_${e.id}_${e.destino}`;
        if (e.origen) {
            refMarcadores[`${e.id}_or`] = `Marker_${e.id}_origen`;
        }
        refPolylines[e.id] = `Poly_${e.id}`;
    });
}

// Escenario A: Usuario calcula una nueva ruta (idEnvioEditando === null)
const viajeTemporalPreview = {
    id: idEnvioEditando || 'preview',
    origen: 'Cordoba',
    destino: 'Mendoza',
    estado: 'Pendiente',
    distancia: 650
};
mockActualizarMapa(marcadoresInline, polylinesInline, viajeTemporalPreview);

console.log('1. Marcadores en mapa después de calcular preview:');
console.log('   marcadoresInline:', Object.keys(marcadoresInline));
console.log('   polylinesInline:', Object.keys(polylinesInline));

// El usuario ahora CIERRA el modal de confirmación sin confirmar (cerrarModalViaje)
function cerrarModalViaje() {
    // app.js línea 1178:
    // document.getElementById('modal-viaje')?.classList.add('hidden');
    // rutaPendiente = null;
    rutaPendiente = null;
}
cerrarModalViaje();

console.log('\n2. Estado tras cerrarModalViaje() [El usuario canceló la confirmación]:');
console.log('   ¿Sigue el marcador "preview" en el mapa?:', 'preview' in marcadoresInline);
console.log('   ¿Sigue la polilínea "preview" en el mapa?:', 'preview' in polylinesInline);
if ('preview' in marcadoresInline) {
    console.log('   [DEFECTO CONFIRMADO]: El mapa inline queda congelado con la ruta temporal "preview" hasta que se refresque o se confirme otro envío!');
}

// Escenario B: Mutación destructiva prematura en iniciarEdicion
console.log('\n=== Escenario B: Mutación en caliente de `envios` en edición ===');
idEnvioEditando = 1;
console.log('Estado inicial de envío 1:', JSON.stringify(envios[0]));

// En app.js línea 1276:
// if (idEnvioEditando !== null) {
//     const idx = envios.findIndex(x => x.id === idEnvioEditando);
//     if (idx !== -1) {
//         envios[idx] = { ...envios[idx], origen: 'Salta', destino: 'Jujuy' };
//         abrirModalViaje(envios[idx]);
//     }
// }
const idx = envios.findIndex(x => x.id === idEnvioEditando);
envios[idx] = { ...envios[idx], origen: 'Salta', destino: 'Jujuy' }; // Mutación en línea 1278

console.log('Envío en memoria tras calcular edición (ANTES de que el usuario confirme):', JSON.stringify(envios[0]));

// Ahora el usuario se arrepiente y presiona "Cancelar Edición"
function cancelarEdicion() {
    idEnvioEditando = null;
    // form.reset(); etc.
}
cancelarEdicion();

console.log('Envío en memoria tras cancelar edición:', JSON.stringify(envios[0]));
if (envios[0].destino === 'Jujuy') {
    console.log('[CORRUPCIÓN DE ESTADO CRÍTICA]: `envios` fue mutado en memoria permanentemente al calcular la ruta! Aunque el usuario cancele, el viaje quedó sobreescrito en la sesión!');
}
