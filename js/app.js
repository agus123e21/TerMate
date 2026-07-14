let envios = JSON.parse(localStorage.getItem('envios')) || [];
let contadorId = parseInt(localStorage.getItem('contadorId')) || 1;

function guardar() {
    localStorage.setItem('envios', JSON.stringify(envios));
    localStorage.setItem('contadorId', contadorId);
}

function fechaActual() {
    const opciones = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
    return new Date().toLocaleDateString('es-ES', opciones);
}

function actualizarKPIs() {
    const total = envios.length;
    const pendientes = envios.filter(e => e.estado === 'Pendiente').length;
    const transito = envios.filter(e => e.estado === 'En Transito').length;
    const entregados = envios.filter(e => e.estado === 'Entregado').length;

    document.getElementById('kpi-total').textContent = total;
    document.getElementById('kpi-pendiente').textContent = pendientes;
    document.getElementById('kpi-transito').textContent = transito;
    document.getElementById('kpi-entregado').textContent = entregados;
}

function claseBadge(estado) {
    if (estado === 'Pendiente') return 'badge-pendiente';
    if (estado === 'En Transito') return 'badge-transito';
    return 'badge-entregado';
}

function renderTabla() {
    const tbody = document.getElementById('tabla-envios');
    if (envios.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;color:#475569;padding:2rem;">No hay envios registrados</td></tr>';
        return;
    }
    tbody.innerHTML = envios.map(e => `
        <tr>
            <td>#${String(e.id).padStart(4, '0')}</td>
            <td>${e.destino}</td>
            <td>${e.producto}</td>
            <td>${e.cantidad}</td>
            <td>${e.peso} kg</td>
            <td><span class="badge ${claseBadge(e.estado)}">${e.estado}</span></td>
            <td class="acciones">
                <button class="btn-sm" onclick="cambiarEstado(${e.id})">Cambiar</button>
                <button class="btn-sm eliminar" onclick="eliminarEnvio(${e.id})">X</button>
            </td>
        </tr>
    `).join('');
}

function renderGrafico() {
    const contenedor = document.getElementById('grafico-barras');
    const pendientes = envios.filter(e => e.estado === 'Pendiente').length;
    const transito = envios.filter(e => e.estado === 'En Transito').length;
    const entregados = envios.filter(e => e.estado === 'Entregado').length;
    const maximo = Math.max(pendientes, transito, entregados, 1);

    const barras = [
        { label: 'Pendiente', valor: pendientes, color: '#fbbf24' },
        { label: 'Transito', valor: transito, color: '#a78bfa' },
        { label: 'Entregado', valor: entregados, color: '#34d399' },
    ];

    contenedor.innerHTML = barras.map(b => `
        <div class="barra-container">
            <div class="barra-valor" style="color:${b.color}">${b.valor}</div>
            <div class="barra" style="height:${(b.valor / maximo) * 120}px;background:${b.color}"></div>
            <div class="barra-label">${b.label}</div>
        </div>
    `).join('');
}

function renderRutas() {
    const contenedor = document.getElementById('lista-rutas');
    const activos = envios.filter(e => e.estado === 'En Transito');
    if (activos.length === 0) {
        contenedor.innerHTML = '<div style="color:#475569;font-size:0.85rem;padding:1rem 0;">Sin rutas activas</div>';
        return;
    }
    contenedor.innerHTML = activos.slice(0, 5).map(e => `
        <div class="ruta">
            <div class="ruta-dot" style="background:#a78bfa"></div>
            <span class="ruta-destino">${e.destino}</span>
            <span class="ruta-fecha">${e.producto}</span>
        </div>
    `).join('');
}

function render() {
    actualizarKPIs();
    renderTabla();
    renderGrafico();
    renderRutas();
}

document.getElementById('form-envio').addEventListener('submit', function(e) {
    e.preventDefault();
    const envio = {
        id: contadorId++,
        destino: document.getElementById('destino').value.trim(),
        producto: document.getElementById('producto').value.trim(),
        cantidad: parseInt(document.getElementById('cantidad').value),
        peso: parseFloat(document.getElementById('peso').value),
        estado: document.getElementById('estado').value,
    };
    envios.push(envio);
    guardar();
    render();
    this.reset();
});

function cambiarEstado(id) {
    const envio = envios.find(e => e.id === id);
    if (!envio) return;
    const estados = ['Pendiente', 'En Transito', 'Entregado'];
    const idx = estados.indexOf(envio.estado);
    envio.estado = estados[(idx + 1) % estados.length];
    guardar();
    render();
}

function eliminarEnvio(id) {
    envios = envios.filter(e => e.id !== id);
    guardar();
    render();
}

document.getElementById('fecha-actual').textContent = fechaActual();
render();
