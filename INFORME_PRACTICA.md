# INFORME TÉCNICO DE LABORATORIO
## Práctica: Despliegue de CampusTareas con Docker, Docker Compose y Nginx

**Ingeniero DevOps / Autor:** Laboratorio de Infraestructura y Despliegue  
**Proyecto:** CampusTareas API  
**Fecha de ejecución:** 16 de noviembre de 2026  
**Ubicación:** `~/Downloads/campustareasdocker`

---

## 1. Resumen Ejecutivo del Despliegue

El despliegue de **CampusTareas** ofrece tolerancia a la caída de una réplica de la API. Nginx y PostgreSQL siguen siendo puntos únicos de fallo.
- **Base de Datos:** PostgreSQL 17 Alpine con persistencia mediante volumen nombrado `pgdata` y comprobación de salud continua (`pg_isready`).
- **Backend Replicado:** 3 instancias idénticas (`api1`, `api2`, `api3`) construidas con un `Dockerfile` multietapa basado en `node:24-alpine`, corriendo bajo usuario no privilegiado (`node`) y con `HEALTHCHECK` activo.
- **Balanceador de Carga / Proxy Inverso:** Nginx Stable Alpine expuesto en el puerto `8080`, balanceando tráfico mediante algoritmo Round Robin con reintento automático y conmutación por error (*failover*) transparente mediante `proxy_next_upstream`.

---

## 2. Evidencias de Ejecución (Fase 2)

### Evidencia 1: Construcción e Inspección de la Imagen (`campus-api:1.0.0`)

#### Comando: `docker build -t campus-api:1.0.0 ./api`
```text
#0 building with "desktop-linux" instance using docker driver
#1 [internal] load build definition from Dockerfile
#1 transferring dockerfile: 733B done
#2 [internal] load metadata for docker.io/library/node:24-alpine
#3 [dependencias 1/4] FROM docker.io/library/node:24-alpine
#4 [dependencias 2/4] WORKDIR /app
#5 [dependencias 3/4] COPY package.json package-lock.json ./
#6 [dependencias 4/4] RUN npm ci --omit=dev
#6 added 79 packages, and audited 80 packages in 2s
#6 found 0 vulnerabilities
#7 [stage-1 3/5] COPY --chown=node:node --from=dependencias /app/node_modules ./node_modules
#8 [stage-1 4/5] COPY --chown=node:node package.json ./
#9 [stage-1 5/5] COPY --chown=node:node src ./src
#10 exporting to image
#10 naming to docker.io/library/campus-api:1.0.0 done
```

#### Comando: `docker images campus-api`
```text
IMAGE              ID             DISK USAGE   CONTENT SIZE   EXTRA
campus-api:1.0.0   17a644b8fc5a        250MB         63.3MB        
```

#### Comando: `docker history campus-api:1.0.0`
```text
IMAGE          CREATED          CREATED BY                                      SIZE      COMMENT
2f65aedb6e71   34 seconds ago   CMD ["node" "src/server.js"]                    0B        buildkit.dockerfile.v0
<missing>      34 seconds ago   HEALTHCHECK {Test:[CMD-SHELL wget -qO- http:…   0B        buildkit.dockerfile.v0
<missing>      34 seconds ago   EXPOSE [3000/tcp]                               0B        buildkit.dockerfile.v0
<missing>      34 seconds ago   USER node                                       0B        buildkit.dockerfile.v0
<missing>      34 seconds ago   COPY --chown=node:node src ./src # buildkit     24.6kB    buildkit.dockerfile.v0
<missing>      34 seconds ago   COPY --chown=node:node package.json ./ # bui…   12.3kB    buildkit.dockerfile.v0
<missing>      34 seconds ago   COPY --chown=node:node /app/node_modules ./n…   5.49MB    buildkit.dockerfile.v0
<missing>      34 seconds ago   ENV NODE_ENV=production PORT=3000 APP_VERSIO…   0B        buildkit.dockerfile.v0
<missing>      34 seconds ago   ARG APP_VERSION=1.0.0                           0B        buildkit.dockerfile.v0
<missing>      37 seconds ago   WORKDIR /app                                    8.19kB    buildkit.dockerfile.v0
<missing>      5 days ago       CMD ["node"]                                    0B        buildkit.dockerfile.v0
<missing>      5 days ago       ENTRYPOINT ["docker-entrypoint.sh"]             0B        buildkit.dockerfile.v0
<missing>      5 days ago       COPY docker-entrypoint.sh /usr/local/bin/ # …   20.5kB    buildkit.dockerfile.v0
<missing>      5 days ago       RUN /bin/sh -c apk add --no-cache --virtual …   5.48MB    buildkit.dockerfile.v0
<missing>      5 days ago       ENV YARN_VERSION=1.22.22                        0B        buildkit.dockerfile.v0
<missing>      5 days ago       RUN /bin/sh -c addgroup -g 1000 node     && …   167MB     buildkit.dockerfile.v0
<missing>      5 days ago       ENV NODE_VERSION=24.22.3                        0B        buildkit.dockerfile.v0
<missing>      11 days ago      CMD ["/bin/sh"]                                 0B        buildkit.dockerfile.v0
<missing>      11 days ago      ADD alpine-minirootfs-3.24.4-x86_64.tar.gz /…   9.09MB    buildkit.dockerfile.v0
```

---

### Evidencia: Prueba Manual y Fallo Controlado sin Configuración

#### Creación de red y ejecución de contenedor aislado:
```powershell
docker network create campus-red
# Define POSTGRES_PASSWORD en el entorno de esta terminal.
docker run -d --name db --network campus-red -e POSTGRES_USER=app -e POSTGRES_PASSWORD -e POSTGRES_DB=campus postgres:17-alpine
docker run -d --name api --network campus-red -p 8080:3000 -e "DATABASE_URL=postgres://app:${env:POSTGRES_PASSWORD}@db:5432/campus" campus-api:1.0.0
curl.exe -s http://localhost:8080/v1/info
```
**Salida obtenida:**
```json
{"app":"campustareas-api","version":"1.0.0","replica":"5c3bd68eb7c2"}
```

#### Comprobación de fallo sin variable obligatoria `DATABASE_URL`:
```powershell
docker run --rm campus-api:1.0.0
```
**Salida y código de salida:**
```text
Falta la variable de entorno DATABASE_URL
(exit code 1)
```

---

### Evidencia: Despliegue con Docker Compose (`compose.yaml`)

#### Comando: `docker compose ps`
```text
NAME                               IMAGE                     COMMAND                  SERVICE       CREATED          STATUS                    PORTS
campustareasdocker-api1-1          campustareasdocker-api1   "docker-entrypoint.s…"   api1          14 minutes ago   Up 5 minutes (healthy)    3000/tcp
campustareasdocker-api2-1          campustareasdocker-api2   "docker-entrypoint.s…"   api2          14 minutes ago   Up 4 minutes (healthy)    3000/tcp
campustareasdocker-api3-1          campustareasdocker-api3   "docker-entrypoint.s…"   api3          14 minutes ago   Up 14 minutes (healthy)   3000/tcp
campustareasdocker-balanceador-1   nginx:stable-alpine       "/docker-entrypoint.…"   balanceador   14 minutes ago   Up 14 minutes             0.0.0.0:8080->80/tcp, [::]:8080->80/tcp
campustareasdocker-db-1            postgres:17-alpine        "docker-entrypoint.s…"   db            14 minutes ago   Up 14 minutes (healthy)   5432/tcp
```

