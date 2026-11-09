const connectionUrl = () => `${location.protocol === 'https:' ? 'wss:' : 'ws:'}//${location.host}/ws`

// Own only socket lifecycle, reconnect backoff and the server-clock heartbeat.
export function createRoomConnection({
  getProfile, canSend, onMessage, onDisconnect, notify,
  url = connectionUrl, WebSocketCtor = globalThis.WebSocket, timers = globalThis
}) {
  let socket, reconnectTimer, clockTimer, attempts = 0, stopped = true

  function send(type, payload = {}) {
    if (socket?.readyState !== WebSocketCtor.OPEN || (!canSend() && type !== 'join')) {
      if (type !== 'cursor') notify('연결을 기다려주세요.')
      return false
    }
    socket.send(JSON.stringify({ type, ...payload }))
    return true
  }

  function ping() {
    send('ping', { sentAt: Date.now() })
  }

  function connect() {
    if (stopped) return
    socket = new WebSocketCtor(typeof url === 'function' ? url() : url)
    socket.onopen = () => send('join', getProfile())
    socket.onmessage = event => {
      const message = JSON.parse(event.data)
      onMessage(message)
      if (message.type === 'welcome') {
        attempts = 0
        ping()
      }
    }
    socket.onclose = () => {
      onDisconnect()
      if (!stopped) reconnectTimer = timers.setTimeout(connect, Math.min(5000, 500 * 2 ** attempts++))
    }
    socket.onerror = () => socket.close()
  }

  function start() {
    if (!stopped) return
    stopped = false
    connect()
    clockTimer = timers.setInterval(ping, 15000)
  }

  function stop() {
    stopped = true
    timers.clearTimeout(reconnectTimer)
    timers.clearInterval(clockTimer)
    socket?.close()
  }

  return { start, stop, send, ping }
}
