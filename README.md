# Control de Logística - Dashboard

Este es un panel de control logístico optimizado para la gestión de envíos, visualización de rutas viales reales mediante OpenStreetMap/OSRM y seguimiento animado en tiempo real.

## Cómo ejecutar el proyecto

Dado que el código ha sido modernizado para utilizar **Módulos de ES6 (`type="module"`)** para evitar la polución del ámbito global y optimizar la carga, los navegadores modernos bloquearán la ejecución si se abre el archivo `index.html` directamente haciendo doble clic (debido a la política de seguridad CORS).

Para ejecutarlo localmente sin problemas, debes servir los archivos a través de un servidor web local. Puedes usar cualquiera de las siguientes opciones sencillas:

### Opción 1: Usando NodeJS (Recomendado)
Ejecuta el siguiente comando en la terminal en la raíz del proyecto:
```bash
npx serve .
```
O si tienes Python instalado:
```bash
python -m http.server 8000
```

### Opción 2: Extensión de editor (VS Code)
Si utilizas **Visual Studio Code**, puedes instalar la extensión **Live Server** y pulsar el botón "Go Live" en la esquina inferior derecha.

---

## Características de la versión 1.1

1. **Modularización Segura**: Cero variables globales, evitando colisiones con otros scripts.
2. **Consultas de Ubicación Inteligentes**: Geocodificación dinámica a través de la API pública de **Nominatim (OpenStreetMap)** con almacenamiento en caché persistente en el navegador para no sobrecargar el servicio.
3. **Optimización de Mapas**: La carga de coordenadas y rutas ocurre en segundo plano al guardar/editar el envío, evitando peticiones redundantes e inseguras durante el ciclo de renderizado.
4. **Seguimiento Realista**: Animación fluida de los vehículos en tránsito calculada a lo largo del trazado real de carreteras e interpolada por distancia/tiempo.
5. **Robustez y Mensajes Visuales**: Manejo transparente de fallos de red con fallback automático a distancias Haversine (línea recta) y alertas informativas en pantalla (Toasts).
6. **Filtros, Búsqueda y Paginación**: Panel de visualización con capacidad de búsqueda de texto, filtro por estados y paginación ajustable de filas.
7. **Edición Completa**: Formulario adaptativo que permite registrar nuevos envíos y editar envíos existentes de forma integrada.