---

### Evidencia 2: Operaciones CRUD de Tareas

#### Creación de Tarea vía `POST http://localhost:8080/v1/tareas`
```powershell
'{"titulo":"Informe de Docker","fechaEntrega":"2026-11-27"}' | curl.exe -i -s -X POST http://localhost:8080/v1/tareas -H "Content-Type: application/json" -d '@-'
```
**Respuesta:**
```http
HTTP/1.1 201 Created
Server: nginx/1.30.6
Date: Mon, 16 Nov 2026 22:08:33 GMT
Content-Type: application/json; charset=utf-8
Content-Length: 101
Connection: keep-alive
X-Powered-By: Express
X-Replica: 3836e9f5e2c3
ETag: W/"65-FMblZ/sRMgbKEDeJdVBOzivRyp4"
X-Upstream: 172.19.0.5:3000

{"id":2,"titulo":"Informe de Docker","descripcion":"","fechaEntrega":"2026-11-27","completada":false}
```

#### Lectura de Tareas vía `GET http://localhost:8080/v1/tareas`
```powershell
curl.exe -i -s http://localhost:8080/v1/tareas
```
**Respuesta:**
```http
HTTP/1.1 200 OK
Server: nginx/1.30.6
Date: Mon, 16 Nov 2026 22:08:59 GMT
Content-Type: application/json; charset=utf-8
Content-Length: 205
Connection: keep-alive
X-Powered-By: Express
X-Replica: 3836e9f5e2c3
ETag: W/"cd-ZjuDIzBkJdp2lH9RcreAKBLMgoM"
X-Upstream: 172.19.0.5:3000

[{"id":1,"titulo":"Informe de Docker","descripcion":"","fechaEntrega":"2026-11-27","completada":false},{"id":2,"titulo":"Informe de Docker","descripcion":"","fechaEntrega":"2026-11-27","completada":false}]
```

---

### Evidencia 3: Demostración de Balanceo Round Robin

Se ejecutaron 6 peticiones consecutivas al endpoint de balanceo `http://localhost:8080/v1/info`:

```powershell
1..6 | ForEach-Object {
    Write-Output "--- Petición $_ ---"
    curl.exe -i -s http://localhost:8080/v1/info | Select-String -Pattern "HTTP/|X-Upstream|X-Replica|`{"
}
```

**Salida registrada:**
```text
--- Petición 1 ---
HTTP/1.1 200 OK
X-Replica: 1187f47a7350
X-Upstream: 172.19.0.3:3000
{"app":"campustareas-api","version":"1.0.0","replica":"1187f47a7350"}

--- Petición 2 ---
HTTP/1.1 200 OK
X-Replica: 1187f47a7350
X-Upstream: 172.19.0.3:3000
{"app":"campustareas-api","version":"1.0.0","replica":"1187f47a7350"}

--- Petición 3 ---
HTTP/1.1 200 OK
X-Replica: 093b364f57d4
X-Upstream: 172.19.0.4:3000
{"app":"campustareas-api","version":"1.0.0","replica":"093b364f57d4"}

--- Petición 4 ---
HTTP/1.1 200 OK
X-Replica: 3836e9f5e2c3
X-Upstream: 172.19.0.5:3000
{"app":"campustareas-api","version":"1.0.0","replica":"3836e9f5e2c3"}

--- Petición 5 ---
HTTP/1.1 200 OK
X-Replica: 1187f47a7350
X-Upstream: 172.19.0.3:3000
{"app":"campustareas-api","version":"1.0.0","replica":"1187f47a7350"}

--- Petición 6 ---
HTTP/1.1 200 OK
X-Replica: 093b364f57d4
X-Upstream: 172.19.0.4:3000
{"app":"campustareas-api","version":"1.0.0","replica":"093b364f57d4"}
```
> **Observación:** El encabezado `X-Upstream` muestra respuestas de las direcciones IP internas de los contenedores (`172.19.0.3:3000`, `172.19.0.4:3000`, `172.19.0.5:3000`), coincidiendo con los IDs de réplica correspondientes (`api2`, `api3`, `api1`).

---

### Evidencia 4: Tolerancia a la caída de una réplica de la API

La conmutación cubre la caída de una réplica de la API. Nginx y PostgreSQL siguen siendo puntos únicos de fallo.

Se detuvo intencionalmente la instancia `api2` (`docker compose stop api2`) y se reintentaron las peticiones:

```powershell
docker compose stop api2
1..6 | ForEach-Object {
    Write-Output "--- Petición $_ ---"
    curl.exe -i -s http://localhost:8080/v1/info | Select-String -Pattern "HTTP/|X-Upstream|X-Replica|`{"
}
docker compose start api2
```

**Salida registrada con `api2` detenido:**
```text
--- Petición 1 ---
HTTP/1.1 200 OK
X-Replica: 3836e9f5e2c3
X-Upstream: 172.19.0.5:3000
{"app":"campustareas-api","version":"1.0.0","replica":"3836e9f5e2c3"}

--- Petición 2 ---
HTTP/1.1 200 OK
X-Replica: 093b364f57d4
X-Upstream: 172.19.0.3:3000, 172.19.0.4:3000
{"app":"campustareas-api","version":"1.0.0","replica":"093b364f57d4"}

--- Petición 3 ---
HTTP/1.1 200 OK
X-Replica: 093b364f57d4
X-Upstream: 172.19.0.4:3000
{"app":"campustareas-api","version":"1.0.0","replica":"093b364f57d4"}

--- Petición 4 ---
HTTP/1.1 200 OK
X-Replica: 3836e9f5e2c3
X-Upstream: 172.19.0.5:3000
{"app":"campustareas-api","version":"1.0.0","replica":"3836e9f5e2c3"}

--- Petición 5 ---
HTTP/1.1 200 OK
X-Replica: 093b364f57d4
X-Upstream: 172.19.0.3:3000, 172.19.0.4:3000
{"app":"campustareas-api","version":"1.0.0","replica":"093b364f57d4"}

