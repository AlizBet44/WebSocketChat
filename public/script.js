/**
 * Cliente de Chat en Tiempo Real
 * Implementa WebSockets, Modo Oscuro, Indicadores de Red,
 * Detección de "Escribiendo...", y Validación de Entradas.
 */

// ============================================================================
// 1. CONFIGURACIÓN Y ESTADO DE LA APLICACIÓN
// ============================================================================
const CONFIG = {
  MAX_MESSAGE_LENGTH: 500,
  RECONNECT_INTERVAL_MS: 3000,
  TYPING_TIMEOUT_MS: 2500,
  TYPING_THROTTLE_MS: 1500
};

const state = {
  ws: null,
  userId: sessionStorage.getItem('chat_user_id') || ('usr_' + Math.random().toString(36).substring(2, 10)),
  username: sessionStorage.getItem('chat_username') || '',
  isConnected: false,
  isReconnecting: false,
  reconnectTimer: null,
  typingTimer: null,
  lastTypingSentTime: 0
};

// Guardar ID único de usuario en sessionStorage (aislado por pestaña)
sessionStorage.setItem('chat_user_id', state.userId);

// ============================================================================
// 2. ELEMENTOS DEL DOM
// ============================================================================
const DOM = {
  // Chat y mensajes
  chatMessages: document.getElementById('chatMessages'),
  chatForm: document.getElementById('chatForm'),
  messageInput: document.getElementById('messageInput'),
  sendBtn: document.getElementById('sendBtn'),
  charCounter: document.getElementById('charCounter'),
  
  // Estado de Red y usuarios
  networkStatus: document.getElementById('networkStatus'),
  networkStatusText: document.getElementById('networkStatusText'),
  userCount: document.getElementById('userCount'),

  // Indicador "Escribiendo..."
  typingIndicator: document.getElementById('typingIndicator'),
  typingText: document.getElementById('typingText'),

  // Tema Claro / Oscuro
  themeToggleBtn: document.getElementById('themeToggleBtn'),
  themeIcon: document.getElementById('themeIcon'),

  // Perfil y Modal
  changeUsernameBtn: document.getElementById('changeUsernameBtn'),
  currentUsernameLabel: document.getElementById('currentUsernameLabel'),
  userModal: document.getElementById('userModal'),
  usernameForm: document.getElementById('usernameForm'),
  modalUsernameInput: document.getElementById('modalUsernameInput'),

  // Toast Notificaciones
  toastNotification: document.getElementById('toastNotification')
};

// ============================================================================
// 3. TEMA CLARO / OSCURO (CON PERSISTENCIA EN LOCALSTORAGE)
// ============================================================================
function initTheme() {
  const savedTheme = localStorage.getItem('chat_theme');
  const prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
  
  // Aplicar modo oscuro si está guardado o es la preferencia del sistema
  if (savedTheme === 'dark' || (!savedTheme && prefersDark)) {
    document.body.classList.add('dark-mode');
    DOM.themeIcon.textContent = '☀️';
  } else {
    document.body.classList.remove('dark-mode');
    DOM.themeIcon.textContent = '🌙';
  }
}

function toggleTheme() {
  const isDark = document.body.classList.toggle('dark-mode');
  localStorage.setItem('chat_theme', isDark ? 'dark' : 'light');
  DOM.themeIcon.textContent = isDark ? '☀️' : '🌙';
}

DOM.themeToggleBtn.addEventListener('click', toggleTheme);

// ============================================================================
// 4. GESTIÓN DEL MODAL Y PERFIL DE USUARIO
// ============================================================================
function openUserModal() {
  DOM.modalUsernameInput.value = state.username;
  DOM.userModal.classList.remove('hidden');
  DOM.modalUsernameInput.focus();
}

function closeUserModal() {
  DOM.userModal.classList.add('hidden');
  DOM.messageInput.focus();
}

