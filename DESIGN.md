# TerMate Design System & Arquitectura de Interfaz

## 1. Visión y Filosofía de Producto
TerMate es la plataforma de gestión logística, trazado de rutas de transporte pesado y emisión digital de remitos en la República Argentina.
Diseñada bajo principios **Mobile-First**, ergonomía táctil para choferes en cabina, visualización integral para operadores logísticos de escritorio y una identidad visual **Obsidian & Electric Blue** de alto contraste.

---

## 2. Flujo Integral de Pantallas (Screen Flow Architecture)

```mermaid
graph TD
    classDef main fill:#131d33,stroke:#2563eb,stroke-width:2px,color:#f8fafc;
    classDef sub fill:#0e1526,stroke:#475569,stroke-width:1px,color:#cbd5e1;
    classDef action fill:#2563eb,stroke:#60a5fa,stroke-width:2px,color:#ffffff;

    App["TerMate Web Application"]:::main

    App --> TabRuta["Tab 1: Nueva Ruta (TabRuta)"]:::main
    App --> TabViajes["Tab 2: Mis Viajes (TabViajes)"]:::main
    App --> TabMapa["Tab 3: Mapa de Flota (TabMapa)"]:::main
    App --> TabFlota["Tab 4: Camiones y Choferes (TabFlota)"]:::main

    TabRuta --> Autocomplete["Autocompletado Nominatim OSM + Caché Local + Dataset Embebido AR"]:::sub
    Autocomplete --> RoutingEngine["Motor OSRM (router.project-osrm.org) + Compresión <=150 pts + Fallback Haversine 1.25x"]:::sub
    RoutingEngine --> InlineMap["Mapa Previo (InlineMap): Capas Calles (OSM) / Satelital (ArcGIS) y POIs"]:::sub
    InlineMap --> ModalViaje["Modal: Asignar Camión, Cliente y N° Remito"]:::action
    ModalViaje --> SaveTrip["Guardado Local (localStorage) y Emisión de Despacho"]:::action

    TabViajes --> FilterBar["Filtros de Estado: Todos / Pendientes / En Ruta / Entregados"]:::sub
    TabViajes --> SearchBar["Buscador en Tiempo Real y Ordenamiento Determinista (Recientes / Distancia / Estado)"]:::sub
    TabViajes --> TripCard["Tarjetas de Viaje (ViajeCard v2)"]:::sub
    TripCard --> ModalDetalle["Modal: Detalle de Viaje, Edición, Cambio de Estado y Borrado con Confirmación/Deshacer"]:::action
    TripCard --> PrintRemito["Generador e Impresión de Remito Oficial (HTML / A4)"]:::action

    TabMapa --> LayerSwitch["Selector de Capas: Calles (OpenStreetMap) / Satelital (ArcGIS World Imagery)"]:::sub
    TabMapa --> POISwitch["Capas POI: Estaciones de Servicio y Paradores de Descanso"]:::sub
    TabMapa --> LiveStats["Panel Flotante de Estadísticas Operativas"]:::sub

    TabFlota --> SubCamiones["Subtab: Administración de Camiones (Dimensiones y Consumo Gasoil)"]:::sub
    TabFlota --> SubChoferes["Subtab: Fichas de Choferes, Vigencia de Licencias y Scoring"]:::sub
    TabFlota --> BackupJSON["Respaldo y Recuperación: Backup / Restore JSON Local"]:::action
    SubChoferes --> ModalConducta["Modal: Registro Manual de Evaluación de Conducción y Bonos"]:::action
    SubChoferes --> ModalPerfil["Modal: Ficha Integral e Historial del Chofer"]:::action
```