--- Petición 6 ---
HTTP/1.1 200 OK
X-Replica: 3836e9f5e2c3
X-Upstream: 172.19.0.5:3000
{"app":"campustareas-api","version":"1.0.0","replica":"3836e9f5e2c3"}
```
> **Análisis de Failover:** En las peticiones 2 y 5 se evidencia claramente:
> `X-Upstream: 172.19.0.3:3000, 172.19.0.4:3000`
> Nginx intentó conectarse primero al nodo caído (`172.19.0.3:3000` - `api2`), esperó hasta el límite de conexión de 2 s antes del reintento, y reenvió la petición a `172.19.0.4:3000` (`api3`) sin devolver ningún código de error al cliente en las seis consultas de la muestra.

---

### Hallazgo: balanceo con múltiples workers

El 17 de noviembre de 2026, `nginx -T` mostró `worker_processes auto;` y `ps` confirmó 16 workers. Sin una zona compartida, cada worker mantiene su propio estado de round robin. Con conexiones nuevas atendidas por distintos workers, la rotación no se mantiene como una secuencia global. En la primera muestra, cinco peticiones llegaron a `api1` y una a `api2`.

Se agregó `zone campus_api 64k;` al inicio de `upstream campus_api` para compartir el estado entre los workers. Se ejecutó `docker compose exec balanceador nginx -s reload`, se revisaron los registros de la recarga y `nginx -T` confirmó la directiva montada y la validez de la configuración.

#### ANTES

```text
X-Replica: 3836e9f5e2c3
X-Upstream: 172.19.0.5:3000
---
X-Replica: 3836e9f5e2c3
X-Upstream: 172.19.0.5:3000
---
X-Replica: 3836e9f5e2c3
X-Upstream: 172.19.0.5:3000
---
X-Replica: 3836e9f5e2c3
X-Upstream: 172.19.0.5:3000
---
X-Replica: 3836e9f5e2c3
X-Upstream: 172.19.0.5:3000
---
X-Replica: 1187f47a7350
X-Upstream: 172.19.0.3:3000
---
```

#### DESPUÉS

```text
X-Replica: 3836e9f5e2c3
X-Upstream: 172.19.0.5:3000
---
X-Replica: 1187f47a7350
X-Upstream: 172.19.0.3:3000
---
X-Replica: 093b364f57d4
X-Upstream: 172.19.0.4:3000
---
X-Replica: 3836e9f5e2c3
X-Upstream: 172.19.0.5:3000
---
X-Replica: 1187f47a7350
X-Upstream: 172.19.0.3:3000
---
X-Replica: 093b364f57d4
X-Upstream: 172.19.0.4:3000
---
```

Las seis consultas a `/v1/info` recorrieron en orden `api1`, `api2` y `api3` dos veces, según ambas cabeceras.

#### Prueba de caída de `api2`

Se ejecutó `docker compose stop api2` y se repitieron las seis consultas.

```text
HTTP 200
X-Replica: 3836e9f5e2c3
X-Upstream: 172.19.0.5:3000
---
HTTP 200
X-Replica: 093b364f57d4
X-Upstream: 172.19.0.3:3000, 172.19.0.4:3000
---
HTTP 200
X-Replica: 093b364f57d4
X-Upstream: 172.19.0.4:3000
---
HTTP 200
X-Replica: 3836e9f5e2c3
X-Upstream: 172.19.0.5:3000
---
HTTP 200
X-Replica: 093b364f57d4
X-Upstream: 172.19.0.3:3000, 172.19.0.4:3000
---
HTTP 200
X-Replica: 3836e9f5e2c3
X-Upstream: 172.19.0.5:3000
---
```

Las seis respuestas fueron HTTP 200 y las atendieron `api1` y `api3`, con tres respuestas cada una. En dos peticiones, `X-Upstream` registró el intento a `api2` seguido del reintento exitoso a `api3`. Los registros de Nginx confirmaron dos tiempos de espera de conexión a `api2` y su desactivación temporal. Al terminar se ejecutó `docker compose start api2`.

---

### Evidencia P1: Verificación de la caché de capas

Se agregó temporalmente un comentario a `api/src/server.js`, se ejecutó el build y se restauró el archivo byte por byte.

```bash
docker build --progress=plain -t campus-api:cache-audit-48369658 ./api
docker image rm campus-api:cache-audit-48369658
```

```text
#7 [dependencias 2/4] WORKDIR /app
#7 CACHED
#8 [dependencias 4/4] RUN npm ci --omit=dev
#8 CACHED
#9 [stage-1 3/5] COPY --chown=node:node --from=dependencias /app/node_modules ./node_modules
#9 CACHED
#10 [dependencias 3/4] COPY package.json package-lock.json ./
#10 CACHED
#11 [stage-1 4/5] COPY --chown=node:node package.json ./
#11 CACHED
#12 [stage-1 5/5] COPY --chown=node:node src ./src
#12 DONE 0.1s
SHA256 antes y después: C029AE7ABF593D116CFAEC8C0359E2190C21305DB53E1FE2087710894F2B55DB
Untagged: campus-api:cache-audit-48369658
```

### Evidencia P2: Comparación de tamaños

Se cambió únicamente el segundo `FROM node:24-alpine` a `FROM node:24` en una copia del Dockerfile que se pasó al constructor por entrada estándar.

```bash
sed 's/^FROM node:24-alpine$/FROM node:24/' api/Dockerfile | docker build --progress=plain -f - -t campus-api:pesada ./api
docker images campus-api
docker image rm campus-api:pesada
```

```text
IMAGE               ID             DISK USAGE   CONTENT SIZE   EXTRA
campus-api:1.0.0    9ffd6fb0cc95        250MB         63.3MB        
campus-api:pesada   f2057ce4bd1e       1.64GB          411MB        
Untagged: campus-api:pesada
Deleted: sha256:f2057ce4bd1ec8d1a32841aae2d054ad2a273528218c8188c17b737f17efaa2a
```

---

## 3. Respuestas técnicas a las ocho preguntas

### 1. ¿Por qué se copian primero los manifiestos de npm?

Separar `package.json` y `package-lock.json` del código permite reutilizar la instalación cuando cambia `src/`. Tras agregar un comentario a `src/server.js`, BuildKit reutilizó los manifiestos, `npm ci --omit=dev` y la copia de dependencias. Solo se repitió la copia del código entre los pasos de la imagen de aplicación. La evidencia P1 incluye el comando, las capas `CACHED` y el hash del archivo restaurado.

### 2. ¿Qué implica cambiar la imagen final a `node:24`?

La variante con `node:24` reportó 1.64 GB en disco y 411 MB de contenido frente a 250 MB y 63.3 MB con Alpine. La variante pesada puede transferir más datos en una descarga en frío. Una base más pequeña puede incorporar menos componentes que mantener. El tamaño por sí solo no permite inferir el número de vulnerabilidades. La evidencia P2 registra las dos imágenes y la eliminación de la etiqueta temporal.

### 3. ¿Por qué `db:5432` y no `localhost:5432`?

En el contenedor de la API, `localhost` apunta a ese mismo contenedor. En la red creada para el laboratorio, el DNS de Docker resuelve `db` al contenedor de PostgreSQL. La prueba manual inició la API con `db:5432` y los registros mostraron «base de datos lista» antes de obtener HTTP 200.

### 4. ¿Qué pasó con las tareas tras `down` y `down -v`?

El mismo registro apareció después de `down` y `up`. Después de `down -v` y `up`, la lista devolvió `[]`. PostgreSQL escribe en `/var/lib/postgresql/data`, montado en el volumen nombrado `pgdata`. El punto de montaje mostrado por `docker volume inspect` pertenece al entorno Linux del motor de Docker Desktop. La sección **Compose y persistencia** contiene los comandos y las salidas.

### 5. ¿Qué ocurre al detener `api2`?

Las seis peticiones de la prueba devolvieron HTTP 200. Nginx registró dos tiempos de espera al conectar con `api2` y reintentó las solicitudes GET en otra réplica gracias a `proxy_next_upstream`. `proxy_connect_timeout 2s` limitó la espera por conexión fallida. `max_fails=2` y `fail_timeout=10s` determinaron la exclusión temporal. La sección **Balanceo, conmutación y escrituras** contiene las cabeceras, los tiempos y los registros.

### 6. ¿Qué ocurriría si cada réplica guardara las tareas en memoria?

Cada réplica tendría su propio arreglo. Si `api1` crea una tarea, una lectura atendida por `api2` o `api3` podría omitirla. Reiniciar `api1` borraría su copia. En la prueba, las tres réplicas devolvieron la misma tarea porque consultan PostgreSQL.

### 7. ¿Qué riesgo tiene escribir la contraseña en Compose?

Una contraseña real escrita en Compose circularía con el código y podría quedar en el historial. Compose requiere `POSTGRES_PASSWORD`, leída de un `.env` local ignorado por Git. `.env.example` describe cómo preparar ese archivo y contiene un marcador. Si el volumen ya se inicializó, cambiar el archivo no cambia automáticamente la contraseña de PostgreSQL.

### 8. ¿Qué se gana con `USER node`?

`USER node` ejecuta el proceso con UID 1000 y restringe escrituras y operaciones reservadas a root. Esto reduce el impacto de un fallo de la aplicación. La prueba `docker run --rm campus-api:1.0.0 id` confirmó el usuario efectivo.

---

## 4. Cliente Android para el laboratorio

La carpeta `android/` contiene un cliente de laboratorio independiente. La aplicación CampusTareas que usa Room se conservó. El cliente incluye lista, creación y refresco con Retrofit. `API_URL` vale `http://10.0.2.2:8080/v1/` en debug. La política HTTP se añade desde `app/src/debug/` y permite únicamente `10.0.2.2`. El cliente usa `TareaDto`, `NuevaTareaDto` y `CampusApi` con rutas relativas a `/v1/`.

