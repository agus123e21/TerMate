---
name: termate-core
description: Lógica de transporte, trazado de rutas de camiones en Argentina, cálculo de combustible, peajes, emisión de remitos y geocodificación de TerMate.
---

# TerMate Core — Transporte & Logística en Argentina

Esta skill define las reglas de negocio, cálculo de rutas, gestión de flota pesada y emisión de remitos para la plataforma TerMate.

## 1. Reglas de Negocio & Transporte
- **Ámbito Geográfico**: Argentina (delimitado estrictamente por `[-56.0, -76.0]` a `[-21.0, -52.0]`).
- **Unidades de Medida**:
  - Distancia: Kilómetros (km), formateados con 1 decimal o entero si > 100 km.
  - Tiempo estimado de viaje: Calculado a velocidad promedio de camión con carga (70-80 km/h en rutas nacionales) + descansos reglamentarios cada 4 horas.
  - Consumo de Combustible:
    - Camión Liviano/Utilitario: ~14 L / 100 km
    - Chasis Rígido: ~26 L / 100 km
    - Tractor con Semirremolque (Semi): ~34 L / 100 km
    - Bitrén / Escalable: ~40 L / 100 km
- **Estados de Viaje**:
  1. `Pendiente` (Creado, sin salir)
  2. `En Transito` (En viaje sobre la ruta)
  3. `Entregado` (Descargado y completado)
  4. `Cancelado` (Anulado con motivo)

## 2. Geocodificación & Motores de Ruta
- **Cascada de Geocodificación**:
  1. *SerpApi Google Maps Engine* (si la API key está configurada y online).
  2. *GeoRef AR (apis.datos.gob.ar)* para provincias, departamentos y localidades federales.
  3. *Nominatim OpenStreetMap* acotado a `countrycodes=ar`.
  4. *Dataset local de localidades argentinas* (fallback offline instantáneo).
- **Cálculo de Trazado de Rutas**:
  - OpenRouteService / OSRM Driving profile.
  - Trazado poligonal con capa de sombra translúcida y línea principal de alto contraste.
  - Marcadores interactivos arrastrables (*draggable*) para ajuste manual fino de puntos de carga/descarga con recálculo dinámico.

## 3. Emisión de Remitos & Comprobantes
- Cada envío genera un Remito Oficial Electrónico estructurado:
  - Número de Remito (Formato `R-XXXX-XXXXXXXX`)
  - Chofer, Patente de Tractor y Semirremolque
  - Origen exacto y Destino exacto
  - Tipo de Carga, Peso (kg/ton), Bultos
  - Fecha de emisión, distancia estipulada, tiempo estimado y firma digital.
  - Impresión térmica / exportación A4 instantánea.