### Detalle Operativo por Pantalla (`TabRuta`, `TabViajes`, `TabMapa`, `TabFlota`)
- **`TabRuta` (Nueva Ruta y Previsualización `InlineMap`)**:
  - **Autocompletado y Geocodificación**: Consulta en vivo a **Nominatim OpenStreetMap** acotado a Argentina (`countrycodes=ar`), respaldado por caché persistente (`termate_geo_cache`) y fallback inmediato al **Dataset Embebido de Localidades de Argentina** en `js/app.js`. *(Nota arquitectónica: Aunque `sw.js` contempla orígenes como `apis.datos.gob.ar` [GeoRef] y `api.openrouteservice.org` [ORS] en su lista de red, el runtime actual de `js/app.js` no los invoca).*
  - **Cálculo de Ruta**: Consulta a **OSRM (`router.project-osrm.org`)** con factor de ajuste de tiempo comercial para transporte pesado (`1.15x`), compresión de polilínea (`<= 150 puntos`) para proteger la cuota de `localStorage`, y cálculo de consumo de gasoil interpolado según el peso de la carga y el camión asignado. Cuando no hay señal o OSRM no responde, opera el fallback offline mediante cálculo lineal **Haversine** con coeficiente vial (`1.25x`) y velocidad media estimada (`70 km/h`).
  - **Mapa de Previsualización (`InlineMap`)**: Incluye selectores de capa **Calles (OpenStreetMap estándar)** y **Satelital (ArcGIS World Imagery)**, además de interruptores de POIs (**Estaciones** y **Paradores**). Los marcadores de origen y destino son estáticos de visualización (no arrastrables en vivo).
- **`TabViajes` (Mis Viajes y Remitos)**:
  - **Búsqueda, Filtros y Ordenamiento**: Buscador en tiempo real (por origen, destino, carga, cliente o número de remito), filtros por estado (`Todos`, `Pendientes`, `En Ruta`, `Entregados`) y ordenamiento determinista (por recientes, distancia o estado).
  - **Gestión del Despacho**: Vista detallada en modal, rotación de estados operativos, edición completa, borrado con confirmación/deshacer y generación de **Remito Oficial imprimible en formato HTML/A4** (documento limpio con firmas de chofer y receptor, sin códigos QR ni códigos de barras simulados).
- **`TabMapa` (Mapa de Flota / Operaciones)**:
  - **Capas Base Permitidas**: Selector entre **Calles (OpenStreetMap estándar)** y **Satelital (ArcGIS World Imagery)**.
  - **Superposiciones Operativas**: Buscador geográfico integrado en el mapa, activación de POIs ruteros (**Estaciones de Servicio** y **Paradores y Descansos**), trazado de todas las rutas activas codificadas por color de estado y panel flotante de métricas (`Rutas en Mapa`, `En Ruta`, `Distancia Total`).
- **`TabFlota` (Camiones y Choferes)**:
  - **Administración de Camiones**: Alta, edición y baja con desvinculación en cascada y preservación de snapshot histórico en viajes; configuración de patente, chofer habitual, peso máximo, dimensiones (`alto`, `largo`, `ancho`) y consumo de gasoil (`vacío` y `a plena carga` en L/100km).
  - **Fichas de Choferes y Licencias**: Gestión de datos personales, certificaciones/capacitaciones y control automático de estado de licencia profesional (**vencida**, **próxima a vencer en 30 días**, **vigente** o **fecha sin registrar**).
  - **Evaluación de Conducción y Respaldo**: Registro manual de evaluaciones de desempeño por viaje (cumplimiento de ruta, puntualidad, incidencias y asignación de bonos) con anillo visual de scoring (`0% - 100%`), complementado con **Backup/Restore JSON local** para resguardo y restauración íntegra de datos.

---

## 3. Flujo de Usuario (User Journey Map)

