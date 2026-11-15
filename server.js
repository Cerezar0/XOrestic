const WebSocket = require('ws');
const wss = new WebSocket.Server({ port: 8080 });
console.log('Сервер XOrestic запущен на ws://localhost:8080');

const queues = { '3x3': [], '4x4': [] };
let roomIdCounter = 1;

wss.on('connection', (ws) => {
    ws.on('message', (message) => {
        try {
            const data = JSON.parse(message);
            
            if (data.type === 'find_game') {
                const mode = data.mode;
                const queue = queues[mode];
                
                if (queue.length > 0) {
                    const opponent = queue.shift();
                    const roomId = roomIdCounter++;
                    ws.roomId = roomId;
                    opponent.roomId = roomId;
                    
                    ws.send(JSON.stringify({ 
                        type: 'game_start', symbol: 'X', opponentName: opponent.nickname || 'Игрок', roomId: roomId, mode: mode
                    }));
                    opponent.send(JSON.stringify({ 
                        type: 'game_start', symbol: 'O', opponentName: ws.nickname || 'Игрок', roomId: roomId, mode: mode
                    }));
                    console.log(`Игра ${roomId} создана`);
                } else {
                    ws.nickname = data.nickname;
                    queue.push(ws);
                    ws.send(JSON.stringify({ type: 'waiting' }));
                    console.log(`Игрок ${ws.nickname} в очереди ${mode}`);
                }
            }
            
            if (data.type === 'move') {
                wss.clients.forEach((client) => {
                    if (client !== ws && client.roomId === ws.roomId && client.readyState === WebSocket.OPEN) {
                        client.send(JSON.stringify({ type: 'opponent_move', index: data.index }));
                    }
                });
            }

            if (data.type === 'leave_game') {
                wss.clients.forEach((client) => {
                    if (client !== ws && client.roomId === ws.roomId && client.readyState === WebSocket.OPEN) {
                        client.send(JSON.stringify({ type: 'opponent_left' }));
                    }
                });
                ws.roomId = null;
            }
        } catch (e) { console.error(e); }
    });

    ws.on('close', () => {
        queues['3x3'] = queues['3x3'].filter(client => client !== ws);
        queues['4x4'] = queues['4x4'].filter(client => client !== ws);
        if (ws.roomId) {
            wss.clients.forEach((client) => {
                if (client !== ws && client.roomId === ws.roomId && client.readyState === WebSocket.OPEN) {
                    client.send(JSON.stringify({ type: 'opponent_left' }));
                }
            });
        }
    });
});