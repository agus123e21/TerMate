# AGENTS.md — TerMate Engineering & AI Agent Protocol

Guía de referencia rápida y alta densidad para agentes de IA (Cursor, Claude, Copilot, Antigravity) que colaboran en el repositorio TerMate.

---

## 1. Identidad y Arquitectura del Proyecto
- **Propósito**: PWA logística y despacho de transporte pesado en Argentina (rutas, remitos electrónicos, combustible, flota).
- **Stack Técnico**: Vanilla JavaScript (ES6+), HTML5 semántico accesible, CSS3 (Obsidian & Electric Blue).
- **Cero Build Step**: Sin bundlers, sin transpiladores (Webpack/Vite/Babel). Ejecución nativa directa en el navegador.
- **Librerías CDN Core**: Leaflet 1.9.4 (`leaflet.js`, `leaflet.css`), fuentes Google Inter. No agregar librerías externas pesadas.
- **Tema Visual**: *Obsidian & Electric Blue* — Paleta oscura industrial (`#060911`, `#0e1526`, `#131d33`), acento primario azul eléctrico (`#2563eb`, `#60a5fa`) y acentos semánticos en esmeralda/ámbar/rojo.

---

## 2. Mapa del Repositorio y Responsabilidades
| Archivo / Carpeta | Responsabilidad |
|---|---|
| `index.html` | Shell SPA, modales de flota/viajes/confirmación, controles de backup/restore, marcado ARIA accesible. |
| `js/app.js` | Estado global (`envios`, `camiones`, `camioneros`), geocodificación, OSRM, render Leaflet, métricas, validaciones, backup/restore y borradores. |
| `css/styles.css` | Sistema Obsidian & Electric Blue, layout responsivo mobile-first, clases de mapa (`.map-tiles-dark`), accesibilidad y estados de foco. |
| `sw.js` | Service Worker PWA, estrategia offline-first, precache resiliente, bypass directo en `localhost`/`127.0.0.1`. |
| `tests/` | Suites de validación y red-team (`certificacion_final_ciclo4.js`, auditorías de storage, XSS y coordenadas). |
| `.agents/skills/` | Habilidades especializadas (`termate-core`, `termate-offline-engine`, `termate-ui-system`). |

---

## 3. Contratos de Datos y Esquemas (`localStorage`)
Claves utilizadas en almacenamiento:
- `termate_envios`: Lista de viajes/despachos registrados (`contador`: `termate_contador`).
- `termate_camiones`: Catálogo de flota pesada (`contador`: `termate_cont_camiones`).
- `termate_camioneros`: Registro de choferes y licencias (`contador`: `termate_cont_camioneros`).
- `termate_geo_cache`: Caché en memoria/disco de resoluciones geográficas.
- `termate_draft_ruta`: Borrador temporal del formulario Nueva Ruta.

### Esquema: Envíos (`envios[]`)
```typescript
interface Envio {
  id: number;
  origen: string;
  destino: string;
  producto: string;
  pesoCarga: number | null; // en toneladas
  estado: 'Pendiente' | 'En Transito' | 'Entregado' | 'Cancelado';
  camionId: number | null;
  cliente?: string;
  remito?: string; // Formato "R-0001-XXXXXXXX"
  distancia: number; // en km
  tiempo: number; // en horas
  coordsOrigen?: [lat: number, lng: number];
  coordsDestino?: [lat: number, lng: number];
  coordsRuta?: [number, number][]; // Polilínea comprimida (máx 150 pts)
  fecha: string; // ISO String
}
```

### Esquema: Camiones (`camiones[]`)
```typescript
interface Camion {
  id: number;
  nombre: string;
  patente: string; // "AA 123 BB" o "ABC 123"
  camionero: string;
  camioneroId: number | null;
  peso: number; // Capacidad máx en tn
  alto: number; // en m
  largo: number; // en m
  ancho: number; // en m
  consumoVacio: number; // L/100km
  consumoLleno: number; // L/100km
}
```

### Esquema: Camioneros (`camioneros[]`)
```typescript
interface Camionero {
  id: number;
  nombre: string;
  dni: string;
  tel: string;
  ingreso: string; // YYYY-MM-DD
  carnetNum: string;
  carnetCat: string; // 'C' | 'D' | 'E'
  carnetVto: string; // YYYY-MM-DD
  camionAsignadoId: number | null;
  capacitaciones: { nombre: string; fecha: string }[];
  historial: { fecha: string; ruta: string; puntualidad: string; incidencias: string; bono: string; obs: string }[];
}
```

---

## 4. Reglas Estrictas para Agentes de IA
1. **Mapas & Tiles**:
   - Usar **OpenStreetMap estándar por defecto**: `https://tile.openstreetmap.org/{z}/{x}/{y}.png` (sin filtros CSS de inversión ni distorsión, render nativo limpio).
   - Capa secundaria disponible: **ArcGIS Satelital**: `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}`.
   - Tanto el mapa general como el mapa de previsualización inline deben poseer selectores de capa ("Calles" y "Satelital") y de POIs ("Estaciones" y "Paradores").
   - **PROHIBIDO el uso de CARTO (`cartocdn.com`)** debido a bloqueos de CORS, requerimiento de token y respuestas 403 en producción.
2. **Seguridad contra XSS**:
   - **NUNCA** inyectar variables de entrada de usuario o de storage directamente en `innerHTML`.
   - **SIEMPRE** sanitizar con `escapeHTML(valor)` antes de renderizar tablas, cards o modales.
3. **Persistencia y Memoria (`localStorage`)**:
   - **SIEMPRE** deserializar arrays con `safeParseArray(raw)` para evitar que datos nulos o corruptos rompan el renderizado.
   - **SIEMPRE** comprimir rutas OSRM con `comprimirCoords(coords, 150)` antes de persistir en `localStorage` (evita exceder la cuota de 5MB).
4. **Validación de Coordenadas**:
   - Verificar siempre coordenadas con `esCoordValida(coord)` antes de pasarlas a Leaflet (`setView`, `fitBounds`, `L.latLngBounds`).
   - Bloquear y descartar arrays con `NaN`, `null` o fuera del bounding box argentino `[-56.0, -76.0]` a `[-21.0, -52.0]`.
5. **Service Worker en Desarrollo**:
   - En `localhost` o `127.0.0.1`, las peticiones de recursos locales van directo a la red sin tocar caché para evitar el infierno de caché entre colaboradores.
   - Si se edita `sw.js`, actualizar versión en query param (`sw.js?v=X.Y.Z`).

---

## 5. Comandos de Verificación Inmediata
Antes de dar por finalizada cualquier tarea o realizar un commit, ejecutar:
```bash
# 1. Comprobación estricta de sintaxis JavaScript
node --check js/app.js
node --check sw.js

# 2. Ejecución de la suite de certificación y tests unitarios
node tests/certificacion_final_ciclo4.js
```
*Si cualquier comando retorna código != 0, corregir de inmediato antes de commitear.*
