# Chat en Tiempo Real con WebSockets

Aplicacion de chat en tiempo real desarrollada con Node.js, Express y WebSockets (libreria ws).

---

## Archivos del Proyecto

```text
WebSocketChat/
├── public/
│   ├── index.html       # Estructura de la interfaz
│   ├── style.css        # Estilos y diseno responsivo
│   └── script.js        # Logica del cliente WebSocket
├── .gitignore           # Archivos excluidos del control de versiones
├── index.js             # Servidor HTTP y WebSocket
├── package.json         # Definicion del proyecto y dependencias
└── package-lock.json    # Arbol de versiones bloqueadas
```

---

## Requisitos Previos

* Node.js instalado en el sistema (version 18 o superior recomendada).
* Un navegador web moderno (Google Chrome, Microsoft Edge, Firefox, etc.).

---

## Pasos para Instalar y Ejecutar el Proyecto

Si descargaste el archivo ZIP o clonaste el repositorio desde GitHub, sigue estos pasos:

### 1. Abrir el proyecto en la terminal o IDE
Abre la carpeta del proyecto en tu editor de codigo (por ejemplo, Visual Studio Code) y abre una terminal integrada en la ruta principal del proyecto.

### 2. Instalar dependencias
Dado que la carpeta `node_modules` no se incluye en el repositorio, debes instalar las dependencias ejecutando:

```bash
npm install
```

Este comando descargara automaticamente las librerias necesarias (`express` y `ws`).

### 3. Iniciar el servidor
Ejecuta el siguiente comando para levantar el servidor:

```bash
npm start
```

En la consola deberas ver el mensaje:
`Servidor ejecutandose en http://localhost:3000`

### 4. Abrir la aplicacion
Abre tu navegador e ingresa a la siguiente direccion:
`http://localhost:3000`

---

## Pasos para Probar la Comunicacion en Tiempo Real

Para verificar el correcto funcionamiento del chat:

1. Abre dos pestanas independientes en tu navegador e ingresa en ambas a `http://localhost:3000`.
2. En la primera pestana, ingresa un nombre de usuario (ejemplo: "Usuario 1").
3. En la segunda pestana, ingresa otro nombre de usuario (ejemplo: "Usuario 2").
4. Escribe un mensaje desde la primera pestana:
   * En la pestana emisora el mensaje aparecera alineado a la derecha en color verde menta.
   * En la pestana receptora el mensaje aparecera alineado a la izquierda en color lila con el nombre del remitente.
5. Verifica el indicador de "escribiendo..." comenzando a teclear en una pestana sin presionar enviar.
6. Prueba el boton de modo claro / oscuro en la esquina superior derecha para validar el cambio de tema visual.

