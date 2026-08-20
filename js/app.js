/**
 * TerMate — Sistema de Gestion de Rutas y Transporte de Cargas
 * Version 3.0 — Rediseño Limpio, Arquitectura Mobile-First, Cero Emojis
 */
(function () {
    'use strict';

    // ═══════════════════════════════════════════════════════════
    // 1. ESTADO GLOBAL
    // ═══════════════════════════════════════════════════════════
    let envios = [];
    let contadorId = 1;
    
    // Instancias de Mapas
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

    // Choferes registrados
    let camioneros = [];
    let contadorCamioneros = 1;
    let camioneroEditandoId = null;
    let camioneroPerfilId = null;
    let capsTemp = [];

    const KEY_GEO_CACHE    = 'termate_geo_cache';
    const KEY_ENVIOS       = 'termate_envios';
    const KEY_CONTADOR     = 'termate_contador';
    const KEY_CAMIONES     = 'termate_camiones';
    const KEY_CONT_CAM     = 'termate_cont_camiones';
    const KEY_CAMIONEROS   = 'termate_camioneros';
    const KEY_CONT_CNR     = 'termate_cont_camioneros';
    const cacheGeo = JSON.parse(localStorage.getItem(KEY_GEO_CACHE) || '{}');

    // ═══════════════════════════════════════════════════════════
    // 2. REGISTRO SERVICE WORKER (PWA)
    // ═══════════════════════════════════════════════════════════
    if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
        navigator.serviceWorker.register('./sw.js')
            .catch(err => console.warn('[SW] Registro omitido:', err));
    }

    // ═══════════════════════════════════════════════════════════
    // 3. INDICADOR DE CONEXION
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
        showToast('Conexion reestablecida.', 'success');
    });
    window.addEventListener('offline', () => {
        actualizarConexion();
        showToast('Modo sin conexion activo.', 'warning');
    });

    // ═══════════════════════════════════════════════════════════
    // 4. PERSISTENCIA EN LOCALSTORAGE
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
            showToast('Almacenamiento lleno. Elimina registros antiguos.', 'error');
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

            // Cargar datos por defecto iniciales si esta completamente vacio
            if (camiones.length === 0) {
                camiones = [
                    { id: 1, nombre: 'Scania R450 - Unidad 01', patente: 'AF 452 BC', camionero: 'Carlos Mendez', camioneroId: 1, peso: 28, alto: 4.1, largo: 18.5, ancho: 2.6, consumoVacio: 24, consumoLleno: 36 },
                    { id: 2, nombre: 'Mercedes-Benz Actros 2645', patente: 'AE 789 OP', camionero: 'Martin Rodriguez', camioneroId: 2, peso: 30, alto: 4.0, largo: 19.0, ancho: 2.6, consumoVacio: 25, consumoLleno: 38 }
                ];
                contadorCamiones = 3;
            }
            if (camioneros.length === 0) {
                camioneros = [
                    { id: 1, nombre: 'Carlos Mendez', dni: '32.145.890', tel: '011-15-5544-3322', ingreso: '2023-03-15', carnetNum: '4589012', carnetCat: 'E', carnetVto: '2027-08-20', camionAsignadoId: 1, capacitaciones: [{ nombre: 'Cargas Peligrosas', fecha: '2024-02-10' }], historial: [{ fecha: '2026-08-10', ruta: 'si', puntualidad: 'puntual', incidencias: '', bono: 'si', obs: 'Excelente viaje' }] },
                    { id: 2, nombre: 'Martin Rodriguez', dni: '35.478.120', tel: '0341-15-6677-8899', ingreso: '2024-01-10', carnetNum: '5120340', carnetCat: 'E', carnetVto: '2028-01-15', camionAsignadoId: 2, capacitaciones: [{ nombre: 'Manejo Defensivo', fecha: '2024-05-12' }], historial: [] }
                ];
                contadorCamioneros = 3;
            }
        } catch (err) {
            console.error('[Storage] Error al cargar:', err);
        }
    }

    // ═══════════════════════════════════════════════════════════
    // 5. GEOCODIFICACION Y AUTOCOMPLETADO FEDERAL
    // ═══════════════════════════════════════════════════════════
    const DATASET_LOCALIDADES_ARGENTINA = [
        { nombre: 'Buenos Aires, CABA', lat: -34.6037, lon: -58.3816 },
        { nombre: 'Rosario, Santa Fe', lat: -32.9468, lon: -60.6393 },
        { nombre: 'Cordoba Capital, Cordoba', lat: -31.4201, lon: -64.1888 },
        { nombre: 'Mendoza Capital, Mendoza', lat: -32.8895, lon: -68.8458 },
        { nombre: 'San Miguel de Tucuman, Tucuman', lat: -26.8083, lon: -65.2176 },
        { nombre: 'Mar del Plata, Buenos Aires', lat: -38.0055, lon: -57.5562 },
        { nombre: 'Salta Capital, Salta', lat: -24.7821, lon: -65.4232 },
        { nombre: 'Santa Fe Capital, Santa Fe', lat: -31.6333, lon: -60.7000 },
        { nombre: 'Neuquen Capital, Neuquen', lat: -38.9516, lon: -68.0591 },
        { nombre: 'Bahia Blanca, Buenos Aires', lat: -38.7196, lon: -62.2724 },
        { nombre: 'Resistencia, Chaco', lat: -27.4514, lon: -58.9866 },
        { nombre: 'Posadas, Misiones', lat: -27.3621, lon: -55.8961 },
        { nombre: 'San Juan Capital, San Juan', lat: -31.5375, lon: -68.5364 },
        { nombre: 'San Luis Capital, San Luis', lat: -33.3017, lon: -66.3378 },
        { nombre: 'Parana, Entre Rios', lat: -31.7333, lon: -60.5333 }
    ];

    async function buscarSugerenciasFederales(query) {
        if (!query || query.length < 2) return [];

        if (navigator.onLine) {
            try {
                const params = new URLSearchParams({
                    q: query,
                    format: 'json',
                    limit: 5,
                    countrycodes: 'ar',
                    addressdetails: 1
                });
                const res = await fetch(`https://nominatim.openstreetmap.org/search?${params}`, {
                    headers: { 'User-Agent': 'TerMateLogistics/3.0' },
                    signal: AbortSignal.timeout(3500)
                });
                if (res.ok) {
                    const data = await res.json();
                    if (Array.isArray(data) && data.length > 0) {
                        return data.map(item => {
                            const addr = item.address || {};
                            const calle = addr.road || addr.pedestrian || addr.suburb || '';
                            const altura = addr.house_number ? ` ${addr.house_number}` : '';
                            const localidad = addr.city || addr.town || addr.village || addr.locality || '';
                            const provincia = addr.state || '';

                            let principal = calle ? `${calle}${altura}` : (localidad || provincia || item.display_name.split(',')[0]);
                            let secundario = [localidad, provincia].filter(Boolean).join(', ') || 'Argentina';

                            return {
                                completo: `${principal}, ${secundario}`,
                                principal,
                                secundario,
                                lat: parseFloat(item.lat),
                                lon: parseFloat(item.lon)
                            };
                        });
                    }
                }
            } catch {}
        }

        // Fallback local instantaneo
        const qNorm = query.toLowerCase();
        return DATASET_LOCALIDADES_ARGENTINA
            .filter(l => l.nombre.toLowerCase().includes(qNorm))
            .map(l => ({
                completo: l.nombre,
                principal: l.nombre.split(',')[0],
                secundario: l.nombre.split(',')[1] ? l.nombre.split(',')[1].trim() : 'Argentina',
                lat: l.lat,
                lon: l.lon
            }));
    }

    async function geocodificar(direccion) {
        const key = direccion.toLowerCase().trim();
        if (!key) return null;
        if (cacheGeo[key]) return cacheGeo[key];

        if (navigator.onLine) {
            try {
                const params = new URLSearchParams({
                    q: direccion,
                    format: 'json',
                    limit: 1,
                    countrycodes: 'ar'
                });
                const res = await fetch(`https://nominatim.openstreetmap.org/search?${params}`, {
                    headers: { 'User-Agent': 'TerMateLogistics/3.0' },
                    signal: AbortSignal.timeout(4000)
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

        // Fallback local
        const matched = DATASET_LOCALIDADES_ARGENTINA.find(l => l.nombre.toLowerCase().includes(key) || key.includes(l.nombre.toLowerCase().split(',')[0]));
        if (matched) {
            const coords = [matched.lat, matched.lon];
            cacheGeo[key] = coords;
            guardarGeoCache();
            return coords;
        }

        return null;
    }

    // ═══════════════════════════════════════════════════════════
    // 6. MOTOR DE RUTEO
    // ═══════════════════════════════════════════════════════════
    async function obtenerRutaOSRM(cOrigen, cDestino) {
        const url = `https://router.project-osrm.org/route/v1/driving/${cOrigen[1]},${cOrigen[0]};${cDestino[1]},${cDestino[0]}?overview=full&geometries=geojson&steps=true`;
        const res = await fetch(url, { signal: AbortSignal.timeout(7000) });
        if (!res.ok) throw new Error('OSRM_ERROR');
        const data = await res.json();

        if (data.code === 'Ok' && data.routes?.length > 0) {
            const r = data.routes[0];
            const calles = [];
            (r.legs || []).forEach(leg => {
                (leg.steps || []).forEach(step => {
                    const name = step.name && step.name.trim();
                    if (name && !calles.includes(name)) calles.push(name);
                });
            });
            return {
                distancia: r.distance / 1000,
                tiempo: (r.duration / 3600) * 1.15, // Ajuste para velocidad media de camion con carga
                coordenadas: r.geometry.coordinates.map(c => [c[1], c[0]]),
                calles,
                warnings: []
            };
        }
        throw new Error('Sin ruta disponible');
    }

    async function resolverRuta(origen, destino, camionId) {
        const [coordsOrigen, coordsDestino] = await Promise.all([
            geocodificar(origen),
            geocodificar(destino)
        ]);

        if (!coordsOrigen) throw new Error(`No se pudo ubicar el punto de origen: "${origen}".`);
        if (!coordsDestino) throw new Error(`No se pudo ubicar el punto de destino: "${destino}".`);

        let dataRuta = null;
        let esAproximada = false;

        if (navigator.onLine) {
            try {
                dataRuta = await obtenerRutaOSRM(coordsOrigen, coordsDestino);
            } catch {
                esAproximada = true;
            }
        }

        if (!dataRuta) {
            const dist = haversine(coordsOrigen, coordsDestino) * 1.25; // Coeficiente vial sobre linea recta
            dataRuta = {
                distancia: dist,
                tiempo: dist / 70,
                coordenadas: [coordsOrigen, coordsDestino],
                calles: [],
                warnings: ['Calculo aproximado por limite de senal']
            };
            esAproximada = true;
        }

        return {
            coordsOrigen,
            coordsDestino,
            distancia: dataRuta.distancia,
            tiempo: dataRuta.tiempo,
            coordsRuta: dataRuta.coordenadas,
            calles: dataRuta.calles || [],
            warnings: dataRuta.warnings || [],
            esAproximada
        };
    }

    // ═══════════════════════════════════════════════════════════
    // 7. GESTION DE MAPAS LEAFLET
    // ═══════════════════════════════════════════════════════════
    const TILE_PROVIDERS = {
        dark: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
        streets: 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png',
        satellite: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'
    };

    let currentTileLayerFull = null;

    function cambiarCapaMapa(map, layerType) {
        if (!map) return;
        const url = TILE_PROVIDERS[layerType] || TILE_PROVIDERS.dark;
        const attrib = layerType === 'satellite' ? 'Esri, Maxar' : 'OpenStreetMap, CARTO';
        
        if (currentTileLayerFull) {
            map.removeLayer(currentTileLayerFull);
        }
        currentTileLayerFull = L.tileLayer(url, { attribution: attrib, maxZoom: 19 }).addTo(map);
    }

    function initMapas() {
        const argentinaBounds = L.latLngBounds(
            L.latLng(-55.1, -73.6),
            L.latLng(-21.8, -53.6)
        );
        const isMobile = window.innerWidth <= 768;
        const mapOpts = {
            zoomControl: !isMobile,
            maxBounds: argentinaBounds,
            maxBoundsViscosity: 0.9,
            minZoom: 4,
            maxZoom: 18
        };

        // 1. Mapa Full (Tab Principal)
        if (!mapaFull && document.getElementById('mapa')) {
            try {
                mapaFull = L.map('mapa', { ...mapOpts, scrollWheelZoom: true }).setView([-38.4, -63.6], 5);
                cambiarCapaMapa(mapaFull, 'dark');
            } catch (err) {
                console.error(err);
            }
        }

        // 2. Mapa Inline (Tab Nueva Ruta)
        if (!mapaInline && document.getElementById('mapa-inline')) {
            try {
                mapaInline = L.map('mapa-inline', { 
                    ...mapOpts, 
                    scrollWheelZoom: false,
                    dragging: !isMobile,
                    tap: true
                }).setView([-38.4, -63.6], 5);
                L.tileLayer(TILE_PROVIDERS.dark, { attribution: 'CARTO', maxZoom: 19 }).addTo(mapaInline);
            } catch (err) {
                console.error(err);
            }
        }

        // Capas
        document.querySelectorAll('.map-layer-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                document.querySelectorAll('.map-layer-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                cambiarCapaMapa(mapaFull, btn.dataset.layer);
            });
        });

        // Buscador en mapa full
        setupAutocompletado('map-search-input', 'map-search-sugerencias');
    }

    // ─── POIS DE ESTACIONES Y PARADORES ───────────────────────
    let poiMarcadores = { gasolina: [], comida: [] };
    let poiActivo = { gasolina: false, comida: false };

    const POIS_ARGENTINA = {
        gasolina: [
            { titulo: 'YPF ACA Rosario Central', direccion: 'Autopista Bs As - Rosario Km 285', lat: -32.958, lon: -60.672, rating: 4.6, reviews: 340 },
            { titulo: 'Shell Full Pilar', direccion: 'Panamericana Km 50, Pilar, Bs As', lat: -34.456, lon: -58.912, rating: 4.5, reviews: 280 },
            { titulo: 'YPF Opessa Cordoba Norte', direccion: 'Av. Circunvalacion Km 12, Cordoba', lat: -31.385, lon: -64.195, rating: 4.7, reviews: 410 },
            { titulo: 'Axion Energy San Nicolas', direccion: 'Ruta Nacional 9 Km 230, San Nicolas', lat: -33.342, lon: -60.221, rating: 4.4, reviews: 195 },
            { titulo: 'Puma Energy Villa Maria', direccion: 'Ruta 9 Km 555, Villa Maria, Cordoba', lat: -32.408, lon: -63.242, rating: 4.3, reviews: 150 },
            { titulo: 'YPF ACA Mendoza Mercaderes', direccion: 'Acceso Este Km 10, Mendoza', lat: -32.898, lon: -68.795, rating: 4.8, reviews: 520 },
            { titulo: 'YPF Bahia Blanca Sur', direccion: 'Ruta 3 Km 695, Bahia Blanca', lat: -38.728, lon: -62.245, rating: 4.5, reviews: 230 },
            { titulo: 'YPF San Luis Centro', direccion: 'Autopista de las Serranias Puntanas Km 790, San Luis', lat: -33.298, lon: -66.335, rating: 4.6, reviews: 210 }
        ],
        comida: [
            { titulo: 'Parador de Camiones "El Tronco"', direccion: 'Ruta Nacional 9 Km 145, Baradero', lat: -33.812, lon: -59.505, rating: 4.7, reviews: 480 },
            { titulo: 'Comedor y Descanso "La Querencia"', direccion: 'Ruta 7 Km 260, Junin, Bs As', lat: -34.582, lon: -60.945, rating: 4.6, reviews: 310 },
            { titulo: 'Parador Camionero "El Cruce"', direccion: 'Cruce Ruta 3 y 226, Azul, Bs As', lat: -36.782, lon: -59.858, rating: 4.8, reviews: 620 },
            { titulo: 'Restaurante de Ruta "El Rutero"', direccion: 'Ruta 14 Km 120, Concepcion del Uruguay', lat: -32.485, lon: -58.262, rating: 4.5, reviews: 270 },
            { titulo: 'Parador "La Posta del Camionero"', direccion: 'Ruta 34 Km 220, Rafaela, Santa Fe', lat: -31.252, lon: -61.488, rating: 4.4, reviews: 185 },
            { titulo: 'Comedor de Campo "Las Rosas"', direccion: 'Ruta 8 Km 180, Pergamino, Bs As', lat: -33.892, lon: -60.575, rating: 4.6, reviews: 390 }
        ]
    };

    function crearIconoCombustible() {
        const svg = `<div style="background:#10b981;width:28px;height:28px;border-radius:50%;border:2px solid #080c14;display:flex;align-items:center;justify-content:center;box-shadow:0 4px 10px rgba(0,0,0,0.5);">
            <svg viewBox="0 0 24 24" fill="none" stroke="#ffffff" stroke-width="2" width="14" height="14">
                <path d="M3 22V10l7-8 7 8v12"/><rect x="9" y="14" width="6" height="8"/><path d="M14 22V14a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v8"/><line x1="18" y1="12" x2="18" y2="7"/>
            </svg>
        </div>`;
        return L.divIcon({ html: svg, className: '', iconSize: [28, 28], iconAnchor: [14, 14] });
    }

    function crearIconoComida() {
        const svg = `<div style="background:#f59e0b;width:28px;height:28px;border-radius:50%;border:2px solid #080c14;display:flex;align-items:center;justify-content:center;box-shadow:0 4px 10px rgba(0,0,0,0.5);">
            <svg viewBox="0 0 24 24" fill="none" stroke="#ffffff" stroke-width="2" width="14" height="14">
                <path d="M18 8h1a4 4 0 0 1 0 8h-1"/><path d="M2 8h16v9a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4V8z"/><line x1="6" y1="1" x2="6" y2="4"/><line x1="10" y1="1" x2="10" y2="4"/><line x1="14" y1="1" x2="14" y2="4"/>
            </svg>
        </div>`;
        return L.divIcon({ html: svg, className: '', iconSize: [28, 28], iconAnchor: [14, 14] });
    }

    function togglePOIMapa(categoria) {
        if (!mapaFull) return;

        poiActivo[categoria] = !poiActivo[categoria];
        const btnId = categoria === 'gasolina' ? 'btn-poi-combustible' : 'btn-poi-comida';
        const btn = document.getElementById(btnId);

        if (!poiActivo[categoria]) {
            if (btn) btn.classList.remove('active');
            poiMarcadores[categoria].forEach(m => mapaFull.removeLayer(m));
            poiMarcadores[categoria] = [];
            showToast(`Ocultando ${categoria === 'gasolina' ? 'estaciones de servicio' : 'paradores de descanso'}.`, 'info');
            return;
        }

        if (btn) btn.classList.add('active');
        const pois = POIS_ARGENTINA[categoria] || [];
        const icono = categoria === 'gasolina' ? crearIconoCombustible() : crearIconoComida();

        pois.forEach(p => {
            const m = L.marker([p.lat, p.lon], { icon: icono }).addTo(mapaFull);
            const tipoLabel = categoria === 'gasolina' ? 'Estacion de Servicio' : 'Parador de Descanso';
            const popupHtml = `<div class="popup-titulo" style="color:${categoria === 'gasolina' ? '#34d399' : '#fbbf24'};font-weight:700">
                ${tipoLabel}
            </div>
            <div class="popup-linea"><strong>${p.titulo}</strong></div>
            <div class="popup-linea">${p.direccion}</div>
            <div class="popup-linea" style="color:#38bdf8;font-weight:600">Calificacion: ${p.rating} / 5 (${p.reviews} resenas)</div>`;
            m.bindPopup(popupHtml);
            poiMarcadores[categoria].push(m);
        });

        if (poiMarcadores[categoria].length > 0) {
            try {
                const group = L.featureGroup(poiMarcadores[categoria]);
                mapaFull.fitBounds(group.getBounds().pad(0.1));
            } catch {}
        }

        showToast(`Mostrando ${pois.length} paradas de ${categoria === 'gasolina' ? 'combustible' : 'descanso'}.`, 'success');
    }

    function crearIconoDestino(color) {
        const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="28" height="34" viewBox="0 0 30 38">
            <path d="M15 0C6.72 0 0 6.72 0 15c0 11.25 15 23 15 23s15-11.75 15-23C30 6.72 23.28 0 15 0z" fill="${color}"/>
            <circle cx="15" cy="15" r="5" fill="#080c14"/>
        </svg>`;
        return L.divIcon({ html: svg, className: '', iconSize: [28, 34], iconAnchor: [14, 34] });
    }

    function crearIconoOrigen() {
        const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 22 22">
            <circle cx="11" cy="11" r="9" fill="#10b981" stroke="#080c14" stroke-width="2.5"/>
            <circle cx="11" cy="11" r="3" fill="#080c14"/>
        </svg>`;
        return L.divIcon({ html: svg, className: '', iconSize: [22, 22], iconAnchor: [11, 11] });
    }

    function colorPorEstado(estado) {
        if (estado === 'Pendiente') return '#f59e0b';
        if (estado === 'En Transito') return '#38bdf8';
        return '#10b981';
    }

    function renderMapas() {
        actualizarMapa(mapaFull, marcadoresFull, polylinesFull, true);
        actualizarMapa(mapaInline, marcadoresInline, polylinesInline, false);

        // Actualizar estadisticas del mapa flotante
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

        Object.values(refMarcadores).forEach(m => instanciaMapa.removeLayer(m));
        Object.values(refPolylines).forEach(p => instanciaMapa.removeLayer(p));
        
        for (const k in refMarcadores) delete refMarcadores[k];
        for (const k in refPolylines) delete refPolylines[k];

        const todosCoords = [];
        const enviosAMapear = incluirTodos ? envios : envios.slice(-1);

        enviosAMapear.forEach(e => {
            if (!e.coordsDestino) return;
            const color = colorPorEstado(e.estado);

            // Destino
            const mDest = L.marker(e.coordsDestino, { icon: crearIconoDestino(color) }).addTo(instanciaMapa);
            mDest.bindPopup(`<div style="font-weight:700;font-size:0.9rem;color:#f8fafc">${e.destino}</div><div style="font-size:0.8rem;color:#94a3b8;margin-top:2px">Destino de Carga #${String(e.id).padStart(4,'0')}</div>`);
            refMarcadores[e.id] = mDest;
            todosCoords.push(e.coordsDestino);

            // Origen
            if (e.coordsOrigen) {
                const mOr = L.marker(e.coordsOrigen, { icon: crearIconoOrigen() }).addTo(instanciaMapa);
                mOr.bindPopup(`<div style="font-weight:700;font-size:0.9rem;color:#10b981">Origen de Carga</div><div style="font-size:0.8rem;color:#94a3b8">${e.origen}</div>`);
                refMarcadores[`${e.id}_or`] = mOr;
                todosCoords.push(e.coordsOrigen);

                if (e.coordsRuta?.length > 0) {
                    const poly = L.polyline(e.coordsRuta, {
                        color: '#38bdf8',
                        weight: 4.5,
                        opacity: 0.75,
                        lineCap: 'round',
                        lineJoin: 'round',
                        dashArray: e.estado === 'Pendiente' ? '8, 6' : null
                    }).addTo(instanciaMapa);
                    
                    const distTxt = formatoDistancia(e.distancia);
                    const rutaPopup = `<div style="font-weight:700;font-size:0.88rem">Ruta #${String(e.id).padStart(4,'0')}</div>`
                        + `<div style="font-size:0.8rem;margin-top:4px">${e.origen.split(',')[0]} -> ${e.destino.split(',')[0]}</div>`
                        + `<div style="font-size:0.8rem;color:#38bdf8;font-weight:600;margin-top:2px">Distancia: ${distTxt}</div>`;
                    poly.bindPopup(rutaPopup);
                    refPolylines[e.id] = poly;
                }
            }
        });

        if (todosCoords.length > 0) {
            const grupo = L.featureGroup(todosCoords.map(c => L.marker(c)));
            try {
                instanciaMapa.fitBounds(grupo.getBounds().pad(0.2));
            } catch {}
        }
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
    // 8. RENDERIZADO DE INTERFAZ (UI)
    // ═══════════════════════════════════════════════════════════
    function actualizarKPIs() {
        const pendiente = envios.filter(e => e.estado === 'Pendiente').length;
        const transito  = envios.filter(e => e.estado === 'En Transito').length;
        const entregado = envios.filter(e => e.estado === 'Entregado').length;
        const totalFlota = camiones.length;

        const set = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
        set('kpi-num-pendiente', pendiente);
        set('kpi-num-transito', transito);
        set('kpi-num-entregado', entregado);
        set('kpi-num-flota', totalFlota);
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
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="36" height="36" style="opacity:0.4;margin-bottom:8px">
                    <rect x="8" y="2" width="8" height="4" rx="1" ry="1"/>
                    <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/>
                </svg>
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
            const camionLabel = camion ? `${camion.nombre}${camion.patente ? ' (' + camion.patente + ')' : ''}` : null;

            return `<div class="viaje-card-v2" data-id="${e.id}" role="button" tabindex="0">
                <!-- Estado e ID -->
                <div class="vc2-estado-bar">
                    <span class="vc2-estado-badge ${clase}">${estadoLabel}</span>
                    <span class="vc2-id">#${String(e.id).padStart(4,'0')}</span>
                </div>

                <!-- Ruta Principal -->
                <div class="vc2-ruta">
                    <div class="vc2-punto">
                        <span class="vc2-dot vc2-dot--ori"></span>
                        <span class="vc2-ciudad">${e.origen.split(',')[0]}</span>
                        <span class="vc2-provincia">${e.origen.split(',').slice(1).join(',').trim() || 'Argentina'}</span>
                    </div>
                    <div class="vc2-linea-ruta"></div>
                    <div class="vc2-punto">
                        <span class="vc2-dot vc2-dot--dest"></span>
                        <span class="vc2-ciudad">${e.destino.split(',')[0]}</span>
                        <span class="vc2-provincia">${e.destino.split(',').slice(1).join(',').trim() || 'Argentina'}</span>
                    </div>
                </div>

                <!-- Metricas Clave -->
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
                        <span class="vc2-metrica-lbl">Gasoil</span>
                    </div>
                </div>

                <!-- Tags Informativos -->
                <div class="vc2-tags">
                    ${camionLabel ? `<span class="vc2-tag">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="11" height="11"><rect x="1" y="11" width="15" height="10" rx="1"/><path d="M16 11l4 3v7h-4V11z"/><circle cx="5.5" cy="21" r="1.5"/><circle cx="18.5" cy="21" r="1.5"/></svg>
                        ${camionLabel}
                    </span>` : ''}
                    <span class="vc2-tag">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="11" height="11"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/></svg>
                        ${e.producto}${e.pesoCarga ? ' · ' + e.pesoCarga + ' tn' : ''}
                    </span>
                    ${e.remito ? `<span class="vc2-tag" style="color:var(--c-primary-light);font-weight:600">
                        Remito: ${e.remito}
                    </span>` : ''}
                </div>

                <!-- Accion Rapida de Descarga -->
                <button class="btn-download" data-id="${e.id}" title="Imprimir Remito Oficial" onclick="event.stopPropagation()">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14">
                        <polyline points="6 9 6 2 18 2 18 9"/>
                        <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/>
                        <rect x="6" y="14" width="12" height="8"/>
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
            if (q.length < 2) { lista.classList.remove('visible'); return; }

            delay = setTimeout(async () => {
                const sugs = await buscarSugerenciasFederales(q);
                if (sugs.length === 0) { lista.classList.remove('visible'); return; }

                lista.innerHTML = sugs.map(s => `
                    <li role="option" data-lat="${s.lat}" data-lon="${s.lon}" data-completo="${s.completo}">
                        <div class="sug-main-row">
                            <span class="sug-principal">${s.principal}</span>
                        </div>
                        <div class="sug-sub-row">
                            <span class="sug-secundario">${s.secundario}</span>
                        </div>
                    </li>
                `).join('');
                lista.classList.add('visible');
            }, 250);
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

        document.querySelectorAll('.sidebar-btn, .nav-btn').forEach(btn => {
            if (btn.dataset.tab === tabId) btn.classList.add('active');
            else btn.classList.remove('active');
        });

        if (tabId === 'mapa' && mapaFull) {
            setTimeout(() => mapaFull.invalidateSize(), 50);
            setTimeout(() => mapaFull.invalidateSize(), 250);
        }
        if (tabId === 'nueva-ruta' && mapaInline) {
            setTimeout(() => mapaInline.invalidateSize(), 50);
            setTimeout(() => mapaInline.invalidateSize(), 250);
        }
    }

    // ─── SCORING DE CONDUCTA DEL CHOFER ───────────────────────
    function calcularScore(camionero) {
        const h = camionero.historial || [];
        if (h.length === 0) return null;
        let puntos = 0;
        h.forEach(r => {
            if (r.ruta === 'si')          puntos += 40;
            else if (r.ruta === 'parcial') puntos += 20;
            if (r.puntualidad === 'puntual') puntos += 30;
            else if (r.puntualidad === 'leve') puntos += 15;
            if (r.bono === 'si')          puntos += 30;
        });
        return Math.min(100, Math.round(puntos / h.length));
    }

    function scoreClass(score) {
        if (score === null) return 'amarillo';
        if (score >= 75) return 'verde';
        if (score >= 50) return 'amarillo';
        return 'rojo';
    }

    function carnetVtoClass(vto) {
        if (!vto) return '';
        const hoy = new Date();
        const vtoDate = new Date(vto);
        const diff = (vtoDate - hoy) / (1000 * 60 * 60 * 24);
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

    // ─── RENDER CHOFERES ──────────────────────────────────────
    function renderListaCamioneros() {
        const c = document.getElementById('lista-camioneros');
        if (!c) return;

        if (camioneros.length === 0) {
            c.innerHTML = `<div class="empty-state"><p>No hay choferes registrados.</p></div>`;
            return;
        }

        c.innerHTML = camioneros.map(cnr => {
            const score = calcularScore(cnr);
            const vtoClass = carnetVtoClass(cnr.carnetVto);
            const vtoLabel = cnr.carnetVto
                ? (vtoClass === 'vto-exp' ? 'Licencia Vencida' : vtoClass === 'vto-prox' ? 'Vence pronto' : `Cat. ${cnr.carnetCat || 'E'} (Vigente)`)
                : (cnr.carnetCat ? `Cat. ${cnr.carnetCat}` : 'Sin Licencia');
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
                        <div class="camionero-dni">${cnr.dni ? 'DNI ' + cnr.dni : (cnr.tel || 'Sin contacto')}</div>
                    </div>
                    ${scoreRingHTML(score)}
                </div>
                <div class="camionero-meta">
                    ${cnr.carnetNum || cnr.carnetCat ? `<span class="cnr-badge cnr-badge--carnet ${vtoClass}">${vtoLabel}</span>` : ''}
                    ${(cnr.capacitaciones || []).length > 0 ? `<span class="cnr-badge cnr-badge--caps">${cnr.capacitaciones.length} Certificaciones</span>` : ''}
                    ${bonos > 0 ? `<span class="cnr-badge cnr-badge--bono">${bonos} Bono${bonos > 1 ? 's' : ''}</span>` : ''}
                </div>
                <div class="camionero-card-footer">
                    <span>${camionAsig ? camionAsig.nombre : 'Sin camion fijo'}</span>
                    <span>${totalRegistros} viajes evaluados</span>
                </div>
            </div>`;
        }).join('');
    }

    function renderListaCamiones() {
        const c = document.getElementById('lista-camiones');
        if (!c) return;

        if (camiones.length === 0) {
            c.innerHTML = `<div class="empty-state"><p>No hay camiones registrados en la flota.</p></div>`;
            return;
        }

        c.innerHTML = camiones.map(cam => `
            <div class="camion-card" data-id="${cam.id}" role="button" tabindex="0">
                <div class="viaje-ruta">
                    <span>${cam.nombre}</span>
                    <span style="font-size:0.75rem;color:var(--c-primary-light);font-weight:700">${cam.patente || 'SIN PATENTE'}</span>
                </div>
                ${cam.camionero ? `<div class="viaje-meta"><span>Chofer asignado: <strong>${cam.camionero}</strong></span></div>` : ''}
                <div class="viaje-meta">
                    <span>Carga max: <strong>${cam.peso} tn</strong></span>
                    <span>Dimensiones: ${cam.largo}m x ${cam.ancho}m x ${cam.alto}m</span>
                </div>
                <div class="viaje-meta">
                    <span>Consumo vacio: ${cam.consumoVacio} L/100km</span>
                    <span>Consumo cargado: ${cam.consumoLleno} L/100km</span>
                </div>
                <button class="camionero-card-delete" data-id="${cam.id}" aria-label="Eliminar">&times;</button>
            </div>
        `).join('');
    }

    function renderSelectCamiones() {
        const sel = document.getElementById('select-camion');
        if (!sel) return;
        const prev = sel.value;
        sel.innerHTML = '<option value="">-- Seleccionar camion de flota --</option>' +
            camiones.map(c => `<option value="${c.id}">${c.nombre} (${c.patente || 'S/P'})</option>`).join('');
        if (prev && camiones.some(c => c.id === parseInt(prev))) sel.value = prev;
    }

    function renderSelectCamioneros() {
        const sel = document.getElementById('cam-camionero-select');
        if (!sel) return;
        const prev = sel.value;
        sel.innerHTML = '<option value="">-- Sin chofer asignado --</option>' +
            camioneros.map(c => `<option value="${c.id}">${c.nombre} (DNI ${c.dni || 'S/D'})</option>`).join('');
        if (prev && camioneros.some(c => c.id === parseInt(prev))) sel.value = prev;
    }

    function irASubTab(subtabId) {
        document.querySelectorAll('.subtab-pane').forEach(p => p.classList.remove('active'));
        document.getElementById(subtabId)?.classList.add('active');
        document.querySelectorAll('.subtab-btn').forEach(b => {
            b.classList.toggle('active', b.dataset.subtab === subtabId);
        });
    }

    // ═══════════════════════════════════════════════════════════
    // 10. MODALES Y EVENTOS
    // ═══════════════════════════════════════════════════════════
    function abrirModalCamion(cam) {
        camionEditandoId = cam ? cam.id : null;
        document.getElementById('modal-camion-titulo').textContent = cam ? 'Editar Camion' : 'Nuevo Camion';
        document.getElementById('cam-id').value = cam ? cam.id : '';
        document.getElementById('cam-nombre').value = cam?.nombre || '';
        document.getElementById('cam-patente').value = cam?.patente || '';
        renderSelectCamioneros();
        if (document.getElementById('cam-camionero-select')) {
            document.getElementById('cam-camionero-select').value = cam?.camioneroId || '';
        }
        document.getElementById('cam-peso').value = cam?.peso || 28;
        document.getElementById('cam-alto').value = cam?.alto || 4.1;
        document.getElementById('cam-largo').value = cam?.largo || 18.5;
        document.getElementById('cam-ancho').value = cam?.ancho || 2.6;
        document.getElementById('cam-cons-vacio').value = cam?.consumoVacio || 24;
        document.getElementById('cam-cons-cargado').value = cam?.consumoLleno || 36;
        document.getElementById('modal-camion')?.classList.remove('hidden');
    }

    function cerrarModalCamion() {
        document.getElementById('modal-camion')?.classList.add('hidden');
        camionEditandoId = null;
    }

    function abrirModalCamionero(cnr) {
        capsTemp = cnr ? [...(cnr.capacitaciones || [])] : [];
        camioneroEditandoId = cnr ? cnr.id : null;
        document.getElementById('modal-camionero-titulo').textContent = cnr ? 'Editar Chofer' : 'Nuevo Chofer';
        document.getElementById('cnr-id').value = cnr ? cnr.id : '';
        document.getElementById('cnr-nombre').value = cnr?.nombre || '';
        document.getElementById('cnr-dni').value = cnr?.dni || '';
        document.getElementById('cnr-tel').value = cnr?.tel || '';
        document.getElementById('cnr-ingreso').value = cnr?.ingreso || '';
        document.getElementById('cnr-carnet-num').value = cnr?.carnetNum || '';
        document.getElementById('cnr-carnet-cat').value = cnr?.carnetCat || '';
        document.getElementById('cnr-carnet-vto').value = cnr?.carnetVto || '';

        const selCam = document.getElementById('cnr-camion-asignado');
        if (selCam) {
            selCam.innerHTML = '<option value="">-- Sin asignar --</option>' +
                camiones.map(c => `<option value="${c.id}" ${c.id === cnr?.camionAsignadoId ? 'selected' : ''}>${c.nombre} (${c.patente || 'S/P'})</option>`).join('');
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
            lista.innerHTML = '<div style="font-size:0.75rem;color:var(--c-text-muted);padding:0.25rem 0">Sin certificaciones agregadas.</div>';
            return;
        }
        lista.innerHTML = capsTemp.map((cap, i) => `
            <div style="display:flex;justify-content:space-between;align-items:center;background:rgba(255,255,255,0.03);padding:6px 10px;border-radius:4px;margin-bottom:4px;font-size:0.8rem">
                <span><strong>${cap.nombre}</strong> ${cap.fecha ? '· ' + cap.fecha : ''}</span>
                <button type="button" class="cap-item-del" data-cap-idx="${i}" style="background:none;border:none;color:var(--c-danger);cursor:pointer;font-size:1.1rem">&times;</button>
            </div>
        `).join('');
    }

    function abrirModalComportamiento(camioneroId) {
        document.getElementById('comp-camionero-id').value = camioneroId;
        document.getElementById('form-comportamiento')?.reset();
        document.getElementById('comp-camionero-id').value = camioneroId;
        document.getElementById('comp-fecha').value = new Date().toISOString().split('T')[0];
        document.getElementById('modal-comportamiento')?.classList.remove('hidden');
    }

    function cerrarModalComportamiento() {
        document.getElementById('modal-comportamiento')?.classList.add('hidden');
    }

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
            <div style="display:flex;align-items:center;gap:1rem;background:var(--c-card);padding:1rem;border-radius:8px;border:1px solid var(--c-border)">
                ${scoreRingHTML(score)}
                <div>
                    <div style="font-size:1.05rem;font-weight:700;color:var(--c-text-title)">${cnr.nombre}</div>
                    <div style="font-size:0.75rem;color:var(--c-text-muted)">Score de cumplimiento: <strong style="color:var(--c-text-title)">${score !== null ? score + '%' : 'Sin evaluar'}</strong> · ${bonos} bono${bonos !== 1 ? 's' : ''}</div>
                </div>
            </div>

            <div class="form-section-label" style="margin-top:1rem">Datos y Licencia</div>
            <div class="detail-rows" style="margin-top:0.5rem">
                ${cnr.dni ? `<div class="detail-row"><span class="detail-key">DNI</span><span class="detail-val">${cnr.dni}</span></div>` : ''}
                ${cnr.tel ? `<div class="detail-row"><span class="detail-key">Telefono</span><span class="detail-val">${cnr.tel}</span></div>` : ''}
                ${cnr.carnetNum ? `<div class="detail-row"><span class="detail-key">N° Licencia</span><span class="detail-val">${cnr.carnetNum} (Cat. ${cnr.carnetCat || 'E'})</span></div>` : ''}
                ${cnr.carnetVto ? `<div class="detail-row"><span class="detail-key">Vencimiento</span><span class="detail-val">${cnr.carnetVto}</span></div>` : ''}
                ${camionAsig ? `<div class="detail-row"><span class="detail-key">Camion</span><span class="detail-val">${camionAsig.nombre}</span></div>` : ''}
            </div>

            <div class="form-section-label" style="margin-top:1.25rem">Historial de Despachos (${historial.length})</div>
            <div style="display:flex;flex-direction:column;gap:6px;max-height:180px;overflow-y:auto;margin-top:0.5rem">
                ${historial.length === 0 ? '<div style="font-size:0.8rem;color:var(--c-text-muted)">Sin registros aun.</div>' :
                    historial.map((r, i) => `
                        <div style="background:var(--c-card);padding:8px 10px;border-radius:6px;border:1px solid var(--c-border);font-size:0.78rem;display:flex;justify-content:space-between;align-items:center">
                            <div>
                                <strong>${r.fecha}</strong> · Ruta: ${r.ruta === 'si' ? 'Cumplio' : 'Desvio'} · ${r.puntualidad}
                                ${r.bono === 'si' ? ' · <span style="color:#a78bfa;font-weight:700">Bono Asignado</span>' : ''}
                            </div>
                        </div>
                    `).join('')}
            </div>
        `;

        document.getElementById('modal-perfil-camionero')?.classList.remove('hidden');
    }

    function cerrarPerfilCamionero() {
        document.getElementById('modal-perfil-camionero')?.classList.add('hidden');
        camioneroPerfilId = null;
    }

    // ─── MODAL DETALLE VIAJE ──────────────────────────────────
    function abrirDetalle(id) {
        const e = envios.find(x => x.id === id);
        if (!e) return;
        idEnvioDetalle = id;

        const cont = document.getElementById('detalle-contenido');
        if (cont) {
            const camion = e.camionId ? camiones.find(c => c.id === e.camionId) : null;
            cont.innerHTML = [
                ['Origen de Carga', e.origen],
                ['Destino de Descarga', e.destino],
                ['Descripcion de Carga', e.producto],
                e.pesoCarga ? ['Peso', `${e.pesoCarga} tn`] : null,
                ['Distancia Estimada', formatoDistancia(e.distancia)],
                ['Tiempo Estimado', formatoTiempo(e.tiempo)],
                e.distancia ? ['Consumo Estimado', formatoFuel(e.distancia, e.pesoCarga, e.camionId) || '—'] : null,
                ['Estado', e.estado],
                camion ? ['Camion Asignado', `${camion.nombre} (${camion.patente || 'S/P'})`] : null,
                camion?.camionero ? ['Chofer', camion.camionero] : null,
                e.cliente ? ['Cliente / Receptor', e.cliente] : null,
                e.remito ? ['N° Remito Oficial', e.remito] : null
            ].filter(Boolean).map(([k, v]) => `
                <div class="detail-row">
                    <span class="detail-key">${k}</span>
                    <span class="detail-val">${v}</span>
                </div>
            `).join('');
        }

        document.getElementById('modal-detalle')?.classList.remove('hidden');
    }

    function cerrarDetalle() {
        document.getElementById('modal-detalle')?.classList.add('hidden');
        idEnvioDetalle = null;
    }

    function abrirModalViaje(envioExistente) {
        const m = document.getElementById('modal-viaje');
        if (!m) return;

        const vjSel = document.getElementById('vj-select-camion');
        if (vjSel) {
            vjSel.innerHTML = '<option value="">-- Seleccionar camion --</option>' +
                camiones.map(c => `<option value="${c.id}">${c.nombre} (${c.patente || 'S/P'})</option>`).join('');
            vjSel.value = envioExistente?.camionId || (rutaPendiente?.camionId || '');
        }

        if (envioExistente) {
            document.getElementById('vj-cliente').value = envioExistente.cliente || '';
            document.getElementById('vj-remito').value = envioExistente.remito || '';
        } else {
            document.getElementById('form-viaje')?.reset();
            if (vjSel) vjSel.value = rutaPendiente?.camionId || '';
            const randomRemito = `R-0001-${String(Math.floor(10000000 + Math.random() * 90000000))}`;
            document.getElementById('vj-remito').value = randomRemito;
        }

        m.classList.remove('hidden');
    }

    function cerrarModalViaje() {
        document.getElementById('modal-viaje')?.classList.add('hidden');
        rutaPendiente = null;
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
        document.getElementById('form-titulo').textContent = 'Nueva Ruta de Transporte';
        document.getElementById('btn-submit-texto').textContent = 'Calcular Ruta y Emitir';
        document.getElementById('btn-cancelar-edicion').classList.add('hidden');
        document.getElementById('resultado-ruta')?.classList.add('hidden');
        renderSelectCamiones();
    }

    // ═══════════════════════════════════════════════════════════
    // 11. BINDING DE EVENTOS
    // ═══════════════════════════════════════════════════════════
    function bindEvents() {
        // Envio de formulario de ruta
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
                showToast('Selecciona un camion para asignar la ruta.', 'error');
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

                const resPanel = document.getElementById('resultado-ruta');
                if (resPanel) {
                    document.getElementById('res-distancia').textContent = formatoDistancia(dataRuta.distancia);
                    document.getElementById('res-tiempo').textContent = formatoTiempo(dataRuta.tiempo);
                    document.getElementById('res-fuel').textContent = formatoFuel(dataRuta.distancia, pesoCarga, camionId) || '--';
                    resPanel.classList.remove('hidden');
                }

                // Dibujar en mapa inline
                if (mapaInline) {
                    actualizarMapa(mapaInline, marcadoresInline, polylinesInline, false);
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

        // POIs
        document.getElementById('btn-poi-combustible')?.addEventListener('click', () => togglePOIMapa('gasolina'));
        document.getElementById('btn-poi-comida')?.addEventListener('click', () => togglePOIMapa('comida'));

        // Navegacion
        document.querySelectorAll('.nav-btn, .sidebar-btn').forEach(btn => {
            btn.addEventListener('click', () => irATab(btn.dataset.tab));
        });

        document.querySelectorAll('.subtab-btn').forEach(btn => {
            btn.addEventListener('click', () => irASubTab(btn.dataset.subtab));
        });

        // Camiones
        document.getElementById('btn-nuevo-camion')?.addEventListener('click', () => abrirModalCamion(null));
        document.getElementById('btn-cerrar-camion')?.addEventListener('click', cerrarModalCamion);
        document.getElementById('btn-cancelar-camion')?.addEventListener('click', cerrarModalCamion);

        document.getElementById('lista-camiones')?.addEventListener('click', e => {
            const card = e.target.closest('.camion-card');
            if (!card) return;
            const id = Number(card.dataset.id);
            const btnDel = e.target.closest('.camionero-card-delete');
            if (btnDel) {
                camiones = camiones.filter(c => c.id !== id);
                guardar();
                renderListaCamiones();
                renderSelectCamiones();
                showToast('Camion eliminado.', 'info');
                return;
            }
            const camion = camiones.find(c => c.id === id);
            if (camion) abrirModalCamion(camion);
        });

        document.getElementById('form-camion')?.addEventListener('submit', e => {
            e.preventDefault();
            const id = document.getElementById('cam-id').value;
            const nombre = document.getElementById('cam-nombre').value.trim();
            const patente = document.getElementById('cam-patente').value.trim().toUpperCase();
            const getN = fid => parseFloat(document.getElementById(fid)?.value) || 0;
            const camioneroId = parseInt(document.getElementById('cam-camionero-select')?.value) || null;
            const camioneroNombre = camioneroId ? (camioneros.find(c => c.id === camioneroId)?.nombre || '') : '';

            if (!nombre) {
                showToast('Ingresa un nombre para el camion.', 'error');
                return;
            }

            const datos = {
                nombre,
                patente,
                camionero: camioneroNombre,
                camioneroId,
                peso: getN('cam-peso') || 28,
                alto: getN('cam-alto') || 4.1,
                largo: getN('cam-largo') || 18.5,
                ancho: getN('cam-ancho') || 2.6,
                consumoVacio: getN('cam-cons-vacio') || 24,
                consumoLleno: getN('cam-cons-cargado') || 36
            };

            if (id) {
                const idx = camiones.findIndex(c => c.id === parseInt(id));
                if (idx !== -1) camiones[idx] = { ...camiones[idx], ...datos };
                showToast('Camion actualizado.', 'success');
            } else {
                camiones.push({ id: contadorCamiones++, ...datos });
                showToast('Camion incorporado a la flota.', 'success');
            }

            cerrarModalCamion();
            guardar();
            renderListaCamiones();
            renderSelectCamiones();
            actualizarKPIs();
        });

        // Choferes
        document.getElementById('btn-nuevo-camionero')?.addEventListener('click', () => abrirModalCamionero(null));
        document.getElementById('btn-cerrar-camionero')?.addEventListener('click', cerrarModalCamionero);
        document.getElementById('btn-cancelar-camionero')?.addEventListener('click', cerrarModalCamionero);

        document.getElementById('btn-agregar-cap')?.addEventListener('click', () => {
            const nombre = document.getElementById('cnr-cap-nombre').value.trim();
            const fecha  = document.getElementById('cnr-cap-fecha').value;
            if (!nombre) { showToast('Escribe el nombre de la certificacion.', 'error'); return; }
            capsTemp.push({ nombre, fecha });
            document.getElementById('cnr-cap-nombre').value = '';
            document.getElementById('cnr-cap-fecha').value = '';
            renderCapsTemp();
        });

        document.getElementById('cnr-caps-lista')?.addEventListener('click', e => {
            const btn = e.target.closest('.cap-item-del');
            if (!btn) return;
            capsTemp.splice(parseInt(btn.dataset.capIdx), 1);
            renderCapsTemp();
        });

        document.getElementById('form-camionero')?.addEventListener('submit', e => {
            e.preventDefault();
            const nombre = document.getElementById('cnr-nombre').value.trim();
            if (!nombre) { showToast('El nombre es obligatorio.', 'error'); return; }

            const datos = {
                nombre,
                dni: document.getElementById('cnr-dni').value.trim(),
                tel: document.getElementById('cnr-tel').value.trim(),
                ingreso: document.getElementById('cnr-ingreso').value,
                carnetNum: document.getElementById('cnr-carnet-num').value.trim(),
                carnetCat: document.getElementById('cnr-carnet-cat').value,
                carnetVto: document.getElementById('cnr-carnet-vto').value,
                camionAsignadoId: parseInt(document.getElementById('cnr-camion-asignado').value) || null,
                capacitaciones: [...capsTemp]
            };

            const idStr = document.getElementById('cnr-id').value;
            if (idStr) {
                const idx = camioneros.findIndex(c => c.id === parseInt(idStr));
                if (idx !== -1) camioneros[idx] = { ...camioneros[idx], ...datos };
                showToast('Ficha de chofer actualizada.', 'success');
            } else {
                camioneros.push({ id: contadorCamioneros++, historial: [], ...datos });
                showToast('Chofer registrado.', 'success');
            }

            cerrarModalCamionero();
            guardar();
            renderListaCamioneros();
        });

        document.getElementById('lista-camioneros')?.addEventListener('click', e => {
            const delBtn = e.target.closest('.camionero-card-delete');
            if (delBtn) {
                const id = Number(delBtn.dataset.id);
                camioneros = camioneros.filter(c => c.id !== id);
                guardar();
                renderListaCamioneros();
                showToast('Chofer eliminado.', 'info');
                return;
            }
            const card = e.target.closest('.camionero-card');
            if (card) abrirPerfilCamionero(Number(card.dataset.id));
        });

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

        // Modal Comportamiento
        document.getElementById('btn-cerrar-comportamiento')?.addEventListener('click', cerrarModalComportamiento);
        document.getElementById('btn-cancelar-comportamiento')?.addEventListener('click', cerrarModalComportamiento);
        document.getElementById('form-comportamiento')?.addEventListener('submit', e => {
            e.preventDefault();
            const cnrId = parseInt(document.getElementById('comp-camionero-id').value);
            const cnr = camioneros.find(c => c.id === cnrId);
            if (!cnr) return;

            const registro = {
                fecha: document.getElementById('comp-fecha').value,
                ruta: document.getElementById('comp-ruta').value,
                puntualidad: document.getElementById('comp-puntualidad').value,
                incidencias: document.getElementById('comp-incidencias').value.trim(),
                bono: document.getElementById('comp-bono').value,
                obs: document.getElementById('comp-obs').value.trim()
            };

            if (!cnr.historial) cnr.historial = [];
            cnr.historial.push(registro);
            guardar();
            renderListaCamioneros();
            cerrarModalComportamiento();
            showToast('Evaluacion guardada.', 'success');
        });

        // Modal Viaje
        document.getElementById('btn-cerrar-viaje')?.addEventListener('click', cerrarModalViaje);
        document.getElementById('btn-cancelar-viaje')?.addEventListener('click', cerrarModalViaje);

        document.getElementById('form-viaje')?.addEventListener('submit', e => {
            e.preventDefault();
            const cliente = document.getElementById('vj-cliente').value.trim();
            const remito = document.getElementById('vj-remito').value.trim();
            const camionId = parseInt(document.getElementById('vj-select-camion')?.value) || null;

            if (!cliente || !remito) {
                showToast('Completa cliente y remito.', 'error');
                return;
            }

            const datosExtra = { cliente, remito, camionId };

            if (idEnvioEditando !== null) {
                const idx = envios.findIndex(x => x.id === idEnvioEditando);
                if (idx !== -1) envios[idx] = { ...envios[idx], ...datosExtra };
                showToast('Despacho actualizado.', 'success');
                cancelarEdicion();
            } else if (rutaPendiente) {
                const nuevo = { id: contadorId++, ...rutaPendiente, ...datosExtra };
                envios.push(nuevo);
                showToast('Remito y ruta emitidos con exito.', 'success');
                document.getElementById('form-envio')?.reset();
                rutaPendiente = null;
            }

            cerrarModalViaje();
            guardar();
            render();
        });

        // Lista de Viajes y Detalles
        document.getElementById('lista-viajes')?.addEventListener('click', e => {
            const dlBtn = e.target.closest('.btn-download');
            if (dlBtn) {
                e.stopPropagation();
                generarComprobante(Number(dlBtn.dataset.id));
                return;
            }
            const card = e.target.closest('.viaje-card-v2');
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

        document.getElementById('btn-detalle-imprimir-remito')?.addEventListener('click', () => {
            if (idEnvioDetalle !== null) generarComprobante(idEnvioDetalle);
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
            showToast(`Estado actualizado a "${x.estado}".`, 'info');
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

        // Busqueda y Filtros
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

        // Click outside para cerrar modales
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
    // 12. GENERADOR DE REMITO OFICIAL IMPRIMIBLE
    // ═══════════════════════════════════════════════════════════
    function generarComprobante(id) {
        const e = envios.find(x => x.id === id);
        if (!e) return;
        const camion = e.camionId ? camiones.find(c => c.id === e.camionId) : null;
        const chofer = camion?.camioneroId ? camioneros.find(c => c.id === camion.camioneroId) : null;
        const now = new Date();
        const fecha = now.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' });
        const hora = now.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });
        const numRemito = e.remito || `R-0001-${String(e.id).padStart(8, '0')}`;

        const html = `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<title>Remito Oficial de Carga — ${numRemito}</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; font-family: 'Segoe UI', Arial, sans-serif; }
  body { background: #f1f5f9; color: #0f172a; padding: 2rem; }
  .remito-container { max-width: 800px; margin: 0 auto; background: #ffffff; border: 1.5px solid #cbd5e1; border-radius: 8px; box-shadow: 0 4px 20px rgba(0,0,0,0.06); padding: 2.5rem; }
  .header-table { width: 100%; border-bottom: 2px solid #0f172a; padding-bottom: 1.25rem; margin-bottom: 1.5rem; }
  .brand-title { font-size: 1.5rem; font-weight: 800; color: #0f172a; letter-spacing: -0.02em; }
  .brand-sub { font-size: 0.8rem; color: #64748b; text-transform: uppercase; font-weight: 600; }
  .remito-num-box { text-align: right; }
  .remito-label { font-size: 0.8rem; font-weight: 700; color: #2563eb; text-transform: uppercase; }
  .remito-number { font-size: 1.25rem; font-weight: 800; color: #0f172a; }
  .section-title { font-size: 0.82rem; font-weight: 700; color: #2563eb; text-transform: uppercase; letter-spacing: 0.05em; border-bottom: 1px solid #e2e8f0; padding-bottom: 4px; margin: 1.25rem 0 0.75rem 0; }
  .grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 1.5rem; }
  .data-group { display: flex; flex-direction: column; gap: 4px; font-size: 0.88rem; }
  .data-label { font-size: 0.72rem; font-weight: 700; color: #64748b; text-transform: uppercase; }
  .data-val { font-weight: 600; color: #0f172a; }
  .cargo-box { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; padding: 1rem; margin-top: 0.5rem; }
  .signatures { display: grid; grid-template-columns: 1fr 1fr; gap: 3rem; margin-top: 3.5rem; padding-top: 1rem; }
  .sign-box { border-top: 1px dashed #94a3b8; text-align: center; font-size: 0.8rem; color: #64748b; padding-top: 6px; }
  .footer-bar { margin-top: 2rem; font-size: 0.72rem; color: #94a3b8; text-align: center; border-top: 1px solid #f1f5f9; padding-top: 1rem; }
  @media print {
    body { background: #fff; padding: 0; }
    .remito-container { border: none; box-shadow: none; padding: 1.5rem; }
  }
</style>
</head>
<body>
<div class="remito-container">
  <table class="header-table">
    <tr>
      <td>
        <div class="brand-title">TERMATE LOGISTICA NACIONAL</div>
        <div class="brand-sub">Servicio de Transporte Federal de Cargas</div>
      </td>
      <td class="remito-num-box">
        <div class="remito-label">REMITO ELECTRONICO OFICIAL</div>
        <div class="remito-number">${numRemito}</div>
        <div style="font-size:0.75rem;color:#64748b;margin-top:2px">Emision: ${fecha} - ${hora} hs</div>
      </td>
    </tr>
  </table>

  <div class="section-title">1. Informacion del Despacho y Partes</div>
  <div class="grid-2">
    <div class="data-group">
      <span class="data-label">Punto de Origen (Carga)</span>
      <span class="data-val">${e.origen}</span>
    </div>
    <div class="data-group">
      <span class="data-label">Punto de Destino (Descarga)</span>
      <span class="data-val">${e.destino}</span>
    </div>
  </div>
  <div class="grid-2" style="margin-top:0.75rem">
    <div class="data-group">
      <span class="data-label">Cliente / Receptor</span>
      <span class="data-val">${e.cliente || 'Consignatario en Destino'}</span>
    </div>
    <div class="data-group">
      <span class="data-label">Estado de Carga</span>
      <span class="data-val">${e.estado}</span>
    </div>
  </div>

  <div class="section-title">2. Detalle de la Mercaderia</div>
  <div class="cargo-box">
    <div class="grid-2">
      <div class="data-group">
        <span class="data-label">Descripcion de Carga</span>
        <span class="data-val">${e.producto || 'Mercaderia General'}</span>
      </div>
      <div class="data-group">
        <span class="data-label">Peso Declarado</span>
        <span class="data-val">${e.pesoCarga ? e.pesoCarga + ' Toneladas' : 'Carga Estandar'}</span>
      </div>
    </div>
    <div class="grid-2" style="margin-top:0.6rem">
      <div class="data-group">
        <span class="data-label">Distancia Estipulada</span>
        <span class="data-val">${formatoDistancia(e.distancia)}</span>
      </div>
      <div class="data-group">
        <span class="data-label">Tiempo Estimado de Transito</span>
        <span class="data-val">${formatoTiempo(e.tiempo)}</span>
      </div>
    </div>
  </div>

  <div class="section-title">3. Unidad de Transporte y Chofer</div>
  <div class="grid-2">
    <div class="data-group">
      <span class="data-label">Camion Asignado</span>
      <span class="data-val">${camion ? camion.nombre + ' · Patente ' + (camion.patente || 'S/P') : 'Unidad de Flota TerMate'}</span>
    </div>
    <div class="data-group">
      <span class="data-label">Chofer Conductor</span>
      <span class="data-val">${chofer ? chofer.nombre + ' (DNI ' + (chofer.dni || '—') + ' · Lic. ' + (chofer.carnetCat || 'E') + ')' : (camion?.camionero || 'Chofer Designado')}</span>
    </div>
  </div>

  <div class="signatures">
    <div class="sign-box">
      Firma y Aclaracion del Chofer Conductor
    </div>
    <div class="sign-box">
      Firma, Sello y DNI Receptor Conforme
    </div>
  </div>

  <div class="footer-bar">
    Documento emitido electronicamente por Sistema TerMate. Valido como comprobante oficial de transito de mercaderias.
  </div>
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
    // 13. UTILIDADES
    // ═══════════════════════════════════════════════════════════
    function haversine(c1, c2) {
        const R = 6371;
        const dLat = (c2[0] - c1[0]) * Math.PI / 180;
        const dLon = (c2[1] - c1[1]) * Math.PI / 180;
        const a = Math.sin(dLat/2)**2 + Math.cos(c1[0]*Math.PI/180) * Math.cos(c2[0]*Math.PI/180) * Math.sin(dLon/2)**2;
        return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
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

    // ═══════════════════════════════════════════════════════════
    // 14. INICIALIZACION
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

        window.addEventListener('resize', () => {
            if (mapaFull) mapaFull.invalidateSize();
            if (mapaInline) mapaInline.invalidateSize();
        });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

})();
