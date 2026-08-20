# TerMate — Sistema de Gestion de Rutas y Logistica de Cargas

Plataforma integral disenada para la administracion de flotas pesadas, trazado de rutas para camiones en la Republica Argentina y emision digital de remitos con funcionamiento resiliente sin conexion.

---

## 1. Arquitectura de Pantallas y Navegacion

```mermaid
graph TD
    classDef main fill:#0f172a,stroke:#38bdf8,stroke-width:2px,color:#f8fafc;
    classDef feature fill:#1e293b,stroke:#64748b,stroke-width:1px,color:#cbd5e1;
    classDef output fill:#312e81,stroke:#818cf8,stroke-width:2px,color:#ffffff;

    Root[TerMate Dashboard]:::main

    Root --> P1[1. Planificador de Ruta]:::feature
    Root --> P2[2. Mis Viajes y Remitos]:::feature
    Root --> P3[3. Mapa de Operaciones]:::feature
    Root --> P4[4. Flota y Choferes]:::feature

    P1 --> Calc[Calculo HGV con Restricciones]:::feature
    Calc --> Drag[Marcadores Arrastrables en Tiempo Real]:::feature
    Drag --> Emit[Emision de Remito Digital]:::output

    P2 --> Filters[Filtros por Estado: Pendiente / En Ruta / Entregado]:::feature
    P2 --> Detail[Ficha Detallada de Viaje]:::feature
    P2 --> Print[Impresion Termica y A4 de Comprobante]:::output

    P3 --> Layers[Selector de Capas: Dark / Streets / Satelital]:::feature
    P3 --> POIs[Puntos de Interes: Combustible y Paradores]:::feature
    P3 --> LiveStats[Metricas Flotantes en Vivo]:::output

    P4 --> Fleet[Gestion de Camiones y Consumos]:::feature
    P4 --> Drivers[Fichas de Choferes, Carnets y Scoring]:::feature
    Drivers --> Scoring[Registro de Conducta y Bonos]:::output
```

---

## 2. Flujo de Usuario y Operacion

```mermaid
sequenceDiagram
    autonumber
    actor Operador as Operador Logistico
    actor Chofer as Chofer de Camion
    participant Sistema as TerMate Web
    participant MapEngine as Motor de Mapas y Ruteo
    participant DB as Almacenamiento Local

    Operador->>Sistema: Ingresa origen, destino y carga
    Sistema->>MapEngine: Geocodifica con SerpApi Google Maps y traza ruta
    MapEngine-->>Sistema: Retorna distancia, tiempo y trazado en carreteras
    Sistema-->>Operador: Muestra ruta en mapa, tiempo y consumo de gasoil
    Operador->>Sistema: Asigna camion y chofer, y emite remito
    Sistema->>DB: Guarda viaje y actualiza indicadores KPI
    Sistema-->>Chofer: Genera remito digital con codigo de validacion e impresion
    Chofer->>Sistema: Actualiza estado del viaje (Pendiente -> En Ruta -> Entregado)
    Sistema->>DB: Registra evaluacion de viaje y scoring de desempeno
```

---

## 3. Sistema de Color y Tokens Visuales

```mermaid
graph LR
    classDef bg fill:#080c14,stroke:#334155,stroke-width:2px,color:#f8fafc;
    classDef card fill:#151e33,stroke:#334155,stroke-width:2px,color:#f8fafc;
    classDef text fill:#cbd5e1,stroke:#475569,stroke-width:2px,color:#080c14;
    classDef blue fill:#2563eb,stroke:#60a5fa,stroke-width:2px,color:#ffffff;
    classDef green fill:#10b981,stroke:#34d399,stroke-width:2px,color:#ffffff;
    classDef amber fill:#f59e0b,stroke:#fbbf24,stroke-width:2px,color:#ffffff;
    classDef red fill:#ef4444,stroke:#f87171,stroke-width:2px,color:#ffffff;

    subgraph Base_60 [60% Fondo y Superficies]
        Fondo[Fondo: #080c14]:::bg
        Panel[Paneles: #0f1524]:::bg
        Tarjeta[Tarjetas: #151e33]:::card
    end

    subgraph Estructura_30 [30% Tipografia y Lineas]
        Titulos[Titulos: #f8fafc]:::card
        Cuerpo[Cuerpo: #cbd5e1]:::card
        Bordes[Bordes: #222f4d]:::card
    end

    subgraph Acentos_10 [10% Acciones y Estados]
        Primario[Boton / CTA: #2563eb]:::blue
        Exito[Entregado / Online: #10b981]:::green
        Alerta[Pendiente / Gasoil: #f59e0b]:::amber
        Critico[Cancelado / Error: #ef4444]:::red
    end
```

---

## 4. Capacidades Principales

| Modulo | Descripcion Tecnica |
| :--- | :--- |
| **Geocodificacion Federal** | Integracion con SerpApi Google Maps Engine, GeoRef Nacional y Nominatim con fallback a dataset argentino. |
| **Trazado para Camiones** | Calculo con perfil HGV (Heavy Goods Vehicle) respetando dimensiones, alturas maximas y cargas por eje. |
| **Marcadores Interactivos** | Marcadores desbloqueables con doble clic y arrastre fluido con recalculo dinamico de distancias y consumo. |
| **Puntos de Interes (POIs)** | Visualizacion de estaciones de servicio y paradores de descanso con calificaciones y opiniones en tiempo real. |
| **Emision de Remitos** | Formato de remito oficial con codigo de barras/QR digital, comprobante para impresion termica y A4. |
| **Scoring de Choferes** | Evaluacion de cumplimiento de ruta, puntualidad, incidencias, historial de carnets y asignacion de bonos. |
| **Resiliencia Offline** | Service Worker PWA de alta velocidad que permite la operacion sin senal en rutas nacionales. |

---

## 5. Instalacion y Ejecucion

La aplicacion no requiere dependencias pesadas ni servidores complejos. Para ejecutarla localmente:

1. Clonar el repositorio:
   ```bash
   git clone https://github.com/agus123e21/gestion.0.0.2.git
   ```
2. Iniciar un servidor web local (por ejemplo con Python o Node):
   ```bash
   python -m http.server 8000
   ```
   o bien:
   ```bash
   npx serve .
   ```
3. Abrir en el navegador: `http://localhost:8000`.

---

## 6. Licencia
Proyecto desarrollado para gestion y transporte logistico bajo estandares abiertos.