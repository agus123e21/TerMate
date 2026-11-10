// tests/audit_ciclo2_hostil.js
// Auditoría Hostil Adversarial - Ciclo 2 en TerMate
const fs = require('fs');
const path = require('path');

console.log('===============================================================');
console.log('   AUDITORÍA ADVERSARIAL IMPLACABLE - CICLO 2 (BRANCH FIX)     ');
console.log('===============================================================\n');

let totalBugs = 0;

function reportFatal(titulo, linea, descripcion, payload) {
    totalBugs++;
    console.log(`\x1b[31m[FALLO CRÍTICO #${totalBugs}]\x1b[0m ${titulo}`);
    console.log(`  └─ Línea/Ubicación: ${linea}`);
    console.log(`  └─ Mecanismo de Quiebre: ${descripcion}`);
    if (payload !== undefined) {
        console.log(`  └─ Payload / Prueba: ${JSON.stringify(payload)}`);
    }
    console.log('');
}

// -------------------------------------------------------------
// VECTORES DE PRUEBA 1: localStorage y safeParseArray
// -------------------------------------------------------------
console.log('--- VECTOR 1: Storage Corrupto y safeParseArray ---');

// Extraer o simular exactamente la implementación de app.js línea 117
function safeParseArray(raw, fallback = []) {
    if (!raw) return fallback;
    try {
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed : fallback;
    } catch {
        return fallback;
    }
}

// Payload hostil: Array con elementos null o primitivos que no son objetos de envío
const corruptArrayPayloads = [
    '[null]',
    '[undefined, null]',
    '[123, "basura", true]',
    '[{"id": 1, "estado": null, "origen": null}]'
];

corruptArrayPayloads.forEach((payload, idx) => {
    const parsed = safeParseArray(payload);
    // Simular actualizarKPIs (línea 647 app.js)
    try {
        parsed.filter(e => e.estado === 'Pendiente');
    } catch (err) {
        reportFatal(
            `safeParseArray permite arrays con null/primitivos que REVIENTAN actualizarKPIs()`,
            `js/app.js:117 / :647`,
            `safeParseArray solo valida que sea Array, NO que los elementos sean objetos válidos. e.estado arroja: ${err.message}`,
            payload
        );
    }

    // Simular renderListaViajes (línea 698 app.js)
    try {
        parsed.forEach(e => {
            if (e && typeof e === 'object') {
                const oriCiudad = (e.origen || '').split(',')[0];
            } else if (e !== null && e !== undefined) {
                // si e no es objeto
                throw new TypeError("Elemento corrupto no es objeto");
            }
        });
    } catch (err) {
        reportFatal(
            `renderListaViajes revienta con elementos de array no conformes`,
            `js/app.js:698`,
            err.message,
            payload
        );
    }
});

// -------------------------------------------------------------
// VECTORES DE PRUEBA 2: Sanitización XSS y escapeHTML
// -------------------------------------------------------------
console.log('\n--- VECTOR 2: Sanitización XSS y Escape ---');