function updateProfileUI() {
  DOM.currentUsernameLabel.textContent = state.username || 'Sin Nombre';
}

DOM.usernameForm.addEventListener('submit', (e) => {
  e.preventDefault();
  const rawName = DOM.modalUsernameInput.value.trim();
  
  if (!rawName) {
    alert('Por favor, ingresa un nombre válido.');
    DOM.modalUsernameInput.focus();
    return;
  }

  state.username = rawName.substring(0, 25);
  sessionStorage.setItem('chat_username', state.username);
  updateProfileUI();
  closeUserModal();

  // Enviar actualización de usuario al servidor si el socket está abierto
  if (state.ws && state.ws.readyState === WebSocket.OPEN) {
    state.ws.send(JSON.stringify({
      type: 'join',
      userId: state.userId,
      username: state.username
    }));
  }
});

DOM.changeUsernameBtn.addEventListener('click', openUserModal);

// ============================================================================
// 5. GESTIÓN DEL ESTADO DE RED E INDICADOR VISUAL
// ============================================================================
function setNetworkStatus(status) {
  DOM.networkStatus.className = 'status-indicator';

  switch (status) {
    case 'connected':
      DOM.networkStatus.classList.add('status-connected');
      DOM.networkStatusText.textContent = 'Conectado';
      DOM.sendBtn.disabled = false;
      state.isConnected = true;
      state.isReconnecting = false;
      break;

    case 'disconnected':
      DOM.networkStatus.classList.add('status-disconnected');
      DOM.networkStatusText.textContent = 'Desconectado';
      DOM.sendBtn.disabled = true;
      state.isConnected = false;
      break;

    case 'reconnecting':
      DOM.networkStatus.classList.add('status-connecting');
      DOM.networkStatusText.textContent = 'Reconectando...';
      DOM.sendBtn.disabled = true;
      state.isConnected = false;
      state.isReconnecting = true;
      break;
  }
}

// ============================================================================
// 6. CONEXIÓN WEBSOCKET Y RECONEXIÓN AUTOMÁTICA
// ============================================================================
function connectWebSocket() {
  // Limpiar timer previo de reconexión si existe
  if (state.reconnectTimer) {
    clearTimeout(state.reconnectTimer);
    state.reconnectTimer = null;
  }

  // Determinar protocolo ws:// o wss:// dinámicamente
  const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
  const wsUrl = `${protocol}//${location.host}`;

  try {
    state.ws = new WebSocket(wsUrl);

    state.ws.onopen = () => {
      console.log('✓ WebSocket conectado con éxito');
      setNetworkStatus('connected');

      // Notificar al servidor quién es este usuario
      if (state.username) {
        state.ws.send(JSON.stringify({
          type: 'join',
          userId: state.userId,
          username: state.username
        }));
      }
    };

    state.ws.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data);
        handleServerMessage(payload);
      } catch (err) {
        console.error('Error parseando payload JSON:', err);
      }
    };

    state.ws.onclose = () => {
      console.warn('Conexión cerrada. Intentando reconectar...');
      setNetworkStatus('reconnecting');
      scheduleReconnect();
    };

    state.ws.onerror = (err) => {
      console.error('Error en WebSocket:', err);
      state.ws.close();
    };

  } catch (error) {
    console.error('Fallo al inicializar WebSocket:', error);
    setNetworkStatus('reconnecting');
    scheduleReconnect();
  }
}

function scheduleReconnect() {
  if (state.reconnectTimer) return;
  state.reconnectTimer = setTimeout(() => {
    state.reconnectTimer = null;
    connectWebSocket();
  }, CONFIG.RECONNECT_INTERVAL_MS);
}

