import express from 'express'
import {
    createTicket,
    listMyTickets,
    getMyTicket,
    replyAsUser,
    closeMyTicket,
    listAllTickets,
    getTicket,
    replyAsAdmin,
    updateTicketStatus
} from '../controllers/ticketController.js'
import authUser from '../middleware/auth.js'
import adminAuth from '../middleware/adminAuth.js'

const ticketRouter = express.Router()

// Customer
ticketRouter.post('/', authUser, createTicket)
ticketRouter.get('/mine', authUser, listMyTickets)
ticketRouter.get('/mine/:id', authUser, getMyTicket)
ticketRouter.post('/mine/:id/reply', authUser, replyAsUser)
ticketRouter.post('/mine/:id/close', authUser, closeMyTicket)

// Admin
ticketRouter.get('/admin/all', adminAuth, listAllTickets)
ticketRouter.get('/admin/:id', adminAuth, getTicket)
ticketRouter.post('/admin/:id/reply', adminAuth, replyAsAdmin)
ticketRouter.put('/admin/:id/status', adminAuth, updateTicketStatus)

export default ticketRouter