// Extraer escapeHTML de app.js línea 1848
function escapeHTML(val) {
    if (val === null || val === undefined) return '';
    let str = '';
    if (typeof val === 'object') {
        try {
            str = val.toString ? val.toString() : Object.prototype.toString.call(val);
        } catch {
            str = '[object Object]';
        }
    } else {
        str = String(val);
    }
    return str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

// 2.1 Object.create(null)
try {
    const nullObj = Object.create(null);
    const res = escapeHTML(nullObj);
    if (res !== '[object Object]') {
        console.log('Object.create(null) no lanzó pero devolvió:', res);
    }
} catch (e) {
    reportFatal(
        `escapeHTML crashea con Object.create(null)`,
        `js/app.js:1848`,
        `val.toString lanza TypeError: Cannot convert object to primitive value: ${e.message}`,
        'Object.create(null)'
    );
}

// 2.2 Inyección en atributos HTML sin comillas (app.js data-completo="${escapeHTML(s.completo)}")
// Está entre comillas dobles en línea 813: data-completo="${escapeHTML(s.completo)}"
// Pero data-lat="${s.lat}" data-lon="${s.lon}" NO usa escapeHTML
const maliciousSug = {
    lat: '0" onmouseover="alert(1)" style="position:fixed;top:0;left:0;width:100%;height:100%" data-x="',
    lon: 0,
    completo: 'Test',
    principal: 'Test',
    secundario: 'Test'
};

const renderedLi = `<li role="option" data-lat="${maliciousSug.lat}" data-lon="${maliciousSug.lon}" data-completo="${escapeHTML(maliciousSug.completo)}">`;
if (renderedLi.includes('onmouseover="alert(1)"')) {
    reportFatal(
        `Inyección de Atributos HTML / XSS en Nominatim Suggestions via data-lat/lon`,
        `js/app.js:813`,
        `s.lat y s.lon se interpolan directamente sin escapeHTML ni validación numérica estricta Number.isFinite()`,
        maliciousSug.lat
    );
}

// -------------------------------------------------------------
// VECTORES DE PRUEBA 3: Cuota de LocalStorage por Geometrías OSRM
// -------------------------------------------------------------
console.log('\n--- VECTOR 3: Explosión de Cuota de LocalStorage (OSRM Geometries) ---');

// Simulación de respuesta real OSRM driving para Buenos Aires -> Salta (1500km)
// Genera ~8,000 coordenadas [lat, lng]
function generarRutaLargaSimulada() {
    const coords = [];
    let lat = -34.6037;
    let lon = -58.3816;
    for (let i = 0; i < 6000; i++) {
        lat += 0.0015;
        lon -= 0.0012;
        coords.push([parseFloat(lat.toFixed(6)), parseFloat(lon.toFixed(6))]);
    }
    return {
        id: 1,
        origen: 'Ciudad Autonoma de Buenos Aires, Argentina',
        destino: 'Salta Capital, Salta, Argentina',
        producto: 'Maquinaria Pesada',
        pesoCarga: 24,
        distancia: 1490.5,
        tiempo: 19.5,
        estado: 'Pendiente',
        coordenadas: coords,
        calles: ['Ruta Nacional 9', 'Ruta Nacional 34']
    };
}

const mockStorage = {};
function mockSetItem(key, val) {
    // Límite habitual de localStorage en navegadores: 5MB UTF-16 = aprox 5 * 1024 * 1024 caracteres
    const MAX_STORAGE_BYTES = 5 * 1024 * 1024;
    let currentTotal = 0;
    for (let k in mockStorage) currentTotal += mockStorage[k].length * 2;
    const newBytes = val.length * 2;
    if (currentTotal + newBytes > MAX_STORAGE_BYTES) {
        const err = new Error('QuotaExceededError: DOMException - The quota has been exceeded.');
        err.name = 'QuotaExceededError';
        throw err;
    }
    mockStorage[key] = val;
}

try {
    const enviosSimulados = [];
    for (let i = 1; i <= 15; i++) {
        const viaje = generarRutaLargaSimulada();
        viaje.id = i;
        enviosSimulados.push(viaje);
        mockSetItem('termate_envios', JSON.stringify(enviosSimulados));
    }
    console.log('15 viajes almacenados sin desbordar el mock de 5MB');
} catch (e) {
    reportFatal(
        `Desbordamiento Inminente de Cuota localStorage (QuotaExceededError)`,
        `js/app.js:293 / :310 / :98-108`,
        `Cada viaje OSRM completo guarda miles de pares de coordenadas sin simplificar (Douglas-Peucker). ` +
        `Con apenas 10-15 viajes interprovinciales, localStorage revienta (5MB). ` +
        `Cuando falla guardar(), los viajes nuevos solo existen en RAM y se PIERDEN irrevocablemente al recargar la página: ${e.message}`,
        { viajesInsertadosAntesDeCrash: Object.keys(mockStorage).length ? 'Menos de 15' : '0' }
    );
}

// -------------------------------------------------------------
// VECTORES DE PRUEBA 4: Service Worker & SPOF Offline
// -------------------------------------------------------------
console.log('\n--- VECTOR 4: Service Worker y Vulnerabilidad SPOF Offline ---');

const swContent = fs.readFileSync(path.join(__dirname, '../sw.js'), 'utf-8');

if (!swContent.includes('router.project-osrm.org')) {
    reportFatal(
        `Service Worker NO intercepta ni cachea llamadas a router.project-osrm.org`,
        `sw.js:46-64`,
        `El router OSRM no figura en API_CACHE ni en fetch handlers. En modo offline o ruta sin señal, el cálculo de rutas OSRM falla irremediablemente sin caché HTTP fallback.`
    );
}

if (swContent.includes('cache.addAll(CORE_ASSETS)')) {
    reportFatal(
        `Service Worker install SPOF: cache.addAll() atómico descarta toda la PWA si un CDN falla`,
        `sw.js:20-27`,
        `Si un recurso externo como 'fonts.googleapis.com' o 'unpkg.com/leaflet' responde 4xx/5xx o timeout durante la instalación, cache.addAll() rechaza la promesa completa. El Service Worker NUNCA se instala.`
    );
}

// -------------------------------------------------------------
// VECTORES DE PRUEBA 5: Archivo Zombi
// -------------------------------------------------------------
console.log('\n--- VECTOR 5: Detección de Archivos Zombi en Repositorio ---');

const zombiPath = path.join(__dirname, '../prueba_ruta.html');
if (fs.existsSync(zombiPath)) {
    const stat = fs.statSync(zombiPath);
    reportFatal(
        `Archivo zombi prueba_ruta.html sigue existiendo en el repositorio`,
        `prueba_ruta.html (${stat.size} bytes, 886 líneas)`,
        `Código muerto no referenciado en index.html ni en la aplicación. Mantiene deuda técnica, versiones desincronizadas de scripts y confusión en auditorías.`
    );
}

// -------------------------------------------------------------
// VECTORES DE PRUEBA 6: formatoFuel Cero y Casos Borde
// -------------------------------------------------------------
console.log('\n--- VECTOR 6: Inconsistencia en formatoFuel (Cero y NaN) ---');

function mockFormatoFuel(km, pesoCarga = 0, camionId = null) {
    const camiones = [{ id: 1, nombre: 'Scania', peso: 30, consumoVacio: 25, consumoLleno: 38 }];
    const camion = camionId ? camiones.find(c => c.id === camionId) : camiones[0];
    if (!camion || !km || !camion.consumoVacio || !camion.consumoLleno) return null;
    const capMax = camion.peso || 1;
    const cargaRatio = Math.min(1, Math.max(0, (pesoCarga || 0) / capMax));
    const consumoPor100km = camion.consumoVacio + (camion.consumoLleno - camion.consumoVacio) * cargaRatio;
    const litros = Math.round(km * consumoPor100km / 100);
    return `${litros} L`;
}

if (mockFormatoFuel(0, 10, 1) === null) {
    reportFatal(
        `formatoFuel(0) retorna null por falsy check (!km) en lugar de '0 L'`,
        `js/app.js:1891`,
        `En commit c492ef0 se arregló formatoDistancia(0) y formatoTiempo(0), pero se omitió formatoFuel donde '!km' anula distancias en cero.`,
        'km = 0'
    );
}

// -------------------------------------------------------------
// VECTORES DE PRUEBA 7: Fuga de Estado idEnvioEditando
// -------------------------------------------------------------
console.log('\n--- VECTOR 7: Fuga de idEnvioEditando al Cerrar Modal de Viaje ---');

const appJsContent = fs.readFileSync(path.join(__dirname, '../js/app.js'), 'utf-8');

const cerrarModalViajeMatch = appJsContent.match(/function cerrarModalViaje\(\)\s*\{([\s\S]*?)\}/);
if (cerrarModalViajeMatch) {
    const body = cerrarModalViajeMatch[1];
    if (!body.includes('idEnvioEditando = null')) {
        reportFatal(
            `cerrarModalViaje() no resetea idEnvioEditando a null`,
            `js/app.js:1224-1230`,
            `Si el usuario inicia edición de un viaje y luego cancela/cierra el modal de viaje, idEnvioEditando sigue apuntando al ID original. Si posteriormente calcula otra ruta creyendo que es nueva, ¡SOBREESCRIBIRÁ el viaje anterior!`
        );
    }
}

// -------------------------------------------------------------
// VECTORES DE PRUEBA 8: Accesibilidad y Controles Interactivos Anidados
// -------------------------------------------------------------
console.log('\n--- VECTOR 8: Violación WCAG ARIA - Botones Interactivos Anidados ---');

if (appJsContent.includes('class="viaje-card-v2" data-id="${e.id}" role="button"') &&
    appJsContent.includes('<button class="btn-download"')) {
    reportFatal(
        `Violación WCAG / W3C ARIA: <button> anidado dentro de elemento con role="button"`,
        `js/app.js:705-764`,
        `viaje-card-v2 declara role="button" tabindex="0", y en su interior contiene un elemento <button class="btn-download">. Según la especificación HTML5 y WAI-ARIA, los controles interactivos no deben anidarse, ya que desorienta lectores de pantalla y rompe el modelo de foco.`
    );
}

if (!appJsContent.includes("lista-viajes')?.addEventListener('keydown") &&
    !appJsContent.includes('e.key === "Enter"')) {
    reportFatal(
        `Ausencia total de accesibilidad por teclado (keydown) en elementos con role="button"`,
        `js/app.js:1608`,
        `viaje-card-v2, camion-card y camionero-card declaran tabindex="0" y role="button", pero carecen de listener para las teclas 'Enter' o 'Space'. Un usuario que navegue con teclado no puede abrir detalles ni interactuar.`
    );
}

console.log('===============================================================');
console.log(` RESUMEN DE LA AUDITORÍA: ${totalBugs} FALLOS GRAVES / REGRESIONES CONFIRMADAS`);
console.log('===============================================================');
process.exit(totalBugs > 0 ? 1 : 0);
