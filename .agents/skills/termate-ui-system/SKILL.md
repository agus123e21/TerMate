---
name: termate-ui-system
description: Sistema de diseño, estándares visuales, componentes y microinteracciones de interfaz de usuario de TerMate.
---

# TerMate UI Design System

Esta skill establece las directrices de interfaz de usuario (UI/UX) para TerMate.

## 1. Principios de Diseño
- **Mobile-First & Thumb Zone**: Todos los controles primarios, botones de acción rápida, filtros y barras de navegación deben ser fácilmente alcanzables con una sola mano en pantallas móviles.
- **Glassmorphism & Jerarquía Neutra**:
  - Paleta base oscura neutra (`#070b12`, `#0f172a`, `#1e293b`) con bordes sutiles traslúcidos (`rgba(255, 255, 255, 0.08)`).
  - Acentos funcionales:
    - Éxito / Entregado: Esmeralda `#10b981`
    - En Tránsito / Primario: Índigo/Cielo `#38bdf8` / `#6366f1`
    - Pendiente / Alerta: Ámbar `#f59e0b`
    - Cancelado / Error: Rojo `#ef4444`
- **Regla 60/30/10**: 60% neutro base, 30% elementos secundarios estructurados, 10% acento focal.
- **8-Point Grid System**: Todo margen, padding y gap debe ser múltiplo de 4 u 8 px (4, 8, 12, 16, 20, 24, 32px).

## 2. Componentes Clave
- **Interactive Map Canvas**:
  - Mapa a pantalla completa o dividido en paneles con Leaflet 1.9.4.
  - Capas seleccionables: Dark (CartoDB Dark Matter), Streets (OSM), Satelital (Esri World Imagery).
  - Marcadores de origen (verde) y destino (rojo), y marcadores de POIs (combustible y comidas).
  - Marcadores desbloqueables con doble clic y arrastre fluido sin pérdida de zoom.
- **Action Drawers & Modals**:
  - Modales con `backdrop-filter: blur(12px)`.
  - Toasts animados con barra de progreso y dismiss táctil.
- **Cards de Envíos & Métricas**:
  - Visualización rápida de origen → destino con flecha de conexión y badges de estado.
  - Acciones rápidas en un toque: "Ver en Mapa", "Imprimir Remito", "Cambiar Estado".
