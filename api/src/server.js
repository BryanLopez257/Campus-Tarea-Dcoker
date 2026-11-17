// API de CampusTareas para las prácticas de Docker y Kubernetes.
import express from 'express';
import os from 'node:os';
import crypto from 'node:crypto';
import { pool, prepararBaseDeDatos } from './db.js';

const PORT = Number(process.env.PORT ?? 3000);
const APP_VERSION = process.env.APP_VERSION ?? 'dev';
const REPLICA = os.hostname(); // en Docker y Kubernetes es el nombre del contenedor o del Pod

const log = (nivel, msg, extra = {}) =>
  console.log(JSON.stringify({ t: new Date().toISOString(), nivel, msg, replica: REPLICA, ...extra }));

const app = express();
app.use(express.json());

// Cada respuesta indica qué réplica la atendió (útil para ver el balanceo)
app.use((req, res, next) => {
  res.setHeader('X-Replica', REPLICA);
  const inicio = Date.now();
  res.on('finish', () => {
    if (!req.path.startsWith('/health')) {
      log('info', 'peticion', { metodo: req.method, ruta: req.path, status: res.statusCode, ms: Date.now() - inicio });
    }
  });
  next();
});

// ---------- Salud ----------
// Liveness: el proceso está vivo. No consulta la base de datos.
app.get('/health/live', (_req, res) => res.json({ status: 'ok' }));

// Readiness: puede atender tráfico porque la base de datos responde.
app.get('/health/ready', async (_req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ status: 'ready' });
  } catch {
    res.status(503).json({ status: 'not-ready' });
  }
});

// ---------- Información de la réplica ----------
app.get('/v1/info', (_req, res) => {
  res.json({ app: 'campustareas-api', version: APP_VERSION, replica: REPLICA });
});

// ---------- Tareas ----------
const aDto = (fila) => ({
  id: fila.id,
  titulo: fila.titulo,
  descripcion: fila.descripcion,
  fechaEntrega: fila.fecha_entrega, // 'AAAA-MM-DD' o null
  completada: fila.completada,
});

app.get('/v1/tareas', async (_req, res, next) => {
  try {
    const { rows } = await pool.query(
      'SELECT id, titulo, descripcion, fecha_entrega, completada FROM tareas ORDER BY fecha_entrega NULLS LAST, id');
    res.json(rows.map(aDto));
  } catch (e) { next(e); }
});

app.post('/v1/tareas', async (req, res, next) => {
  const { titulo, descripcion = '', fechaEntrega = null } = req.body ?? {};
  if (typeof titulo !== 'string' || titulo.trim() === '') {
    return res.status(400).json({ error: 'El campo "titulo" es obligatorio' });
  }
  try {
    const { rows } = await pool.query(
      `INSERT INTO tareas (titulo, descripcion, fecha_entrega)
       VALUES ($1, $2, $3)
       RETURNING id, titulo, descripcion, fecha_entrega, completada`,
      [titulo.trim(), descripcion, fechaEntrega]);
    res.status(201).json(aDto(rows[0]));
  } catch (e) { next(e); }
});

app.patch('/v1/tareas/:id', async (req, res, next) => {
  const { completada } = req.body ?? {};
  if (typeof completada !== 'boolean') {
    return res.status(400).json({ error: 'El campo "completada" debe ser true o false' });
  }
  try {
    const { rows } = await pool.query(
      `UPDATE tareas SET completada = $1 WHERE id = $2
       RETURNING id, titulo, descripcion, fecha_entrega, completada`,
      [completada, Number(req.params.id)]);
    if (rows.length === 0) return res.status(404).json({ error: 'Tarea no encontrada' });
    res.json(aDto(rows[0]));
  } catch (e) { next(e); }
});

// ---------- Trabajo pesado (para las pruebas de autoescalado) ----------
// Consume CPU durante unos milisegundos, como lo haría generar un reporte.
app.get('/v1/trabajo-pesado', (_req, res) => {
  const fin = Date.now() + 50;
  let hash = 'campustareas';
  while (Date.now() < fin) {
    hash = crypto.createHash('sha256').update(hash).digest('hex');
  }
  res.json({ replica: REPLICA, resultado: hash.slice(0, 12) });
});

// Errores no controlados
app.use((err, _req, res, _next) => {
  log('error', 'error no controlado', { error: err.message });
  res.status(500).json({ error: 'Error interno' });
});

// ---------- Arranque y apagado ordenado ----------
await prepararBaseDeDatos(log);
const server = app.listen(PORT, () => log('info', 'API escuchando', { puerto: PORT, version: APP_VERSION }));

const apagar = (senal) => {
  log('info', 'apagado ordenado', { senal });
  server.close(async () => {
    await pool.end();
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10_000).unref(); // por si alguna conexión no cierra
};
process.on('SIGTERM', () => apagar('SIGTERM'));
process.on('SIGINT', () => apagar('SIGINT'));
