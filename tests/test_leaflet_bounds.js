// tests/test_leaflet_bounds.js
// Prueba adversarial de Leaflet latLngBounds y pad(0.2)

// Implementación canónica de Leaflet 1.9.4 para LatLng y LatLngBounds
class LatLng {
    constructor(lat, lng) {
        if (isNaN(lat) || isNaN(lng)) {
            throw new Error('Invalid LatLng object: (' + lat + ', ' + lng + ')');
        }
        this.lat = +lat;
        this.lng = +lng;
    }
}

class LatLngBounds {
    constructor(corner1, corner2) {
        if (!corner1) return;
        const latlngs = corner2 ? [corner1, corner2] : corner1;
        for (let i = 0, len = latlngs.length; i < len; i++) {
            this.extend(latlngs[i]);
        }
    }

    extend(obj) {
        if (!obj) return this;
        let latLng;
        if (Array.isArray(obj)) {
            latLng = new LatLng(obj[0], obj[1]);
        } else if (obj.lat !== undefined && obj.lng !== undefined) {
            latLng = new LatLng(obj.lat, obj.lng);
        } else {
            return this;
        }

        if (!this._southWest && !this._northEast) {
            this._southWest = new LatLng(latLng.lat, latLng.lng);
            this._northEast = new LatLng(latLng.lat, latLng.lng);
        } else {
            this._southWest.lat = Math.min(latLng.lat, this._southWest.lat);
            this._southWest.lng = Math.min(latLng.lng, this._southWest.lng);
            this._northEast.lat = Math.max(latLng.lat, this._northEast.lat);
            this._northEast.lng = Math.max(latLng.lng, this._northEast.lng);
        }
        return this;
    }

    pad(bufferRatio) {
        const sw = this._southWest;
        const ne = this._northEast;
        if (!sw || !ne) {
            // Leaflet 1.9.4: NO TIENE este check en pad()!
            // En Leaflet 1.9.4 pad() hace directamente:
            // heightBuffer = Math.abs(sw.lat - ne.lat) * bufferRatio
        }
        const heightBuffer = Math.abs(sw.lat - ne.lat) * bufferRatio;
        const widthBuffer = Math.abs(sw.lng - ne.lng) * bufferRatio;
        return new LatLngBounds(
            new LatLng(sw.lat - heightBuffer, sw.lng - widthBuffer),
            new LatLng(ne.lat + heightBuffer, ne.lng + widthBuffer)
        );
    }

    isValid() {
        return !!(this._southWest && this._northEast);
    }
}

function L_latLngBounds(a, b) {
    if (a instanceof LatLngBounds) return a;
    return new LatLngBounds(a, b);
}

console.log('=== TEST LEAFLET BOUNDS: Ataque a commit 9a9378b ===');

// Caso 1: Array vacío
try {
    const emptyCoords = [];
    const b = L_latLngBounds(emptyCoords);
    b.pad(0.2);
    console.log('Caso 1: No lanzó excepción');
} catch (e) {
    console.log('[CONFIRMADO]: L.latLngBounds([]).pad(0.2) arroja excepción fatal:', e.message);
}

// Caso 2: Array con coordenadas inválidas [NaN, NaN]
try {
    const invalidCoords = [[NaN, NaN]];
    const b = L_latLngBounds(invalidCoords);
    b.pad(0.2);
    console.log('Caso 2: No lanzó');
} catch (e) {
    console.log('[CONFIRMADO]: Coordenadas [NaN, NaN] en bounds arrojan excepción fatal:', e.message);
}

// Caso 3: Array con un solo punto (Destino sin Origen)
try {
    const singleCoord = [[-34.6037, -58.3816]];
    const b = L_latLngBounds(singleCoord);
    const padded = b.pad(0.2);
    console.log('Caso 3 (Punto único): sw === ne:', 
        padded._southWest.lat === padded._northEast.lat && padded._southWest.lng === padded._northEast.lng,
        '-> Resultado: Bounding box de área 0 (provoca zoom descontrolado/máximo en Leaflet)');
} catch (e) {
    console.log('Caso 3 error:', e.message);
}

// Caso 4: Qué pasa con la guardia en app.js
console.log('\nAnálisis de la línea 591 de app.js:');
console.log(`
if (todosCoords.length > 0) {
    try {
        instanciaMapa.fitBounds(L.latLngBounds(todosCoords).pad(0.2));
    } catch {}
}
`);
console.log('1. Si todosCoords tiene 1 punto, pad(0.2) no tiene efecto diferencial (altura=0, ancho=0). Leaflet fitBounds sobre un punto único sin maxZoom estipulado zoomea al límite visual máximo del mapa (zoom 19), mostrando una pantalla gris o azulejos borrosos.');
console.log('2. El bloque try {} catch {} enmascara silenciosamente cualquier fallo sin alertar ni aplicar fallback a los límites de Argentina.');
