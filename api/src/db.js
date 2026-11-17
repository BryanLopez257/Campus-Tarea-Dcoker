import pg from 'pg';

// Las fechas (tipo DATE) se devuelven como texto 'AAAA-MM-DD' para evitar
// desfases por zona horaria.
pg.types.setTypeParser(1082, (valor) => valor);

const url = process.env.DATABASE_URL;
if (!url) {
  console.error('Falta la variable de entorno DATABASE_URL');
  process.exit(1);
}

export const pool = new pg.Pool({
  connectionString: url,
  max: Number(process.env.DB_POOL_MAX ?? 10),
  connectionTimeoutMillis: 3000,
});

// Si la base de datos se reinicia, las conexiones inactivas fallan.
// Sin este manejador el proceso entero se caería.
pool.on('error', (err) => {
  console.log(JSON.stringify({ t: new Date().toISOString(), nivel: 'warn', msg: 'conexión a la BD perdida', error: err.message }));
});

const espera = (ms) => new Promise((r) => setTimeout(r, ms));

// Crea la tabla si no existe. Reintenta mientras la base de datos arranca,
// algo habitual en Docker Compose y en Kubernetes.
export async function prepararBaseDeDatos(log) {
  for (let intento = 1; intento <= 15; intento++) {
    try {
      const cliente = await pool.connect();
      try {
        // El bloqueo evita que varias réplicas creen la tabla al mismo tiempo;
        // se libera solo al terminar la transacción.
        await cliente.query('BEGIN');
        await cliente.query('SELECT pg_advisory_xact_lock(20261115)');
        await cliente.query(`
          CREATE TABLE IF NOT EXISTS tareas (
            id            SERIAL PRIMARY KEY,
            titulo        TEXT NOT NULL,
            descripcion   TEXT NOT NULL DEFAULT '',
            fecha_entrega DATE,
            completada    BOOLEAN NOT NULL DEFAULT false,
            creada_en     TIMESTAMPTZ NOT NULL DEFAULT now()
          )`);
        await cliente.query('COMMIT');
      } catch (e) {
        await cliente.query('ROLLBACK').catch(() => {});
        throw e;
      } finally {
        cliente.release();
      }
      log('info', 'base de datos lista', { intento });
      return;
    } catch (e) {
      log('warn', 'base de datos no disponible, reintentando', { intento, error: e.message });
      await espera(2000);
    }
  }
  log('error', 'no se pudo conectar a la base de datos');
  process.exit(1);
}
