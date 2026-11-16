// tests/auditoria_integral_relaciones.js
// Auditoría exhaustiva de 78 pruebas unitarias, de relaciones, consistencia, estado y UI.
// Ejecuta el código REAL de js/app.js e index.html en un entorno DOM + Storage aislado en memoria.
// NO modifica ningún archivo de producción.

const fs = require('fs');
const path = require('path');
const vm = require('vm');

// ============================================================================
// 1. MINI MOTOR DOM PARA EJECUTAR js/app.js CONTRA EL index.html REAL
// ============================================================================
const VOID_TAGS = new Set([
    'area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input',
    'link', 'meta', 'param', 'source', 'track', 'wbr', 'path',
    'circle', 'line', 'polygon', 'polyline', 'rect'
]);

function parseAttrs(attrStr) {
    const attrs = {};
    const re = /([a-zA-Z0-9_:-]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;
    let m;
    while ((m = re.exec(attrStr)) !== null) {
        const key = m[1].toLowerCase();
        const val = m[2] !== undefined ? m[2] : (m[3] !== undefined ? m[3] : (m[4] !== undefined ? m[4] : ''));
        attrs[key] = val;
    }
    return attrs;
}

class MockClassList {
    constructor(el) { this.el = el; }
    _list() {
        const raw = this.el.attrs.class || '';
        return raw.split(/\s+/).filter(Boolean);
    }
    _save(arr) {
        this.el.attrs.class = [...new Set(arr)].join(' ');
    }
    add(...cls) {
        const arr = this._list();
        cls.forEach(c => { if (c && !arr.includes(c)) arr.push(c); });
        this._save(arr);
    }
    remove(...cls) {
        const arr = this._list().filter(c => !cls.includes(c));
        this._save(arr);
    }
    toggle(c, force) {
        const has = this.contains(c);
        const shouldAdd = force !== undefined ? Boolean(force) : !has;
        if (shouldAdd) this.add(c); else this.remove(c);
        return shouldAdd;
    }
    contains(c) { return this._list().includes(c); }
}

function matchSimpleSelector(el, sel) {
    if (!el || el.nodeType !== 1) return false;
    sel = sel.trim();
    if (!sel) return false;
    if (sel === '*') return true;

    let rest = sel;
    // tag
    const tagM = rest.match(/^([a-zA-Z0-9_-]+)/);
    if (tagM) {
        if (el.tagName.toLowerCase() !== tagM[1].toLowerCase()) return false;
        rest = rest.slice(tagM[0].length);
    }
    while (rest.length > 0) {
        if (rest.startsWith('#')) {
            const m = rest.match(/^#([a-zA-Z0-9_-]+)/);
            if (!m || el.id !== m[1]) return false;
            rest = rest.slice(m[0].length);
        } else if (rest.startsWith('.')) {
            const m = rest.match(/^\.([a-zA-Z0-9_-]+)/);
            if (!m || !el.classList.contains(m[1])) return false;
            rest = rest.slice(m[0].length);
        } else if (rest.startsWith(':not(')) {
            const end = rest.indexOf(')');
            if (end === -1) return false;
            const inner = rest.slice(5, end);
            if (matchSimpleSelector(el, inner)) return false;
            rest = rest.slice(end + 1);
        } else if (rest.startsWith('[')) {
            const end = rest.indexOf(']');
            if (end === -1) return false;
            const expr = rest.slice(1, end);
            rest = rest.slice(end + 1);
            const eqIdx = expr.indexOf('=');
            if (eqIdx === -1) {
                if (!(expr.toLowerCase() in el.attrs)) return false;
            } else {
                let op = '=';
                let k = expr.slice(0, eqIdx);
                if (k.endsWith('~')) { op = '~='; k = k.slice(0, -1); }
                let v = expr.slice(eqIdx + 1).replace(/^["']|["']$/g, '');
                const actual = el.getAttribute(k.toLowerCase());
                if (actual === null) return false;
                if (op === '~=') {
                    if (!actual.split(/\s+/).includes(v)) return false;
                } else if (actual !== v) {
                    return false;
                }
            }
        } else {
            return false;
        }
    }
    return true;
}

function matchSelector(el, selector) {
    const groups = selector.split(',').map(s => s.trim()).filter(Boolean);
    return groups.some(group => {
        const parts = group.split(/\s+/).filter(Boolean);
        if (parts.length === 0) return false;
        if (!matchSimpleSelector(el, parts[parts.length - 1])) return false;
        let cur = el.parentNode;
        for (let i = parts.length - 2; i >= 0; i--) {
            while (cur && !matchSimpleSelector(cur, parts[i])) {
                cur = cur.parentNode;
            }
            if (!cur) return false;
            cur = cur.parentNode;
        }
        return true;
    });
}

class MockElement {
    constructor(tagName, attrs = {}, doc = null) {
        this.nodeType = 1;
        this.tagName = tagName.toUpperCase();
        this.attrs = { ...attrs };
        this.children = [];
        this.parentNode = null;
        this.ownerDocument = doc;
        this.style = {};
        this.listeners = {};
        this._textContent = '';
        this._value = attrs.value !== undefined ? String(attrs.value) : '';
        this.disabled = 'disabled' in attrs;
        this.classList = new MockClassList(this);
        this._datasetProxy = null;
    }

    get id() { return this.attrs.id || ''; }
    set id(v) { this.attrs.id = String(v); }

    get className() { return this.attrs.class || ''; }
    set className(v) { this.attrs.class = String(v); }

    get dataset() {
        if (!this._datasetProxy) {
            this._datasetProxy = new Proxy(this.attrs, {
                get(target, prop) {
                    const kebab = String(prop).replace(/([A-Z])/g, '-$1').toLowerCase();
                    return target['data-' + kebab];
                },
                set(target, prop, val) {
                    const kebab = String(prop).replace(/([A-Z])/g, '-$1').toLowerCase();
                    target['data-' + kebab] = String(val);
                    return true;
                }
            });
        }
        return this._datasetProxy;
    }

    get value() {
        if (this.tagName === 'SELECT') {
            if (this._value !== '') return this._value;
            const selOpt = this.children.find(c => c.tagName === 'OPTION' && ('selected' in c.attrs));
            if (selOpt) return selOpt.value;
            const firstOpt = this.children.find(c => c.tagName === 'OPTION');
            return firstOpt ? firstOpt.value : '';
        }
        if (this.tagName === 'OPTION') {
            return this.attrs.value !== undefined ? this.attrs.value : this.textContent;
        }
        return this._value;
    }
    set value(v) {
        this._value = v === null || v === undefined ? '' : String(v);
        if (this.tagName === 'SELECT') {
            this.children.forEach(c => {
                if (c.tagName === 'OPTION') {
                    if (c.value === this._value) c.attrs.selected = '';
                    else delete c.attrs.selected;
                }
            });
        }
    }

    get files() { return this._files || []; }
    set files(f) { this._files = f; }

    get offsetParent() {
        if (this.closest('.hidden')) return null;
        return this.parentNode || this;
    }

    get textContent() {
        if (this.children.length === 0) return this._textContent;
        return this._textContent + this.children.map(c => c.textContent).join('');
    }
    set textContent(v) {
        this.children = [];
        this._textContent = v === null || v === undefined ? '' : String(v);
    }

    get innerHTML() {
        if (this._rawInnerHTML !== undefined && this.children.length === 0) return this._rawInnerHTML;
        const ch = this.children.map(c => c.outerHTML).join('');
        return ch ? (this._textContent ? `${ch}${this._textContent}` : ch) : this._textContent;
    }
    set innerHTML(html) {
        this.children = [];
        this._textContent = '';
        this._rawInnerHTML = String(html || '');
        const parsed = parseHTMLFragment(this._rawInnerHTML, this.ownerDocument);
        parsed.forEach(node => this.appendChild(node));
    }

    get outerHTML() {
        const attrStr = Object.entries(this.attrs)
            .map(([k, v]) => v === '' ? k : `${k}="${v}"`)
            .join(' ');
        const tag = this.tagName.toLowerCase();
        const open = attrStr ? `<${tag} ${attrStr}>` : `<${tag}>`;
        if (VOID_TAGS.has(tag)) return open;
        return `${open}${this.innerHTML}</${tag}>`;
    }

    appendChild(child) {
        if (!child) return child;
        child.parentNode = this;
        this.children.push(child);
        return child;
    }

    removeChild(child) {
        const idx = this.children.indexOf(child);
        if (idx !== -1) {
            this.children.splice(idx, 1);
            child.parentNode = null;
        }
        return child;
    }

    remove() {
        if (this.parentNode) this.parentNode.removeChild(this);
    }

    add(opt) {
        if (this.tagName === 'SELECT') this.appendChild(opt);
    }

    getAttribute(k) {
        k = k.toLowerCase();
        return k in this.attrs ? this.attrs[k] : null;
    }
    setAttribute(k, v) { this.attrs[k.toLowerCase()] = String(v); }
    removeAttribute(k) { delete this.attrs[k.toLowerCase()]; }

    querySelectorAll(sel) {
        const out = [];
        const walk = node => {
            for (const ch of node.children) {
                if (matchSelector(ch, sel)) out.push(ch);
                walk(ch);
            }
        };
        walk(this);
        return out;
    }
    querySelector(sel) { return this.querySelectorAll(sel)[0] || null; }

    closest(sel) {
        let cur = this;
        while (cur && cur.nodeType === 1) {
            if (matchSelector(cur, sel)) return cur;
            cur = cur.parentNode;
        }
        return null;
    }

    contains(other) {
        let cur = other;
        while (cur) {
            if (cur === this) return true;
            cur = cur.parentNode;
        }
        return false;
    }

    addEventListener(type, fn) {
        if (!this.listeners[type]) this.listeners[type] = [];
        this.listeners[type].push(fn);
    }

    dispatchEvent(evt) {
        if (!evt.target) evt.target = this;
        evt.defaultPrevented = false;
        evt.preventDefault = () => { evt.defaultPrevented = true; };
        evt.stopPropagation = () => { evt._stopped = true; };
        let cur = this;
        while (cur && !evt._stopped) {
            evt.currentTarget = cur;
            const list = cur.listeners?.[evt.type] || [];
            for (const fn of list) {
                fn.call(cur, evt);
            }
            cur = cur.parentNode;
        }
        return !evt.defaultPrevented;
    }

    click() {
        this.dispatchEvent({ type: 'click', target: this });
    }

    focus() {
        if (this.ownerDocument) this.ownerDocument.activeElement = this;
    }

    reset() {
        this.querySelectorAll('input, select, textarea').forEach(el => {
            if (el.tagName === 'SELECT') {
                const first = el.children.find(c => c.tagName === 'OPTION');
                el.value = first ? first.value : '';
            } else if (el.attrs.type !== 'hidden') {
                el.value = '';
            }
        });
    }
}

function parseHTMLFragment(html, doc) {
    const root = { children: [] };
    const stack = [root];
    const tokenRe = /<!--[\s\S]*?-->|<\/([a-zA-Z0-9_-]+)\s*>|<([a-zA-Z0-9_-]+)([^>]*?)(\/?)>|([^<]+)/g;
    let m;
    while ((m = tokenRe.exec(html)) !== null) {
        const parent = stack[stack.length - 1];
        if (m[0].startsWith('<!--')) continue;
        if (m[1]) {
            const closeTag = m[1].toUpperCase();
            for (let i = stack.length - 1; i >= 1; i--) {
                if (stack[i].tagName === closeTag) {
                    stack.length = i;
                    break;
                }
            }
        } else if (m[2]) {
            const tag = m[2].toLowerCase();
            const attrs = parseAttrs(m[3] || '');
            const el = new MockElement(tag, attrs, doc);
            el.parentNode = parent === root ? null : parent;
            parent.children.push(el);
            if (!m[4] && !VOID_TAGS.has(tag)) {
                stack.push(el);
            }
        } else if (m[5]) {
            const txt = m[5];
            if (parent !== root && txt.trim()) {
                parent._textContent += txt.trim();
            }
        }
    }
    return root.children;
}

class MockDocument {
    constructor(html) {
        this.nodeType = 9;
        this.readyState = 'complete';
        this.listeners = {};
        this.body = new MockElement('body', {}, this);
        this.activeElement = this.body;
        const nodes = parseHTMLFragment(html, this);
        nodes.forEach(n => this.body.appendChild(n));
    }
    getElementById(id) {
        return this.body.querySelector(`#${id}`);
    }
    querySelectorAll(sel) {
        return this.body.querySelectorAll(sel);
    }
    querySelector(sel) {
        return this.body.querySelector(sel);
    }
    createElement(tag) {
        return new MockElement(tag, {}, this);
    }
    contains(el) {
        return this.body.contains(el);
    }
    addEventListener(type, fn) {
        if (!this.listeners[type]) this.listeners[type] = [];
        this.listeners[type].push(fn);
    }
    dispatchEvent(evt) {
        if (!evt.target) evt.target = this.activeElement || this.body;
        evt.preventDefault = () => { evt.defaultPrevented = true; };
        evt.currentTarget = this;
        const list = this.listeners[evt.type] || [];
        list.forEach(fn => fn.call(this, evt));
    }
}

// ============================================================================
// 2. HARNESS PARA INSTANCIAR LA APP REAL EN AISLAMIENTO
// ============================================================================
const INDEX_HTML = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const APP_JS_RAW = fs.readFileSync(path.join(__dirname, '..', 'js', 'app.js'), 'utf8');
const SW_JS_RAW = fs.readFileSync(path.join(__dirname, '..', 'sw.js'), 'utf8');

// Exponer símbolos internos en memoria sin modificar js/app.js en disco
const APP_JS_TESTABLE = APP_JS_RAW.replace(
    /\}\)\(\);\s*$/,
    `
    window.__TM__ = {
        getState: () => ({
            envios, camiones, camioneros,
            contadorId, contadorCamiones, contadorCamioneros,
            idEnvioEditando, idEnvioDetalle, detalleModoEdicion,
            filtroEstado, filtroBuscar, ordenViajes, rutaPendiente,
            camionEditandoId, camioneroEditandoId, camioneroPerfilId, capsTemp,
            cacheGeo, mapaFull, mapaInline
        }),
        setState: (patch) => {
            if ('envios' in patch) envios = patch.envios;
            if ('camiones' in patch) camiones = patch.camiones;
            if ('camioneros' in patch) camioneros = patch.camioneros;
            if ('contadorId' in patch) contadorId = patch.contadorId;
            if ('contadorCamiones' in patch) contadorCamiones = patch.contadorCamiones;
            if ('contadorCamioneros' in patch) contadorCamioneros = patch.contadorCamioneros;
            if ('rutaPendiente' in patch) rutaPendiente = patch.rutaPendiente;
            if ('idEnvioEditando' in patch) idEnvioEditando = patch.idEnvioEditando;
            if ('filtroEstado' in patch) filtroEstado = patch.filtroEstado;
            if ('filtroBuscar' in patch) filtroBuscar = patch.filtroBuscar;
            if ('ordenViajes' in patch) ordenViajes = patch.ordenViajes;
        },
        fn: {
            guardar, cargarDatos, safeParseArray, comprimirCoords,
            esCoordArgentinaValida, esFechaISOValida, esFechaYYYYMMDDValida,
            generarBackupPayload, validarBackupJSON, aplicarRestoreTransaccional,
            guardarBorradorRuta, restaurarBorradorRuta, limpiarBorradorRuta,
            calcularScore, scoreClass, evaluarEstadoLicencia, carnetVtoClass,
            renderListaCamiones, renderListaCamioneros, renderListaViajes,
            renderSelectCamiones, renderSelectCamioneros, actualizarKPIs,
            abrirModalCamion, cerrarModalCamion, abrirModalCamionero, cerrarModalCamionero,
            generarNumeroRemito, iniciarEdicion, cancelarEdicion,
            abrirDetalle, cerrarDetalle, abrirModalConfig, cerrarModalConfig,
            getFotoGenericaChofer, getFotoGenericaCamion,
            escapeHTML, formatoDistancia, formatoTiempo, formatoFuel, calcularCostoFuel,
            generarComprobante, irATab, irASubTab, actualizarMapa, TILE_PROVIDERS
        }
    };
})();`
);

function createAppEnv(initialStorage = {}, options = {}) {
    const store = { ...initialStorage };
    let quotaThrowOnKey = options.quotaThrowOnKey || null;
    const localStorageMock = {
        getItem: k => (Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null),
        setItem: (k, v) => {
            if (quotaThrowOnKey && k === quotaThrowOnKey) {
                throw new Error('QuotaExceededError');
            }
            store[k] = String(v);
        },
        removeItem: k => { delete store[k]; },
        clear: () => { Object.keys(store).forEach(k => delete store[k]); },
        _dump: () => store,
        setQuotaFailKey: k => { quotaThrowOnKey = k; }
    };

    const doc = new MockDocument(INDEX_HTML);
    const openedWindows = [];
    const mapCalls = [];

    function makeLayerMock() {
        return {
            addTo() { return this; },
            bindPopup() { return this; },
            openPopup() { return this; },
            getBounds() { return { pad: () => ({}) }; },
            getLatLng() { return [-34.6, -58.3]; }
        };
    }

    const LMock = {
        latLng: (a, b) => ({ lat: a, lng: b }),
        latLngBounds: () => ({ pad: () => ({}) }),
        divIcon: opts => opts,
        tileLayer: (url, opts) => {
            mapCalls.push({ type: 'tileLayer', url, opts });
            return makeLayerMock();
        },
        marker: (coord, opts) => {
            mapCalls.push({ type: 'marker', coord, opts });
            return makeLayerMock();
        },
        polyline: (coords, opts) => {
            mapCalls.push({ type: 'polyline', coords, opts });
            return makeLayerMock();
        },
        featureGroup: () => makeLayerMock(),
        map: (id) => {
            const m = {
                id,
                layers: [],
                setView(c, z) { mapCalls.push({ type: 'setView', id, c, z }); return this; },
                fitBounds(b, o) { mapCalls.push({ type: 'fitBounds', id, b, o }); return this; },
                removeLayer(l) { mapCalls.push({ type: 'removeLayer', id, l }); },
                invalidateSize() {}
            };
            return m;
        }
    };

    const windowObj = {
        location: { hostname: 'localhost' },
        innerWidth: 1280,
        addEventListener: () => {},
        Option: function (text, value) {
            const o = doc.createElement('option');
            o.textContent = text;
            o.attrs.value = value !== undefined ? String(value) : text;
            return o;
        },
        open: () => {
            const w = {
                opener: windowObj,
                written: '',
                closed: false,
                printed: false,
                document: {
                    write: s => { w.written += s; },
                    close: () => { w.closed = true; }
                },
                print: () => { w.printed = true; }
            };
            openedWindows.push(w);
            return w;
        }
    };

    const fetchMock = options.fetch || (async (url) => {
        if (String(url).includes('nominatim')) {
            return {
                ok: true,
                json: async () => [{ lat: '-34.6037', lon: '-58.3816', display_name: 'Buenos Aires', address: { city: 'Buenos Aires', state: 'CABA' } }]
            };
        }
        if (String(url).includes('router.project-osrm.org')) {
            return {
                ok: true,
                json: async () => ({
                    code: 'Ok',
                    routes: [{
                        distance: 695000,
                        duration: 28000,
                        geometry: { coordinates: [[-58.3816, -34.6037], [-64.1888, -31.4201]] },
                        legs: [{ steps: [{ name: 'RN 9' }] }]
                    }]
                })
            };
        }
        return { ok: false, json: async () => ({}) };
    });

    const context = {
        window: windowObj,
        document: doc,
        localStorage: localStorageMock,
        navigator: { onLine: options.onLine !== undefined ? options.onLine : true },
        L: LMock,
        Option: windowObj.Option,
        fetch: fetchMock,
        URL: { createObjectURL: () => 'blob:mock', revokeObjectURL: () => {} },
        Blob: function (parts) { this.size = Buffer.byteLength(parts.join(''), 'utf8'); },
        AbortSignal: { timeout: () => ({}), any: () => ({}) },
        AbortController: function () { this.signal = {}; this.abort = () => {}; },
        console,
        setTimeout: (fn) => { return 0; },
        clearTimeout: () => {},
        setInterval: () => 0,
        clearInterval: () => {},
        Buffer,
        JSON, Math, Date, Number, String, Array, Object, Boolean, Error, Promise, Set, Map, Proxy, parseInt, parseFloat, isNaN
    };
    windowObj.document = doc;

    vm.runInNewContext(APP_JS_TESTABLE, context);
    return {
        tm: windowObj.__TM__,
        doc,
        ls: localStorageMock,
        win: windowObj,
        openedWindows,
        mapCalls
    };
}

// ============================================================================
// 3. RUNNER DE PRUEBAS Y REPORTE
// ============================================================================
let total = 0, passed = 0, failed = 0;
const bugsDetectados = [];
const queue = [];
let currentGroup = '';

function group(title) {
    queue.push({ type: 'group', title });
}

function test(id, categoria, nombre, fn) {
    queue.push({ type: 'test', id, categoria, nombre, fn });
}

async function runAll() {
    console.log('================================================================================');
    console.log('  TER-MATE — AUDITORÍA INTEGRAL (78 PRUEBAS: RELACIONES, CONSISTENCIA Y UI)    ');
    console.log('================================================================================');

    for (const item of queue) {
        if (item.type === 'group') {
            console.log(`\n${item.title}`);
            continue;
        }
        const { id, categoria, nombre, fn } = item;
        total++;
        try {
            const res = await fn();
            if (res === true) {
                passed++;
                console.log(`  \x1b[32m✔ [PASS]\x1b[0m ${id} — ${nombre}`);
            } else {
                failed++;
                const detalle = typeof res === 'string' ? res : 'Aserción falsa';
                console.log(`  \x1b[31m✖ [FAIL]\x1b[0m ${id} — ${nombre}`);
                console.log(`      └─ \x1b[33mHallazgo:\x1b[0m ${detalle}`);
                bugsDetectados.push({ id, categoria, nombre, detalle });
            }
        } catch (err) {
            failed++;
            console.log(`  \x1b[31m✖ [FAIL]\x1b[0m ${id} — ${nombre}`);
            console.log(`      └─ \x1b[31mExcepción:\x1b[0m ${err.message}`);
            bugsDetectados.push({ id, categoria, nombre, detalle: `Excepción: ${err.message}` });
        }
    }

    console.log('\n================================================================================');
    console.log(` RESUMEN AUDITORÍA: ${total} PRUEBAS | ${passed} PASADAS | ${failed} FALLIDAS / HALLAZGOS`);
    console.log('================================================================================');
    if (bugsDetectados.length > 0) {
        console.log('\nLISTADO CONSOLIDADO DE BUGS / INCONSISTENCIAS DETECTADAS:');
        bugsDetectados.forEach((b, i) => {
            console.log(`  ${String(i + 1).padStart(2, '0')}. [${b.id}][${b.categoria}] ${b.nombre}`);
            console.log(`      -> ${b.detalle}`);
        });
    }
    console.log('');
    process.exit(failed > 0 ? 1 : 0);
}

// ----------------------------------------------------------------------------
// GRUPO 1: INTEGRIDAD REFERENCIAL BIDIRECCIONAL CAMIÓN <-> CHOFER (12 pruebas)
// ----------------------------------------------------------------------------
group('--- Grupo 1: Relaciones Bidireccionales Camión ↔ Chofer (12) ---');

test('T01', 'Relaciones', 'Semilla inicial: camión #1 y chofer #1 tienen vínculo recíproco', () => {
    const { tm } = createAppEnv();
    const { camiones, camioneros } = tm.getState();
    const cam1 = camiones.find(c => c.id === 1);
    const cnr1 = camioneros.find(c => c.id === 1);
    return (cam1?.camioneroId === 1 && cnr1?.camionAsignadoId === 1) || 'Vínculo inicial roto';
});

test('T02', 'Relaciones', 'Semilla inicial: camión #2 y chofer #2 tienen vínculo recíproco', () => {
    const { tm } = createAppEnv();
    const { camiones, camioneros } = tm.getState();
    const cam2 = camiones.find(c => c.id === 2);
    const cnr2 = camioneros.find(c => c.id === 2);
    return (cam2?.camioneroId === 2 && cnr2?.camionAsignadoId === 2) || 'Vínculo inicial roto';
});

test('T03', 'Relaciones', 'Crear camión nuevo asignándole un chofer actualiza chofer.camionAsignadoId', () => {
    const { tm, doc } = createAppEnv();
    tm.fn.abrirModalCamion(null);
    doc.getElementById('cam-nombre').value = 'Volvo FH';
    doc.getElementById('cam-patente').value = 'AG 100 ZZ';
    doc.getElementById('cam-camionero-select').value = '1';
    doc.getElementById('form-camion').dispatchEvent({ type: 'submit' });
    const { camiones, camioneros } = tm.getState();
    const nuevoCam = camiones.find(c => c.patente === 'AG 100 ZZ');
    const cnr1 = camioneros.find(c => c.id === 1);
    if (cnr1.camionAsignadoId !== nuevoCam.id) {
        return `Al crear camión #${nuevoCam.id} con chofer #1, chofer.camionAsignadoId quedó en ${cnr1.camionAsignadoId} (no se sincronizó)`;
    }
    return true;
});

test('T04', 'Relaciones', 'Editar camión cambiando chofer 1 -> 2 desvincula chofer 1 y vincula chofer 2', () => {
    const { tm, doc } = createAppEnv();
    const cam1 = tm.getState().camiones.find(c => c.id === 1);
    tm.fn.abrirModalCamion(cam1);
    doc.getElementById('cam-camionero-select').value = '2';
    doc.getElementById('form-camion').dispatchEvent({ type: 'submit' });
    const { camioneros } = tm.getState();
    const cnr1 = camioneros.find(c => c.id === 1);
    const cnr2 = camioneros.find(c => c.id === 2);
    if (cnr1.camionAsignadoId === 1) {
        return `Chofer #1 sigue apuntando a camión #1 (camionAsignadoId=${cnr1.camionAsignadoId}) aunque camión #1 ahora tiene chofer #2`;
    }
    return cnr2.camionAsignadoId === 1 || `Chofer #2 no se actualizó a camión #1`;
});

test('T05', 'Relaciones', 'Editar camión quitando chofer ("") limpia chofer.camionAsignadoId', () => {
    const { tm, doc } = createAppEnv();
    const cam1 = tm.getState().camiones.find(c => c.id === 1);
    tm.fn.abrirModalCamion(cam1);
    doc.getElementById('cam-camionero-select').value = '';
    doc.getElementById('form-camion').dispatchEvent({ type: 'submit' });
    const cnr1 = tm.getState().camioneros.find(c => c.id === 1);
    return cnr1.camionAsignadoId === null || `Chofer #1 quedó huérfano apuntando al camión #1 (camionAsignadoId=${cnr1.camionAsignadoId})`;
});

test('T06', 'Relaciones', 'Asignar mismo chofer a segundo camión evita duplicidad de chofer en 2 camiones', () => {
    const { tm, doc } = createAppEnv();
    const cam2 = tm.getState().camiones.find(c => c.id === 2);
    tm.fn.abrirModalCamion(cam2);
    doc.getElementById('cam-camionero-select').value = '1';
    doc.getElementById('form-camion').dispatchEvent({ type: 'submit' });
    const camionesDeCnr1 = tm.getState().camiones.filter(c => c.camioneroId === 1);
    return camionesDeCnr1.length === 1 || `Chofer #1 quedó asignado simultáneamente a ${camionesDeCnr1.length} camiones (IDs: ${camionesDeCnr1.map(c => c.id).join(', ')})`;
});

test('T07', 'Relaciones', 'Editar chofer asignándole otro camión actualiza camion.camioneroId y camion.camionero', () => {
    const { tm, doc } = createAppEnv();
    const cnr1 = tm.getState().camioneros.find(c => c.id === 1);
    tm.fn.abrirModalCamionero(cnr1);
    doc.getElementById('cnr-camion-asignado').value = '2';
    doc.getElementById('form-camionero').dispatchEvent({ type: 'submit' });
    const { camiones } = tm.getState();
    const cam1 = camiones.find(c => c.id === 1);
    const cam2 = camiones.find(c => c.id === 2);
    if (cam2.camioneroId !== 1) {
        return `Camión #2 sigue con camioneroId=${cam2.camioneroId} ("${cam2.camionero}") pese a asignar chofer #1 desde su ficha`;
    }
    if (cam1.camioneroId === 1) {
        return `Camión #1 sigue con camioneroId=1 aunque chofer #1 pasó al camión #2`;
    }
    return true;
});

test('T08', 'Relaciones', 'Editar nombre de chofer propaga el nuevo nombre al camión asignado (camion.camionero)', () => {
    const { tm, doc } = createAppEnv();
    const cnr1 = tm.getState().camioneros.find(c => c.id === 1);
    tm.fn.abrirModalCamionero(cnr1);
    doc.getElementById('cnr-nombre').value = 'Carlos Mendez Editado';
    doc.getElementById('form-camionero').dispatchEvent({ type: 'submit' });
    const cam1 = tm.getState().camiones.find(c => c.id === 1);
    return cam1.camionero === 'Carlos Mendez Editado' || `Camión #1 conservó el nombre desactualizado "${cam1.camionero}"`;
});

test('T09', 'Relaciones', 'Eliminar chofer desvincula camioneroId y camionero en todos los camiones vinculados', () => {
    const { tm, doc } = createAppEnv();
    const delBtn = doc.querySelector('#lista-camioneros .camionero-card-delete[data-id="1"]');
    delBtn.click();
    doc.getElementById('btn-aceptar-confirm').click();
    const cam1 = tm.getState().camiones.find(c => c.id === 1);
    return (cam1.camioneroId === null && cam1.camionero === '') || `Camión #1 quedó con camioneroId=${cam1.camioneroId}`;
});

test('T10', 'Relaciones', 'Deshacer eliminación de chofer restaura el chofer y su vínculo con el camión', () => {
    const { tm, doc } = createAppEnv();
    doc.querySelector('#lista-camioneros .camionero-card-delete[data-id="1"]').click();
    doc.getElementById('btn-aceptar-confirm').click();
    const undoBtn = doc.querySelector('.toast-action-btn');
    undoBtn.click();
    const cam1 = tm.getState().camiones.find(c => c.id === 1);
    const cnr1 = tm.getState().camioneros.find(c => c.id === 1);
    return (Boolean(cnr1) && cam1.camioneroId === 1) || 'No restauró vínculo';
});

test('T11', 'Relaciones', 'Eliminar camión desvincula camionAsignadoId en chofer y guarda histórico en viajes', () => {
    const { tm, doc } = createAppEnv();
    tm.setState({
        envios: [{ id: 10, origen: 'Bs As', destino: 'Cordoba', producto: 'Granos', estado: 'Pendiente', camionId: 1, distancia: 700, tiempo: 8 }]
    });
    tm.fn.renderListaCamiones();
    doc.querySelector('#lista-camiones .camionero-card-delete[data-id="1"]').click();
    doc.getElementById('btn-aceptar-confirm').click();
    const { envios, camioneros } = tm.getState();
    const cnr1 = camioneros.find(c => c.id === 1);
    return (cnr1.camionAsignadoId === null && envios[0].camionId === null && envios[0].camionNombre === 'Scania R450 - Unidad 01')
        || 'No desvinculó correctamente';
});

test('T12', 'Relaciones', 'Deshacer eliminación de camión restaura camionId en viaje y camionAsignadoId en chofer', () => {
    const { tm, doc } = createAppEnv();
    tm.setState({
        envios: [{ id: 10, origen: 'Bs As', destino: 'Cordoba', producto: 'Granos', estado: 'Pendiente', camionId: 1, distancia: 700, tiempo: 8 }]
    });
    tm.fn.renderListaCamiones();
    doc.querySelector('#lista-camiones .camionero-card-delete[data-id="1"]').click();
    doc.getElementById('btn-aceptar-confirm').click();
    doc.querySelector('.toast-action-btn').click();
    const { envios, camioneros, camiones } = tm.getState();
    return (camiones.some(c => c.id === 1) && envios[0].camionId === 1 && camioneros.find(c => c.id === 1).camionAsignadoId === 1)
        || 'No restauró asignaciones del camión';
});

// ----------------------------------------------------------------------------
// GRUPO 2: CICLO DE VIDA DE VIAJES Y RELACIONES CON REMITO/CAMIÓN (12 pruebas)
// ----------------------------------------------------------------------------
group('--- Grupo 2: Viajes, Remitos y Consistencia Operativa (12) ---');

test('T13', 'Viajes', 'Emitir nuevo viaje directamente desde form-envio lo agrega a envios y Mis Viajes sin modal', async () => {
    const { tm, doc } = createAppEnv();
    doc.getElementById('origen').value = 'Buenos Aires, CABA';
    doc.getElementById('destino').value = 'Cordoba Capital, Cordoba';
    doc.getElementById('producto').value = 'Autopartes';
    doc.getElementById('peso-carga').value = '15';
    doc.getElementById('select-camion').value = '1';
    doc.getElementById('cliente').value = 'Cliente Test';
    doc.getElementById('remito').value = 'R-0001-99990001';
    await doc.getElementById('form-envio').dispatchEvent({ type: 'submit' });
    await new Promise(r => setImmediate(r));
    const { envios } = tm.getState();
    const cards = doc.querySelectorAll('#lista-viajes .viaje-card-v2');
    return (envios.length === 1 && cards.length === 1 && envios[0].cliente === 'Cliente Test' && envios[0].remito === 'R-0001-99990001') || 'El viaje no apareció en Mis Viajes';
});

test('T14', 'Viajes', 'form-envio valida que pesoCarga no supere la capacidad máxima del camión (sobrepeso)', async () => {
    const { tm, doc } = createAppEnv();
    doc.getElementById('origen').value = 'Buenos Aires, CABA';
    doc.getElementById('destino').value = 'Rosario, Santa Fe';
    doc.getElementById('producto').value = 'Acero';
    doc.getElementById('peso-carga').value = '999'; // Camión #1 soporta 28 tn
    doc.getElementById('select-camion').value = '1';
    await doc.getElementById('form-envio').dispatchEvent({ type: 'submit' });
    await new Promise(r => setImmediate(r));
    if (tm.getState().envios.length > 0) {
        return 'Permitió emitir ruta con 999 tn en un camión de 28 tn sin advertencia ni bloqueo';
    }
    return true;
});

test('T15', 'Viajes', 'form-envio rechaza pesoCarga negativo (-5 tn)', async () => {
    const { tm, doc } = createAppEnv();
    doc.getElementById('origen').value = 'Buenos Aires, CABA';
    doc.getElementById('destino').value = 'Rosario, Santa Fe';
    doc.getElementById('producto').value = 'Acero';
    doc.getElementById('peso-carga').value = '-5';
    doc.getElementById('select-camion').value = '1';
    await doc.getElementById('form-envio').dispatchEvent({ type: 'submit' });
    await new Promise(r => setImmediate(r));
    if (tm.getState().envios.length > 0) {
        return 'Permitió calcular ruta con peso negativo (-5 tn)';
    }
    return true;
});

test('T16', 'Viajes', 'Resultado de ruta (#res-fuel) muestra consumo y costo en pesos en tiempo real', async () => {
    const { doc } = createAppEnv();
    doc.getElementById('origen').value = 'Buenos Aires, CABA';
    doc.getElementById('destino').value = 'Cordoba Capital, Cordoba';
    doc.getElementById('producto').value = 'Mate';
    doc.getElementById('peso-carga').value = '14';
    doc.getElementById('select-camion').value = '1';
    await doc.getElementById('form-envio').dispatchEvent({ type: 'submit' });
    await new Promise(r => setImmediate(r));
    const fuelTxt = doc.getElementById('res-fuel').textContent;
    return (fuelTxt.includes('L') && fuelTxt.includes('$')) || `Esperado litros y costo en $, recibido "${fuelTxt}"`;
});

test('T17', 'Viajes', 'form-envio previene números de remito duplicados entre viajes distintos', async () => {
    const { tm, doc } = createAppEnv();
    tm.setState({
        envios: [{ id: 1, origen: 'A', destino: 'B', producto: 'X', estado: 'Pendiente', camionId: 1, remito: 'R-0001-11111111', distancia: 100, tiempo: 2 }]
    });
    doc.getElementById('origen').value = 'Buenos Aires, CABA';
    doc.getElementById('destino').value = 'Rosario, Santa Fe';
    doc.getElementById('producto').value = 'Y';
    doc.getElementById('select-camion').value = '1';
    doc.getElementById('remito').value = 'R-0001-11111111';
    await doc.getElementById('form-envio').dispatchEvent({ type: 'submit' });
    await new Promise(r => setImmediate(r));
    if (tm.getState().envios.length > 1) {
        return 'Permitió emitir dos viajes distintos con el mismo número de remito oficial (R-0001-11111111)';
    }
    return !doc.getElementById('err-remito').classList.contains('hidden') || 'No mostró error inline en remito duplicado';
});

test('T18', 'Viajes', 'iniciarEdicion carga cliente/remito y cancelarEdicion restaura título y botón de form-envio', () => {
    const { tm, doc } = createAppEnv();
    tm.setState({
        envios: [{ id: 1, origen: 'Bs As', destino: 'Rosario', producto: 'Cajas', pesoCarga: 10, estado: 'Pendiente', camionId: 1, cliente: 'Acme SA', remito: 'R-0001-12345678', distancia: 300, tiempo: 4 }]
    });
    tm.fn.iniciarEdicion(1);
    const cargado = doc.getElementById('cliente').value === 'Acme SA' && doc.getElementById('remito').value === 'R-0001-12345678';
    tm.fn.cancelarEdicion();
    const titulo = doc.getElementById('form-titulo').textContent;
    const cancelHidden = doc.getElementById('btn-cancelar-edicion').classList.contains('hidden');
    return (cargado && titulo === 'Nueva Ruta de Transporte' && cancelHidden) || 'No cargó o no restauró form-envio tras cancelarEdicion';
});

test('T19', 'Viajes', 'Viaje con estado "Cancelado" se renderiza como Cancelado y no como "Entregado"', () => {
    const { tm, doc } = createAppEnv();
    tm.setState({
        envios: [{ id: 1, origen: 'Bs As', destino: 'Rosario', producto: 'Cajas', estado: 'Cancelado', camionId: 1, distancia: 300, tiempo: 4 }]
    });
    tm.fn.renderListaViajes();
    const badge = doc.querySelector('#lista-viajes .vc2-estado-badge');
    if (badge.textContent === 'Entregado') {
        return `Viaje con estado "Cancelado" se muestra en la UI con badge verde "Entregado" (js/app.js:1572-1573)`;
    }
    return true;
});

test('T20', 'Viajes', 'generarComprobante resuelve chofer actual desde camion.camioneroId y escapa HTML', () => {
    const { tm, openedWindows } = createAppEnv();
    tm.setState({
        envios: [{ id: 1, origen: 'Bs As', destino: 'Rosario', producto: 'Pallets', estado: 'Pendiente', camionId: 1, distancia: 300, tiempo: 4 }]
    });
    tm.fn.generarComprobante(1);
    const w = openedWindows[0];
    return (w && w.written.includes('Carlos Mendez') && w.opener === null) || 'No generó comprobante seguro';
});

test('T21', 'Viajes', 'restaurarBorradorRuta ignora camionId si el camión fue eliminado', () => {
    const { tm, doc, ls } = createAppEnv();
    ls.setItem('termate_draft_ruta', JSON.stringify({ origen: 'A', destino: 'B', producto: 'Z', camionId: '999' }));
    tm.fn.restaurarBorradorRuta();
    return doc.getElementById('select-camion').value === '' || 'Asignó camión inexistente desde borrador';
});

test('T22', 'Viajes', 'Editar nombre/patente de camión actualiza inmediatamente las tarjetas en Mis Viajes', () => {
    const { tm, doc } = createAppEnv();
    tm.setState({
        envios: [{ id: 1, origen: 'Bs As', destino: 'Rosario', producto: 'Pallets', estado: 'Pendiente', camionId: 1, distancia: 300, tiempo: 4 }]
    });
    tm.fn.renderListaViajes();
    const cam1 = tm.getState().camiones.find(c => c.id === 1);
    tm.fn.abrirModalCamion(cam1);
    doc.getElementById('cam-nombre').value = 'Scania V8 Renombrado';
    doc.getElementById('form-camion').dispatchEvent({ type: 'submit' });
    const htmlViajes = doc.getElementById('lista-viajes').innerHTML;
    return htmlViajes.includes('Scania V8 Renombrado') || 'Mis Viajes sigue mostrando el nombre viejo del camión porque form-camion no llama renderListaViajes()';
});

test('T23', 'Viajes', 'Editar camión en form-detalle-edicion y guardar persiste nueva asignación en el viaje', async () => {
    const { tm, doc } = createAppEnv();
    tm.setState({
        envios: [{ id: 1, origen: 'Buenos Aires, CABA', destino: 'Rosario, Santa Fe', producto: 'Pallets', pesoCarga: 10, estado: 'Pendiente', camionId: 1, distancia: 300, tiempo: 4 }]
    });
    tm.fn.abrirDetalle(1);
    doc.getElementById('btn-detalle-editar').click();
    doc.getElementById('det-camion').value = '2';
    await doc.getElementById('form-detalle-edicion').dispatchEvent({ type: 'submit' });
    await new Promise(r => setImmediate(r));
    return tm.getState().envios[0].camionId === 2 || 'No actualizó camionId desde detalle';
});

test('T24', 'Viajes', 'Cambiar estado rápido en modal-detalle actualiza estado y KPIs', () => {
    const { tm, doc } = createAppEnv();
    tm.setState({
        envios: [{ id: 1, origen: 'A', destino: 'B', producto: 'Pallets', estado: 'Pendiente', camionId: 1, distancia: 100, tiempo: 2 }]
    });
    tm.fn.actualizarKPIs();
    tm.fn.abrirDetalle(1);
    doc.getElementById('btn-detalle-estado').click();
    doc.getElementById('detalle-estado-select').value = 'Entregado';
    doc.getElementById('btn-detalle-guardar-estado').click();
    return (tm.getState().envios[0].estado === 'Entregado' && doc.getElementById('kpi-num-entregado').textContent === '1')
        || 'No actualizó estado o KPI';
});

// ----------------------------------------------------------------------------
// GRUPO 3: CONFIGURACIÓN (termate_config) Y NAVEGACIÓN (8 pruebas)
// ----------------------------------------------------------------------------
group('--- Grupo 3: Configuración, Navegación y Modales (8) ---');

test('T25', 'Configuración', 'form-config guarda empresa, precioGasoil y mapaDefault en localStorage.termate_config', () => {
    const { tm, doc, ls } = createAppEnv();
    tm.fn.abrirModalConfig();
    doc.getElementById('cfg-empresa').value = 'Transporte Sur';
    doc.getElementById('cfg-gasoil').value = '1500';
    doc.getElementById('cfg-mapa').value = 'satellite';
    doc.getElementById('form-config').dispatchEvent({ type: 'submit' });
    const cfg = JSON.parse(ls.getItem('termate_config'));
    return (cfg.empresa === 'Transporte Sur' && cfg.precioGasoil === 1500 && cfg.mapaDefault === 'satellite') || 'Configuración no persistida';
});

test('T26', 'Configuración', 'Al iniciar la app (init) se aplica el nombre de empresa y mapaDefault guardados en termate_config', () => {
    const { doc, mapCalls } = createAppEnv({
        termate_config: JSON.stringify({ empresa: 'Transporte Sur', precioGasoil: 1500, mapaDefault: 'satellite' })
    });
    const brandName = doc.querySelector('.sidebar-brand .brand-name')?.textContent;
    const tileSat = mapCalls.some(c => c.type === 'tileLayer' && c.url.includes('World_Imagery'));
    if (brandName !== 'Transporte Sur' || !tileSat) {
        return `init() no lee termate_config al arrancar: brand="${brandName}" (esperado "Transporte Sur"), tileSat=${tileSat}`;
    }
    return true;
});

test('T27', 'Configuración', 'Guardar mapaDefault en form-config cambia la capa de mapaFull y mapaInline en caliente', () => {
    const { tm, doc, mapCalls } = createAppEnv();
    const prevCount = mapCalls.length;
    tm.fn.abrirModalConfig();
    doc.getElementById('cfg-mapa').value = 'satellite';
    doc.getElementById('form-config').dispatchEvent({ type: 'submit' });
    const nuevosTiles = mapCalls.slice(prevCount).filter(c => c.type === 'tileLayer' && c.url.includes('World_Imagery'));
    if (nuevosTiles.length === 0) {
        return 'form-config verifica "typeof mapFull" en vez de "mapaFull" (js/app.js:3056-3057), por lo que nunca cambia el mapa en vivo';
    }
    return true;
});

test('T28', 'Configuración', 'Click en #btn-sidebar-config NO desactiva la pestaña activa actual', () => {
    const { doc } = createAppEnv();
    doc.getElementById('btn-sidebar-config').click();
    const activeTabs = doc.querySelectorAll('.tab-pane.active');
    if (activeTabs.length === 0) {
        return '#btn-sidebar-config tiene clase "sidebar-btn" sin data-tab; el listener genérico llama irATab(undefined) y oculta TODAS las pestañas!';
    }
    return true;
});

test('T29', 'Configuración', 'Tecla Escape cierra #modal-config cuando está abierto', () => {
    const { tm, doc } = createAppEnv();
    tm.fn.abrirModalConfig();
    doc.dispatchEvent({ type: 'keydown', key: 'Escape' });
    const hidden = doc.getElementById('modal-config').classList.contains('hidden');
    return hidden || 'El handler global de Escape no contempla #modal-config (js/app.js:3503-3509)';
});

test('T30', 'Configuración', 'Click en el backdrop de #modal-config cierra el modal', () => {
    const { tm, doc } = createAppEnv();
    tm.fn.abrirModalConfig();
    const overlay = doc.getElementById('modal-config');
    overlay.dispatchEvent({ type: 'click', target: overlay });
    return overlay.classList.contains('hidden') || 'El listener de click-outside en .modal-overlay no contempla #modal-config';
});

test('T31', 'Configuración', 'Botón "Limpiar caché geográfica" limpia localStorage y también cacheGeo en RAM', () => {
    const { tm, doc, ls } = createAppEnv({
        termate_geo_cache: JSON.stringify({ 'buenos aires': [-34.6, -58.38] })
    });
    tm.fn.abrirModalConfig();
    doc.getElementById('btn-cfg-limpiar-cache').click();
    const lsEmpty = ls.getItem('termate_geo_cache') === null;
    const ramKeys = Object.keys(tm.getState().cacheGeo);
    if (!lsEmpty || ramKeys.length > 0) {
        return `Eliminó localStorage (${lsEmpty}) pero dejó ${ramKeys.length} clave(s) cacheadas en la variable en RAM cacheGeo`;
    }
    return true;
});

test('T32', 'Configuración', 'calcularCostoFuel usa el precioGasoil guardado en termate_config', () => {
    const { tm, ls } = createAppEnv();
    ls.setItem('termate_config', JSON.stringify({ precioGasoil: 2000 }));
    const costo = tm.fn.calcularCostoFuel(100, 0, 1); // 24 L * 2000 = 48.000
    return costo.includes('48') || `Esperado ~$48.000, recibido "${costo}"`;
});

// ----------------------------------------------------------------------------
// GRUPO 4: FLUJO NUEVA RUTA, BORRADORES Y MODALES (9 pruebas)
// ----------------------------------------------------------------------------
group('--- Grupo 4: Flujo Nueva Ruta, Borradores y Modales (9) ---');

test('T33', 'Nueva Ruta', 'El formulario inicial pre-carga un número de remito y no existe #modal-viaje', () => {
    const { doc } = createAppEnv();
    const remVal = doc.getElementById('remito')?.value || '';
    const modalViaje = doc.getElementById('modal-viaje');
    return (/^R-0001-\d{8}$/.test(remVal) && !modalViaje) || `Remito="${remVal}", modalViaje=${Boolean(modalViaje)}`;
});

test('T34', 'Nueva Ruta', 'Emitir nuevo viaje desde form-envio resetea filtroEstado y filtroBuscar para hacerlo visible', async () => {
    const { tm, doc } = createAppEnv();
    tm.setState({
        filtroEstado: 'Entregado',
        filtroBuscar: 'inexistente'
    });
    doc.getElementById('origen').value = 'Buenos Aires, CABA';
    doc.getElementById('destino').value = 'Salta Capital, Salta';
    doc.getElementById('producto').value = 'Textil';
    doc.getElementById('select-camion').value = '1';
    doc.getElementById('cliente').value = 'Textil Norte';
    doc.getElementById('remito').value = 'R-0001-00000123';
    await doc.getElementById('form-envio').dispatchEvent({ type: 'submit' });
    await new Promise(r => setImmediate(r));
    return (tm.getState().filtroEstado === 'todos' && tm.getState().filtroBuscar === '') || 'No reseteó filtros';
});

test('T35', 'Nueva Ruta', 'CTA "Planificar Nueva Ruta" en estado vacío navega al tab nueva-ruta', () => {
    const { doc } = createAppEnv();
    doc.getElementById('snav-mis-viajes').click();
    doc.querySelector('.btn-cta-crear-viaje').click();
    return doc.getElementById('tab-nueva-ruta').classList.contains('active') || 'No cambió a nueva-ruta';
});

test('T36', 'Nueva Ruta', 'guardarBorradorRuta y restaurarBorradorRuta persisten datos y muestran draft-banner', () => {
    const { tm, doc } = createAppEnv();
    doc.getElementById('origen').value = 'Rosario';
    doc.getElementById('destino').value = 'Santa Fe';
    doc.getElementById('producto').value = 'Maquinaria';
    tm.fn.guardarBorradorRuta();
    doc.getElementById('form-envio').reset();
    tm.fn.restaurarBorradorRuta();
    return (doc.getElementById('origen').value === 'Rosario' && !doc.getElementById('draft-banner').classList.contains('hidden'))
        || 'No restauró borrador';
});

test('T37', 'Nueva Ruta', 'Botón descartar borrador limpia storage y oculta draft-banner', () => {
    const { tm, doc, ls } = createAppEnv();
    doc.getElementById('origen').value = 'Rosario';
    tm.fn.guardarBorradorRuta();
    doc.getElementById('btn-descartar-borrador').click();
    return (ls.getItem('termate_draft_ruta') === null && doc.getElementById('draft-banner').classList.contains('hidden'))
        || 'No limpió borrador';
});

test('T38', 'Nueva Ruta', 'Click en backdrop de #modal-detalle NO cierra si detalleModoEdicion está activo', () => {
    const { tm, doc } = createAppEnv();
    tm.setState({
        envios: [{ id: 1, origen: 'A', destino: 'B', producto: 'X', estado: 'Pendiente', camionId: 1, distancia: 100, tiempo: 2 }]
    });
    tm.fn.abrirDetalle(1);
    doc.getElementById('btn-detalle-editar').click();
    const overlay = doc.getElementById('modal-detalle');
    overlay.dispatchEvent({ type: 'click', target: overlay });
    return !overlay.classList.contains('hidden') || 'Cerró modal-detalle mientras estaba editando';
});

test('T39', 'Nueva Ruta', 'comprimirCoords respeta invariante <= maxPuntos incluso en múltiplos exactos (300, 450, 600)', () => {
    const { tm } = createAppEnv();
    for (const n of [200, 300, 449, 450, 598, 600, 5000]) {
        const arr = Array.from({ length: n }, (_, i) => [-34 - i * 0.0001, -58 - i * 0.0001]);
        const res = tm.fn.comprimirCoords(arr, 150);
        if (res.length > 150) return `Desbordó maxPuntos para N=${n}: ${res.length}`;
        if (res[0] !== arr[0] || res[res.length - 1] !== arr[arr.length - 1]) return `No preservó extremos para N=${n}`;
    }
    return true;
});

test('T40', 'Nueva Ruta', 'irATab("nueva-ruta") actualiza clase active en sidebar y nav móvil', () => {
    const { tm, doc } = createAppEnv();
    tm.fn.irATab('mis-viajes');
    return (
        doc.getElementById('snav-mis-viajes').classList.contains('active') &&
        doc.getElementById('nav-mis-viajes').classList.contains('active') &&
        !doc.getElementById('snav-nueva-ruta').classList.contains('active')
    ) || 'Desincronización entre sidebar y bottom-nav';
});

test('T41', 'Nueva Ruta', 'irASubTab cambia correctamente entre sub-camiones y sub-camioneros', () => {
    const { tm, doc } = createAppEnv();
    tm.fn.irASubTab('sub-camioneros');
    return (
        doc.getElementById('sub-camioneros').classList.contains('active') &&
        !doc.getElementById('sub-camiones').classList.contains('active')
    ) || 'Subtab no cambió';
});

// ----------------------------------------------------------------------------
// GRUPO 5: CHOFERES, SCORING, LICENCIAS Y UI VACÍA (11 pruebas)
// ----------------------------------------------------------------------------
group('--- Grupo 5: Choferes, Scoring, Licencias y Tarjetas (11) ---');

test('T42', 'Choferes', 'calcularScore retorna null cuando historial está vacío', () => {
    const { tm } = createAppEnv();
    return tm.fn.calcularScore({ historial: [] }) === null || 'No retornó null';
});

test('T43', 'Choferes', 'calcularScore calcula 100 con ruta=si, puntualidad=puntual, bono=si', () => {
    const { tm } = createAppEnv();
    return tm.fn.calcularScore({ historial: [{ ruta: 'si', puntualidad: 'puntual', bono: 'si' }] }) === 100 || 'Cálculo erróneo';
});

test('T44', 'Choferes', 'calcularScore calcula 35 con ruta=parcial, puntualidad=leve, bono=no', () => {
    const { tm } = createAppEnv();
    return tm.fn.calcularScore({ historial: [{ ruta: 'parcial', puntualidad: 'leve', bono: 'no' }] }) === 35 || 'Cálculo erróneo';
});

test('T45', 'Choferes', 'evaluarEstadoLicencia detecta fecha pasada como vencida', () => {
    const { tm } = createAppEnv();
    const res = tm.fn.evaluarEstadoLicencia('2020-01-01');
    return (res.estado === 'vencida' && res.clase === 'vto-exp') || JSON.stringify(res);
});

test('T46', 'Choferes', 'evaluarEstadoLicencia detecta fecha <=30 días como próxima a vencer', () => {
    const { tm } = createAppEnv();
    const en10 = new Date(Date.now() + 10 * 86400000).toISOString().split('T')[0];
    const res = tm.fn.evaluarEstadoLicencia(en10);
    return (res.estado === 'proxima' && res.clase === 'vto-prox') || JSON.stringify(res);
});

test('T47', 'Choferes', 'evaluarEstadoLicencia rechaza fecha calendario imposible (2026-02-31)', () => {
    const { tm } = createAppEnv();
    const res = tm.fn.evaluarEstadoLicencia('2026-02-31');
    if (res.estado !== 'fecha_invalida') {
        return `new Date("2026-02-31") hace rollover a marzo; evaluarEstadoLicencia la aceptó como estado="${res.estado}"`;
    }
    return true;
});

test('T48', 'Choferes', 'evaluarEstadoLicencia no marca como vencida una licencia que vence HOY (desfase UTC)', () => {
    const { tm } = createAppEnv();
    const d = new Date();
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    const hoyISO = `${yyyy}-${mm}-${dd}`;
    const res = tm.fn.evaluarEstadoLicencia(hoyISO);
    if (res.estado === 'vencida') {
        return `Licencia que vence HOY (${hoyISO}) fue marcada como "vencida" (diff=${res.dias}) por parseo UTC vs medianoche local`;
    }
    return true;
});

test('T49', 'Choferes', 'Evaluación de comportamiento guarda en historial y actualiza score del chofer', () => {
    const { tm, doc } = createAppEnv();
    doc.getElementById('comp-camionero-id').value = '2';
    doc.getElementById('comp-fecha').value = '2026-11-16';
    doc.getElementById('comp-ruta').value = 'si';
    doc.getElementById('comp-puntualidad').value = 'puntual';
    doc.getElementById('comp-bono').value = 'si';
    doc.getElementById('form-comportamiento').dispatchEvent({ type: 'submit' });
    const cnr2 = tm.getState().camioneros.find(c => c.id === 2);
    return (cnr2.historial.length === 1 && tm.fn.calcularScore(cnr2) === 100) || 'No guardó evaluación';
});

test('T50', 'Choferes', 'Lista de choferes vacía sigue mostrando tarjeta punteada Agregar Chofer', () => {
    const { tm, doc } = createAppEnv();
    tm.setState({ camioneros: [] });
    tm.fn.renderListaCamioneros();
    const addCard = doc.querySelector('#lista-camioneros .fleet-add-card--chofer');
    return Boolean(addCard) || 'Cuando camioneros=[] retorna antes y NO muestra la tarjeta punteada Agregar Chofer';
});

test('T51', 'Choferes', 'Lista de camiones vacía sigue mostrando tarjeta punteada Agregar Camión', () => {
    const { tm, doc } = createAppEnv();
    tm.setState({ camiones: [] });
    tm.fn.renderListaCamiones();
    const addCard = doc.querySelector('#lista-camiones .fleet-add-card--camion');
    return Boolean(addCard) || 'Cuando camiones=[] retorna antes y NO muestra la tarjeta punteada Agregar Camión';
});

test('T52', 'Choferes', 'renderListaCamioneros genera tarjeta punteada Agregar Chofer cuando hay choferes', () => {
    const { doc } = createAppEnv();
    const addCard = doc.querySelector('#lista-camioneros .fleet-add-card--chofer');
    return Boolean(addCard) || 'Falta tarjeta Agregar Chofer';
});

// ----------------------------------------------------------------------------
// GRUPO 6: CAMIONES, CONSUMO Y VALIDACIONES NUMÉRICAS (8 pruebas)
// ----------------------------------------------------------------------------
group('--- Grupo 6: Camiones, Consumo y Costos (8) ---');

test('T53', 'Camiones', 'formatoFuel(0, 1) retorna estrictamente "0 L"', () => {
    const { tm } = createAppEnv();
    return tm.fn.formatoFuel(0, 1, 1) === '0 L' || 'No retornó 0 L';
});

test('T54', 'Camiones', 'formatoFuel calcula consumo vacío (24 L) y lleno (36 L) para 100 km', () => {
    const { tm } = createAppEnv();
    return (tm.fn.formatoFuel(100, 0, 1) === '24 L' && tm.fn.formatoFuel(100, 28, 1) === '36 L') || 'Cálculo incorrecto';
});

test('T55', 'Camiones', 'formatoFuel clampa cargaRatio a 1 cuando pesoCarga excede capacidad del camión', () => {
    const { tm } = createAppEnv();
    return tm.fn.formatoFuel(100, 80, 1) === '36 L' || 'No clampó cargaRatio';
});

test('T56', 'Camiones', 'formatoFuel retorna null si camionId no existe en la flota', () => {
    const { tm } = createAppEnv();
    return tm.fn.formatoFuel(100, 10, 999) === null || 'Debió retornar null para camión inexistente';
});

test('T57', 'Camiones', 'form-camion rechaza valores negativos en peso o consumo', () => {
    const { tm, doc } = createAppEnv();
    tm.fn.abrirModalCamion(null);
    doc.getElementById('cam-nombre').value = 'Camión Negativo';
    doc.getElementById('cam-patente').value = 'AA 000 AA';
    doc.getElementById('cam-peso').value = '-20';
    doc.getElementById('cam-cons-vacio').value = '-15';
    doc.getElementById('form-camion').dispatchEvent({ type: 'submit' });
    const bad = tm.getState().camiones.find(c => c.nombre === 'Camión Negativo');
    if (bad && (bad.peso < 0 || bad.consumoVacio < 0)) {
        return `form-camion persistió peso=${bad.peso} y consumoVacio=${bad.consumoVacio} negativos en localStorage`;
    }
    return true;
});

test('T58', 'Camiones', 'formatoDistancia y formatoTiempo formatean correctamente miles y minutos', () => {
    const { tm } = createAppEnv();
    return (
        tm.fn.formatoDistancia(1500) === '1,5 mil km' &&
        tm.fn.formatoDistancia(450) === '450 km' &&
        tm.fn.formatoTiempo(0.5) === '30 min' &&
        tm.fn.formatoTiempo(2.5) === '2h 30min'
    ) || 'Formato inesperado';
});

test('T59', 'Camiones', 'renderListaCamiones muestra miniatura de foto local y patente', () => {
    const { doc } = createAppEnv();
    const html = doc.getElementById('lista-camiones').innerHTML;
    return (html.includes('assets/img/camiones/mercedes-actros-2645.jpg') && html.includes('AF 452 BC')) || 'Falta foto o patente';
});

test('T60', 'Camiones', 'renderListaCamiones incluye tarjeta punteada Agregar Camión', () => {
    const { doc } = createAppEnv();
    return Boolean(doc.querySelector('#lista-camiones .fleet-add-card--camion')) || 'Falta tarjeta Agregar Camión';
});

// ----------------------------------------------------------------------------
// GRUPO 7: KPIS, BÚSQUEDA, FILTROS Y ORDENAMIENTO (6 pruebas)
// ----------------------------------------------------------------------------
group('--- Grupo 7: KPIs, Búsqueda, Filtros y Ordenamiento (6) ---');

test('T61', 'Filtros/KPIs', 'actualizarKPIs contabiliza exactamente Pendientes, En Ruta, Entregados y Flota', () => {
    const { tm, doc } = createAppEnv();
    tm.setState({
        envios: [
            { id: 1, estado: 'Pendiente', origen: 'A', destino: 'B', producto: 'X' },
            { id: 2, estado: 'Pendiente', origen: 'A', destino: 'B', producto: 'X' },
            { id: 3, estado: 'En Transito', origen: 'A', destino: 'B', producto: 'X' },
            { id: 4, estado: 'Entregado', origen: 'A', destino: 'B', producto: 'X' }
        ]
    });
    tm.fn.actualizarKPIs();
    return (
        doc.getElementById('kpi-num-pendiente').textContent === '2' &&
        doc.getElementById('kpi-num-transito').textContent === '1' &&
        doc.getElementById('kpi-num-entregado').textContent === '1' &&
        doc.getElementById('kpi-num-flota').textContent === '2'
    ) || 'KPIs incorrectos';
});

test('T62', 'Filtros/KPIs', 'Filtro por estado filtra correctamente tarjetas en Mis Viajes', () => {
    const { tm, doc } = createAppEnv();
    tm.setState({
        envios: [
            { id: 1, estado: 'Pendiente', origen: 'A', destino: 'B', producto: 'X', distancia: 100, tiempo: 1 },
            { id: 2, estado: 'Entregado', origen: 'C', destino: 'D', producto: 'Y', distancia: 200, tiempo: 2 }
        ]
    });
    doc.querySelector('.filter-btn[data-estado="Entregado"]').click();
    const cards = doc.querySelectorAll('#lista-viajes .viaje-card-v2');
    return (cards.length === 1 && cards[0].dataset.id === '2') || 'Filtro por estado falló';
});

test('T63', 'Filtros/KPIs', 'Búsqueda por texto (#filtro-buscar) incluye nombre de camión o patente', () => {
    const { tm, doc } = createAppEnv();
    tm.setState({
        envios: [
            { id: 1, estado: 'Pendiente', origen: 'Buenos Aires', destino: 'Rosario', producto: 'Granos', camionId: 1, distancia: 300, tiempo: 4 }
        ]
    });
    tm.setState({ filtroBuscar: 'AF 452 BC' });
    tm.fn.renderListaViajes();
    const cards = doc.querySelectorAll('#lista-viajes .viaje-card-v2');
    if (cards.length === 0) {
        return 'Buscar por patente ("AF 452 BC") o nombre de camión en Mis Viajes no devuelve resultados (solo busca origen/destino/producto/cliente/remito)';
    }
    return true;
});

test('T64', 'Filtros/KPIs', 'Ordenamiento distancia-desc ordena correctamente de mayor a menor km', () => {
    const { tm, doc } = createAppEnv();
    tm.setState({
        envios: [
            { id: 1, estado: 'Pendiente', origen: 'A', destino: 'B', producto: 'X', distancia: 100, tiempo: 1 },
            { id: 2, estado: 'Pendiente', origen: 'C', destino: 'D', producto: 'Y', distancia: 900, tiempo: 10 },
            { id: 3, estado: 'Pendiente', origen: 'E', destino: 'F', producto: 'Z', distancia: 400, tiempo: 5 }
        ],
        ordenViajes: 'distancia-desc'
    });
    tm.fn.renderListaViajes();
    const ids = doc.querySelectorAll('#lista-viajes .viaje-card-v2').map(el => el.dataset.id);
    return ids.join(',') === '2,3,1' || `Orden recibido: ${ids.join(',')}`;
});

test('T65', 'Filtros/KPIs', 'Viaje con distancia=0 muestra "0 L" en Mis Viajes (no "—")', () => {
    const { tm, doc } = createAppEnv();
    tm.setState({
        envios: [{ id: 1, estado: 'Pendiente', origen: 'A', destino: 'A', producto: 'Local', camionId: 1, distancia: 0, tiempo: 0 }]
    });
    tm.fn.renderListaViajes();
    return doc.getElementById('lista-viajes').innerHTML.includes('0 L') || 'Mostró — en lugar de 0 L';
});

test('T66', 'Filtros/KPIs', 'renderListaViajes soporta viajes corruptos sin origen/destino ({}) sin crashear', () => {
    const { tm } = createAppEnv();
    tm.setState({ envios: [{}] });
    tm.fn.renderListaViajes();
    return true;
});

// ----------------------------------------------------------------------------
// GRUPO 8: BACKUP JSON Y RESTORE TRANSACCIONAL (6 pruebas)
// ----------------------------------------------------------------------------
group('--- Grupo 8: Backup JSON y Restore Transaccional (6) ---');

test('T67', 'Backup/Restore', 'generarBackupPayload produce schema válido y contadores >= maxId + 1', () => {
    const { tm } = createAppEnv();
    const p = tm.fn.generarBackupPayload();
    return (p.schema === 'termate-backup' && p.version === 1 && p.data.contadores.camiones >= 3) || 'Payload inválido';
});

test('T68', 'Backup/Restore', 'validarBackupJSON rechaza JSON corrupto, schema incorrecto y version != 1', () => {
    const { tm } = createAppEnv();
    const r1 = tm.fn.validarBackupJSON('{corrupto');
    const r2 = tm.fn.validarBackupJSON(JSON.stringify({ schema: 'otro', version: 1, data: {} }));
    const r3 = tm.fn.validarBackupJSON(JSON.stringify({ schema: 'termate-backup', version: 2, data: {} }));
    return (!r1.ok && !r2.ok && !r3.ok) || 'Aceptó backup inválido';
});

test('T69', 'Backup/Restore', 'validarBackupJSON rechaza IDs duplicados y referencias huérfanas (camionId inexistente)', () => {
    const { tm } = createAppEnv();
    const payload = tm.fn.generarBackupPayload();
    payload.data.envios.push({
        id: 1, origen: 'A', destino: 'B', producto: 'X', estado: 'Pendiente',
        camionId: 999, distancia: 100, tiempo: 2
    });
    const res = tm.fn.validarBackupJSON(JSON.stringify(payload));
    return !res.ok || 'Aceptó backup con referencia huérfana';
});

test('T70', 'Backup/Restore', 'validarBackupJSON detecta asimetría bidireccional camion.camioneroId vs chofer.camionAsignadoId', () => {
    const { tm } = createAppEnv();
    const payload = tm.fn.generarBackupPayload();
    // Camión 1 dice chofer 1, pero chofer 1 dice camión 2 (asimetría)
    payload.data.camioneros[0].camionAsignadoId = 2;
    const res = tm.fn.validarBackupJSON(JSON.stringify(payload));
    if (res.ok) {
        return 'validarBackupJSON valida existencia de IDs pero NO valida simetría entre camion.camioneroId y chofer.camionAsignadoId';
    }
    return true;
});

test('T71', 'Backup/Restore', 'aplicarRestoreTransaccional ejecuta rollback completo ante fallo de cuota en localStorage', () => {
    const { tm, ls } = createAppEnv();
    tm.fn.guardar();
    const antesCam = ls.getItem('termate_camiones');
    const payload = tm.fn.generarBackupPayload();
    payload.data.camiones.push({
        id: 99, nombre: 'Nuevo', patente: 'AA 999 AA', camionero: '', camioneroId: null,
        peso: 28, alto: 4, largo: 18, ancho: 2.6, consumoVacio: 24, consumoLleno: 36
    });
    const val = tm.fn.validarBackupJSON(JSON.stringify(payload));
    ls.setQuotaFailKey('termate_camiones');
    const res = tm.fn.aplicarRestoreTransaccional(val.normalized);
    ls.setQuotaFailKey(null);
    return (!res.ok && !res.rollbackIncomplete && ls.getItem('termate_camiones') === antesCam) || 'Rollback falló';
});

test('T72', 'Backup/Restore', 'validarBackupJSON sanitiza/rechaza campo foto malicioso en camiones/camioneros', () => {
    const { tm } = createAppEnv();
    const payload = tm.fn.generarBackupPayload();
    payload.data.camiones[0].foto = 'data:image/png," onerror="alert(1)';
    const res = tm.fn.validarBackupJSON(JSON.stringify(payload));
    if (res.ok && res.normalized.camiones[0].foto.includes('"')) {
        return 'validarBackupJSON no valida/sanitiza el campo "foto", permitiendo inyección de atributos HTML en el backup';
    }
    return true;
});

// ----------------------------------------------------------------------------
// GRUPO 9: SEGURIDAD XSS, COORDENADAS, MAPAS Y SERVICE WORKER (6 pruebas)
// ----------------------------------------------------------------------------
group('--- Grupo 9: Seguridad XSS, Coordenadas, Mapas y SW (6) ---');

test('T73', 'Seguridad/Mapas', 'escapeHTML neutraliza etiquetas HTML, comillas simples y dobles', () => {
    const { tm } = createAppEnv();
    const out = tm.fn.escapeHTML('<script>alert("x\'y")</script>');
    return (!out.includes('<') && !out.includes('"') && !out.includes("'")) || `Escape incompleto: ${out}`;
});

test('T74', 'Seguridad/Mapas', 'getFotoGenericaChofer y Camion bloquean ruptura de atributo src vía comillas en data:image/', () => {
    const { tm } = createAppEnv();
    const html = tm.fn.getFotoGenericaChofer(1, 'data:image/png,abc" onload="alert(1)');
    if (html.includes('onload="alert(1)')) {
        return 'getFotoGenericaChofer/Camion inyecta fotoPersonalizada sin escapeHTML() ni validación estricta base64/regex en el atributo src';
    }
    return true;
});

test('T75', 'Seguridad/Mapas', 'esCoordArgentinaValida valida CABA y rechaza [NaN,NaN] y coordenadas fuera de Argentina', () => {
    const { tm } = createAppEnv();
    return (
        tm.fn.esCoordArgentinaValida([-34.6037, -58.3816]) &&
        !tm.fn.esCoordArgentinaValida([NaN, NaN]) &&
        !tm.fn.esCoordArgentinaValida([0, 0]) &&
        !tm.fn.esCoordArgentinaValida([40.4, -3.7])
    ) || 'Validación de coordenadas incorrecta';
});

test('T76', 'Seguridad/Mapas', 'TILE_PROVIDERS no usa CARTO y usa ArcGIS World_Street_Map / World_Imagery', () => {
    const { tm } = createAppEnv();
    const { streets, satellite } = tm.fn.TILE_PROVIDERS;
    return (
        !streets.includes('cartocdn.com') &&
        !satellite.includes('cartocdn.com') &&
        streets.includes('server.arcgisonline.com') &&
        satellite.includes('server.arcgisonline.com')
    ) || 'Proveedores de tiles incorrectos';
});

test('T77', 'Seguridad/Mapas', 'Service Worker (sw.js) precachea todos los assets existentes incluyendo fotos locales', () => {
    const rootDir = path.join(__dirname, '..');
    const missingAssets = [];
    const match = SW_JS_RAW.match(/const CORE_ASSETS = \[([\s\S]*?)\];/);
    if (match) {
        const localAssets = [...match[1].matchAll(/'(\.\/[^']+)'/g)].map(m => m[1]);
        localAssets.forEach(a => {
            if (a === './') return;
            const full = path.join(rootDir, a.replace('./', ''));
            if (!fs.existsSync(full)) missingAssets.push(a);
        });
    }
    const includesLocalTrucks = SW_JS_RAW.includes('scania.webp') && SW_JS_RAW.includes('mercedes-actros-2645.jpg');
    if (missingAssets.length > 0 || !includesLocalTrucks) {
        return `Assets faltantes en disco: [${missingAssets.join(', ')}]; fotos locales de camiones en CORE_ASSETS: ${includesLocalTrucks}`;
    }
    return true;
});

test('T78', 'Seguridad/Mapas', 'index.html coloca todos los modales antes de <script src="js/app.js">', () => {
    const scriptIdx = INDEX_HTML.indexOf('src="js/app.js');
    const modalCfgIdx = INDEX_HTML.indexOf('id="modal-config"');
    if (modalCfgIdx > scriptIdx) {
        return `#modal-config (pos ${modalCfgIdx}) está declarado en index.html DESPUÉS de <script src="js/app.js"> (pos ${scriptIdx})`;
    }
    return true;
});

runAll();
