import ticketModel from "../models/ticketModel.js";
import userModel from "../models/userModel.js";

// Customer: create a new ticket
const createTicket = async (req, res) => {
    try {
        const { userId, subject, category, message } = req.body;
        if (!subject || !message) {
            return res.json({ success: false, message: 'Subject and message are required' });
        }
        const user = await userModel.findById(userId);
        if (!user) return res.json({ success: false, message: 'User not found' });

        const ticket = await ticketModel.create({
            userId,
            userName: user.name,
            userEmail: user.email,
            subject,
            category: category || 'other',
            messages: [{ sender: 'user', senderName: user.name, body: message }],
            lastReplyAt: new Date(),
            lastReplyBy: 'user'
        });

        res.json({ success: true, ticket });
    } catch (error) {
        console.log(error);
        res.json({ success: false, message: error.message });
    }
}

// Customer: list own tickets
const listMyTickets = async (req, res) => {
    try {
        const { userId } = req.body;
        const tickets = await ticketModel.find({ userId }).sort({ updatedAt: -1 });
        res.json({ success: true, tickets });
    } catch (error) {
        console.log(error);
        res.json({ success: false, message: error.message });
    }
}

// Customer: fetch a single ticket (ownership-checked)
const getMyTicket = async (req, res) => {
    try {
        const { userId } = req.body;
        const ticket = await ticketModel.findOne({ _id: req.params.id, userId });
        if (!ticket) return res.json({ success: false, message: 'Ticket not found' });
        res.json({ success: true, ticket });
    } catch (error) {
        console.log(error);
        res.json({ success: false, message: error.message });
    }
}

// Customer: reply on own ticket
const replyAsUser = async (req, res) => {
    try {
        const { userId, message } = req.body;
        if (!message) return res.json({ success: false, message: 'Message is required' });

        const user = await userModel.findById(userId);
        const ticket = await ticketModel.findOne({ _id: req.params.id, userId });
        if (!ticket) return res.json({ success: false, message: 'Ticket not found' });
        if (ticket.status === 'closed') return res.json({ success: false, message: 'Ticket is closed' });

        ticket.messages.push({ sender: 'user', senderName: user?.name, body: message });
        ticket.status = 'open';
        ticket.lastReplyAt = new Date();
        ticket.lastReplyBy = 'user';
        await ticket.save();

        res.json({ success: true, ticket });
    } catch (error) {
        console.log(error);
        res.json({ success: false, message: error.message });
    }
}

// Customer: close own ticket
const closeMyTicket = async (req, res) => {
    try {
        const { userId } = req.body;
        const ticket = await ticketModel.findOneAndUpdate(
            { _id: req.params.id, userId },
            { status: 'closed' },
            { new: true }
        );
        if (!ticket) return res.json({ success: false, message: 'Ticket not found' });
        res.json({ success: true, ticket });
    } catch (error) {
        console.log(error);
        res.json({ success: false, message: error.message });
    }
}

// Admin: list all tickets (with optional status filter)
const listAllTickets = async (req, res) => {
    try {
        const { status } = req.query;
        const filter = status ? { status } : {};
        const tickets = await ticketModel.find(filter).sort({ updatedAt: -1 });
        res.json({ success: true, tickets });
    } catch (error) {
        console.log(error);
        res.json({ success: false, message: error.message });
    }
}

// Admin: fetch a single ticket
const getTicket = async (req, res) => {
    try {
        const ticket = await ticketModel.findById(req.params.id);
        if (!ticket) return res.json({ success: false, message: 'Ticket not found' });
        res.json({ success: true, ticket });
    } catch (error) {
        console.log(error);
        res.json({ success: false, message: error.message });
    }
}

// Admin: reply
const replyAsAdmin = async (req, res) => {
    try {
        const { message, status } = req.body;
        if (!message) return res.json({ success: false, message: 'Message is required' });

        const ticket = await ticketModel.findById(req.params.id);
        if (!ticket) return res.json({ success: false, message: 'Ticket not found' });

        ticket.messages.push({ sender: 'admin', senderName: 'Support', body: message });
        ticket.status = status || 'pending';
        ticket.lastReplyAt = new Date();
        ticket.lastReplyBy = 'admin';
        await ticket.save();

        res.json({ success: true, ticket });
    } catch (error) {
        console.log(error);
        res.json({ success: false, message: error.message });
    }
}

// Admin: update status (resolve/close/reopen)
const updateTicketStatus = async (req, res) => {
    try {
        const { status } = req.body;
        if (!['open', 'pending', 'resolved', 'closed'].includes(status)) {
            return res.json({ success: false, message: 'Invalid status' });
        }
        const ticket = await ticketModel.findByIdAndUpdate(req.params.id, { status }, { new: true });
        if (!ticket) return res.json({ success: false, message: 'Ticket not found' });
        res.json({ success: true, ticket });
    } catch (error) {
        console.log(error);
        res.json({ success: false, message: error.message });
    }
}

export {
    createTicket,
    listMyTickets,
    getMyTicket,
    replyAsUser,
    closeMyTicket,
    listAllTickets,
    getTicket,
    replyAsAdmin,
    updateTicketStatus
}
