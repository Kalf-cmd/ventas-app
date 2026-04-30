# Sistema de Ventas

Sistema web pequeno para gestionar productos, clientes y ventas. Esta pensado para un trabajo academico y para desplegarse de la forma mas sencilla en Render.

## Funciones

- Registro de productos con precio y stock.
- Registro de clientes.
- Registro de ventas con descuento automatico de stock.
- Resumen de productos, clientes, ventas e ingresos.
- Persistencia con PostgreSQL en Render.
- Modo local temporal si no existe `DATABASE_URL`.

## Ejecutar localmente

```bash
npm install
npm start
```

Luego abre:

```text
http://localhost:3000
```

Sin `DATABASE_URL`, los datos viven solo mientras el servidor este encendido.

Si Render tiene configurado el comando `node index.js`, tambien funcionara porque `index.js` carga el servidor principal.

## Desplegar en Render

1. Sube este proyecto a GitHub.
2. En Render, crea un nuevo **Blueprint** usando el archivo `render.yaml`.
3. Render creara el Web Service y la base de datos PostgreSQL.
4. Cuando termine el despliegue, abre la URL `onrender.com`.

Tambien puedes hacerlo manualmente:

- New > Web Service.
- Runtime: Node.
- Build Command: `npm install`.
- Start Command: `npm start`.
- Agrega una base de datos PostgreSQL.
- En el Web Service, crea la variable `DATABASE_URL` con la connection string interna de PostgreSQL.

## Estructura

```text
src/server.js       Backend Express y API REST
public/index.html   Interfaz web
public/styles.css   Estilos
public/app.js       Logica del navegador
render.yaml         Configuracion para Render
```
