/**
 * TerMate — Sistema de Gestión de Rutas y Logística para Camiones
 * v2.1 — Refinado Profesional, Geocodificación Federal, Cero Emojis
 */
(function () {
    'use strict';

    // ═══════════════════════════════════════════════════════════
    // 1. ESTADO GLOBAL
    // ═══════════════════════════════════════════════════════════
    let envios = [];
    let contadorId = 1;
    
    // Mapas
    let mapaFull = null;
    let mapaInline = null;
    let marcadoresFull = {};
    let marcadoresInline = {};
    let polylinesFull = {};
    let polylinesInline = {};
    
    let idEnvioEditando = null;
    let idEnvioDetalle = null;
    let filtroEstado = 'todos';
    let filtroBuscar = '';
    let rutaPendiente = null;

    // Camiones registrados
    let camiones = [];
    let contadorCamiones = 1;
    let camionEditandoId = null;

    // Camioneros registrados
    let camioneros = [];
    let contadorCamioneros = 1;
    let camioneroEditandoId = null;
    let camioneroPerfilId = null;
    // Capacitaciones temporales mientras se edita
    let capsTemp = [];

    const KEY_GEO_CACHE    = 'termate_geo_cache';
    const KEY_ENVIOS       = 'termate_envios';
    const KEY_CONTADOR     = 'termate_contador';
    const KEY_CAMIONES     = 'termate_camiones';
    const KEY_CONT_CAM     = 'termate_cont_camiones';
    const KEY_CAMIONEROS   = 'termate_camioneros';
    const KEY_CONT_CNR     = 'termate_cont_camioneros';
    const cacheGeo = JSON.parse(localStorage.getItem(KEY_GEO_CACHE) || '{}');

    const ORS_BASE = 'https://api.openrouteservice.org/v2';
    const ORS_API_KEY = ''; // Coloca tu API key aquí si lo prefieres

    // ═══════════════════════════════════════════════════════════
    // 2. REGISTRO SERVICE WORKER (PWA)
    // ═══════════════════════════════════════════════════════════
    if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
        navigator.serviceWorker.register('./sw.js')
            .catch(err => console.warn('[SW] Error registro:', err));
    }

    // ═══════════════════════════════════════════════════════════
    // 3. INDICADOR DE CONEXIÓN
    // ═══════════════════════════════════════════════════════════
    function actualizarConexion() {
        const online = navigator.onLine;
        const badges = [
            document.getElementById('indicador-conexion'),
            document.getElementById('indicador-conexion-sidebar')
        ];
        
        badges.forEach(b => {
            if (!b) return;
            b.className = `conexion-pill ${online ? 'online' : 'offline'}`;
            const txt = b.querySelector('.conexion-texto');
            if (txt) txt.textContent = online ? 'Online' : 'Sin red';
        });
    }

    window.addEventListener('online', () => {
        actualizarConexion();
        showToast('Conexión reestablecida.', 'success');
    });
    window.addEventListener('offline', () => {
        actualizarConexion();
        showToast('Modo sin conexión activado.', 'warning');
    });

    // ═══════════════════════════════════════════════════════════
    // 4. PERSISTENCIA
    // ═══════════════════════════════════════════════════════════
    function guardar() {
        try {
            localStorage.setItem(KEY_ENVIOS,     JSON.stringify(envios));
            localStorage.setItem(KEY_CONTADOR,    String(contadorId));
            localStorage.setItem(KEY_CAMIONES,    JSON.stringify(camiones));
            localStorage.setItem(KEY_CONT_CAM,    String(contadorCamiones));
            localStorage.setItem(KEY_CAMIONEROS,  JSON.stringify(camioneros));
            localStorage.setItem(KEY_CONT_CNR,    String(contadorCamioneros));
        } catch {
            showToast('Almacenamiento lleno. Elimina rutas viejas.', 'error');
        }
    }

    function guardarGeoCache() {
        try {
            localStorage.setItem(KEY_GEO_CACHE, JSON.stringify(cacheGeo));
        } catch {}
    }

    function cargarDatos() {
        try {
            const e = localStorage.getItem(KEY_ENVIOS);
            if (e) envios = JSON.parse(e);
            const c = localStorage.getItem(KEY_CONTADOR);
            if (c) contadorId = parseInt(c, 10);
            const ca = localStorage.getItem(KEY_CAMIONES);
            if (ca) camiones = JSON.parse(ca);
            const cc = localStorage.getItem(KEY_CONT_CAM);
            if (cc) contadorCamiones = parseInt(cc, 10);
            const cnr = localStorage.getItem(KEY_CAMIONEROS);
            if (cnr) camioneros = JSON.parse(cnr);
            const ccnr = localStorage.getItem(KEY_CONT_CNR);
            if (ccnr) contadorCamioneros = parseInt(ccnr, 10);
        } catch (err) {
            console.error(err);
        }
    }

    const KEY_SERPAPI_KEY    = 'termate_serpapi_key';
    const DEFAULT_SERPAPI_KEY = 'secret_api_key';
    const SERPAPI_BASE_URL   = 'https://serpapi.com/search';

    function obtenerSerpApiKey() {
        return localStorage.getItem(KEY_SERPAPI_KEY) || DEFAULT_SERPAPI_KEY;
    }

    function guardarSerpApiKey(key) {
        if (key) {
            localStorage.setItem(KEY_SERPAPI_KEY, key.trim());
        } else {
            localStorage.removeItem(KEY_SERPAPI_KEY);
        }
    }

    // ═══════════════════════════════════════════════════════════
    // 5. GEOCODIFICACIÓN Y MAPAS (SERPAPI GOOGLE MAPS ENGINE)
    // ═══════════════════════════════════════════════════════════

    /**
     * Helper para peticiones a SerpApi con manejo transparente de CORS en navegador
     */
    async function fetchSerpApi(paramsObj) {
        const apiKey = obtenerSerpApiKey();
        const params = new URLSearchParams(paramsObj);
        if (apiKey && !params.has('api_key')) {
            params.append('api_key', apiKey);
        }

        const rawUrl = `${SERPAPI_BASE_URL}?${params.toString()}`;

        // 1. Intentar fetch directo
        try {
            const res = await fetch(rawUrl, { signal: AbortSignal.timeout(5000) });
            if (res.ok) return await res.json();
        } catch (e) {
            console.warn('[SerpApi] Fetch directo falló (posible CORS), usando proxy corsproxy.io...', e);
        }

        // 2. Intentar vía corsproxy.io
        try {
            const proxyUrl = `https://corsproxy.io/?${encodeURIComponent(rawUrl)}`;
            const resProxy = await fetch(proxyUrl, { signal: AbortSignal.timeout(7000) });
            if (resProxy.ok) return await resProxy.json();
        } catch (e) {
            console.warn('[SerpApi] Proxy corsproxy.io falló, usando allorigins.win...', e);
        }

        // 3. Intentar vía allorigins.win
        try {
            const proxyUrl2 = `https://api.allorigins.win/raw?url=${encodeURIComponent(rawUrl)}`;
            const resProxy2 = await fetch(proxyUrl2, { signal: AbortSignal.timeout(7000) });
            if (resProxy2.ok) return await resProxy2.json();
        } catch (e) {
            console.error('[SerpApi] Fallaron las peticiones:', e);
        }

        return null;
    }

    /**
     * Búsqueda en el motor Google Maps a través de la API de SerpApi
     * URL Oficial: https://serpapi.com/search?engine=google_maps
     */
    async function buscarSerpApiGoogleMaps(query) {
        if (!query || query.trim().length < 2 || !navigator.onLine) return [];

        const data = await fetchSerpApi({
            engine: 'google_maps',
            q: query,
            gl: 'ar',
            hl: 'es'
        });

        if (!data) return [];
        const sugerencias = [];

        // 1. Procesar local_results
        if (Array.isArray(data.local_results)) {
            data.local_results.forEach(item => {
                if (item.gps_coordinates?.latitude && item.gps_coordinates?.longitude) {
                    const title = item.title || query;
                    const address = item.address || item.snippet || 'Argentina';
                    sugerencias.push({
                        completo: `${title}, ${address}`,
                        principal: title,
                        secundario: address,
                        lat: parseFloat(item.gps_coordinates.latitude),
                        lon: parseFloat(item.gps_coordinates.longitude),
                        fuente: 'Google Maps (SerpApi)',
                        rating: item.rating || null,
                        reviews: item.reviews || null,
                        placeId: item.place_id || null
                    });
                }
            });
        }

        // 2. Procesar place_results
        if (data.place_results?.gps_coordinates) {
            const place = data.place_results;
            if (place.gps_coordinates.latitude && place.gps_coordinates.longitude) {
                const title = place.title || query;
                const address = place.address || 'Argentina';
                const lat = parseFloat(place.gps_coordinates.latitude);
                const lon = parseFloat(place.gps_coordinates.longitude);

                const yaExiste = sugerencias.some(s => Math.abs(s.lat - lat) < 0.0001 && Math.abs(s.lon - lon) < 0.0001);
                if (!yaExiste) {
                    sugerencias.unshift({
                        completo: `${title}, ${address}`,
                        principal: title,
                        secundario: address,
                        lat: lat,
                        lon: lon,
                        fuente: 'Google Maps (SerpApi)',
                        rating: place.rating || null,
                        reviews: place.reviews || null,
                        placeId: place.place_id || null
                    });
                }
            }
        }

        return sugerencias;
    }

    /**
     * Búsqueda de sugerencias federales en Argentina.
     * Consulta primeramente SerpApi Google Maps Engine y utiliza Nominatim como fallback.
     */
    async function buscarSugerenciasFederales(query) {
        if (query.length < 3 || !navigator.onLine) return [];

        // 1. Intentar SerpApi Google Maps API (https://serpapi.com/search?engine=google_maps)
        const sugsSerp = await buscarSerpApiGoogleMaps(query);
        if (sugsSerp.length > 0) {
            return sugsSerp;
        }

        // 2. Fallback a Nominatim (OpenStreetMap)
        try {
            const params = new URLSearchParams({
                q: query,
                format: 'json',
                limit: 5,
                countrycodes: 'ar',
                addressdetails: 1
            });
            const res = await fetch(`https://nominatim.openstreetmap.org/search?${params}`, {
                headers: { 'User-Agent': 'TerMate/2.1' },
                signal: AbortSignal.timeout(4000)
            });
            if (!res.ok) return [];
            const data = await res.json();

            return data.map(item => {
                const addr = item.address || {};
                const calle = addr.road || addr.pedestrian || addr.suburb || '';
                const altura = addr.house_number ? ` ${addr.house_number}` : '';
                const localidad = addr.city || addr.town || addr.village || addr.locality || '';
                const provincia = addr.state || '';

                let principal = '';
                let secundario = '';

                if (calle) {
                    principal = `${calle}${altura}`;
                    secundario = [localidad, provincia].filter(Boolean).join(', ');
                } else {
                    principal = localidad || provincia || item.display_name;
                    secundario = provincia && localidad ? provincia : 'Argentina';
                }

                return {
                    completo: `${principal}, ${secundario}`,
                    principal,
                    secundario,
                    lat: parseFloat(item.lat),
                    lon: parseFloat(item.lon),
                    fuente: 'OpenStreetMap'
                };
            });
        } catch {
            return [];
        }
    }

    async function geocodificar(direccion) {
        const key = direccion.toLowerCase().trim();
        if (!key) return null;
        if (cacheGeo[key]) return cacheGeo[key];

        if (navigator.onLine) {
            // Priorizar SerpApi Google Maps Engine
            try {
                const resSerp = await buscarSerpApiGoogleMaps(direccion);
                if (resSerp.length > 0 && resSerp[0].lat && resSerp[0].lon) {
                    const coords = [resSerp[0].lat, resSerp[0].lon];
                    cacheGeo[key] = coords;
                    guardarGeoCache();
                    return coords;
                }
            } catch {}

            // Fallback a Nominatim
            try {
                const params = new URLSearchParams({
                    q: direccion,
                    format: 'json',
                    limit: 1,
                    countrycodes: 'ar'
                });
                const res = await fetch(`https://nominatim.openstreetmap.org/search?${params}`, {
                    headers: { 'User-Agent': 'TerMate/2.1' }
                });
                if (res.ok) {
                    const data = await res.json();
                    if (data?.length > 0) {
                        const coords = [parseFloat(data[0].lat), parseFloat(data[0].lon)];
                        cacheGeo[key] = coords;
                        guardarGeoCache();
                        return coords;
                    }
                }
            } catch {}
        }
        return null;
    }

    // ═══════════════════════════════════════════════════════════
    // 6. RUTEO PROFESIONAL HGV
    // ═══════════════════════════════════════════════════════════
    async function obtenerRutaCamion(cOrigen, cDestino, camionId) {
        const camion = camiones.find(c => c.id === camionId);
        const headers = {
            'Content-Type': 'application/json',
            'Accept': 'application/json'
        };
        if (ORS_API_KEY) headers['Authorization'] = ORS_API_KEY;

        const body = {
            coordinates: [
                [cOrigen[1], cOrigen[0]], // lon, lat
                [cDestino[1], cDestino[0]]
            ]
        };

        if (camion) {
            body.options = {
                profile_params: {
                    restrictions: {
                        height: camion.alto,
                        width: camion.ancho,
                        length: camion.largo,
                        weight: camion.peso,
                        axleload: Math.round(camion.peso / 3 * 10) / 10
                    }
                }
            };
        }

        const res = await fetch(`${ORS_BASE}/directions/driving-hgv`, {
            method: 'POST',
            headers,
            body: JSON.stringify(body),
            signal: AbortSignal.timeout(9000)
        });

        if (!res.ok) throw new Error('ORS_ERROR');
        const data = await res.json();

        if (data.routes?.length > 0) {
            const r = data.routes[0];
            return {
                distancia: r.summary.distance / 1000,
                tiempo: r.summary.duration / 3600,
                coordenadas: decodificarPolyline(r.geometry),
                calles: [],
                warnings: (r.warnings || []).map(w => w.message || w)
            };
        }
        throw new Error('Ruta no encontrada');
    }

    async function obtenerRutaOSRM(cOrigen, cDestino) {
        const url = `https://router.project-osrm.org/route/v1/driving/${cOrigen[1]},${cOrigen[0]};${cDestino[1]},${cDestino[0]}?overview=full&geometries=geojson&steps=true`;
        const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
        if (!res.ok) throw new Error('OSRM_ERROR');
        const data = await res.json();

        if (data.code === 'Ok' && data.routes?.length > 0) {
            const r = data.routes[0];
            const calles = [];
            const legs = r.legs || [];
            legs.forEach(leg => {
                (leg.steps || []).forEach(step => {
                    const name = step.name && step.name.trim();
                    if (name && !calles.includes(name)) calles.push(name);
                });
            });
            return {
                distancia: r.distance / 1000,
                tiempo: r.duration / 3600,
                coordenadas: r.geometry.coordinates.map(c => [c[1], c[0]]),
                calles,
                warnings: []
            };
        }
        throw new Error('OSRM sin ruta');
    }

    async function resolverRuta(origen, destino, camionId) {
        const [coordsOrigen, coordsDestino] = await Promise.all([
            geocodificar(origen),
            geocodificar(destino)
        ]);

        if (!coordsOrigen) throw new Error(`Direccion de origen no resuelta.`);
        if (!coordsDestino) throw new Error(`Direccion de destino no resuelta.`);

        let dataRuta = null;
        let esAproximada = false;

        if (navigator.onLine) {
            try {
                dataRuta = await obtenerRutaCamion(coordsOrigen, coordsDestino, camionId);
            } catch {
                try {
                    dataRuta = await obtenerRutaOSRM(coordsOrigen, coordsDestino);
                    esAproximada = true;
                } catch {}
            }
        }

        if (!dataRuta) {
            const dist = haversine(coordsOrigen, coordsDestino);
            dataRuta = {
                distancia: dist,
                tiempo: dist / 70,
                coordenadas: [coordsOrigen, coordsDestino],
                warnings: ['Sin red: Calculo en linea recta.']
            };
            esAproximada = true;
        }

        if (esAproximada && navigator.onLine) {
            showToast('Ruta aproximada por limites de servicio.', 'warning');
        }

        return {
            coordsOrigen,
            coordsDestino,
            distancia: dataRuta.distancia,
            tiempo: dataRuta.tiempo,
            coordsRuta: dataRuta.coordenadas,
            calles: dataRuta.calles || [],
            warnings: dataRuta.warnings || []
        };
    }

    // ═══════════════════════════════════════════════════════════
    // 7. MAPAS LEAFLET DUALES
    // ═══════════════════════════════════════════════════════════
    let currentTileLayerFull = null;
    const TILE_PROVIDERS = {
        dark: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
        streets: 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png',
        satellite: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'
    };

    function cambiarCapaMapa(map, layerType) {
        if (!map) return;
        const url = TILE_PROVIDERS[layerType] || TILE_PROVIDERS.dark;
        const attrib = layerType === 'satellite' ? '© Esri, Maxar' : '© OpenStreetMap, © CARTO';
        
        if (currentTileLayerFull) {
            map.removeLayer(currentTileLayerFull);
        }
        currentTileLayerFull = L.tileLayer(url, { attribution: attrib, maxZoom: 19 }).addTo(map);
    }

    function initMapas() {
        const argentinaBounds = L.latLngBounds(
            L.latLng(-55.1, -73.6),  // Sur-Oeste (Tierra del Fuego)
            L.latLng(-21.8, -53.6)   // Norte-Este (Misiones)
        );
        const mapOpts = {
            zoomControl: true,
            maxBounds: argentinaBounds,
            maxBoundsViscosity: 1.0,
            minZoom: 3,
            maxZoom: 18,
            worldCopyJump: false
        };

        const argStyle = {
            color: '#38bdf8',
            weight: 1.2,
            opacity: 0.6,
            fillColor: '#0e1726',
            fillOpacity: 0.15
        };
        const argLabelStyle = {
            className: 'argentina-province-label',
            direction: 'center',
            permanent: true,
            offset: [0, 0],
            interactive: false
        };

        function onEachProvince(layer) {
            layer.bindTooltip(layer.feature.properties.name, argLabelStyle);
        }

        function addArgentinaOverlay(map) {
            if (!location.protocol.startsWith('http')) {
                console.warn('[Mapa] Protocolo local file:// detectado. Omitiendo overlay de provincias para evitar bloqueo CORS de navegador.');
                return;
            }
            fetch('data/argentina-provinces.geojson')
                .then(r => {
                    if (!r.ok) throw new Error('HTTP Error');
                    return r.json();
                })
                .then(geo => {
                    L.geoJSON(geo, {
                        style: () => argStyle,
                        onEachFeature: (_f, layer) => onEachProvince(layer)
                    }).addTo(map);
                })
                .catch(err => console.warn('Carga de provincias omitida:', err));
        }

        // 1. Mapa Full (Tab principal de Mapa)
        if (!mapaFull && document.getElementById('mapa')) {
            try {
                mapaFull = L.map('mapa', mapOpts).setView([-38.4, -63.6], 4);
                cambiarCapaMapa(mapaFull, 'dark');
                addArgentinaOverlay(mapaFull);
            } catch (err) {
                console.error(err);
            }
        }

        // 2. Mapa Inline (Tab Nueva Ruta - Desktop)
        if (!mapaInline && document.getElementById('mapa-inline')) {
            try {
                mapaInline = L.map('mapa-inline', mapOpts).setView([-38.4, -63.6], 4);
                L.tileLayer(TILE_PROVIDERS.dark, { attribution: '© CARTO', maxZoom: 19 }).addTo(mapaInline);
                addArgentinaOverlay(mapaInline);
            } catch (err) {
                console.error(err);
            }
        }

        // Event listeners para botones de capas
        document.querySelectorAll('.map-layer-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                document.querySelectorAll('.map-layer-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                cambiarCapaMapa(mapaFull, btn.dataset.layer);
            });
        });

        // Setup buscador en mapa principal con SerpApi
        setupAutocompletado('map-search-input', 'map-search-sugerencias');
    }

    let poiMarcadores = { gasolina: [], comida: [] };
    let poiActivo = { gasolina: false, comida: false };

    function crearIconoCombustible() {
        const svg = `<div class="poi-marker-icon" style="background:#10b981; width:28px; height:28px; border:2px solid #0f172a;">
            <svg viewBox="0 0 24 24" fill="none" stroke="#ffffff" stroke-width="2" width="14" height="14">
                <path d="M3 22V10l7-8 7 8v12"/><rect x="9" y="14" width="6" height="8"/><path d="M14 22V14a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v8"/><line x1="18" y1="12" x2="18" y2="7"/>
            </svg>
        </div>`;
        return L.divIcon({ html: svg, className: '', iconSize: [28, 28], iconAnchor: [14, 14] });
    }

    function crearIconoComida() {
        const svg = `<div class="poi-marker-icon" style="background:#f59e0b; width:28px; height:28px; border:2px solid #0f172a;">
            <svg viewBox="0 0 24 24" fill="none" stroke="#ffffff" stroke-width="2" width="14" height="14">
                <path d="M18 8h1a4 4 0 0 1 0 8h-1"/><path d="M2 8h16v9a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4V8z"/><line x1="6" y1="1" x2="6" y2="4"/><line x1="10" y1="1" x2="10" y2="4"/><line x1="14" y1="1" x2="14" y2="4"/>
            </svg>
        </div>`;
        return L.divIcon({ html: svg, className: '', iconSize: [28, 28], iconAnchor: [14, 14] });
    }

    const POIS_ARGENTINA_FALLBACK = {
        gasolina: [
            { titulo: 'YPF ACA Rosario Central', direccion: 'Autopista Bs As - Rosario Km 285', lat: -32.958, lon: -60.672, rating: 4.6, reviews: 340 },
            { titulo: 'Shell Full Pilar', direccion: 'Panamericana Km 50, Pilar, Bs As', lat: -34.456, lon: -58.912, rating: 4.5, reviews: 280 },
            { titulo: 'YPF Opessa Córdoba Norte', direccion: 'Av. Circunvalación Km 12, Córdoba', lat: -31.385, lon: -64.195, rating: 4.7, reviews: 410 },
            { titulo: 'Axion Energy San Nicolás', direccion: 'Ruta Nacional 9 Km 230, San Nicolás', lat: -33.342, lon: -60.221, rating: 4.4, reviews: 195 },
            { titulo: 'Puma Energy Villa María', direccion: 'Ruta 9 Km 555, Villa María, Córdoba', lat: -32.408, lon: -63.242, rating: 4.3, reviews: 150 },
            { titulo: 'YPF ACA Mendoza Mercaderes', direccion: 'Acceso Este Km 10, Mendoza', lat: -32.898, lon: -68.795, rating: 4.8, reviews: 520 },
            { titulo: 'YPF Bahía Blanca Sur', direccion: 'Ruta 3 Km 695, Bahía Blanca', lat: -38.728, lon: -62.245, rating: 4.5, reviews: 230 },
            { titulo: 'YPF San Luis Centro', direccion: 'Autopista de las Serranías Puntanas Km 790, San Luis', lat: -33.298, lon: -66.335, rating: 4.6, reviews: 210 }
        ],
        comida: [
            { titulo: 'Parador de Camiones "El Tronco"', direccion: 'Ruta Nacional 9 Km 145, Baradero', lat: -33.812, lon: -59.505, rating: 4.7, reviews: 480 },
            { titulo: 'Comedor y Descanso "La Querencia"', direccion: 'Ruta 7 Km 260, Junín, Bs As', lat: -34.582, lon: -60.945, rating: 4.6, reviews: 310 },
            { titulo: 'Parador Camionero "El Cruce"', direccion: 'Cruce Ruta 3 y 226, Azul, Bs As', lat: -36.782, lon: -59.858, rating: 4.8, reviews: 620 },
            { titulo: 'Restaurante de Ruta "El Rutero"', direccion: 'Ruta 14 Km 120, Concepción del Uruguay', lat: -32.485, lon: -58.262, rating: 4.5, reviews: 270 },
            { titulo: 'Parador "La Posta del Camionero"', direccion: 'Ruta 34 Km 220, Rafaela, Santa Fe', lat: -31.252, lon: -61.488, rating: 4.4, reviews: 185 },
            { titulo: 'Comedor de Campo "Las Rosas"', direccion: 'Ruta 8 Km 180, Pergamino, Bs As', lat: -33.892, lon: -60.575, rating: 4.6, reviews: 390 }
        ]
    };

    async function buscarPOIsSerpApi(categoria) {
        let pois = [];

        if (navigator.onLine) {
            let query = (categoria === 'gasolina')
                ? 'estacion de servicio YPF Shell Axion Puma Argentina'
                : 'parador de camiones restaurante comedor de ruta descanso Argentina';

            const paramsObj = {
                engine: 'google_maps',
                q: query,
                gl: 'ar',
                hl: 'es'
            };

            if (mapaFull) {
                const center = mapaFull.getCenter();
                const zoom = Math.round(mapaFull.getZoom());
                paramsObj.ll = `@${center.lat.toFixed(5)},${center.lng.toFixed(5)},${zoom}z`;
            }

            const data = await fetchSerpApi(paramsObj);

            if (data && Array.isArray(data.local_results)) {
                data.local_results.forEach(item => {
                    if (item.gps_coordinates?.latitude && item.gps_coordinates?.longitude) {
                        pois.push({
                            titulo: item.title || 'Parada de Ruta',
                            direccion: item.address || item.snippet || 'Argentina',
                            lat: parseFloat(item.gps_coordinates.latitude),
                            lon: parseFloat(item.gps_coordinates.longitude),
                            rating: item.rating || null,
                            reviews: item.reviews || null,
                            tipo: categoria
                        });
                    }
                });
            }
        }

        // Si la API falla o no retorna lugares en la consulta, combinar con dataset predeterminado de Argentina
        if (pois.length === 0) {
            pois = POIS_ARGENTINA_FALLBACK[categoria] || [];
        }

        return pois;
    }

    async function togglePOIMapa(categoria) {
        if (!mapaFull) return;

        poiActivo[categoria] = !poiActivo[categoria];
        const btnId = categoria === 'gasolina' ? 'btn-poi-combustible' : 'btn-poi-comida';
        const btn = document.getElementById(btnId);

        if (!poiActivo[categoria]) {
            if (btn) btn.classList.remove('active');
            poiMarcadores[categoria].forEach(m => mapaFull.removeLayer(m));
            poiMarcadores[categoria] = [];
            showToast(`Ocultando paradas de ${categoria === 'gasolina' ? 'estaciones de servicio' : 'comida y descanso'}.`, 'info');
            return;
        }

        if (btn) btn.classList.add('active');
        showToast(`Cargando ${categoria === 'gasolina' ? 'estaciones de servicio' : 'paradores de comida'} en Google Maps...`, 'info');

        const pois = await buscarPOIsSerpApi(categoria);

        if (pois.length === 0) {
            showToast('No se encontraron paradas cercanas en este momento.', 'warning');
            if (btn) btn.classList.remove('active');
            poiActivo[categoria] = false;
            return;
        }

        const icono = categoria === 'gasolina' ? crearIconoCombustible() : crearIconoComida();

        pois.forEach(p => {
            const m = L.marker([p.lat, p.lon], { icon: icono }).addTo(mapaFull);
            const popupHtml = `<div class="popup-titulo" style="color:${categoria === 'gasolina' ? '#34d399' : '#fbbf24'}">
                ${categoria === 'gasolina' ? '⛽ Estación de Servicio' : '🍽️ Parador / Resto'}
            </div>
            <div class="popup-linea"><strong>${p.titulo}</strong></div>
            <div class="popup-linea">${p.direccion}</div>
            ${p.rating ? `<div class="popup-linea" style="color:#fbbf24;font-weight:600">★ ${p.rating} (${p.reviews || 0} opiniones)</div>` : ''}
            <div class="popup-linea" style="font-size:0.75rem;opacity:0.85;margin-top:4px">Obtenido de Google Maps vía SerpApi</div>`;
            m.bindPopup(popupHtml);
            poiMarcadores[categoria].push(m);
        });

        // Centrar mapa suavemente para abarcar las paradas si hay marcadores
        if (poiMarcadores[categoria].length > 0) {
            try {
                const group = L.featureGroup(poiMarcadores[categoria]);
                mapaFull.fitBounds(group.getBounds().pad(0.1));
            } catch {}
        }

        showToast(`Se mostraron ${pois.length} paradas de ${categoria === 'gasolina' ? 'combustible' : 'comida'} en el mapa.`, 'success');
    }

    function crearIcono(color) {
        const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="30" height="38" viewBox="0 0 30 38">
            <path d="M15 0C6.72 0 0 6.72 0 15c0 11.25 15 23 15 23s15-11.75 15-23C30 6.72 23.28 0 15 0z" fill="${color}"/>
            <circle cx="15" cy="15" r="5" fill="#080c14"/>
        </svg>`;
        return L.divIcon({
            html: svg,
            className: '',
            iconSize: [30, 38],
            iconAnchor: [15, 38],
            popupAnchor: [0, -32]
        });
    }

    function crearIconoOrigen() {
        const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 22 22">
            <circle cx="11" cy="11" r="9" fill="#10b981" stroke="#080c14" stroke-width="2"/>
            <circle cx="11" cy="11" r="3" fill="#080c14"/>
        </svg>`;
        return L.divIcon({ html: svg, className: '', iconSize: [22, 22], iconAnchor: [11, 11] });
    }

    function colorPorEstado(estado) {
        if (estado === 'Pendiente') return '#f59e0b';
        if (estado === 'En Transito') return '#3b82f6';
        return '#10b981';
    }

    function renderMapas() {
        actualizarMapa(mapaFull, marcadoresFull, polylinesFull, true);
        actualizarMapa(mapaInline, marcadoresInline, polylinesInline, false);

        // Actualizar estadísticas del mapa flotante
        const rutasCount = envios.length;
        const transitoCount = envios.filter(e => e.estado === 'En Transito').length;
        const totalDist = envios.reduce((acc, e) => acc + (e.distancia || 0), 0);

        const elRutas = document.getElementById('map-stat-rutas');
        const elTransito = document.getElementById('map-stat-transito');
        const elDist = document.getElementById('map-stat-distancia');

        if (elRutas) elRutas.textContent = rutasCount;
        if (elTransito) elTransito.textContent = transitoCount;
        if (elDist) elDist.textContent = formatoDistancia(totalDist);
    }

    function actualizarMapa(instanciaMapa, refMarcadores, refPolylines, incluirTodos) {
        if (!instanciaMapa) return;

        // Limpiar capas previas
        Object.values(refMarcadores).forEach(m => instanciaMapa.removeLayer(m));
        Object.values(refPolylines).forEach(p => instanciaMapa.removeLayer(p));
        
        // Reset local referencias
        for (const k in refMarcadores) delete refMarcadores[k];
        for (const k in refPolylines) delete refPolylines[k];

        const todosCoords = [];
        const enviosAMapear = incluirTodos 
            ? envios 
            : envios.slice(-1); // En el mapa de preview, solo mostramos la última ruta o la que se está editando

        enviosAMapear.forEach(e => {
            if (!e.coordsDestino) return;
            const color = colorPorEstado(e.estado);

            // Destino
            const mDest = L.marker(e.coordsDestino, { icon: crearIcono(color) }).addTo(instanciaMapa);
            mDest.bindPopup(popupHtml(e));
            refMarcadores[e.id] = mDest;
            todosCoords.push(e.coordsDestino);

            // Origen
            if (e.coordsOrigen) {
                const mOr = L.marker(e.coordsOrigen, { icon: crearIconoOrigen() }).addTo(instanciaMapa);
                mOr.bindPopup(`<div class="popup-titulo" style="color:#10b981">Origen</div><div class="popup-linea">${e.origen}</div>`);
                refMarcadores[`${e.id}_or`] = mOr;
                todosCoords.push(e.coordsOrigen);

                if (e.coordsRuta?.length > 0) {
                    const poly = L.polyline(e.coordsRuta, {
                        color: '#38bdf8',
                        weight: 5,
                        opacity: 0.45,
                        lineCap: 'round',
                        lineJoin: 'round',
                        dashArray: e.estado === 'Pendiente' ? '12, 8' : null
                    }).addTo(instanciaMapa);
                    const rutaPopup = `<div class="popup-titulo">Ruta #${String(e.id).padStart(4,'0')}</div>`
                        + `<div class="popup-linea"><strong>${e.origen}</strong> → <strong>${e.destino}</strong></div>`
                        + (e.producto ? `<div class="popup-linea">Carga: ${e.producto}</div>` : '')
                        + (e.distancia ? `<div class="popup-linea">Distancia: ${formatoDistancia(e.distancia)}</div>` : '')
                        + (e.calles?.length ? `<div class="popup-linea" style="margin-top:6px;font-size:0.8rem;opacity:0.85"><strong>Ruta por:</strong><br>${e.calles.join(' → ')}</div>` : '');
                    poly.bindPopup(rutaPopup);
                    refPolylines[e.id] = poly;
                }
            }
        });

        if (todosCoords.length > 0) {
            const grupo = L.featureGroup(todosCoords.map(c => L.marker(c)));
            try {
                instanciaMapa.fitBounds(grupo.getBounds().pad(0.15));
            } catch {}
        }
    }

    function popupHtml(e) {
        const dist = formatoDistancia(e.distancia);
        const tiempo = formatoTiempo(e.tiempo);
        const fuel = formatoFuel(e.distancia, e.pesoCarga);
        return `<div class="popup-titulo">${e.destino}</div>`
            + `<div class="popup-linea"><strong>Desde:</strong> ${e.origen}</div>`
            + `<div class="popup-linea"><strong>Carga:</strong> ${e.producto}</div>`
            + (dist !== '—' ? `<div class="popup-linea"><strong>Distancia:</strong> ${dist}</div>` : '')
            + (tiempo !== '—' ? `<div class="popup-linea"><strong>Tiempo:</strong> ${tiempo}</div>` : '')
            + (fuel ? `<div class="popup-linea"><strong>Combustible:</strong> ${fuel}</div>` : '');
    }

    function enfocarRutaEspecifica(id) {
        irATab('mapa');
        setTimeout(() => {
            const poly = polylinesFull[id];
            if (poly) {
                mapaFull.fitBounds(poly.getBounds(), { padding: [40, 40], maxZoom: 10 });
                if (marcadoresFull[id]) marcadoresFull[id].openPopup();
            } else if (marcadoresFull[id]) {
                mapaFull.setView(marcadoresFull[id].getLatLng(), 10);
                marcadoresFull[id].openPopup();
            }
        }, 300);
    }

    // ═══════════════════════════════════════════════════════════
    // 8. RENDERIZADO UI
    // ═══════════════════════════════════════════════════════════
    function actualizarKPIs() {
        const pendiente = envios.filter(e => e.estado === 'Pendiente').length;
        const transito  = envios.filter(e => e.estado === 'En Transito').length;
        const entregado = envios.filter(e => e.estado === 'Entregado').length;

        const set = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
        set('kpi-num-pendiente', pendiente);
        set('kpi-num-transito', transito);
        set('kpi-num-entregado', entregado);
    }

    function renderListaViajes() {
        const c = document.getElementById('lista-viajes');
        if (!c) return;

        let lista = envios.slice().reverse();

        if (filtroEstado !== 'todos') {
            lista = lista.filter(e => e.estado === filtroEstado);
        }
        if (filtroBuscar) {
            const q = filtroBuscar.toLowerCase();
            lista = lista.filter(e =>
                e.origen.toLowerCase().includes(q) ||
                e.destino.toLowerCase().includes(q) ||
                e.producto.toLowerCase().includes(q) ||
                (e.cliente && e.cliente.toLowerCase().includes(q)) ||
                (e.remito && e.remito.toLowerCase().includes(q))
            );
        }

        if (lista.length === 0) {
            c.innerHTML = `<div class="empty-state">
                <span class="empty-icon">📋</span>
                <p>No se encontraron registros de viajes.</p>
            </div>`;
            return;
        }

        c.innerHTML = lista.map(e => {
            const clase = e.estado === 'Pendiente' ? 'pendiente' : e.estado === 'En Transito' ? 'transito' : 'entregado';
            const estadoLabel = e.estado === 'Pendiente' ? 'Pendiente' : e.estado === 'En Transito' ? 'En Ruta' : 'Entregado';
            const camion = e.camionId ? camiones.find(c => c.id === e.camionId) : null;
            const dist   = formatoDistancia(e.distancia);
            const tiempo = formatoTiempo(e.tiempo);
            const fuel   = e.distancia ? (formatoFuel(e.distancia, e.pesoCarga, e.camionId) || '—') : '—';
            const camionLabel = camion ? `${camion.nombre}${camion.patente ? ' · ' + camion.patente : ''}` : null;

            return `<div class="viaje-card-v2 ${clase}" data-id="${e.id}" role="button" tabindex="0">

                <!-- Franja de estado -->
                <div class="vc2-estado-bar">
                    <span class="vc2-estado-badge ${clase}">${estadoLabel}</span>
                    <span class="vc2-id">#${String(e.id).padStart(4,'0')}</span>
                </div>

                <!-- Ruta principal -->
                <div class="vc2-ruta">
                    <div class="vc2-punto">
                        <span class="vc2-dot vc2-dot--ori"></span>
                        <span class="vc2-ciudad">${e.origen.split(',')[0]}</span>
                        <span class="vc2-provincia">${e.origen.split(',').slice(1).join(',').trim()}</span>
                    </div>
                    <div class="vc2-linea-ruta"></div>
                    <div class="vc2-punto">
                        <span class="vc2-dot vc2-dot--dest"></span>
                        <span class="vc2-ciudad">${e.destino.split(',')[0]}</span>
                        <span class="vc2-provincia">${e.destino.split(',').slice(1).join(',').trim()}</span>
                    </div>
                </div>

                <!-- Métricas clave -->
                <div class="vc2-metricas">
                    <div class="vc2-metrica">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="13" height="13"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                        <span class="vc2-metrica-val">${tiempo}</span>
                        <span class="vc2-metrica-lbl">Tiempo</span>
                    </div>
                    <div class="vc2-sep"></div>
                    <div class="vc2-metrica">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="13" height="13"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>
                        <span class="vc2-metrica-val">${dist}</span>
                        <span class="vc2-metrica-lbl">Distancia</span>
                    </div>
                    <div class="vc2-sep"></div>
                    <div class="vc2-metrica">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="13" height="13"><path d="M3 22V10l7-8 7 8v12"/><rect x="9" y="14" width="6" height="8"/></svg>
                        <span class="vc2-metrica-val">${fuel}</span>
                        <span class="vc2-metrica-lbl">Combustible</span>
                    </div>
                </div>

                <!-- Fila secundaria: camion + carga + remito -->
                <div class="vc2-tags">
                    ${camionLabel ? `<span class="vc2-tag vc2-tag--camion">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="11" height="11"><rect x="1" y="11" width="15" height="10" rx="1"/><path d="M16 11l4 3v7h-4V11z"/><circle cx="5.5" cy="21" r="1.5"/><circle cx="18.5" cy="21" r="1.5"/></svg>
                        ${camionLabel}
                    </span>` : ''}
                    <span class="vc2-tag vc2-tag--carga">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="11" height="11"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/></svg>
                        ${e.producto}${e.pesoCarga ? ' · ' + e.pesoCarga + ' tn' : ''}
                    </span>
                    ${e.remito ? `<span class="vc2-tag vc2-tag--remito">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="11" height="11"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
                        ${e.remito}
                    </span>` : ''}
                </div>

                <!-- Más info (colapsable) -->
                <div class="vc2-mas-info-wrap">
                    <button class="vc2-mas-info-toggle" data-id="${e.id}" onclick="event.stopPropagation()">
                        <svg class="vc2-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" width="13" height="13"><polyline points="6 9 12 15 18 9"/></svg>
                        Más info
                    </button>
                    <div class="vc2-mas-info hidden">
                        ${e.cliente ? `<div class="vc2-info-row"><span>Cliente</span><span>${e.cliente}</span></div>` : ''}
                        ${camion?.camionero ? `<div class="vc2-info-row"><span>Chofer</span><span>${camion.camionero}</span></div>` : ''}
                        ${e.pesoCarga ? `<div class="vc2-info-row"><span>Peso carga</span><span>${e.pesoCarga} tn</span></div>` : ''}
                        ${e.calles?.length ? `<div class="vc2-info-row"><span>Ruta por</span><span style="text-align:right;max-width:180px">${e.calles.slice(0,4).join(' → ')}${e.calles.length > 4 ? '…' : ''}</span></div>` : ''}
                        <div class="vc2-info-row"><span>Fecha</span><span>${e.fecha ? new Date(e.fecha).toLocaleDateString('es-AR') : '—'}</span></div>
                    </div>
                </div>

                <!-- Acciones flotantes -->
                <button class="btn-download" data-id="${e.id}" title="Descargar comprobante" onclick="event.stopPropagation()">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="15" height="15">
                        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                        <polyline points="7 10 12 15 17 10"/>
                        <line x1="12" y1="15" x2="12" y2="3"/>
                    </svg>
                </button>
            </div>`;
        }).join('');
    }

    function render() {
        actualizarKPIs();
        renderListaViajes();
        renderMapas();
        renderSelectCamiones();
    }

    // ═══════════════════════════════════════════════════════════
    // 9. EVENTOS Y AUTOCOMPLETADO
    // ═══════════════════════════════════════════════════════════
    function setupAutocompletado(inputId, listaId) {
        const input = document.getElementById(inputId);
        const lista = document.getElementById(listaId);
        if (!input || !lista) return;

        let delay = null;

        input.addEventListener('input', () => {
            clearTimeout(delay);
            const q = input.value.trim();
            if (q.length < 3) { lista.classList.remove('visible'); return; }

            delay = setTimeout(async () => {
                const sugs = await buscarSugerenciasFederales(q);
                if (sugs.length === 0) { lista.classList.remove('visible'); return; }

                lista.innerHTML = sugs.map(s => {
                    const badgeHtml = s.fuente ? `<span class="sug-badge ${s.fuente.includes('Google') ? 'sug-badge--google' : ''}">${s.fuente}</span>` : '';
                    const ratingHtml = (s.rating && s.rating > 0) ? `<span class="sug-rating">★ ${s.rating}${s.reviews ? ` (${s.reviews})` : ''}</span>` : '';
                    return `<li role="option" data-lat="${s.lat}" data-lon="${s.lon}" data-completo="${s.completo}">
                        <div class="sug-main-row">
                            <span class="sug-principal">${s.principal}</span>
                            ${badgeHtml}
                        </div>
                        <div class="sug-sub-row">
                            <span class="sug-secundario">${s.secundario}</span>
                            ${ratingHtml}
                        </div>
                    </li>`;
                }).join('');
                lista.classList.add('visible');
            }, 300);
        });

        lista.addEventListener('click', e => {
            const li = e.target.closest('li');
            if (!li) return;

            const completo = li.dataset.completo;
            const lat = parseFloat(li.dataset.lat);
            const lon = parseFloat(li.dataset.lon);

            input.value = completo;
            lista.classList.remove('visible');

            if (!isNaN(lat) && !isNaN(lon)) {
                cacheGeo[completo.toLowerCase().trim()] = [lat, lon];
                guardarGeoCache();
            }
        });

        document.addEventListener('click', e => {
            if (!input.contains(e.target) && !lista.contains(e.target)) {
                lista.classList.remove('visible');
            }
        });
    }

    function irATab(tabId) {
        document.querySelectorAll('.tab-pane').forEach(t => t.classList.remove('active'));
        document.getElementById(`tab-${tabId}`)?.classList.add('active');

        // Botones
        document.querySelectorAll('.sidebar-btn, .nav-btn').forEach(btn => {
            if (btn.dataset.tab === tabId) btn.classList.add('active');
            else btn.classList.remove('active');
        });

        // Forzar recalcular tamaño de mapas al verse
        if (tabId === 'mapa' && mapaFull) {
            setTimeout(() => mapaFull.invalidateSize(), 50);
        }
        if (tabId === 'nueva-ruta' && mapaInline) {
            setTimeout(() => mapaInline.invalidateSize(), 50);
        }
    }

    function cerrarModalCamion() {
        document.getElementById('modal-camion')?.classList.add('hidden');
        camionEditandoId = null;
    }

    // ─── SCORING DE CAMIONERO ─────────────────────────────────
    function calcularScore(camionero) {
        const h = camionero.historial || [];
        if (h.length === 0) return null;
        let puntos = 0;
        h.forEach(r => {
            if (r.ruta === 'si')      puntos += 40;
            else if (r.ruta === 'parcial') puntos += 20;
            if (r.puntualidad === 'puntual') puntos += 30;
            else if (r.puntualidad === 'leve') puntos += 15;
            if (r.bono === 'si')      puntos += 30;
        });
        return Math.round(puntos / h.length);
    }

    function scoreClass(score) {
        if (score === null) return 'amarillo';
        if (score >= 70) return 'verde';
        if (score >= 40) return 'amarillo';
        return 'rojo';
    }

    function carnetVtoClass(vto) {
        if (!vto) return '';
        const hoy = new Date();
        const vtoDate = new Date(vto);
        const diff = (vtoDate - hoy) / (1000*60*60*24);
        if (diff < 0)  return 'vto-exp';
        if (diff < 60) return 'vto-prox';
        return 'vto-ok';
    }

    function scoreRingHTML(score) {
        const pct = score !== null ? score : 0;
        const r = 20;
        const circ = 2 * Math.PI * r;
        const offset = circ - (pct / 100) * circ;
        const cls = scoreClass(score);
        return `<div class="score-ring">
            <svg width="48" height="48" viewBox="0 0 48 48">
                <circle class="score-ring-bg" cx="24" cy="24" r="${r}"/>
                <circle class="score-ring-fill ${cls}" cx="24" cy="24" r="${r}"
                    stroke-dasharray="${circ.toFixed(2)}"
                    stroke-dashoffset="${offset.toFixed(2)}"/>
            </svg>
            <div class="score-ring-label">${score !== null ? score + '%' : '—'}</div>
        </div>`;
    }

    // ─── RENDER LISTA CAMIONEROS ──────────────────────────────
    function renderListaCamioneros() {
        const c = document.getElementById('lista-camioneros');
        if (!c) return;

        if (camioneros.length === 0) {
            c.innerHTML = `<div class="empty-state"><p>No hay camioneros registrados. Agrega uno para llevar el control de conducta y bonos.</p></div>`;
            return;
        }

        c.innerHTML = camioneros.map(cnr => {
            const score = calcularScore(cnr);
            const cls = scoreClass(score);
            const vtoClass = carnetVtoClass(cnr.carnetVto);
            const vtoLabel = cnr.carnetVto
                ? (vtoClass === 'vto-exp' ? 'Carnet VENCIDO' : vtoClass === 'vto-prox' ? 'Vence pronto' : `Cat. ${cnr.carnetCat || '?'} ✓`)
                : (cnr.carnetCat ? `Cat. ${cnr.carnetCat}` : 'Sin carnet');
            const totalRegistros = (cnr.historial || []).length;
            const bonos = (cnr.historial || []).filter(h => h.bono === 'si').length;
            const camionAsig = cnr.camionAsignadoId ? camiones.find(c => c.id === cnr.camionAsignadoId) : null;
            const initials = cnr.nombre.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase();

            return `<div class="camionero-card" data-id="${cnr.id}" role="button" tabindex="0">
                <button class="camionero-card-delete" data-id="${cnr.id}" aria-label="Eliminar">&times;</button>
                <div class="camionero-card-header">
                    <div class="camionero-avatar">${initials}</div>
                    <div class="camionero-info">
                        <div class="camionero-nombre">${cnr.nombre}</div>
                        <div class="camionero-dni">${cnr.dni ? 'DNI ' + cnr.dni : (cnr.tel || 'Sin datos')}</div>
                    </div>
                    ${scoreRingHTML(score)}
                </div>
                <div class="camionero-meta">
                    ${cnr.carnetNum || cnr.carnetCat ? `<span class="cnr-badge cnr-badge--carnet ${vtoClass}">${vtoLabel}</span>` : ''}
                    ${(cnr.capacitaciones || []).length > 0 ? `<span class="cnr-badge cnr-badge--caps">${cnr.capacitaciones.length} capacitaciones</span>` : ''}
                    ${bonos > 0 ? `<span class="cnr-badge cnr-badge--bono">${bonos} bono${bonos > 1 ? 's' : ''}</span>` : ''}
                </div>
                <div class="camionero-card-footer">
                    <span>${camionAsig ? camionAsig.nombre + ' ' + (camionAsig.patente || '') : 'Sin camion asignado'}</span>
                    <span><span class="viajes-count">${totalRegistros}</span> registros</span>
                </div>
            </div>`;
        }).join('');
    }

    // ─── MODAL CAMIONERO: abrir/cerrar ────────────────────────
    function abrirModalCamionero(cnr) {
        capsTemp = cnr ? [...(cnr.capacitaciones || [])] : [];
        camioneroEditandoId = cnr ? cnr.id : null;

        const titulo = document.getElementById('modal-camionero-titulo');
        if (titulo) titulo.textContent = cnr ? 'Editar Camionero' : 'Nuevo Camionero';

        document.getElementById('cnr-id').value = cnr ? cnr.id : '';
        document.getElementById('cnr-nombre').value = cnr?.nombre || '';
        document.getElementById('cnr-dni').value = cnr?.dni || '';
        document.getElementById('cnr-tel').value = cnr?.tel || '';
        document.getElementById('cnr-ingreso').value = cnr?.ingreso || '';
        document.getElementById('cnr-carnet-num').value = cnr?.carnetNum || '';
        document.getElementById('cnr-carnet-cat').value = cnr?.carnetCat || '';
        document.getElementById('cnr-carnet-vto').value = cnr?.carnetVto || '';

        // Poblar select de camiones
        const selCam = document.getElementById('cnr-camion-asignado');
        if (selCam) {
            selCam.innerHTML = '<option value="">-- Sin asignar --</option>' +
                camiones.map(c => `<option value="${c.id}" ${c.id === cnr?.camionAsignadoId ? 'selected' : ''}>${c.nombre} ${c.patente ? '(' + c.patente + ')' : ''}</option>`).join('');
        }

        renderCapsTemp();
        document.getElementById('modal-camionero')?.classList.remove('hidden');
    }

    function cerrarModalCamionero() {
        document.getElementById('modal-camionero')?.classList.add('hidden');
        camioneroEditandoId = null;
        capsTemp = [];
    }

    function renderCapsTemp() {
        const lista = document.getElementById('cnr-caps-lista');
        if (!lista) return;
        if (capsTemp.length === 0) {
            lista.innerHTML = '<div style="font-size:0.78rem;color:var(--c-text-muted);padding:0.3rem 0">Sin capacitaciones agregadas aun.</div>';
            return;
        }
        lista.innerHTML = capsTemp.map((cap, i) => `
            <div class="cap-item">
                <span class="cap-item-nombre">${cap.nombre}</span>
                <span class="cap-item-fecha">${cap.fecha || ''}</span>
                <button type="button" class="cap-item-del" data-cap-idx="${i}">&times;</button>
            </div>
        `).join('');
    }

    // ─── MODAL COMPORTAMIENTO ─────────────────────────────────
    function abrirModalComportamiento(camioneroId) {
        document.getElementById('comp-camionero-id').value = camioneroId;
        document.getElementById('form-comportamiento')?.reset();
        document.getElementById('comp-camionero-id').value = camioneroId;
        // Fecha default = hoy
        document.getElementById('comp-fecha').value = new Date().toISOString().split('T')[0];
        document.getElementById('modal-comportamiento')?.classList.remove('hidden');
    }

    function cerrarModalComportamiento() {
        document.getElementById('modal-comportamiento')?.classList.add('hidden');
    }

    // ─── MODAL PERFIL CAMIONERO ───────────────────────────────
    function abrirPerfilCamionero(id) {
        const cnr = camioneros.find(c => c.id === id);
        if (!cnr) return;
        camioneroPerfilId = id;

        const score = calcularScore(cnr);
        const cls = scoreClass(score);
        const historial = [...(cnr.historial || [])].reverse();
        const bonos = (cnr.historial || []).filter(h => h.bono === 'si').length;
        const camionAsig = cnr.camionAsignadoId ? camiones.find(c => c.id === cnr.camionAsignadoId) : null;
        const initials = cnr.nombre.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase();

        const cont = document.getElementById('perfil-contenido');
        if (!cont) return;

        cont.innerHTML = `
            <!-- Score y Avatar -->
            <div class="perfil-score-bar">
                ${scoreRingHTML(score)}
                <div class="perfil-score-meta">
                    <span class="perfil-score-label">Score de cumplimiento</span>
                    <span class="perfil-score-desc">
                        ${score === null ? 'Sin registros aun' : score >= 70 ? 'Rendimiento excelente — candidato a bono' : score >= 40 ? 'Rendimiento regular — revisar' : 'Rendimiento bajo — requiere atencion'}
                    </span>
                </div>
                <span class="perfil-score-num ${cls}" style="margin-left:auto">${score !== null ? score + '%' : '—'}</span>
            </div>

            <!-- Datos Personales -->
            <div class="perfil-section-title">Datos Personales</div>
            <div class="perfil-grid">
                <span class="perfil-key">Nombre</span><span class="perfil-val">${cnr.nombre}</span>
                ${cnr.dni ? `<span class="perfil-key">DNI</span><span class="perfil-val">${cnr.dni}</span>` : ''}
                ${cnr.tel ? `<span class="perfil-key">Telefono</span><span class="perfil-val">${cnr.tel}</span>` : ''}
                ${cnr.ingreso ? `<span class="perfil-key">Ingreso</span><span class="perfil-val">${new Date(cnr.ingreso).toLocaleDateString('es-AR')}</span>` : ''}
                ${camionAsig ? `<span class="perfil-key">Camion</span><span class="perfil-val">${camionAsig.nombre} ${camionAsig.patente ? '(' + camionAsig.patente + ')' : ''}</span>` : ''}
            </div>

            <!-- Carnet -->
            ${cnr.carnetNum || cnr.carnetCat ? `
            <div class="perfil-section-title">Carnet Profesional</div>
            <div class="perfil-grid">
                ${cnr.carnetNum ? `<span class="perfil-key">N° Carnet</span><span class="perfil-val">${cnr.carnetNum}</span>` : ''}
                ${cnr.carnetCat ? `<span class="perfil-key">Categoria</span><span class="perfil-val">${cnr.carnetCat}</span>` : ''}
                ${cnr.carnetVto ? `<span class="perfil-key">Vencimiento</span><span class="perfil-val">${new Date(cnr.carnetVto).toLocaleDateString('es-AR')}</span>` : ''}
            </div>` : ''}

            <!-- Capacitaciones -->
            ${(cnr.capacitaciones || []).length > 0 ? `
            <div class="perfil-section-title">Capacitaciones</div>
            <div class="caps-lista" style="margin-bottom:0">
                ${cnr.capacitaciones.map(cap => `
                    <div class="cap-item">
                        <span class="cap-item-nombre">${cap.nombre}</span>
                        <span class="cap-item-fecha">${cap.fecha ? new Date(cap.fecha).toLocaleDateString('es-AR') : ''}</span>
                    </div>
                `).join('')}
            </div>` : ''}

            <!-- Historial -->
            <div class="perfil-section-title" style="margin-top:1.25rem">
                Historial de conduccion
                <span style="font-weight:400;color:var(--c-text-muted);margin-left:0.5rem">(${historial.length} registros · ${bonos} bono${bonos !== 1 ? 's' : ''})</span>
            </div>
            ${historial.length === 0
                ? '<p style="font-size:0.82rem;color:var(--c-text-muted);padding:0.5rem 0">Sin registros de comportamiento aun.</p>'
                : `<div class="historial-timeline">
                    ${historial.map((r, revIdx) => {
                        const realIdx = historial.length - 1 - revIdx;
                        const enClass = r.ruta === 'si' && r.puntualidad === 'puntual' ? 'ok' : r.ruta === 'no' || r.puntualidad === 'grave' ? 'bad' : 'warn';
                        return `<div class="historial-entry ${enClass}" data-idx="${realIdx}">
                            <div class="historial-entry-header">
                                <span class="historial-fecha">${r.fecha ? new Date(r.fecha).toLocaleDateString('es-AR') : '—'}</span>
                                <div class="historial-badges">
                                    <span class="hist-badge ruta-${r.ruta}">${r.ruta === 'si' ? 'Ruta OK' : r.ruta === 'no' ? 'No cumplió' : 'Parcial'}</span>
                                    <span class="hist-badge punt-${r.puntualidad === 'puntual' ? 'ok' : r.puntualidad === 'leve' ? 'leve' : 'grave'}">${r.puntualidad === 'puntual' ? 'Puntual' : r.puntualidad === 'leve' ? 'Tardanza leve' : 'Tardanza grave'}</span>
                                    <span class="hist-badge bono-${r.bono}">${r.bono === 'si' ? 'Bono ✓' : 'Sin bono'}</span>
                                </div>
                                <button class="historial-del" data-hist-idx="${realIdx}">Eliminar</button>
                            </div>
                            ${r.incidencias ? `<div class="historial-incidencia">${r.incidencias}</div>` : ''}
                            ${r.obs ? `<div style="font-size:0.78rem;color:var(--c-text-muted);margin-top:0.2rem">${r.obs}</div>` : ''}
                        </div>`;
                    }).join('')}
                </div>`
            }
        `;

        // Bind delete en historial
        cont.querySelectorAll('.historial-del').forEach(btn => {
            btn.addEventListener('click', e => {
                e.stopPropagation();
                const idx = parseInt(btn.dataset.histIdx);
                const c2 = camioneros.find(x => x.id === camioneroPerfilId);
                if (c2 && c2.historial) {
                    c2.historial.splice(idx, 1);
                    guardar();
                    renderListaCamioneros();
                    abrirPerfilCamionero(camioneroPerfilId);
                }
            });
        });

        document.getElementById('modal-perfil-camionero')?.classList.remove('hidden');
    }

    function cerrarPerfilCamionero() {
        document.getElementById('modal-perfil-camionero')?.classList.add('hidden');
        camioneroPerfilId = null;
    }

    // ─── SUB-TABS ─────────────────────────────────────────────
    function irASubTab(subtabId) {
        document.querySelectorAll('.subtab-pane').forEach(p => p.classList.remove('active'));
        document.getElementById(subtabId)?.classList.add('active');
        document.querySelectorAll('.subtab-btn').forEach(b => {
            b.classList.toggle('active', b.dataset.subtab === subtabId);
        });
    }

    function renderListaCamiones() {
        const c = document.getElementById('lista-camiones');
        if (!c) return;

        if (camiones.length === 0) {
            c.innerHTML = `<div class="empty-state">
                <p>No hay camiones registrados. Agrega uno para empezar a asignar rutas.</p>
            </div>`;
            return;
        }

        c.innerHTML = camiones.map(cam => `
            <div class="camion-card viaje-card pendiente" data-id="${cam.id}" role="button" tabindex="0">
                <div class="viaje-ruta">
                    <span>${cam.nombre}</span>
                    <span class="viaje-distancia" style="font-size:0.7rem;opacity:0.7;margin-left:auto">${cam.patente || ''}</span>
                </div>
                ${cam.camionero ? `<div class="viaje-meta"><span class="viaje-carga">Camionero: ${cam.camionero}</span></div>` : ''}
                <div class="viaje-meta">
                    <span class="viaje-carga">${cam.peso} tn</span>
                    <span class="viaje-distancia">${cam.largo}m x ${cam.ancho}m</span>
                </div>
                <div class="viaje-meta">
                    <span class="viaje-carga">Vacio: ${cam.consumoVacio} L/100km</span>
                    <span class="viaje-distancia">Cargado: ${cam.consumoLleno} L/100km</span>
                </div>
                <button class="camion-card-delete" data-id="${cam.id}" aria-label="Eliminar camion" style="position:absolute;top:8px;right:8px;background:none;border:none;color:var(--c-text-muted);cursor:pointer;font-size:1.1rem;">&times;</button>
            </div>
        `).join('');
    }

    function renderSelectCamiones() {
        const sel = document.getElementById('select-camion');
        if (!sel) return;
        const prev = sel.value;
        sel.innerHTML = '<option value="">-- Seleccionar camion --</option>' +
            camiones.map(c => `<option value="${c.id}">${c.nombre} ${c.patente ? '(' + c.patente + ')' : ''}</option>`).join('');
        if (prev && camiones.some(c => c.id === parseInt(prev))) sel.value = prev;
    }

    function renderSelectCamioneros() {
        // Actualiza el select de camionero dentro del modal de camion
        const sel = document.getElementById('cam-camionero-select');
        if (!sel) return;
        const prev = sel.value;
        sel.innerHTML = '<option value="">-- Sin camionero --</option>' +
            camioneros.map(c => `<option value="${c.id}">${c.nombre}${c.dni ? ' · DNI ' + c.dni : ''}</option>`).join('');
        if (prev && camioneros.some(c => c.id === parseInt(prev))) sel.value = prev;
    }

    // Modal Datos del Viaje
    function abrirModalViaje(envioExistente) {
        const m = document.getElementById('modal-viaje');
        if (!m) return;

        const vjSel = document.getElementById('vj-select-camion');
        if (vjSel) {
            vjSel.innerHTML = '<option value="">-- Seleccionar camion --</option>' +
                camiones.map(c => `<option value="${c.id}">${c.nombre} ${c.patente ? '(' + c.patente + ')' : ''}</option>`).join('');
            vjSel.value = envioExistente?.camionId || '';
        }

        if (envioExistente) {
            document.getElementById('vj-cliente').value = envioExistente.cliente || '';
            document.getElementById('vj-remito').value = envioExistente.remito || '';
        } else {
            document.getElementById('form-viaje')?.reset();
            if (vjSel) vjSel.value = '';
        }

        m.classList.remove('hidden');
    }

    function cerrarModalViaje() {
        document.getElementById('modal-viaje')?.classList.add('hidden');
        rutaPendiente = null;
    }

    // Modal Detalle Viaje
    function abrirDetalle(id) {
        const e = envios.find(x => x.id === id);
        if (!e) return;
        idEnvioDetalle = id;

        const cont = document.getElementById('detalle-contenido');
        if (cont) {
            cont.innerHTML = [
                ['Origen', e.origen],
                ['Destino', e.destino],
                ['Carga', e.producto],
                e.pesoCarga ? ['Peso', `${e.pesoCarga} tn`] : null,
                ['Distancia', formatoDistancia(e.distancia)],
                ['Tiempo estimado', formatoTiempo(e.tiempo)],
                e.distancia ? ['Consumo estimado', formatoFuel(e.distancia, e.pesoCarga, e.camionId)] : null,
                ['Estado', e.estado],
                e.camionId ? ['Camion', `${(camiones.find(c => c.id === e.camionId) || {}).nombre || 'N/A'} ${(camiones.find(c => c.id === e.camionId) || {}).patente ? '(' + (camiones.find(c => c.id === e.camionId)).patente + ')' : ''}`] : ['Camion', '<em style="opacity:0.5">Sin asignar</em> <button id="btn-detalle-asignar-camion" class="btn-link" style="margin-left:6px">Asignar</button>'],
                e.camionId && (camiones.find(c => c.id === e.camionId) || {}).camionero ? ['Camionero', (camiones.find(c => c.id === e.camionId)).camionero] : null,
                e.cliente ? ['Cliente', e.cliente] : null,
                e.remito ? ['N° Remito', e.remito] : null,
                e.calles?.length ? ['Ruta por', e.calles.join(' → ')] : null
            ].filter(Boolean).map(([k, v]) => 
                `<div class="detail-row">
                    <span class="detail-key">${k}</span>
                    <span class="detail-val">${v}</span>
                </div>`
            ).join('') + `<div style="text-align:center;margin-top:12px"><button id="btn-detalle-cambiar-camion" class="btn-link" style="font-size:0.85rem">Cambiar camion</button></div>`;
        }

        document.getElementById('modal-detalle')?.classList.remove('hidden');
    }

    function cerrarDetalle() {
        document.getElementById('modal-detalle')?.classList.add('hidden');
        idEnvioDetalle = null;
    }

    function iniciarEdicion(id) {
        const e = envios.find(x => x.id === id);
        if (!e) return;
        idEnvioEditando = id;
        cerrarDetalle();

        document.getElementById('origen').value = e.origen;
        document.getElementById('destino').value = e.destino;
        document.getElementById('producto').value = e.producto;
        document.getElementById('peso-carga').value = e.pesoCarga || '';
        document.getElementById('estado').value = e.estado;
        document.getElementById('select-camion').value = e.camionId || '';

        document.getElementById('form-titulo').textContent = `Editar Ruta #${String(id).padStart(4, '0')}`;
        document.getElementById('btn-submit-texto').textContent = 'Guardar Cambios';
        document.getElementById('btn-cancelar-edicion').classList.remove('hidden');

        irATab('nueva-ruta');
    }

    function cancelarEdicion() {
        idEnvioEditando = null;
        document.getElementById('form-envio')?.reset();
        document.getElementById('form-titulo').textContent = 'Nueva Ruta';
        document.getElementById('btn-submit-texto').textContent = 'Calcular Mejor Ruta';
        document.getElementById('btn-cancelar-edicion').classList.add('hidden');
        document.getElementById('resultado-ruta')?.classList.add('hidden');
        renderSelectCamiones();
    }

    // ═══════════════════════════════════════════════════════════
    // 10. BIND EVENT LISTENERS
    // ═══════════════════════════════════════════════════════════
    function bindEvents() {
        // Formulario de envío
        const formEnvio = document.getElementById('form-envio');
        formEnvio?.addEventListener('submit', async e => {
            e.preventDefault();
            const origen = document.getElementById('origen').value.trim();
            const destino = document.getElementById('destino').value.trim();
            const producto = document.getElementById('producto').value.trim();
            const pesoCarga = parseFloat(document.getElementById('peso-carga').value) || null;
            const estado = document.getElementById('estado').value;
            const camionId = parseInt(document.getElementById('select-camion').value) || null;

            if (!origen || !destino || !producto) {
                showToast('Completa origen, destino y carga.', 'error');
                return;
            }
            if (!camionId) {
                showToast('Selecciona un camion para la ruta.', 'error');
                return;
            }

            const btnText = document.getElementById('btn-submit-texto');
            const loader = document.getElementById('btn-submit-loader');
            const btn = document.getElementById('btn-submit-envio');

            btn.disabled = true;
            btnText.classList.add('hidden');
            loader.classList.remove('hidden');

            try {
                const dataRuta = await resolverRuta(origen, destino, camionId);

                // Actualizar panel de resultados
                const resPanel = document.getElementById('resultado-ruta');
                if (resPanel) {
                    document.getElementById('res-distancia').textContent = formatoDistancia(dataRuta.distancia);
                    document.getElementById('res-tiempo').textContent = formatoTiempo(dataRuta.tiempo);
                    document.getElementById('res-fuel').textContent = formatoFuel(dataRuta.distancia, pesoCarga, camionId) || '--';
                    const adv = document.getElementById('res-advertencias');
                    if (dataRuta.warnings.length > 0) {
                        adv.textContent = dataRuta.warnings.join(' · ');
                        adv.classList.remove('hidden');
                    } else {
                        adv.classList.add('hidden');
                    }
                    resPanel.classList.remove('hidden');
                }

                if (idEnvioEditando === null) {
                    rutaPendiente = {
                        origen, destino, producto, pesoCarga, estado, camionId,
                        ...dataRuta,
                        fecha: new Date().toISOString()
                    };
                    abrirModalViaje(null);
                } else {
                    const idx = envios.findIndex(x => x.id === idEnvioEditando);
                    if (idx !== -1) {
                        envios[idx] = { ...envios[idx], origen, destino, producto, pesoCarga, estado, camionId, ...dataRuta };
                        abrirModalViaje(envios[idx]);
                    }
                }

            } catch (err) {
                showToast(err.message || 'Error al calcular la ruta.', 'error');
            } finally {
                btn.disabled = false;
                btnText.classList.remove('hidden');
                loader.classList.add('hidden');
            }
        });

        document.getElementById('btn-cancelar-edicion')?.addEventListener('click', cancelarEdicion);
        document.getElementById('btn-ver-mapa-resultado')?.addEventListener('click', () => irATab('mapa'));

        // Modal SerpApi Google Maps Engine Config
        const modalSerpApi = document.getElementById('modal-serpapi');
        const inputSerpKey = document.getElementById('input-serpapi-key');

        document.getElementById('btn-open-serpapi-modal')?.addEventListener('click', () => {
            if (inputSerpKey) inputSerpKey.value = obtenerSerpApiKey();
            modalSerpApi?.classList.remove('hidden');
        });
        document.getElementById('btn-cerrar-modal-serpapi')?.addEventListener('click', () => {
            modalSerpApi?.classList.add('hidden');
        });
        document.getElementById('btn-guardar-serpapi-key')?.addEventListener('click', () => {
            const key = inputSerpKey?.value || '';
            guardarSerpApiKey(key);
            showToast(key ? 'API Key de SerpApi guardada.' : 'API Key eliminada.', key ? 'success' : 'info');
            modalSerpApi?.classList.add('hidden');
        });
        document.getElementById('btn-borrar-serpapi-key')?.addEventListener('click', () => {
            guardarSerpApiKey('');
            if (inputSerpKey) inputSerpKey.value = '';
            showToast('API Key de SerpApi eliminada.', 'info');
            modalSerpApi?.classList.add('hidden');
        });

        // Botones POI (Estaciones de Servicio y Paradores/Comidas)
        document.getElementById('btn-poi-combustible')?.addEventListener('click', () => togglePOIMapa('gasolina'));
        document.getElementById('btn-poi-comida')?.addEventListener('click', () => togglePOIMapa('comida'));

        // Tab triggers (Bottom Nav & Sidebar)
        document.querySelectorAll('.nav-btn, .sidebar-btn').forEach(btn => {
            btn.addEventListener('click', () => irATab(btn.dataset.tab));
        });

        // Sub-tabs Camiones / Camioneros
        document.querySelectorAll('.subtab-btn').forEach(btn => {
            btn.addEventListener('click', () => irASubTab(btn.dataset.subtab));
        });

        // Modal Camiones
        document.getElementById('btn-nuevo-camion')?.addEventListener('click', () => {
            camionEditandoId = null;
            document.getElementById('modal-camion-titulo').textContent = 'Nuevo Camion';
            document.getElementById('form-camion')?.reset();
            document.getElementById('cam-id').value = '';
            renderSelectCamioneros();
            document.getElementById('modal-camion')?.classList.remove('hidden');
        });
        document.getElementById('btn-cerrar-camion')?.addEventListener('click', cerrarModalCamion);
        document.getElementById('btn-cancelar-camion')?.addEventListener('click', cerrarModalCamion);

        // Lista de camiones (click en card para editar)
        document.getElementById('lista-camiones')?.addEventListener('click', e => {
            const card = e.target.closest('.camion-card');
            if (!card) return;
            const id = Number(card.dataset.id);
            const btnDel = e.target.closest('.camion-card-delete');
            if (btnDel) {
                camiones = camiones.filter(c => c.id !== id);
                guardar();
                renderListaCamiones();
                renderSelectCamiones();
                showToast('Camion eliminado.', 'info');
                return;
            }
            const camion = camiones.find(c => c.id === id);
            if (!camion) return;
            camionEditandoId = id;
            document.getElementById('modal-camion-titulo').textContent = 'Editar Camion';
            document.getElementById('cam-id').value = id;
            document.getElementById('cam-nombre').value = camion.nombre;
            document.getElementById('cam-patente').value = camion.patente || '';
            renderSelectCamioneros();
            const selCnr = document.getElementById('cam-camionero-select');
            if (selCnr) selCnr.value = camion.camioneroId || '';
            document.getElementById('cam-peso').value = camion.peso;
            document.getElementById('cam-alto').value = camion.alto;
            document.getElementById('cam-largo').value = camion.largo;
            document.getElementById('cam-ancho').value = camion.ancho;
            document.getElementById('cam-cons-vacio').value = camion.consumoVacio;
            document.getElementById('cam-cons-cargado').value = camion.consumoLleno;
            document.getElementById('modal-camion')?.classList.remove('hidden');
        });

        // ─── CAMIONEROS ───────────────────────────────────────
        document.getElementById('btn-nuevo-camionero')?.addEventListener('click', () => abrirModalCamionero(null));
        document.getElementById('btn-cerrar-camionero')?.addEventListener('click', cerrarModalCamionero);
        document.getElementById('btn-cancelar-camionero')?.addEventListener('click', cerrarModalCamionero);

        // Agregar capacitacion temporal
        document.getElementById('btn-agregar-cap')?.addEventListener('click', () => {
            const nombre = document.getElementById('cnr-cap-nombre').value.trim();
            const fecha  = document.getElementById('cnr-cap-fecha').value;
            if (!nombre) { showToast('Escribe el nombre del curso.', 'error'); return; }
            capsTemp.push({ nombre, fecha });
            document.getElementById('cnr-cap-nombre').value = '';
            document.getElementById('cnr-cap-fecha').value = '';
            renderCapsTemp();
        });

        // Eliminar cap temporal
        document.getElementById('cnr-caps-lista')?.addEventListener('click', e => {
            const btn = e.target.closest('.cap-item-del');
            if (!btn) return;
            capsTemp.splice(parseInt(btn.dataset.capIdx), 1);
            renderCapsTemp();
        });

        // Guardar camionero
        document.getElementById('form-camionero')?.addEventListener('submit', e => {
            e.preventDefault();
            const nombre = document.getElementById('cnr-nombre').value.trim();
            if (!nombre) { showToast('El nombre es obligatorio.', 'error'); return; }

            const datos = {
                nombre,
                dni:            document.getElementById('cnr-dni').value.trim(),
                tel:            document.getElementById('cnr-tel').value.trim(),
                ingreso:        document.getElementById('cnr-ingreso').value,
                carnetNum:      document.getElementById('cnr-carnet-num').value.trim(),
                carnetCat:      document.getElementById('cnr-carnet-cat').value,
                carnetVto:      document.getElementById('cnr-carnet-vto').value,
                camionAsignadoId: parseInt(document.getElementById('cnr-camion-asignado').value) || null,
                capacitaciones: [...capsTemp]
            };

            const idStr = document.getElementById('cnr-id').value;
            if (idStr) {
                const idx = camioneros.findIndex(c => c.id === parseInt(idStr));
                if (idx !== -1) camioneros[idx] = { ...camioneros[idx], ...datos };
                showToast('Camionero actualizado.', 'success');
            } else {
                camioneros.push({ id: contadorCamioneros++, historial: [], ...datos });
                showToast('Camionero registrado.', 'success');
            }

            cerrarModalCamionero();
            guardar();
            renderListaCamioneros();
        });

        // Click en card de camionero
        document.getElementById('lista-camioneros')?.addEventListener('click', e => {
            const delBtn = e.target.closest('.camionero-card-delete');
            if (delBtn) {
                const id = Number(delBtn.dataset.id);
                camioneros = camioneros.filter(c => c.id !== id);
                guardar();
                renderListaCamioneros();
                showToast('Camionero eliminado.', 'info');
                return;
            }
            const card = e.target.closest('.camionero-card');
            if (card) abrirPerfilCamionero(Number(card.dataset.id));
        });

        // Perfil camionero — botones
        document.getElementById('btn-cerrar-perfil')?.addEventListener('click', cerrarPerfilCamionero);
        document.getElementById('btn-perfil-nuevo-registro')?.addEventListener('click', () => {
            if (camioneroPerfilId === null) return;
            cerrarPerfilCamionero();
            abrirModalComportamiento(camioneroPerfilId);
        });
        document.getElementById('btn-perfil-editar')?.addEventListener('click', () => {
            if (camioneroPerfilId === null) return;
            const cnr = camioneros.find(c => c.id === camioneroPerfilId);
            cerrarPerfilCamionero();
            abrirModalCamionero(cnr);
        });

        // Modal comportamiento
        document.getElementById('btn-cerrar-comportamiento')?.addEventListener('click', cerrarModalComportamiento);
        document.getElementById('btn-cancelar-comportamiento')?.addEventListener('click', cerrarModalComportamiento);
        document.getElementById('form-comportamiento')?.addEventListener('submit', e => {
            e.preventDefault();
            const cnrId = parseInt(document.getElementById('comp-camionero-id').value);
            const cnr = camioneros.find(c => c.id === cnrId);
            if (!cnr) return;

            const registro = {
                fecha:        document.getElementById('comp-fecha').value,
                ruta:         document.getElementById('comp-ruta').value,
                puntualidad:  document.getElementById('comp-puntualidad').value,
                incidencias:  document.getElementById('comp-incidencias').value.trim(),
                bono:         document.getElementById('comp-bono').value,
                obs:          document.getElementById('comp-obs').value.trim()
            };

            if (!cnr.historial) cnr.historial = [];
            cnr.historial.push(registro);
            guardar();
            renderListaCamioneros();
            cerrarModalComportamiento();
            showToast('Registro guardado.', 'success');
        });

        // Modal Datos del Viaje
        document.getElementById('btn-cerrar-viaje')?.addEventListener('click', cerrarModalViaje);
        document.getElementById('btn-cancelar-viaje')?.addEventListener('click', cerrarModalViaje);

        document.getElementById('form-viaje')?.addEventListener('submit', e => {
            e.preventDefault();
            const cliente = document.getElementById('vj-cliente').value.trim();
            const remito = document.getElementById('vj-remito').value.trim();
            const camionId = parseInt(document.getElementById('vj-select-camion')?.value) || null;

            if (!cliente || !remito) {
                showToast('Completá cliente y remito.', 'error');
                return;
            }

            const datosExtra = { cliente, remito, camionId };

            if (idEnvioEditando !== null) {
                const idx = envios.findIndex(x => x.id === idEnvioEditando);
                if (idx !== -1) {
                    envios[idx] = { ...envios[idx], ...datosExtra };
                }
                showToast('Datos del viaje actualizados.', 'success');
                cancelarEdicion();
            } else if (rutaPendiente) {
                const nuevo = { id: contadorId++, ...rutaPendiente, ...datosExtra };
                envios.push(nuevo);
                showToast('Viaje guardado con éxito.', 'success');
                document.getElementById('form-envio')?.reset();
                rutaPendiente = null;
            }

            cerrarModalViaje();
            guardar();
            render();
        });

        document.getElementById('form-camion')?.addEventListener('submit', e => {
            e.preventDefault();
            const id = document.getElementById('cam-id').value;
            const nombre = document.getElementById('cam-nombre').value.trim();
            const patente = document.getElementById('cam-patente').value.trim().toUpperCase();
            const getN = fid => parseFloat(document.getElementById(fid)?.value) || 0;
            const camioneroId = parseInt(document.getElementById('cam-camionero-select')?.value) || null;
            // Derivar nombre de camionero para retrocompatibilidad de display
            const camioneroNombre = camioneroId ? (camioneros.find(c => c.id === camioneroId)?.nombre || '') : '';

            if (!nombre) {
                showToast('Ponle un nombre al camion.', 'error');
                return;
            }

            const datos = {
                nombre,
                patente,
                camionero:    camioneroNombre,
                camioneroId,
                peso:         getN('cam-peso') || 20,
                alto:         getN('cam-alto') || 4.0,
                largo:        getN('cam-largo') || 18,
                ancho:        getN('cam-ancho') || 2.5,
                consumoVacio: getN('cam-cons-vacio') || 25,
                consumoLleno: getN('cam-cons-cargado') || 38
            };

            if (id) {
                const idx = camiones.findIndex(c => c.id === parseInt(id));
                if (idx !== -1) camiones[idx] = { ...camiones[idx], ...datos };
                showToast('Camion actualizado.', 'success');
            } else {
                camiones.push({ id: contadorCamiones++, ...datos });
                showToast('Camion registrado.', 'success');
            }

            cerrarModalCamion();
            guardar();
            renderListaCamiones();
            renderSelectCamiones();
        });

        // Detalle de viaje
        document.getElementById('lista-viajes')?.addEventListener('click', e => {
            const dlBtn = e.target.closest('.btn-download');
            if (dlBtn) {
                e.stopPropagation();
                generarComprobante(Number(dlBtn.dataset.id));
                return;
            }
            const card = e.target.closest('.viaje-card');
            if (card) abrirDetalle(Number(card.dataset.id));
        });

        document.getElementById('btn-cerrar-detalle')?.addEventListener('click', cerrarDetalle);
        document.getElementById('btn-detalle-ver-mapa')?.addEventListener('click', () => {
            if (idEnvioDetalle !== null) {
                const id = idEnvioDetalle;
                cerrarDetalle();
                enfocarRutaEspecifica(id);
            }
        });

        document.getElementById('btn-detalle-estado')?.addEventListener('click', () => {
            if (idEnvioDetalle === null) return;
            const x = envios.find(item => item.id === idEnvioDetalle);
            if (!x) return;
            const estados = ['Pendiente', 'En Transito', 'Entregado'];
            x.estado = estados[(estados.indexOf(x.estado) + 1) % estados.length];
            guardar();
            render();
            cerrarDetalle();
            showToast(`Estado cambiado a ${x.estado}.`, 'info');
        });

        document.getElementById('btn-detalle-editar')?.addEventListener('click', () => {
            if (idEnvioDetalle !== null) iniciarEdicion(idEnvioDetalle);
        });

        document.getElementById('btn-detalle-eliminar')?.addEventListener('click', () => {
            if (idEnvioDetalle === null) return;
            envios = envios.filter(x => x.id !== idEnvioDetalle);
            guardar();
            render();
            cerrarDetalle();
            showToast('Ruta eliminada.', 'warning');
        });

        document.getElementById('detalle-contenido')?.addEventListener('click', e => {
            if (e.target.id === 'btn-detalle-cambiar-camion' || e.target.id === 'btn-detalle-asignar-camion') {
                if (idEnvioDetalle === null) return;
                const envio = envios.find(x => x.id === idEnvioDetalle);
                if (!envio) return;
                e.target.outerHTML = `<select id="vj-cambiar-camion-inline" class="field-input" style="margin-top:4px;font-size:0.85rem">
                    ${camiones.map(c => `<option value="${c.id}" ${c.id === envio.camionId ? 'selected' : ''}>${c.nombre} ${c.patente ? '(' + c.patente + ')' : ''}</option>`).join('')}
                </select>`;
                const sel = document.getElementById('vj-cambiar-camion-inline');
                sel?.focus();
                const aplicar = () => {
                    const nuevoId = parseInt(sel.value);
                    if (nuevoId && nuevoId !== envio.camionId) {
                        envio.camionId = nuevoId;
                        guardar();
                        render();
                        showToast(`Camion cambiado a ${(camiones.find(c => c.id === nuevoId) || {}).nombre}.`, 'success');
                    }
                    abrirDetalle(idEnvioDetalle);
                };
                sel?.addEventListener('change', aplicar);
                sel?.addEventListener('blur', () => { setTimeout(() => { if (document.getElementById('vj-cambiar-camion-inline')) abrirDetalle(idEnvioDetalle); }, 150); });
            }
        });

        // Filtro & Búsqueda
        document.getElementById('filtro-buscar')?.addEventListener('input', e => {
            filtroBuscar = e.target.value;
            renderListaViajes();
        });

        document.querySelectorAll('.filter-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                filtroEstado = btn.dataset.estado;
                renderListaViajes();
            });
        });

        // Overlays cerrar modales al hacer click afuera
        document.querySelectorAll('.modal-overlay').forEach(overlay => {
            overlay.addEventListener('click', e => {
                if (e.target === overlay) {
                    cerrarModalCamion();
                    cerrarDetalle();
                    cerrarModalViaje();
                    cerrarModalCamionero();
                    cerrarModalComportamiento();
                    cerrarPerfilCamionero();
                }
            });
        });
    }

    // ═══════════════════════════════════════════════════════════
    // 11. UTILS GENERALES
    // ═══════════════════════════════════════════════════════════
    function haversine(c1, c2) {
        const R = 6371;
        const dLat = (c2[0] - c1[0]) * Math.PI / 180;
        const dLon = (c2[1] - c1[1]) * Math.PI / 180;
        const a = Math.sin(dLat/2)**2 + Math.cos(c1[0]*Math.PI/180) * Math.cos(c2[0]*Math.PI/180) * Math.sin(dLon/2)**2;
        return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    }

    function decodificarPolyline(encoded) {
        const coords = [];
        let index = 0, lat = 0, lng = 0;
        while (index < encoded.length) {
            let b, shift = 0, result = 0;
            do {
                b = encoded.charCodeAt(index++) - 63;
                result |= (b & 0x1f) << shift;
                shift += 5;
            } while (b >= 0x20);
            lat += (result & 1) ? ~(result >> 1) : (result >> 1);

            shift = 0; result = 0;
            do {
                b = encoded.charCodeAt(index++) - 63;
                result |= (b & 0x1f) << shift;
                shift += 5;
            } while (b >= 0x20);
            lng += (result & 1) ? ~(result >> 1) : (result >> 1);

            coords.push([lat / 1e5, lng / 1e5]);
        }
        return coords;
    }

    function formatoDistancia(km) {
        if (!km || isNaN(km)) return '—';
        return km >= 1000 ? `${(km/1000).toFixed(1).replace('.', ',')} mil km` : `${Math.round(km)} km`;
    }

    function formatoTiempo(h) {
        if (!h || isNaN(h)) return '—';
        if (h < 1) return `${Math.round(h * 60)} min`;
        const hh = Math.floor(h);
        const mm = Math.round((h - hh) * 60);
        return mm > 0 ? `${hh}h ${mm}min` : `${hh}h`;
    }

    function formatoFuel(km, pesoCarga = 0, camionId = null) {
        const camion = camionId ? camiones.find(c => c.id === camionId) : camiones[0];
        if (!camion || !km || !camion.consumoVacio || !camion.consumoLleno) return null;
        
        const capMax = camion.peso || 1;
        const cargaRatio = Math.min(1, Math.max(0, (pesoCarga || 0) / capMax));
        
        const consumoPor100km = camion.consumoVacio + (camion.consumoLleno - camion.consumoVacio) * cargaRatio;
        
        const litros = Math.round(km * consumoPor100km / 100);
        return `${litros} L`;
    }

    function showToast(msg, tipo = 'info') {
        const cont = document.getElementById('toast-container');
        if (!cont) return;
        const t = document.createElement('div');
        t.className = `toast ${tipo}`;
        t.textContent = msg;
        cont.appendChild(t);
        setTimeout(() => {
            t.style.opacity = '0';
            t.style.transform = 'translateX(20px)';
            t.style.transition = 'all 0.25s ease';
            setTimeout(() => t.remove(), 250);
        }, 3500);
    }

    function generarComprobante(id) {
        const e = envios.find(x => x.id === id);
        if (!e) return;
        const camion = e.camionId ? camiones.find(c => c.id === e.camionId) : null;
        const now = new Date();
        const fecha = now.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' });
        const hora = now.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });

        const html = `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<title>Comprobante Ruta #${String(e.id).padStart(4,'0')}</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: 'Segoe UI', Arial, sans-serif; background: #f8fafc; color: #1e293b; padding: 2rem; }
  .comprobante { max-width: 700px; margin: 0 auto; background: #fff; border-radius: 12px; box-shadow: 0 2px 16px rgba(0,0,0,0.08); overflow: hidden; }
  .header { background: #0f172a; color: #fff; padding: 1.5rem 2rem; display: flex; justify-content: space-between; align-items: center; }
  .header h1 { font-size: 1.3rem; font-weight: 700; }
  .header .fecha { font-size: 0.85rem; opacity: 0.8; }
  .body { padding: 1.5rem 2rem; }
  .row { display: flex; padding: 0.6rem 0; border-bottom: 1px solid #e2e8f0; }
  .row:last-child { border-bottom: none; }
  .key { width: 140px; font-size: 0.8rem; font-weight: 600; color: #64748b; text-transform: uppercase; letter-spacing: 0.03em; padding-top: 2px; }
  .val { flex: 1; font-size: 0.95rem; color: #1e293b; }
  .section { font-size: 0.85rem; font-weight: 700; color: #3b82f6; text-transform: uppercase; letter-spacing: 0.05em; padding: 1rem 0 0.3rem; border-bottom: 2px solid #3b82f6; margin-top: 0.5rem; }
  .estado { display: inline-block; padding: 3px 12px; border-radius: 999px; font-size: 0.8rem; font-weight: 600; }
  .estado.pendiente { background: #fef3c7; color: #92400e; }
  .estado.transito { background: #dbeafe; color: #1e40af; }
  .estado.entregado { background: #d1fae5; color: #065f46; }
  .rutas { background: #f1f5f9; border-radius: 8px; padding: 1rem; margin-top: 0.5rem; font-size: 0.85rem; line-height: 1.6; color: #475569; }
  .footer { text-align: center; padding: 1rem 2rem; background: #f8fafc; font-size: 0.75rem; color: #94a3b8; border-top: 1px solid #e2e8f0; }
  @media print { body { padding: 0; background: #fff; } .comprobante { box-shadow: none; border-radius: 0; } }
</style>
</head>
<body>
<div class="comprobante">
  <div class="header">
    <h1>Comprobante Ruta #${String(e.id).padStart(4,'0')}</h1>
    <div class="fecha">${fecha} ${hora}</div>
  </div>
  <div class="body">
    <div class="section">Datos del viaje</div>
    <div class="row"><div class="key">Origen</div><div class="val">${e.origen}</div></div>
    <div class="row"><div class="key">Destino</div><div class="val">${e.destino}</div></div>
    <div class="row"><div class="key">Carga</div><div class="val">${e.producto || '—'}</div></div>
    ${e.pesoCarga ? `<div class="row"><div class="key">Peso</div><div class="val">${e.pesoCarga} tn</div></div>` : ''}
    <div class="row"><div class="key">Distancia</div><div class="val">${formatoDistancia(e.distancia)}</div></div>
    <div class="row"><div class="key">Tiempo est.</div><div class="val">${formatoTiempo(e.tiempo)}</div></div>
    <div class="row"><div class="key">Estado</div><div class="val"><span class="estado ${e.estado === 'Pendiente' ? 'pendiente' : e.estado === 'En Transito' ? 'transito' : 'entregado'}">${e.estado}</span></div></div>

    ${camion ? `<div class="section">Camion asignado</div>
    <div class="row"><div class="key">Nombre</div><div class="val">${camion.nombre}</div></div>
    ${camion.patente ? `<div class="row"><div class="key">Patente</div><div class="val">${camion.patente}</div></div>` : ''}
    ${camion.camionero ? `<div class="row"><div class="key">Camionero</div><div class="val">${camion.camionero}</div></div>` : ''}` : ''}

    ${e.cliente || e.remito ? `<div class="section">Cliente</div>
    ${e.cliente ? `<div class="row"><div class="key">Cliente</div><div class="val">${e.cliente}</div></div>` : ''}
    ${e.remito ? `<div class="row"><div class="key">Remito</div><div class="val">${e.remito}</div></div>` : ''}` : ''}

    ${e.calles?.length ? `<div class="section">Ruta</div><div class="rutas">${e.calles.join(' → ')}</div>` : ''}
  </div>
  <div class="footer">Generado por TerMate — ${fecha} ${hora}</div>
</div>
</body>
</html>`;

        const win = window.open('', '_blank');
        if (win) {
            win.document.write(html);
            win.document.close();
        }
    }

    // ═══════════════════════════════════════════════════════════
    // 12. INICIALIZACIÓN
    // ═══════════════════════════════════════════════════════════
    function init() {
        cargarDatos();
        actualizarConexion();
        initMapas();
        setupAutocompletado('origen', 'sugerencias-origen');
        setupAutocompletado('destino', 'sugerencias-destino');
        bindEvents();
        renderListaCamiones();
        renderListaCamioneros();
        render();

        if (camiones.length === 0) irATab('camiones');
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

})();
