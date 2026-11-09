const express = require('express');
const WebSocket = require('ws');
const path = require('path');

const app = express();
const port = process.env.PORT || 3000;

// Servir archivos estáticos desde la carpeta public
app.use(express.static(path.join(__dirname, 'public')));

// Iniciar servidor HTTP
const server = app.listen(port, () => {
  console.log(`🚀 Servidor ejecutándose en http://localhost:${port}`);
});

// Instanciar el servidor WebSocket enlazado al servidor HTTP
const wss = new WebSocket.Server({ server });

// Estructura para gestionar clientes conectados: Map<WebSocket, { id: string, username: string }>()
const clients = new Map();

/**
 * Genera una hora formateada en HH:mm (ej. 18:30)
 */
function getFormattedTimestamp() {
  const now = new Date();
  return now.toLocaleTimeString('es-ES', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  });
}

/**
 * Envía un payload JSON a todos los clientes conectados o a un subconjunto
 * @param {object} data Objeto del mensaje a serializar
 * @param {WebSocket|null} excludeWs Cliente a excluir (opcional)
 */
function broadcast(data, excludeWs = null) {
  const payload = JSON.stringify(data);
  for (const [client] of clients) {
    if (client !== excludeWs && client.readyState === WebSocket.OPEN) {
      client.send(payload);
    }
  }
}

wss.on('connection', (ws) => {
  // Asignación de ID temporal y usuario por defecto
  const tempId = 'user_' + Math.random().toString(36).substring(2, 9);
  const defaultUser = {
    id: tempId,
    username: 'Anónimo'
  };
  clients.set(ws, defaultUser);

  console.log(`[CONEXIÓN] Cliente conectado (ID provisional: ${tempId}). Total: ${clients.size}`);

  // Enviar mensaje de inicialización al cliente con el total de usuarios y su ID provisional
  ws.send(JSON.stringify({
    type: 'init',
    userId: tempId,
    userCount: clients.size,
    timestamp: getFormattedTimestamp()
  }));

  // Notificar al resto sobre el número de usuarios conectados
  broadcast({
    type: 'user_count',
    userCount: clients.size
  }, ws);

  ws.on('message', (rawData) => {
    try {
      const data = JSON.parse(rawData);

      // 1. Registro de usuario (Join)
      if (data.type === 'join') {
        const username = typeof data.username === 'string' && data.username.trim()
          ? data.username.trim().substring(0, 25)
          : 'Anónimo';
        const userId = data.userId || tempId;

        clients.set(ws, { id: userId, username });

        console.log(`[USUARIO IDENTIFICADO] ${username} (${userId}). Total: ${clients.size}`);

        // Notificar a todos los usuarios que alguien se unió
        broadcast({
          type: 'system',
          action: 'join',
          username: username,
          text: `${username} se unió al chat`,
          userCount: clients.size,
          timestamp: getFormattedTimestamp()
        });
      }

      // 2. Mensajes de Chat
      else if (data.type === 'chat') {
        const currentUser = clients.get(ws) || defaultUser;
        const rawText = typeof data.text === 'string' ? data.text.trim() : '';

        // Validación estricta en servidor: no vacío y máximo 500 caracteres
        if (!rawText || rawText.length === 0 || rawText.length > 500) {
          ws.send(JSON.stringify({
            type: 'error',
            message: 'El mensaje debe tener entre 1 y 500 caracteres.'
          }));
          return;
        }

        const chatPayload = {
          type: 'chat',
          id: 'msg_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6),
          userId: currentUser.id,
          username: currentUser.username,
          text: rawText,
          timestamp: getFormattedTimestamp() // Inyección de hora exacta por el servidor
        };

        // Broadcast a todos los usuarios conectados (incluido el emisor)
        broadcast(chatPayload);
      }

      // 3. Indicador de "Escribiendo..."
      else if (data.type === 'typing') {
        const currentUser = clients.get(ws) || defaultUser;

        // Reenviar únicamente a los demás usuarios (no al que está escribiendo)
        broadcast({
          type: 'typing',
          userId: currentUser.id,
          username: currentUser.username
        }, ws);
      }

    } catch (err) {
      console.error('[ERROR PARSING MESSAGE]:', err.message);
    }
  });

  // Manejo de desconexión
  ws.on('close', () => {
    const leavingUser = clients.get(ws);
    clients.delete(ws);

    console.log(`[DESCONEXIÓN] Cliente ${leavingUser ? leavingUser.username : 'Desconocido'} se ha ido. Restantes: ${clients.size}`);

    // Notificar a todos los clientes restantes sobre la salida
    if (leavingUser && leavingUser.username) {
      broadcast({
        type: 'system',
        action: 'leave',
        username: leavingUser.username,
        text: `${leavingUser.username} salió del chat`,
        userCount: clients.size,
        timestamp: getFormattedTimestamp()
      });
    } else {
      // Si no tenía nombre registrado, al menos actualizar el contador
      broadcast({
        type: 'user_count',
        userCount: clients.size
      });
    }
  });

  // Manejo de errores de conexión
  ws.on('error', (err) => {
    console.error(`[ERROR WEBSOCKET]:`, err.message);
    clients.delete(ws);
  });
});