En Windows, desde el directorio `android/`:

```powershell
.\gradlew.bat :app:assembleDebug :app:processReleaseMainManifest
```

```text
> Task :app:processDebugMainManifest UP-TO-DATE
> Task :app:processReleaseMainManifest UP-TO-DATE
> Task :app:compileDebugKotlin
> Task :app:assembleDebug
BUILD SUCCESSFUL in 22s
Manifiestos combinados: networkSecurityConfig presente en debug y ausente en release.
app-debug.apk 1766716
```

### Parte A. Prueba funcional en el emulador

Se probó y se entrega el cliente de laboratorio de `android/` (`ec.edu.campus.tareas.docker`). La prueba usó `http://10.0.2.2:8080/v1/`. La aplicación local con Room se conservó fuera de este entregable.

```text
docker compose up -d --build --wait
docker compose ps
adb devices                     -> emulator-5554 device
emulator -list-avds             -> Medium_Phone_API_37.0
emulator -avd Medium_Phone_API_37.0 -no-window -no-audio -no-snapshot-save
adb shell getprop sys.boot_completed -> 1
.\gradlew.bat --offline --console=plain installDebug
Installed on 1 device.
BUILD SUCCESSFUL in 38s
adb shell am start -W -n ec.edu.campus.tareas.docker/.MainActivity
Status: ok
```

Se localizaron los controles con `adb shell uiautomator dump /sdcard/campus-ui.xml`. Se creó la tarea en la interfaz, se consultó `curl.exe -fsS -i http://localhost:8080/v1/tareas` y se guardó la primera captura. Después de `docker compose stop api1 api3`, se pulsó **Actualizar lista**, se comprobaron los registros de Nginx y se repitió la consulta desde el host. Al terminar se ejecutaron `docker compose start api1 api3`, `docker compose up -d --wait` y `docker compose ps`.

```text
adb shell input tap 540 318
adb shell input text Evidencia%sAndroid%s150324
adb shell input tap 540 676
UI: Tarea creada (ID 3)
UI: Evidencia Android 150324
Pendiente
adb exec-out screencap -p > evidencias/android_lista_3_replicas.png
HTTP/1.1 200 OK
X-Replica: 2b2271de3cfe
X-Upstream: 172.19.0.4:3000
{"id":3,"titulo":"Evidencia Android 150324","descripcion":"","fechaEntrega":null,"completada":false}
api2=75c834d0b623
adb shell input tap 540 802
UI tras refrescar: Tareas: 3
balanceador-1  | 172.19.0.1 - - [17/Nov/2026:20:03:39 +0000] "GET /v1/tareas HTTP/1.1" 200 306 "-" "okhttp/3.14.9" "-"
adb exec-out screencap -p > evidencias/android_lista_solo_api2.png
HTTP/1.1 200 OK
X-Replica: 75c834d0b623
X-Upstream: 172.19.0.3:3000, 172.19.0.4:3000, 172.19.0.5:3000
{"id":3,"titulo":"Evidencia Android 150324","descripcion":"","fechaEntrega":null,"completada":false}
campustareasdocker-api1-1          campustareasdocker-api1   "docker-entrypoint.s…"   api1          3 minutes ago   Up 5 seconds (healthy)   3000/tcp
campustareasdocker-api2-1          campustareasdocker-api2   "docker-entrypoint.s…"   api2          3 minutes ago   Up 3 minutes (healthy)   3000/tcp
campustareasdocker-api3-1          campustareasdocker-api3   "docker-entrypoint.s…"   api3          3 minutes ago   Up 6 seconds (healthy)   3000/tcp
```

La segunda captura y el registro de OkHttp muestran que el refresco terminó. El HTTP 200 y `X-Replica: 75c834d0b623` confirman que `api2` atendió la consulta desde el host. Los primeros valores de `X-Upstream` corresponden a intentos hacia las réplicas detenidas.

- [Lista tras crear la tarea con tres réplicas](evidencias/android_lista_3_replicas.png)
- [Lista tras refrescar con solo api2](evidencias/android_lista_solo_api2.png)

---

## 5. Estado al cierre de la revisión base

Se ejecutó `docker compose down` en el proyecto original y `docker compose ps -a` quedó sin contenedores. El volumen original y la imagen de la práctica se conservaron.

```text
NAME      IMAGE     COMMAND   SERVICE   CREATED   STATUS    PORTS
=== docker volume ls (proyecto original) ===
DRIVER    VOLUME NAME
local     campustareasdocker_pgdata
=== docker images campus-api ===
IMAGE              ID             DISK USAGE   CONTENT SIZE   EXTRA
campus-api:1.0.0   9ffd6fb0cc95        250MB         63.3MB
```

Se verificó la presencia de `api/Dockerfile`, `api/.dockerignore`, `compose.yaml`, `nginx/nginx.conf`, este informe y `android/`. `.gitignore` incluye `.env`. Esta carpeta no contiene metadatos Git, por lo que no se pudo verificar el historial ni un enlace de entrega.

## 6. Verificación de la rúbrica · 17 de noviembre de 2026

La revisión usó la guía original de la práctica. Se ejecutaron las pruebas de persistencia y balanceo con el mismo `compose.yaml` bajo el proyecto temporal `campus-audit-af8f0547`. Los comandos de esta sección usan Bash para reproducir las pruebas. En Windows se ejecutó `curl.exe`, enviando el JSON en línea por la entrada estándar desde PowerShell. Se esperó a que PostgreSQL estuviera healthy y `/health/ready` respondiera antes de las solicitudes.

### Dockerfile y usuario en ejecución

```bash
docker build -t campus-api:1.0.0 ./api
docker images campus-api
docker history campus-api:1.0.0
docker run --rm campus-api:1.0.0 id
```

```text
IMAGE              ID             DISK USAGE   CONTENT SIZE   EXTRA
campus-api:1.0.0   9ffd6fb0cc95        250MB         63.3MB        
IMAGE          CREATED        CREATED BY                                      SIZE      COMMENT
9ffd6fb0cc95   22 hours ago   CMD ["node" "src/server.js"]                    0B        buildkit.dockerfile.v0
<missing>      22 hours ago   HEALTHCHECK {Test:[CMD-SHELL wget -qO- http:…   0B        buildkit.dockerfile.v0
<missing>      22 hours ago   USER node                                       0B        buildkit.dockerfile.v0
uid=1000(node) gid=1000(node) groups=1000(node),1000(node)
```

