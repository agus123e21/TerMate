---
name: termate-core
description: Lógica de transporte, trazado de rutas de camiones en Argentina, cálculo de combustible, peajes, emisión de remitos y geocodificación de TerMate.
---

# TerMate Core — Transporte & Logística en Argentina

Esta skill define las reglas de negocio, cálculo de rutas, gestión de flota pesada, mapas y emisión de remitos para la plataforma TerMate.

## 1. Reglas de Negocio & Transporte
- **Ámbito Geográfico**: Argentina (delimitado estrictamente por `[-56.0, -76.0]` a `[-21.0, -52.0]`).
- **Unidades de Medida**:
  - Distancia: Kilómetros (km), formateados con 1 decimal o entero si > 100 km.
  - Tiempo estimado de viaje: Calculado a velocidad promedio de camión con carga (70-80 km/h en rutas nacionales) + descansos reglamentarios cada 4 horas.
  - Consumo de Combustible (`formatoFuel`):
    - Camión Liviano / Utilitario: ~14 L / 100 km
    - Chasis Rígido: ~26 L / 100 km
    - Tractor con Semirremolque (Semi): ~34 L / 100 km
    - Bitrén / Escalable: ~40 L / 100 km
    - Distancias de 0 km deben formatearse estrictamente como `"0 L"`.
- **Estados de Viaje**:
  1. `Pendiente` (Creado, sin salir)
  2. `En Transito` (En viaje sobre la ruta)
  3. `Entregado` (Descargado y completado)
  4. `Cancelado` (Anulado con motivo)

## 2. Motor Cartográfico & Trazado de Rutas
- **Proveedor Cartográfico**:
  - OpenStreetMap estándar: `https://tile.openstreetmap.org/{z}/{x}/{y}.png`. 100% libre sin API key.
  - Renderizado Dark Mode mediante filtro CSS `.map-tiles-dark`.
  - **PROHIBIDO CARTO (`cartocdn.com`)** debido a bloqueos de CORS y errores 403.
- **Validación Estricta de Coordenadas (`esCoordValida`)**:
  - Validar siempre antes de interactuar con Leaflet (`setView`, `fitBounds`).
  - Descartar coordenadas inválidas como `[NaN, NaN]`, `null` o fuera del bounding box argentino.
  - Si sólo hay 1 punto válido, usar `setView(coord, 12)` evitando crear bounds con un único punto para prevenir zoom infinito.
- **Compresión de Rutas OSRM**:
  - Trazado poligonal vía OSRM (`router.project-osrm.org`).
  - Toda polilínea debe pasar por `comprimirCoords(coords, 150)` antes de persistirse en `localStorage` para garantizar la cuota de almacenamiento.

## 3. Geocodificación en Cascada
1. *SerpApi Google Maps Engine* (si la API key está presente y con red activa).
2. *GeoRef AR (`apis.datos.gob.ar`)* para provincias, departamentos y localidades argentinas oficiales.
3. *Nominatim OpenStreetMap* acotado a `countrycodes=ar`.
4. *Dataset local de localidades argentinas* (fallback offline inmediato).

## 4. Emisión de Remitos & Seguridad contra XSS
- Cada despacho genera un Remito Oficial Electrónico estructurado:
  - Número de Remito (Formato `R-XXXX-XXXXXXXX`).
  - Chofer, Patente de Tractor y Semirremolque.
  - Origen exacto y Destino exacto.
  - Tipo de Carga, Peso (kg/ton), Bultos.
  - Fecha de emisión, distancia estipulada, tiempo estimado y firma digital.
  - Impresión térmica / exportación A4 instantánea.
- **Seguridad**:
  - SIEMPRE invocar `escapeHTML()` sobre campos de texto antes de concatenar en templates HTML de remitos, tablas o modales.
