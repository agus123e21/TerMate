# TerMate Design System & Arquitectura de Interfaz

## 1. Vision y Filosofia de Producto
TerMate es la plataforma de gestion logistica, trazado de rutas de transporte pesado y emision digital de remitos en la Republica Argentina.
Disenada bajo principios Mobile-First, ergonomia tactil para choferes en cabina y visualizacion integral para operadores logisticos de escritorio.

---

## 2. Flujo Integral de Pantallas (Screen Flow Architecture)

```mermaid
graph TD
    classDef main fill:#1e293b,stroke:#38bdf8,stroke-width:2px,color:#f8fafc;
    classDef sub fill:#0f172a,stroke:#64748b,stroke-width:1px,color:#cbd5e1;
    classDef action fill:#312e81,stroke:#818cf8,stroke-width:2px,color:#ffffff;

    App[TerMate Web Application]:::main

    App --> TabRuta[Tab 1: Nueva Ruta]:::main
    App --> TabViajes[Tab 2: Mis Viajes]:::main
    App --> TabMapa[Tab 3: Mapa de Operaciones]:::main
    App --> TabFlota[Tab 4: Camiones y Choferes]:::main

    TabRuta --> Autocomplete[Autocompletado de Direcciones Nominatim / GeoRef]:::sub
    Autocomplete --> RoutingEngine[Motor de Calculo OSRM / ORS]:::sub
    RoutingEngine --> InlineMap[Visualizador de Ruta con Marcadores Arrastrables]:::sub
    InlineMap --> ModalViaje[Modal: Asignar Cliente y Remito]:::action
    ModalViaje --> SaveTrip[Guardado Local y Emision de Remito]:::action

    TabViajes --> FilterBar[Filtros: Todos / Pendiente / En Ruta / Entregado]:::sub
    TabViajes --> SearchBar[Buscador en Tiempo Real]:::sub
    TabViajes --> TripCard[Tarjetas de Viaje Expandibles]:::sub
    TripCard --> ModalDetalle[Modal: Detalle del Viaje y Cambio de Estado]:::action
    TripCard --> PrintRemito[Generador e Impresion de Remito Oficial]:::action

    TabMapa --> LayerSwitch[Selector de Capas: Dark / Streets / Satelital]:::sub
    TabMapa --> POISwitch[Capas POI: Estaciones de Servicio y Paradores]:::sub
    TabMapa --> LiveStats[Panel Flotante de Estadisticas en Vivo]:::sub

    TabFlota --> SubCamiones[Subtab: Administracion de Camiones]:::sub
    TabFlota --> SubChoferes[Subtab: Fichas de Choferes y Scoring]:::sub
    SubChoferes --> ModalConducta[Modal: Registro de Conducta y Bonos]:::action
    SubChoferes --> ModalPerfil[Modal: Perfil Completo del Camionero]:::action
```

---

## 3. Flujo de Usuario (User Journey Map)

```mermaid
sequenceDiagram
    autonumber
    actor Operador as Operador / Chofer
    participant UI as Interfaz TerMate
    participant GeoAPI as Nominatim / GeoRef Engine
    participant RouteEngine as OSRM / ORS Routing
    participant Storage as Base de Datos Local

    Operador->>UI: Ingresa origen y destino de carga
    UI->>GeoAPI: Consulta ubicaciones federales argentinas
    GeoAPI-->>UI: Retorna coordenadas normalizadas
    UI->>RouteEngine: Solicita calculo de ruta y distancias
    RouteEngine-->>UI: Retorna geometria poligonal y kilometraje
    UI-->>Operador: Muestra ruta en mapa, tiempo y litros de gasoil estimados
    
    opt Ajuste Fino en Mapa
        Operador->>UI: Desbloquea y arrastra marcadores de carga/descarga
        UI->>RouteEngine: Recalcula distancia y tiempo suavemente
    end

    Operador->>UI: Confirma emision del remito
    UI->>Storage: Persiste viaje y actualiza contadores KPI
    UI-->>Operador: Emite comprobante digital listo para impresion termica o A4
```