// ============================================================================
// 7. PROCESAMIENTO DE MENSAJES RECIBIDOS (PAYLOADS JSON)
// ============================================================================
function handleServerMessage(msg) {
  switch (msg.type) {
    case 'init':
      if (msg.userCount !== undefined) {
        DOM.userCount.textContent = msg.userCount;
      }
      break;

    case 'user_count':
      if (msg.userCount !== undefined) {
        DOM.userCount.textContent = msg.userCount;
      }
      break;

    case 'system':
      appendSystemMessage(msg.text, msg.timestamp);
      if (msg.userCount !== undefined) {
        DOM.userCount.textContent = msg.userCount;
      }
      break;

    case 'chat':
      appendChatMessage(msg);
      break;

    case 'typing':
      // Mostrar indicador solo si el mensaje es de otro usuario
      if (msg.userId !== state.userId) {
        showTypingIndicator(msg.username);
      }
      break;

    case 'error':
      showToast(msg.message || 'Error en el servidor');
      break;

    default:
      console.log('Mensaje no reconocido:', msg);
  }
}

// ============================================================================
// 8. RENDERIZADO DE MENSAJES ESTILO WHATSAPP (FLEXBOX)
// ============================================================================

/**
 * Agrega una burbuja de mensaje (in / out) con hora en la esquina
 */
function appendChatMessage(msg) {
  const isSelf = msg.userId === state.userId;
  const row = document.createElement('div');
  row.className = `message-row ${isSelf ? 'out' : 'in'}`;

  const bubble = document.createElement('div');
  bubble.className = `bubble ${isSelf ? 'bubble-out' : 'bubble-in'}`;

  // Si es recibido de otro usuario, mostrar el nombre en la parte superior
  if (!isSelf) {
    const senderElem = document.createElement('div');
    senderElem.className = 'sender-name';
    senderElem.textContent = msg.username || 'Anónimo';
    bubble.appendChild(senderElem);
  }

  // Contenido del texto (protegido contra inyección XSS con textContent)
  const textElem = document.createElement('div');
  textElem.className = 'message-text';
  textElem.textContent = msg.text;
  bubble.appendChild(textElem);

  // Metadatos: Hora en la esquina inferior y doble check para mensajes propios
  const metaElem = document.createElement('div');
  metaElem.className = 'message-meta';

  const timeElem = document.createElement('span');
  timeElem.className = 'message-time';
  timeElem.textContent = msg.timestamp || '';
  metaElem.appendChild(timeElem);

  if (isSelf) {
    const checkElem = document.createElement('span');
    checkElem.className = 'check-status';
    checkElem.textContent = '✓✓';
    metaElem.appendChild(checkElem);
  }

  bubble.appendChild(metaElem);
  row.appendChild(bubble);

  DOM.chatMessages.appendChild(row);
  scrollToBottom();
}

/**
 * Agrega un mensaje de sistema centrado
 */
function appendSystemMessage(text, timestamp) {
  const systemRow = document.createElement('div');
  systemRow.className = 'message-system';

  const pill = document.createElement('span');
  pill.textContent = timestamp ? `${text} • ${timestamp}` : text;
  
  systemRow.appendChild(pill);
  DOM.chatMessages.appendChild(systemRow);
  scrollToBottom();
}

function scrollToBottom() {
  DOM.chatMessages.scrollTop = DOM.chatMessages.scrollHeight;
}

// ============================================================================
// 9. INDICADOR "ESCRIBIENDO..."
// ============================================================================
function showTypingIndicator(username) {
  DOM.typingText.textContent = `${username || 'Alguien'} está escribiendo...`;
  DOM.typingIndicator.classList.remove('hidden');

  // Limpiar temporizador previo
  if (state.typingTimer) {
    clearTimeout(state.typingTimer);
  }

  // Ocultar automáticamente tras 2 a 3 segundos de inactividad
  state.typingTimer = setTimeout(() => {
    DOM.typingIndicator.classList.add('hidden');
    state.typingTimer = null;
  }, CONFIG.TYPING_TIMEOUT_MS);
}