```mermaid
sequenceDiagram
    autonumber
    actor Operador as Operador / Chofer
    participant UI as Interfaz TerMate
    participant GeoAPI as Nominatim OSM + Cache + Dataset AR
    participant RouteEngine as OSRM Routing / Fallback Haversine 1.25x
    participant Storage as localStorage + JSON Backup

    Operador->>UI: Ingresa origen, destino, carga y camion en TabRuta
    UI->>GeoAPI: Consulta sugerencias y geocodifica (Cache -> Nominatim -> Dataset AR)
    GeoAPI-->>UI: Retorna coordenadas validadas en territorio argentino
    UI->>RouteEngine: Solicita trazado vial a OSRM (timeout 7s)
    alt Conexion OSRM exitosa
        RouteEngine-->>UI: Retorna polilinea (comprimida <=150 pts), distancia y tiempo comercial (1.15x)
    else Sin red o fallo OSRM
        RouteEngine-->>UI: Aplica fallback Haversine (factor vial 1.25x) y alerta aproximacion
    end
    UI-->>Operador: Renderiza ruta estatica en InlineMap (Calles OSM / Satelital ArcGIS) y gasoil estimado

    Operador->>UI: Asigna cliente, confirma N° de remito y emite despacho
    UI->>Storage: Persiste viaje comprimido y actualiza KPIs / TabViajes / TabMapa
    Operador->>UI: Filtra, ordena o consulta detalle en TabViajes y solicita impresion
    UI-->>Operador: Genera Remito Oficial HTML/A4 listo para impresion
```

---

## 4. Sistema de Color y Tokens — Obsidian & Electric Blue (Regla 60 / 30 / 10)

```mermaid
graph LR
    classDef base fill:#060911,stroke:#334155,stroke-width:2px,color:#f8fafc;
    classDef surface fill:#0e1526,stroke:#334155,stroke-width:2px,color:#f8fafc;
    classDef structural fill:#131d33,stroke:#475569,stroke-width:2px,color:#cbd5e1;
    classDef accentPrimary fill:#2563eb,stroke:#60a5fa,stroke-width:2px,color:#ffffff;
    classDef accentSuccess fill:#10b981,stroke:#34d399,stroke-width:2px,color:#ffffff;
    classDef accentWarning fill:#f59e0b,stroke:#fbbf24,stroke-width:2px,color:#ffffff;
    classDef accentDanger fill:#ef4444,stroke:#f87171,stroke-width:2px,color:#ffffff;

    subgraph Base_60pct ["Superficie Base 60%"]
        BG["Fondo Principal: #060911"]:::base
        Surface["Superficie Paneles: #0e1526"]:::surface
        Card["Tarjetas y Modales: #131d33"]:::structural
    end

    subgraph Estructural_30pct ["Estructura y Tipografia 30%"]
        TextTitle["Titulos: #f8fafc"]:::structural
        TextBody["Cuerpo: #cbd5e1"]:::structural
        TextMuted["Secundario: #8493a8"]:::structural
        Border["Bordes y Guias: rgba(255,255,255,0.08)"]:::structural
    end

    subgraph Acentos_10pct ["Acentos Funcionales 10%"]
        AccPrimary["Primario / CTAs: #2563eb"]:::accentPrimary
        AccSuccess["Entregado / Online: #10b981"]:::accentSuccess
        AccWarning["Pendiente / Combustible: #f59e0b"]:::accentWarning
        AccDanger["Cancelado / Alerta: #ef4444"]:::accentDanger
    end
```

---

## 5. Arquitectura de Geocodificación y Resiliencia Offline

```mermaid
graph TD
    classDef online fill:#064e3b,stroke:#10b981,stroke-width:2px,color:#ffffff;
    classDef fallback fill:#78350f,stroke:#f59e0b,stroke-width:2px,color:#ffffff;
    classDef local fill:#131d33,stroke:#2563eb,stroke-width:2px,color:#ffffff;

    Req["Peticion de Direccion o Localidad"] --> CacheGeo{"Existe en Cache Local (termate_geo_cache)?"}
    CacheGeo -- "Si" --> ReturnCoords["Retorna Coordenadas Cacheadas"]:::local
    CacheGeo -- "No" --> CheckNet{"Dispositivo Online?"}

    CheckNet -- "Si" --> Nominatim["Nivel 1 Online: Nominatim OpenStreetMap (AR)"]:::online
    Nominatim -- "Exito" --> SaveCache["Guarda en termate_geo_cache (max 100 entradas)"]:::local
    SaveCache --> ReturnCoords

    CheckNet -- "No" --> FallbackDataset["Nivel 2 Offline: Dataset Embebido de Localidades de Argentina"]:::fallback
    Nominatim -- "Falla o Sin Resultados" --> FallbackDataset
    FallbackDataset --> RouteCalc["Ruteo OSRM Online o Fallback Lineal Haversine (1.25x)"]:::fallback
```