La imagen multietapa conserva las dependencias de producción, el `HEALTHCHECK` y el `CMD` en formato exec. El uso en disco reportado, 250 MB, supera la referencia orientativa de 150–200 MB. Docker reportó 63.3 MB en la columna `CONTENT SIZE`. `api/.dockerignore` excluye `node_modules`, `.git`, `.env` y `.env.*`.

### Contenedores manuales

```bash
docker network create campus-red
# Exporta POSTGRES_PASSWORD en el entorno de esta terminal.
docker run -d --name db --network campus-red -e POSTGRES_USER=app -e POSTGRES_PASSWORD -e POSTGRES_DB=campus postgres:17-alpine
docker run -d --name api --network campus-red -p 8080:3000 -e "DATABASE_URL=postgres://app:${POSTGRES_PASSWORD}@db:5432/campus" campus-api:1.0.0
curl -fsS http://localhost:8080/v1/info
docker logs api
docker run --rm campus-api:1.0.0
docker rm -f -v api db
docker network rm campus-red
```

```text
7d9c1bcdc81fc642e32834a721c05e2b45ae0e8eda46e34bff470cb4059000d0
279e44e12f37f60a0a170f1240d5f772e3528812bb927b18c0a1145f077e401f
e20999427214d4cd1bc4f52b5b89568baa05914c5121507cc5649a462e07f105
{"app":"campustareas-api","version":"1.0.0","replica":"e20999427214"}
{"t":"2026-11-17T19:47:34.598Z","nivel":"warn","msg":"base de datos no disponible, reintentando","replica":"e20999427214","intento":1,"error":"connect ECONNREFUSED 172.19.0.2:5432"}
{"t":"2026-11-17T19:47:36.648Z","nivel":"info","msg":"base de datos lista","replica":"e20999427214","intento":2}
{"t":"2026-11-17T19:47:36.656Z","nivel":"info","msg":"API escuchando","replica":"e20999427214","puerto":3000,"version":"1.0.0"}
{"t":"2026-11-17T19:47:36.944Z","nivel":"info","msg":"peticion","replica":"e20999427214","metodo":"GET","ruta":"/v1/info","status":200,"ms":3}
Falta la variable de entorno DATABASE_URL
exit code: 1
api
db
campus-red
```

### Compose y persistencia

Se comprobó que las tres réplicas reutilizan `x-api`, dependen de `db` con `service_healthy` y carecen de puertos publicados. PostgreSQL usa `pg_isready` y el volumen `pgdata`. El único puerto publicado fue `8080`.

```bash
docker compose -p campus-audit-af8f0547 up -d --build --remove-orphans
docker compose -p campus-audit-af8f0547 ps
curl -fsS -X POST http://localhost:8080/v1/tareas -H 'Content-Type: application/json' -d '{"titulo":"Informe de Docker","fechaEntrega":"2026-11-27"}'
curl -fsS http://localhost:8080/v1/tareas
```

```text
Image campus-audit-af8f0547-api1 Built 
 Image campus-audit-af8f0547-api2 Built 
 Image campus-audit-af8f0547-api3 Built 
 Container campus-audit-af8f0547-db-1 Healthy 
 Container campus-audit-af8f0547-db-1 Healthy 
 Container campus-audit-af8f0547-db-1 Healthy 
NAME                                  IMAGE                        COMMAND                  SERVICE       CREATED         STATUS                           PORTS
campus-audit-af8f0547-api1-1          campus-audit-af8f0547-api1   "docker-entrypoint.s…"   api1          7 seconds ago   Up 1 second (health: starting)   3000/tcp
campus-audit-af8f0547-api2-1          campus-audit-af8f0547-api2   "docker-entrypoint.s…"   api2          7 seconds ago   Up 1 second (health: starting)   3000/tcp
campus-audit-af8f0547-api3-1          campus-audit-af8f0547-api3   "docker-entrypoint.s…"   api3          7 seconds ago   Up 1 second (health: starting)   3000/tcp
campus-audit-af8f0547-balanceador-1   nginx:stable-alpine          "/docker-entrypoint.…"   balanceador   7 seconds ago   Up Less than a second            0.0.0.0:8080->80/tcp, [::]:8080->80/tcp
campus-audit-af8f0547-db-1            postgres:17-alpine           "docker-entrypoint.s…"   db            8 seconds ago   Up 7 seconds (healthy)           5432/tcp
HTTP/1.1 201 Created
X-Replica: 09d2350bcda1
X-Upstream: 172.19.0.5:3000
{"id":1,"titulo":"Informe de Docker","descripcion":"","fechaEntrega":"2026-11-27","completada":false}
Latencia: 0.229944s
HTTP/1.1 200 OK
X-Replica: 2045028456e4
X-Upstream: 172.19.0.4:3000
[{"id":1,"titulo":"Informe de Docker","descripcion":"","fechaEntrega":"2026-11-27","completada":false}]
Latencia: 0.213114s
```

```bash
docker compose -p campus-audit-af8f0547 down
docker compose -p campus-audit-af8f0547 up -d
curl -fsS http://localhost:8080/v1/tareas
docker volume inspect campus-audit-af8f0547_pgdata --format '{{.Name}} {{.Mountpoint}}'
```

```text
Container campus-audit-af8f0547-db-1 Healthy 
 Container campus-audit-af8f0547-db-1 Healthy 
 Container campus-audit-af8f0547-db-1 Healthy 
HTTP/1.1 200 OK
X-Replica: 0bc8bcc60f93
X-Upstream: 172.19.0.3:3000
[{"id":1,"titulo":"Informe de Docker","descripcion":"","fechaEntrega":"2026-11-27","completada":false}]
campus-audit-af8f0547_pgdata /var/lib/docker/volumes/campus-audit-af8f0547_pgdata/_data
```

```bash
docker compose -p campus-audit-af8f0547 down -v
docker compose -p campus-audit-af8f0547 up -d
curl -fsS http://localhost:8080/v1/tareas
```

```text
Volume campus-audit-af8f0547_pgdata Removed 
 Volume campus-audit-af8f0547_pgdata Created 
 Volume campus-audit-af8f0547_pgdata Created 
 Container campus-audit-af8f0547-db-1 Healthy 
 Container campus-audit-af8f0547-db-1 Healthy 
 Container campus-audit-af8f0547-db-1 Healthy 
HTTP/1.1 200 OK
X-Replica: a9036dc09eaf
X-Upstream: 172.19.0.5:3000
[]
```

El primer ciclo conservó el mismo JSON. El segundo recreó el volumen de prueba y devolvió `[]`. El proyecto original se detuvo con `docker compose down`, conservando su volumen.

### Balanceo, conmutación y escrituras

Se comprobó la configuración montada con `docker compose -p campus-audit-af8f0547 exec -T balanceador cat /etc/nginx/conf.d/default.conf`. Se registró el código, las dos cabeceras, el cuerpo y la latencia de seis solicitudes en cada muestra.

```bash
for i in 1 2 3 4 5 6; do
  curl -fsS -i -w '\nLatencia: %{time_total}s\n' http://localhost:8080/v1/info
done
```

