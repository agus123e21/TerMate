// tests/test_storage_corruption.js
// Prueba hostil de resiliencia de localStorage y crash por pantalla blanca

function simularCargarDatos(mockStorage) {
    let envios = [];
    let contadorId = 1;
    let camiones = [];
    let contadorCamiones = 1;
    let camioneros = [];
    let contadorCamioneros = 1;

    try {
        const e = mockStorage.getItem('termate_envios');
        if (e) envios = JSON.parse(e);
        const c = mockStorage.getItem('termate_contador');
        if (c) contadorId = parseInt(c, 10);
        const ca = mockStorage.getItem('termate_camiones');
        if (ca) camiones = JSON.parse(ca);
        const cc = mockStorage.getItem('termate_cont_camiones');
        if (cc) contadorCamiones = parseInt(cc, 10);
        const cnr = mockStorage.getItem('termate_camioneros');
        if (cnr) camioneros = JSON.parse(cnr);
        const ccnr = mockStorage.getItem('termate_cont_camioneros');
        if (ccnr) contadorCamioneros = parseInt(ccnr, 10);

        if (camiones.length === 0) {
            camiones = [{ id: 1, nombre: 'Scania' }];
            contadorCamiones = 2;
        }
    } catch (err) {
        console.error('[Storage] Error al cargar:', err.message);
    }

    // Ahora simulamos la función actualizarKPIs() y renderListaViajes() que se ejecutan en render()
    function simularRender() {
        // En app.js línea 619:
        const pendiente = envios.filter(e => e.estado === 'Pendiente').length;
        // En app.js línea 651:
        const listaViajesLen = envios.length;
        return { pendiente, listaViajesLen, contadorId };
    }

    return { simularRender, envios, camiones, contadorId };
}

console.log('=== TEST STORAGE CORRUPTION: Ataque a commit 2097541 ===');

// Caso 1: termate_envios tiene el string "null"
const mockStorageNull = {
    getItem: (key) => {
        if (key === 'termate_envios') return 'null';
        return null;
    }
};

try {
    const app = simularCargarDatos(mockStorageNull);
    app.simularRender();
    console.log('Fallo 1 no detectado');
} catch (e) {
    console.log('[CRASH FATAL CONFIRMADO 1]: localStorage.termate_envios = "null" revienta en render():', e.message);
}

// Caso 2: termate_envios tiene un objeto "{}" en vez de Array
const mockStorageObj = {
    getItem: (key) => {
        if (key === 'termate_envios') return '{"id": 1}';
        return null;
    }
};

try {
    const app = simularCargarDatos(mockStorageObj);
    app.simularRender();
    console.log('Fallo 2 no detectado');
} catch (e) {
    console.log('[CRASH FATAL CONFIRMADO 2]: localStorage.termate_envios = "{}" revienta envios.filter():', e.message);
}

// Caso 3: termate_camiones tiene "null"
const mockStorageCamNull = {
    getItem: (key) => {
        if (key === 'termate_camiones') return 'null';
        return null;
    }
};

try {
    simularCargarDatos(mockStorageCamNull);
    console.log('Fallo 3 no detectado');
} catch (e) {
    console.log('[CRASH FATAL CONFIRMADO 3]: localStorage.termate_camiones = "null" revienta camiones.length:', e.message);
}

// Caso 4: termate_contador es "corrupto" -> NaN
const mockStorageContadorCorrupto = {
    getItem: (key) => {
        if (key === 'termate_contador') return 'basura';
        return null;
    }
};

const app4 = simularCargarDatos(mockStorageContadorCorrupto);
if (isNaN(app4.contadorId)) {
    console.log('[REGRESIÓN CONFIRMADA 4]: contadorId queda como NaN de por vida si el storage contiene texto inválido!');
}