function notifyTypingToServer() {
  const now = Date.now();
  // Evitar saturar el WebSocket enviando máximo una vez cada 1.5s
  if (now - state.lastTypingSentTime > CONFIG.TYPING_THROTTLE_MS) {
    state.lastTypingSentTime = now;
    if (state.ws && state.ws.readyState === WebSocket.OPEN) {
      state.ws.send(JSON.stringify({
        type: 'typing',
        userId: state.userId,
        username: state.username
      }));
    }
  }
}

// ============================================================================
// 10. VALIDACIÓN DE ENTRADAS Y ENVÍO DE MENSAJES
// ============================================================================

/**
 * Muestra un aviso flotante y/o alerta en pantalla
 */
function showToast(message) {
  DOM.toastNotification.textContent = message;
  DOM.toastNotification.classList.remove('hidden');
  
  setTimeout(() => {
    DOM.toastNotification.classList.add('hidden');
  }, 3500);
}

/**
 * Actualiza el contador de caracteres en tiempo real
 */
function updateCharCounter() {
  const len = DOM.messageInput.value.length;
  DOM.charCounter.textContent = `${len} / ${CONFIG.MAX_MESSAGE_LENGTH}`;

  if (len > CONFIG.MAX_MESSAGE_LENGTH) {
    DOM.charCounter.className = 'char-counter danger';
  } else if (len > CONFIG.MAX_MESSAGE_LENGTH * 0.85) {
    DOM.charCounter.className = 'char-counter warning';
  } else {
    DOM.charCounter.className = 'char-counter';
  }
}

DOM.messageInput.addEventListener('input', () => {
  updateCharCounter();
  notifyTypingToServer();
});

function handleSendMessage() {
  const rawValue = DOM.messageInput.value;

  // Validación 1: Rechazar mensajes mayores a 500 caracteres, limpiar y alertar
  if (rawValue.length > CONFIG.MAX_MESSAGE_LENGTH) {
    DOM.messageInput.value = '';
    updateCharCounter();
    showToast('El mensaje supera el límite de 500 caracteres y fue descartado.');
    alert('⚠️ Tu mensaje supera el límite máximo permitido de 500 caracteres y no pudo ser enviado.');
    DOM.messageInput.focus();
    return;
  }

  // Validación 2: Verificar que no esté vacío ni contenga solo espacios
  const trimmedText = rawValue.trim();
  if (trimmedText.length === 0) {
    DOM.messageInput.value = '';
    updateCharCounter();
    DOM.messageInput.focus();
    return;
  }

  // Validación 3: Conexión activa
  if (!state.ws || state.ws.readyState !== WebSocket.OPEN) {
    showToast('No hay conexión con el servidor. Reconectando...');
    return;
  }

  // Validación 4: Nombre de usuario establecido
  if (!state.username) {
    openUserModal();
    return;
  }

  // Enviar payload JSON estructurado
  const payload = {
    type: 'chat',
    userId: state.userId,
    username: state.username,
    text: trimmedText
  };

  state.ws.send(JSON.stringify(payload));

  // Limpiar campo de texto y reiniciar contador
  DOM.messageInput.value = '';
  updateCharCounter();
  DOM.messageInput.focus();
}

DOM.chatForm.addEventListener('submit', (e) => {
  e.preventDefault();
  handleSendMessage();
});

// Enviar con Enter (sin Shift presionado)
DOM.messageInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    handleSendMessage();
  }
});

// ============================================================================
// 11. INICIALIZACIÓN
// ============================================================================
function initApp() {
  initTheme();
  updateCharCounter();

  // Si el usuario no tiene nombre registrado, mostrar modal de bienvenida
  if (!state.username) {
    openUserModal();
  } else {
    updateProfileUI();
  }

  // Iniciar conexión WebSocket
  connectWebSocket();
}

// Iniciar aplicación al cargar el DOM
document.addEventListener('DOMContentLoaded', initApp);

