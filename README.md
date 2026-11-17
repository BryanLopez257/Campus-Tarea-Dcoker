# CampusTareas · Proyecto base para las prácticas de Docker y Kubernetes

Este proyecto contiene la API REST de CampusTareas en Node.js con PostgreSQL.
La API ya está terminada: el trabajo de las prácticas es **desplegarla**.

```
campustareas/
└── api/
    ├── package.json
    ├── package-lock.json
    └── src/
        ├── server.js   # rutas, salud y apagado ordenado
        └── db.js       # conexión a PostgreSQL y creación de la tabla
```

## Endpoints

| Método | Ruta                  | Qué hace                                                  |
|--------|-----------------------|-----------------------------------------------------------|
| GET    | `/health/live`        | 200 si el proceso está vivo                               |
| GET    | `/health/ready`       | 200 si la base de datos responde; 503 si no               |
| GET    | `/v1/info`            | Versión y nombre de la réplica que atendió                |
| GET    | `/v1/tareas`          | Lista las tareas                                          |
| POST   | `/v1/tareas`          | Crea una tarea: `{"titulo", "descripcion", "fechaEntrega"}` |
| PATCH  | `/v1/tareas/{id}`     | Marca una tarea: `{"completada": true}`                   |
| GET    | `/v1/trabajo-pesado`  | Consume CPU unos 50 ms (práctica de autoescalado)         |

## Variables de entorno

| Variable       | Obligatoria | Valor por defecto | Ejemplo                                        |
|----------------|-------------|-------------------|------------------------------------------------|
| `DATABASE_URL` | Sí          | —                 | `postgres://app:PASSWORD@db:5432/campus`       |
| `PORT`         | No          | `3000`            | `3000`                                         |
| `APP_VERSION`  | No          | `dev`             | `1.0.0`                                        |
| `DB_POOL_MAX`  | No          | `10`              | `10`                                           |

Sin `DATABASE_URL` la API no arranca. La tabla `tareas` se crea sola la primera
vez que la API se conecta a la base de datos.

Cada respuesta incluye la cabecera `X-Replica` con el nombre del contenedor o
Pod que la atendió.

## Despliegue con Docker y Docker Compose

Si aún no tienes `.env` en la raíz, ejecuta `Copy-Item .env.example .env` en PowerShell o `cp .env.example .env` en Bash. Edita `POSTGRES_PASSWORD` según los comentarios de la plantilla. Si `pgdata` ya existe, utiliza la contraseña con la que se inicializó. Compose requiere esa variable para arrancar.

### 1. Levantar la base de datos y la API

Desde la raíz del proyecto, construye la API y levanta PostgreSQL (`db`), las tres réplicas (`api1`, `api2`, `api3`) y Nginx (`balanceador`):

```bash
docker compose up -d --build --remove-orphans
```

### 2. Verificar el estado de los contenedores

```bash
docker compose ps
docker compose logs -f api1
```

Espera a que `db` aparezca como `healthy`. Nginx publica el puerto `8080` y las réplicas usan el puerto interno `3000`.

### 3. Detener los servicios

```bash
docker compose down
```

Si deseas reiniciar borrando los datos de la base de datos:

```bash
docker compose down -v
```

### 4. Probar los endpoints

```bash
# Comprobar salud
curl -f http://localhost:8080/health/live
curl -f http://localhost:8080/health/ready
curl -f http://localhost:8080/v1/info

# Crear una tarea
curl -f -X POST http://localhost:8080/v1/tareas \
  -H "Content-Type: application/json" \
  -d '{"titulo": "Aprender Docker", "descripcion": "Levantar base de datos y API", "fechaEntrega": "2026-11-20"}'

# Consultar tareas
curl -f http://localhost:8080/v1/tareas

# Sustituir 1 por el id devuelto al crear la tarea
curl -f -X PATCH http://localhost:8080/v1/tareas/1 \
  -H "Content-Type: application/json" \
  -d '{"completada": true}'
```

Los ejemplos usan Bash. En PowerShell, envía el JSON en línea por la entrada estándar para conservar las comillas:

```powershell
'{"titulo":"Aprender Docker","fechaEntrega":"2026-11-20"}' | curl.exe -f -X POST http://localhost:8080/v1/tareas -H "Content-Type: application/json" -d '@-'
'{"completada":true}' | curl.exe -f -X PATCH http://localhost:8080/v1/tareas/1 -H "Content-Type: application/json" -d '@-'
```

### 5. Probar desde Android

Abre `android/` como proyecto en Android Studio y ejecuta la variante debug en el emulador. El cliente usa `http://10.0.2.2:8080/v1/`. El [informe](INFORME_PRACTICA.md#parte-a-prueba-funcional-en-el-emulador) contiene la prueba de creación y las capturas con tres réplicas y con solo `api2`.