```text
zone campus_api 64k;
    server api1:3000 max_fails=2 fail_timeout=10s;
    server api2:3000 max_fails=2 fail_timeout=10s;
    server api3:3000 max_fails=2 fail_timeout=10s;
        proxy_next_upstream error timeout http_502 http_503;
        proxy_connect_timeout 2s;
        add_header X-Upstream $upstream_addr always;
-- 1 --
HTTP/1.1 200 OK
X-Replica: 70759f0d1288
X-Upstream: 172.19.0.4:3000
{"app":"campustareas-api","version":"1.0.0","replica":"70759f0d1288"}
Latencia: 0.215129s
-- 2 --
HTTP/1.1 200 OK
X-Replica: 71f5264e95f6
X-Upstream: 172.19.0.3:3000
{"app":"campustareas-api","version":"1.0.0","replica":"71f5264e95f6"}
Latencia: 0.206560s
-- 3 --
HTTP/1.1 200 OK
X-Replica: a9036dc09eaf
X-Upstream: 172.19.0.5:3000
{"app":"campustareas-api","version":"1.0.0","replica":"a9036dc09eaf"}
Latencia: 0.215824s
-- 4 --
HTTP/1.1 200 OK
X-Replica: 70759f0d1288
X-Upstream: 172.19.0.4:3000
{"app":"campustareas-api","version":"1.0.0","replica":"70759f0d1288"}
Latencia: 0.206972s
-- 5 --
HTTP/1.1 200 OK
X-Replica: 71f5264e95f6
X-Upstream: 172.19.0.3:3000
{"app":"campustareas-api","version":"1.0.0","replica":"71f5264e95f6"}
Latencia: 0.204225s
-- 6 --
HTTP/1.1 200 OK
X-Replica: a9036dc09eaf
X-Upstream: 172.19.0.5:3000
{"app":"campustareas-api","version":"1.0.0","replica":"a9036dc09eaf"}
Latencia: 0.210191s
```

```bash
docker compose -p campus-audit-af8f0547 stop api2
# Repetir el bucle de /v1/info.
docker compose -p campus-audit-af8f0547 logs balanceador --tail 20
docker compose -p campus-audit-af8f0547 start api2
```

```text
Container campus-audit-af8f0547-api2-1 Stopping 
 Container campus-audit-af8f0547-api2-1 Stopped 
-- 1 --
HTTP/1.1 200 OK
X-Replica: 70759f0d1288
X-Upstream: 172.19.0.4:3000
{"app":"campustareas-api","version":"1.0.0","replica":"70759f0d1288"}
Latencia: 0.208202s
-- 2 --
HTTP/1.1 200 OK
X-Replica: 71f5264e95f6
X-Upstream: 172.19.0.3:3000
{"app":"campustareas-api","version":"1.0.0","replica":"71f5264e95f6"}
Latencia: 0.206352s
-- 3 --
HTTP/1.1 200 OK
X-Replica: 70759f0d1288
X-Upstream: 172.19.0.5:3000, 172.19.0.4:3000
{"app":"campustareas-api","version":"1.0.0","replica":"70759f0d1288"}
Latencia: 2.212727s
-- 4 --
HTTP/1.1 200 OK
X-Replica: 70759f0d1288
X-Upstream: 172.19.0.4:3000
{"app":"campustareas-api","version":"1.0.0","replica":"70759f0d1288"}
Latencia: 0.210167s
-- 5 --
HTTP/1.1 200 OK
X-Replica: 71f5264e95f6
X-Upstream: 172.19.0.3:3000
{"app":"campustareas-api","version":"1.0.0","replica":"71f5264e95f6"}
Latencia: 0.241311s
-- 6 --
HTTP/1.1 200 OK
X-Replica: 70759f0d1288
X-Upstream: 172.19.0.5:3000, 172.19.0.4:3000
{"app":"campustareas-api","version":"1.0.0","replica":"70759f0d1288"}
Latencia: 2.206522s

balanceador-1  | 2026/11/17 19:49:54 [notice] 1#1: start worker process 34
balanceador-1  | 2026/11/17 19:49:54 [notice] 1#1: start worker process 35
balanceador-1  | 2026/11/17 19:49:54 [notice] 1#1: start worker process 36
balanceador-1  | 172.19.0.1 - - [17/Nov/2026:19:49:54 +0000] "GET /health/ready HTTP/1.1" 200 18 "-" "curl/8.22.0" "-"
balanceador-1  | 172.19.0.1 - - [17/Nov/2026:19:49:54 +0000] "GET /v1/tareas HTTP/1.1" 200 2 "-" "curl/8.22.0" "-"
balanceador-1  | 172.19.0.1 - - [17/Nov/2026:19:49:55 +0000] "GET /v1/info HTTP/1.1" 200 69 "-" "curl/8.22.0" "-"
balanceador-1  | 172.19.0.1 - - [17/Nov/2026:19:49:55 +0000] "GET /v1/info HTTP/1.1" 200 69 "-" "curl/8.22.0" "-"
balanceador-1  | 172.19.0.1 - - [17/Nov/2026:19:49:55 +0000] "GET /v1/info HTTP/1.1" 200 69 "-" "curl/8.22.0" "-"
balanceador-1  | 172.19.0.1 - - [17/Nov/2026:19:49:56 +0000] "GET /v1/info HTTP/1.1" 200 69 "-" "curl/8.22.0" "-"
balanceador-1  | 172.19.0.1 - - [17/Nov/2026:19:49:56 +0000] "GET /v1/info HTTP/1.1" 200 69 "-" "curl/8.22.0" "-"
balanceador-1  | 172.19.0.1 - - [17/Nov/2026:19:49:56 +0000] "GET /v1/info HTTP/1.1" 200 69 "-" "curl/8.22.0" "-"
balanceador-1  | 172.19.0.1 - - [17/Nov/2026:19:49:57 +0000] "GET /v1/info HTTP/1.1" 200 69 "-" "curl/8.22.0" "-"
balanceador-1  | 172.19.0.1 - - [17/Nov/2026:19:49:57 +0000] "GET /v1/info HTTP/1.1" 200 69 "-" "curl/8.22.0" "-"
balanceador-1  | 2026/11/17 19:50:00 [error] 31#31: *21 upstream timed out (110: Operation timed out) while connecting to upstream, client: 172.19.0.1, server: , request: "GET /v1/info HTTP/1.1", upstream: "http://172.19.0.5:3000/v1/info", host: "localhost:8080"
balanceador-1  | 172.19.0.1 - - [17/Nov/2026:19:50:00 +0000] "GET /v1/info HTTP/1.1" 200 69 "-" "curl/8.22.0" "-"
balanceador-1  | 172.19.0.1 - - [17/Nov/2026:19:50:00 +0000] "GET /v1/info HTTP/1.1" 200 69 "-" "curl/8.22.0" "-"
balanceador-1  | 172.19.0.1 - - [17/Nov/2026:19:50:00 +0000] "GET /v1/info HTTP/1.1" 200 69 "-" "curl/8.22.0" "-"
balanceador-1  | 2026/11/17 19:50:02 [warn] 34#34: *28 upstream server temporarily disabled while connecting to upstream, client: 172.19.0.1, server: , request: "GET /v1/info HTTP/1.1", upstream: "http://172.19.0.5:3000/v1/info", host: "localhost:8080"
balanceador-1  | 2026/11/17 19:50:02 [error] 34#34: *28 upstream timed out (110: Operation timed out) while connecting to upstream, client: 172.19.0.1, server: , request: "GET /v1/info HTTP/1.1", upstream: "http://172.19.0.5:3000/v1/info", host: "localhost:8080"
balanceador-1  | 172.19.0.1 - - [17/Nov/2026:19:50:02 +0000] "GET /v1/info HTTP/1.1" 200 69 "-" "curl/8.22.0" "-"
 Container campus-audit-af8f0547-db-1 Waiting 
 Container campus-audit-af8f0547-db-1 Healthy 
 Container campus-audit-af8f0547-api2-1 Starting 
 Container campus-audit-af8f0547-api2-1 Started 
api2 salió de la exclusión temporal: a9036dc09eaf
```

