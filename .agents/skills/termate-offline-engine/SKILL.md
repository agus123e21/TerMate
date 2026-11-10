---
name: termate-offline-engine
description: Arquitectura offline-first, Service Worker, almacenamiento local persistente y resiliencia para transporte en rutas sin señal.
---

# TerMate Offline Engine

Esta skill rige la arquitectura de resiliencia, funcionamiento sin conexión y persistencia local de TerMate.

## 1. Estrategia de Conectividad en Rutas
- Los camiones circulan frecuentemente por tramos de ruta nacional sin cobertura 3G/4G/5G.
- La aplicación DEBE garantizar:
  1. Consulta de remitos y detalles de carga 100% offline.
  2. Creación de nuevos remitos en modo borrador/pendiente offline con sincronización automática al recuperar señal.
  3. Cálculo de distancias y geocodificación mediante dataset embebido de respaldo cuando las APIs de red fallen.
  4. Caché inteligente de tiles de mapas ya visitados mediante el Service Worker (`sw.js`).

## 2. Service Worker (`sw.js`) & Estrategias de Caché
- **Bypass de Desarrollo Local**: Si `url.hostname === 'localhost' || url.hostname === '127.0.0.1'`, las peticiones de recursos locales (HTML, JS, CSS) van DIRECTAMENTE a la red (`fetch(event.request)`) sin tocar la caché, evitando el bloqueo de versiones antiguas entre desarrolladores.
- **Precache Tolerante a Fallos**: En el evento `install`, se precachean los activos core uno por uno con bloque `try/catch` individual (`cache.add(asset)`), asegurando que un fallo en un recurso secundario no impida la instalación del SW.
- **Mapas y Tiles**:
  - Proveedor principal: OpenStreetMap estándar (`tile.openstreetmap.org`) estilizado con `.map-tiles-dark`. Libre de API key. Prohibido CARTO (`cartocdn.com`).
  - Estrategia: *Cache First*, fallback a red. Control de cuota: no almacenar nuevos tiles si el uso excede 150 MB (`navigator.storage.estimate`).
- **APIs de Georreferenciación & Rutas**:
  - Endpoints: `apis.datos.gob.ar`, `router.project-osrm.org`, `nominatim.openstreetmap.org`.
  - Estrategia: *Network First*, fallback a `termate-api-v1`. En fallo total, degradación a dataset local de localidades argentinas.

## 3. Persistencia Segura y Cuota de Almacenamiento
- **Compresión de Rutas OSRM**:
  - Las rutas OSRM pueden contener miles de coordenadas que saturan los 5 MB de `localStorage`.
  - SIEMPRE invocar `comprimirCoords(coords, maxPuntos = 150)` antes de persistir cualquier viaje en `termate_envios`.
  - La compresión preserva obligatoriamente el punto de origen (índice 0) y el destino final (último índice), muestreando de manera uniforme los puntos intermedios.
- **Parsing Resiliente de Storage**:
  - Utilizar siempre `safeParseArray(raw)` al leer claves de `localStorage`.
  - Garantiza que si el storage contiene `null`, objetos rotos o tipos primitivos inválidos, la app degrade a un array vacío sin lanzar excepciones no controladas.

## 4. Indicadores de Estado de Red
- Detección reactiva mediante eventos `window.addEventListener('online')` y `'offline'`.
- Pastilla de estado de conexión visible en cabecera y barra lateral:
  - `[Online]`: Todas las APIs habilitadas (GeoRef, OSRM, Nominatim).
  - `[Offline]`: Operando sobre cache de tiles y datasets locales de Argentina.