---

## 4. Sistema de Color y Tokens (Regla 60 / 30 / 10)

```mermaid
graph LR
    classDef base fill:#060911,stroke:#334155,stroke-width:2px,color:#f8fafc;
    classDef surface fill:#0e1526,stroke:#334155,stroke-width:2px,color:#f8fafc;
    classDef structural fill:#131d33,stroke:#475569,stroke-width:2px,color:#cbd5e1;
    classDef accentPrimary fill:#2563eb,stroke:#60a5fa,stroke-width:2px,color:#ffffff;
    classDef accentSuccess fill:#10b981,stroke:#34d399,stroke-width:2px,color:#ffffff;
    classDef accentWarning fill:#f59e0b,stroke:#fbbf24,stroke-width:2px,color:#ffffff;
    classDef accentDanger fill:#ef4444,stroke:#f87171,stroke-width:2px,color:#ffffff;

    subgraph Base_60pct [Superficie Base 60%]
        BG[Fondo Principal: #060911]:::base
        Surface[Superficie Paneles: #0e1526]:::surface
        Card[Tarjetas y Modales: #131d33]:::structural
    end

    subgraph Estructural_30pct [Estructura y Tipografia 30%]
        TextTitle[Titulos: #f8fafc]:::structural
        TextBody[Cuerpo: #cbd5e1]:::structural
        TextMuted[Secundario: #8493a8]:::structural
        Border[Bordes y Guias: rgba 255,255,255,0.08]:::structural
    end

    subgraph Acentos_10pct [Acentos Funcionales 10%]
        AccPrimary[Primario / CTAs: #2563eb]:::accentPrimary
        AccSuccess[Entregado / Online: #10b981]:::accentSuccess
        AccWarning[Pendiente / Combustible: #f59e0b]:::accentWarning
        AccDanger[Cancelado / Alerta: #ef4444]:::accentDanger
    end
```

---

## 5. Arquitectura de Geocodificacion y Resiliencia Offline

```mermaid
graph TD
    classDef online fill:#064e3b,stroke:#10b981,stroke-width:2px,color:#ffffff;
    classDef fallback fill:#78350f,stroke:#f59e0b,stroke-width:2px,color:#ffffff;
    classDef local fill:#1e1b4b,stroke:#6366f1,stroke-width:2px,color:#ffffff;

    Req[Peticion de Direccion o POI] --> CheckNet{Dispositivo Online?}
    
    CheckNet -- Si --> GeoRef[Nivel 1: GeoRef AR Datos Publicos]:::online
    GeoRef -- Falla --> Nominatim[Nivel 2: Nominatim OpenStreetMap]:::online
    
    CheckNet -- No --> CacheGeo[Nivel 3: Cache Local de Direcciones]:::local
    Nominatim -- Falla --> CacheGeo
    CacheGeo -- No Encontrado --> FallbackDataset[Nivel 4: Dataset Embebido Localidades Argentina]:::fallback
    
    FallbackDataset --> HaversineCalc[Calculo Lineal Haversine + Modo Edicion Manual]:::fallback
```

---

## 6. Jerarquia de Aislamiento Visual (Z-Index)
- `Header y Sidebar`: `z-index: 5000` (Fijos y visibles siempre por encima del contenido).
- `Bottom Navigation Bar`: `z-index: 5000` (Ergonomia tactil fija en la base de la pantalla sin superposiciones).
- `Modales y Dialogos`: `z-index: 9000` (Aislamiento completo sobre la capa de trabajo).
- `Notificaciones Toast`: `z-index: 9999` (Feedback de sistema en primer plano).
- `Capas de Mapa Leaflet`: `z-index: 5` a `25` (Contenidas estrictamente dentro de su contenedor).