Las seis respuestas fueron HTTP 200 y provinieron de dos réplicas. Los dos reintentos transparentes añadieron hasta 2 s de espera de conexión por intento fallido, según `proxy_connect_timeout`. El tiempo total observado fue de hasta 2.213 s. Tras reiniciar `api2`, se esperó a que volviera al reparto, porque la exclusión temporal de Nginx puede seguir vigente tras el arranque.

```bash
curl -fsS -X POST http://localhost:8080/v1/tareas -H 'Content-Type: application/json' -d '{"titulo":"Informe de Docker","fechaEntrega":"2026-11-27"}'
for i in 1 2 3 4 5 6; do
  curl -fsS -i http://localhost:8080/v1/tareas
done
curl -fsS -i -X PATCH http://localhost:8080/v1/tareas/1 -H 'Content-Type: application/json' -d '{"completada":true}'
```

```text
HTTP/1.1 201 Created
X-Replica: 71f5264e95f6
X-Upstream: 172.19.0.3:3000
{"id":1,"titulo":"Informe de Docker","descripcion":"","fechaEntrega":"2026-11-27","completada":false}
Latencia: 0.243050s
-- 1 --
HTTP/1.1 200 OK
X-Replica: 70759f0d1288
X-Upstream: 172.19.0.4:3000
[{"id":1,"titulo":"Informe de Docker","descripcion":"","fechaEntrega":"2026-11-27","completada":false}]
Latencia: 0.230626s
-- 2 --
HTTP/1.1 200 OK
X-Replica: a9036dc09eaf
X-Upstream: 172.19.0.5:3000
[{"id":1,"titulo":"Informe de Docker","descripcion":"","fechaEntrega":"2026-11-27","completada":false}]
Latencia: 0.219470s
-- 3 --
HTTP/1.1 200 OK
X-Replica: 71f5264e95f6
X-Upstream: 172.19.0.3:3000
[{"id":1,"titulo":"Informe de Docker","descripcion":"","fechaEntrega":"2026-11-27","completada":false}]
Latencia: 0.219758s
-- 4 --
HTTP/1.1 200 OK
X-Replica: 70759f0d1288
X-Upstream: 172.19.0.4:3000
[{"id":1,"titulo":"Informe de Docker","descripcion":"","fechaEntrega":"2026-11-27","completada":false}]
Latencia: 0.211593s
-- 5 --
HTTP/1.1 200 OK
X-Replica: a9036dc09eaf
X-Upstream: 172.19.0.5:3000
[{"id":1,"titulo":"Informe de Docker","descripcion":"","fechaEntrega":"2026-11-27","completada":false}]
Latencia: 0.216359s
-- 6 --
HTTP/1.1 200 OK
X-Replica: 71f5264e95f6
X-Upstream: 172.19.0.3:3000
[{"id":1,"titulo":"Informe de Docker","descripcion":"","fechaEntrega":"2026-11-27","completada":false}]
Latencia: 0.218413s

PATCH /v1/tareas/1
HTTP/1.1 200 OK
X-Replica: 70759f0d1288
X-Upstream: 172.19.0.4:3000
{"id":1,"titulo":"Informe de Docker","descripcion":"","fechaEntrega":"2026-11-27","completada":true}
Latencia: 0.222495s
```

Las seis lecturas devolvieron el mismo cuerpo JSON desde tres réplicas. El `PATCH` utilizó el ID devuelto por el `POST` de esa ejecución y obtuvo `completada: true`.

## 7. Parte B. Retos opcionales

### Comprobación de referencia

Antes de editar la configuración, se ejecutaron seis consultas con `curl.exe -fsS -D - -o NUL http://localhost:8080/v1/info`. Ambas cabeceras rotaron entre las tres réplicas. `docker compose exec -T balanceador nginx -t` validó la configuración montada.

```text
X-Replica: 75c834d0b623
X-Upstream: 172.19.0.5:3000
---
X-Replica: 707542c0ec19
X-Upstream: 172.19.0.3:3000
---
X-Replica: 2b2271de3cfe
X-Upstream: 172.19.0.4:3000
---
X-Replica: 75c834d0b623
X-Upstream: 172.19.0.5:3000
---
X-Replica: 707542c0ec19
X-Upstream: 172.19.0.3:3000
---
X-Replica: 2b2271de3cfe
X-Upstream: 172.19.0.4:3000
---
nginx: the configuration file /etc/nginx/nginx.conf syntax is ok
nginx: configuration file /etc/nginx/nginx.conf test is successful
```

### Reto 1. Contraseña local en `.env`

Compose requiere `POSTGRES_PASSWORD` y se retiró el valor de respaldo. `.env.example` explica cómo crear `.env` y contiene un marcador distinto del valor local. Se conservó la contraseña con la que se inicializó `pgdata`. Se comprobó la regla `.env` en `.gitignore` directamente porque esta carpeta todavía carece de repositorio Git.

```powershell
(Get-Content .gitignore) -contains '.env'
docker compose config --quiet
docker compose up -d --force-recreate --wait
docker compose ps
curl.exe -fsS http://localhost:8080/health/ready
```

```text
True
NAME                               IMAGE                     COMMAND                  SERVICE       CREATED          STATUS                    PORTS
campustareasdocker-api1-1          campustareasdocker-api1   "docker-entrypoint.s…"   api1          16 seconds ago   Up 7 seconds (healthy)    3000/tcp
campustareasdocker-api2-1          campustareasdocker-api2   "docker-entrypoint.s…"   api2          16 seconds ago   Up 5 seconds (healthy)    3000/tcp
campustareasdocker-api3-1          campustareasdocker-api3   "docker-entrypoint.s…"   api3          16 seconds ago   Up 5 seconds (healthy)    3000/tcp
campustareasdocker-db-1            postgres:17-alpine        "docker-entrypoint.s…"   db            18 seconds ago   Up 13 seconds (healthy)   5432/tcp
{"status":"ready"}
```

### Reto 2. Comparar round robin con `least_conn`

Se usó el proyecto aislado `campus-reto`. El primer build aislado falló al resolver `registry-1.docker.io`. El reintento utilizó la imagen local `campus-api:1.0.0` en las tres réplicas mediante un override temporal. Se montó una copia de la configuración de Nginx y se conservó `zone campus_api 64k;`. La misma réplica quedó limitada a 0,25 CPU en ambas mediciones.

```powershell
docker compose -p campus-reto -f compose.yaml -f .campus-reto.override.tmp up -d --no-build --wait
$api1 = docker compose -p campus-reto -f compose.yaml -f .campus-reto.override.tmp ps -q api1
docker update --cpus 0.25 $api1
# Después de la primera medición, agregar least_conn; al upstream de la copia montada.
docker compose -p campus-reto -f compose.yaml -f .campus-reto.override.tmp exec -T balanceador nginx -t
docker compose -p campus-reto -f compose.yaml -f .campus-reto.override.tmp exec -T balanceador nginx -s reload
1..6 | ForEach-Object {
    curl.exe -fsS -D - -o NUL http://localhost:8080/v1/info |
        Select-String '^X-(Replica|Upstream):'
}
```