> [!NOTE]
> **Alcance en Runtime vs. Service Worker (`sw.js`)**: El motor activo en `js/app.js` resuelve direcciones exclusivamente mediante `termate_geo_cache`, **Nominatim OpenStreetMap** y el **Dataset Embebido de Localidades de Argentina**. Aunque `sw.js` declara reglas de intercepción *Network-First* para dominios como `apis.datos.gob.ar` (GeoRef) o `api.openrouteservice.org` (ORS), dichos servicios se mantienen como previsión de infraestructura en el Service Worker y no son consumidos por `js/app.js`.

---

## 6. Capacidades Operativas Verificadas vs. Capacidades Fuera de Alcance / Aspiracionales

Para evitar divergencias entre el diseño documental y la evidencia del código en producción (`index.html`, `js/app.js`, `css/styles.css`, `sw.js`), se establece la siguiente matriz de verdad operativa:

| Dominio | Capacidades Operativas Verificadas (Runtime Actual) | Capacidades Fuera de Alcance / Aspiracionales (No en Runtime) |
| :--- | :--- | :--- |
| **Geocodificación** | Autocompletado y resolución con **Nominatim OpenStreetMap** (`countrycodes=ar`), caché persistente (`termate_geo_cache`) y fallback al **Dataset Embebido de Localidades de Argentina**. | Integración activa en `js/app.js` con **GeoRef AR** (`apis.datos.gob.ar`), **OpenRouteService (ORS)** o **SerpApi Google Maps**. |
| **Motor de Ruteo** | Cálculo vial mediante **OSRM (`router.project-osrm.org`)** con ajuste de tiempo comercial (`1.15x`), compresión de polilínea (`<= 150 puntos`) y fallback offline **Haversine (`1.25x`)**. | Ruteo **HGV** con restricciones viales activas por dimensiones físicas (altura de puentes, ancho, largo) o peso máximo por eje. |
| **Mapas e Interacción** | Doble instancia Leaflet (`TabMapa` e `InlineMap`) con capas **Calles (OpenStreetMap estándar)** y **Satelital (ArcGIS World Imagery)**, más POIs locales de **Estaciones** y **Paradores**. | **Marcadores arrastrables** con recálculo de ruta en vivo y **seguimiento GPS / telemetría en tiempo real**. |
| **Viajes y Remitos** | Búsqueda en vivo, filtros por estado (`Todos`, `Pendientes`, `En Ruta`, `Entregados`), ordenamiento determinista, detalle modal, borrado con confirmación/deshacer y **Remito Oficial HTML/A4**. | Impresión térmica ESC/POS dedicada o inclusión de **códigos QR / códigos de barras** dinámicos en el remito impreso. |
| **Flota y Choferes** | ABM de camiones y choferes, control de vencimiento de licencias (vencida, próxima en 30 días, vigente, sin fecha), scoring por evaluación manual de viajes y **Backup/Restore JSON local**. | Sincronización automática en la nube multi-dispositivo o ingesta telemática automática de conducción. |

---

## 7. Jerarquía de Aislamiento Visual (Z-Index)
- `Header y Sidebar`: `z-index: 5000` (Fijos y visibles siempre por encima del contenido).
- `Bottom Navigation Bar`: `z-index: 5000` (Ergonomía táctil fija en la base de la pantalla sin superposiciones).
- `Modales y Diálogos`: `z-index: 9000` (Aislamiento completo sobre la capa de trabajo).
- `Notificaciones Toast`: `z-index: 9999` (Feedback de sistema en primer plano).
- `Capas de Mapa Leaflet`: `z-index: 5` a `25` (Contenidas estrictamente dentro de su contenedor).
