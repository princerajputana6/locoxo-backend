import { Server } from 'socket.io'

let io = null

export const initRealtime = (httpServer) => {
    io = new Server(httpServer, {
        cors: { origin: '*', methods: ['GET', 'POST'] }
    })

    io.on('connection', (socket) => {
        // Customer or admin asks to subscribe to a specific order
        socket.on('subscribe:order', (orderId) => {
            if (orderId) socket.join(`order:${orderId}`)
        })

        socket.on('unsubscribe:order', (orderId) => {
            if (orderId) socket.leave(`order:${orderId}`)
        })

        // Customer subscribes to all their orders
        socket.on('subscribe:user', (userId) => {
            if (userId) socket.join(`user:${userId}`)
        })

        // Admin dashboard
        socket.on('subscribe:admin', () => socket.join('admin'))
    })

    console.log('Socket.IO ready')
    return io
}

export const emitOrderUpdate = (orderId, payload) => {
    if (!io) return
    io.to(`order:${orderId}`).emit('order:update', payload)
    if (payload?.userId) io.to(`user:${payload.userId}`).emit('order:update', payload)
}

export const emitAdminOrderUpdate = (payload) => {
    if (!io) return
    io.to('admin').emit('order:update', payload)
}

export const getIO = () => io