La prueba concurrente se ejecutó con `python -`, enviando este código por la entrada estándar antes y después de la recarga:

```python
from concurrent.futures import ThreadPoolExecutor
from collections import Counter
from http.client import HTTPConnection
from time import perf_counter

def request(_):
    conn = HTTPConnection("127.0.0.1", 8080, timeout=15)
    started = perf_counter()
    try:
        conn.request("GET", "/v1/trabajo-pesado")
        reply = conn.getresponse()
        reply.read()
        replica = reply.getheader("X-Replica")
        if reply.status != 200 or not replica:
            raise RuntimeError(f"HTTP {reply.status}, replica={replica}")
        return replica, perf_counter() - started
    finally:
        conn.close()

with ThreadPoolExecutor(max_workers=12) as pool:
    results = list(pool.map(request, range(60)))

print("60 respuestas HTTP 200; 12 conexiones concurrentes")
for replica, count in sorted(Counter(replica for replica, _ in results).items()):
    print(f"{replica}: {count} solicitudes")
print(f"Latencia maxima: {max(t for _, t in results):.3f} s")
```

```text
Round robin
api1 = 310d57c5b379
api2 = c98abfceec92
api3 = 9fefa4e20b86
60 respuestas HTTP 200; 12 conexiones concurrentes
310d57c5b379: 20 solicitudes
9fefa4e20b86: 20 solicitudes
c98abfceec92: 20 solicitudes
Latencia maxima: 1.022 s
least_conn: seis peticiones secuenciales
nginx: the configuration file /etc/nginx/nginx.conf syntax is ok
nginx: configuration file /etc/nginx/nginx.conf test is successful
2026/11/17 20:07:34 [notice] 43#43: signal process started
X-Replica: 310d57c5b379
X-Upstream: 172.19.0.4:3000
---
X-Replica: c98abfceec92
X-Upstream: 172.19.0.5:3000
---
X-Replica: 9fefa4e20b86
X-Upstream: 172.19.0.3:3000
---
X-Replica: 310d57c5b379
X-Upstream: 172.19.0.4:3000
---
X-Replica: c98abfceec92
X-Upstream: 172.19.0.5:3000
---
X-Replica: 9fefa4e20b86
X-Upstream: 172.19.0.3:3000
---
least_conn: misma carga concurrente
60 respuestas HTTP 200; 12 conexiones concurrentes
310d57c5b379: 14 solicitudes
9fefa4e20b86: 23 solicitudes
c98abfceec92: 23 solicitudes
Latencia maxima: 0.500 s
```

Con peticiones rápidas y secuenciales, las conexiones activas suelen empatar y `least_conn` distribuye esos empates por round robin. Con 12 solicitudes concurrentes, `least_conn` envió 14 a la réplica limitada frente a 20 con round robin. La latencia máxima observada pasó de 1,022 s a 0,500 s en esta muestra. Se dejó **round robin** en la configuración entregada para conservar el reparto por turnos de la práctica con réplicas equivalentes. Se retiraron la variante y sus archivos temporales.

### Reto 3. Escaneo con Docker Scout

```powershell
docker scout cves campus-api:1.0.0
```

```text
Indexed 248 packages
Detected 9 vulnerable packages with a total of 26 vulnerabilities

## Overview

                   │       Analyzed Image
───────────────────┼─────────────────────────────
 Target            │  campus-api:1.0.0
   digest          │  9ffd6fb0cc95
   platform        │ linux/amd64
   vulnerabilities │    1C    11H    13M     1L
   size            │ 63 MB
   packages        │ 248


## Packages and Vulnerabilities

   1C     0H     0M     0L  zlib 1.3.2-r1
pkg:apk/alpine/zlib@1.3.2-r1?os_name=alpine&os_version=3.24

    x CRITICAL CVE-2026-4738
      Affected range : <1.4-r0
      Fixed version  : 1.4-r0
```

Scout identificó **CVE-2026-4738**, de severidad crítica, en `zlib 1.3.2-r1` para Alpine 3.24. El escáner indica que afecta a versiones anteriores a `1.4-r0` y señala esa versión como corregida. Para remediarlo, se puede reconstruir una etiqueta nueva con una base que incluya `zlib 1.4-r0` o posterior y volver a ejecutar Scout. La etiqueta `1.0.0` original se conservó.

### Reto 4. Pendiente manual · GitHub Container Registry

Crea un **PAT clásico** con `write:packages`. Si la organización exige SSO, autoriza el token para esa organización. En PowerShell, cambia `TU_USUARIO` por tu usuario de GitHub. Introduce el PAT cuando Docker pida la contraseña.

```powershell
$usuario = 'TU_USUARIO'
docker login ghcr.io -u $usuario
docker tag campus-api:1.0.0 "ghcr.io/$usuario/campus-api:1.0.0"
docker push "ghcr.io/$usuario/campus-api:1.0.0"
```

La primera publicación crea un paquete privado por defecto. Revisa la visibilidad en los ajustes del paquete de GitHub y concede acceso a quien deba descargarlo. [Documentación de GitHub Container Registry](https://docs.github.com/en/packages/working-with-a-github-packages-registry/working-with-the-container-registry)

### Reto 5. Imagen `1.1.0`

El primer intento falló por DNS. El comando original funcionó al reintentarlo. En `campus-reto`, un override temporal agregó `version11` con la imagen construida, acceso a `db:5432` y el puerto local `18081`.

```powershell
docker build --build-arg APP_VERSION=1.1.0 -t campus-api:1.1.0 ./api
docker compose -p campus-reto -f compose.yaml -f .campus-reto.version.tmp up -d --no-build --wait version11
curl.exe -fsS http://127.0.0.1:18081/v1/info
docker compose -p campus-reto -f compose.yaml -f .campus-reto.version.tmp down -v
```

```text
#12 naming to docker.io/library/campus-api:1.1.0 done
Container campus-reto-db-1 Healthy
Container campus-reto-version11-1 Healthy
{"app":"campustareas-api","version":"1.1.0","replica":"709084b5a928"}
Volume campus-reto_pgdata Removed
```

### Estado final de Docker

```powershell
docker compose down
docker compose ps -a
docker images campus-api
docker volume ls
```

```text
NAME      IMAGE     COMMAND   SERVICE   CREATED   STATUS    PORTS
IMAGE              ID             DISK USAGE   CONTENT SIZE   EXTRA
campus-api:1.0.0   9ffd6fb0cc95        250MB         63.3MB        
campus-api:1.1.0   828aeedabb79        250MB         63.3MB        
DRIVER    VOLUME NAME
local     campustareasdocker_pgdata
```

### Pendiente manual · Entregar el repositorio

Crea un repositorio remoto vacío y ejecuta estos comandos desde la raíz del proyecto. Confirma que `git check-ignore` lista los dos archivos `.env` antes de preparar el commit. Sustituye el usuario y el nombre del repositorio remoto.

```powershell
git init -b main
git check-ignore -v .env api/.env
git add .gitignore .env.example README.md INFORME_PRACTICA.md compose.yaml api nginx android evidencias
git status --short
git commit -m "Entrega de CampusTareas con Docker"
git remote add origin https://github.com/TU_USUARIO/TU_REPOSITORIO.git
git push -u origin main
```
