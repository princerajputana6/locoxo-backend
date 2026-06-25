// Cashfree Payment Gateway service (PG Orders API, version 2023-08-01).
// Implemented with Node's global fetch — no extra dependency required.

const API_VERSION = '2023-08-01';

const baseUrl = () =>
    (process.env.CASHFREE_ENV || 'TEST').toUpperCase() === 'PROD'
        ? 'https://api.cashfree.com/pg'
        : 'https://sandbox.cashfree.com/pg';

const isConfigured = () =>
    process.env.CASHFREE_APP_ID &&
    process.env.CASHFREE_SECRET_KEY &&
    !process.env.CASHFREE_APP_ID.includes('Paste');

const headers = () => ({
    'Content-Type': 'application/json',
    'x-api-version': API_VERSION,
    'x-client-id': process.env.CASHFREE_APP_ID,
    'x-client-secret': process.env.CASHFREE_SECRET_KEY,
});

// Create a Cashfree order. Returns { order_id, payment_session_id, ... }.
const createOrder = async ({ orderId, amount, customer, returnUrl }) => {
    if (!isConfigured()) {
        throw new Error('Cashfree is not configured. Add CASHFREE_APP_ID and CASHFREE_SECRET_KEY to the backend .env');
    }

    const body = {
        order_id: orderId,
        order_amount: Number(amount.toFixed ? amount.toFixed(2) : amount),
        order_currency: 'INR',
        customer_details: {
            customer_id: customer.id,
            customer_name: customer.name || 'Customer',
            customer_email: customer.email || 'customer@locoxo.in',
            customer_phone: customer.phone || '9999999999',
        },
        order_meta: {
            return_url: returnUrl, // Cashfree appends ?order_id={order_id}
        },
    };

    const res = await fetch(`${baseUrl()}/orders`, {
        method: 'POST',
        headers: headers(),
        body: JSON.stringify(body),
    });

    const data = await res.json();
    if (!res.ok) {
        throw new Error(data.message || 'Failed to create Cashfree order');
    }
    return data;
};

// Fetch the payment status for an order. Returns 'PAID' | 'ACTIVE' | 'EXPIRED' | ...
const getOrderStatus = async (orderId) => {
    if (!isConfigured()) {
        throw new Error('Cashfree is not configured.');
    }

    const res = await fetch(`${baseUrl()}/orders/${orderId}`, {
        method: 'GET',
        headers: headers(),
    });
    const data = await res.json();
    if (!res.ok) {
        throw new Error(data.message || 'Failed to fetch Cashfree order');
    }
    // order_status: PAID | ACTIVE | EXPIRED | TERMINATED | TERMINATION_REQUESTED
    return data.order_status;
};

export { createOrder, getOrderStatus, isConfigured };
