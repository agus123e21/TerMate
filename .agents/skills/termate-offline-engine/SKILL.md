---
name: termate-offline-engine
description: Arquitectura offline-first, Service Worker, almacenamiento local persistente y resiliencia para transporte en rutas sin señal.
---

# TerMate Offline Engine

Esta skill rige la arquitectura de resiliencia y funcionamiento sin conexión de TerMate.

## 1. Estrategia de Conectividad en Rutas
- Los camiones circulan frecuentemente por tramos de ruta nacional sin cobertura 3G/4G/5G.
- La aplicación DEBE garantizar:
  1. Consulta de remitos y detalles de carga 100% offline.
  2. Creación de nuevos remitos en modo borrador/pendiente offline con sincronización automática al recuperar señal.
  3. Cálculo de distancias y geocodificación mediante dataset embebido de respaldo cuando las APIs de red fallen.
  4. Caché inteligente de tiles de mapas ya visitados mediante el Service Worker (`sw.js`).

## 2. Indicadores de Estado de Red
- Detección reactiva mediante eventos `window.addEventListener('online')` y `'offline'`.
- Pastilla de estado de conexión visible en cabecera y barra lateral:
  - [Online]: Todas las APIs habilitadas (SerpApi, OSRM, GeoRef).
  - [Offline]: Operando sobre cache y datasets locales de Argentina.
