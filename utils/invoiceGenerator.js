import PDFDocument from 'pdfkit';
import QRCode from 'qrcode';
import fs from 'fs';
import path from 'path';

const generateInvoice = async (orderData) => {
    return new Promise(async (resolve, reject) => {
        try {
            // Create invoices directory if it doesn't exist
            const invoicesDir = path.join(process.cwd(), 'invoices');
            if (!fs.existsSync(invoicesDir)) {
                fs.mkdirSync(invoicesDir, { recursive: true });
            }

            const invoicePath = path.join(invoicesDir, `invoice-${orderData.orderNumber}.pdf`);
            const doc = new PDFDocument({ margin: 50 });
            const stream = fs.createWriteStream(invoicePath);

            doc.pipe(stream);

            // Generate QR Code with complete order information
            const qrCodeData = JSON.stringify({
                orderNumber: orderData.orderNumber,
                orderDate: new Date(orderData.date).toLocaleDateString(),
                paymentMethod: orderData.paymentMethod,
                paymentStatus: orderData.payment ? 'Paid' : 'Pending',
                customer: {
                    name: `${orderData.address.firstName} ${orderData.address.lastName}`,
                    email: orderData.address.email,
                    phone: orderData.address.phone
                },
                items: orderData.items.map(item => ({
                    name: item.name,
                    size: item.size,
                    quantity: item.quantity,
                    price: item.price
                })),
                pricing: {
                    subtotal: orderData.subtotal || orderData.amount,
                    shipping: orderData.shippingCharge || 0,
                    total: orderData.amount
                },
                verificationUrl: `https://locoxo.com/verify-order/${orderData.orderNumber}`
            });
            const qrCodeImage = await QRCode.toDataURL(qrCodeData);

            // Logo and Header
            const logoPath = path.join(process.cwd(), 'assets', 'logo.png');
            if (fs.existsSync(logoPath)) {
                doc.image(logoPath, 50, 45, { width: 60 });
            }
            
            doc.fontSize(24).font('Helvetica-Bold').text('LOCOXO', 120, 50);
            doc.fontSize(10).font('Helvetica').text('Premium Fashion Store', 120, 80);
            doc.text('Mumbai, Maharashtra, India', 120, 95);
            doc.text('Phone: +91-9876543210', 120, 110);
            doc.text('Email: support@locoxo.com', 120, 125);

            // Invoice Title
            doc.fontSize(20).font('Helvetica-Bold').text('INVOICE', 400, 50);
            doc.fontSize(10).font('Helvetica').text(`Invoice #: ${orderData.orderNumber}`, 400, 80);
            doc.text(`Date: ${new Date(orderData.date).toLocaleDateString()}`, 400, 95);
            doc.text(`Payment: ${orderData.paymentMethod}`, 400, 110);

            // QR Code
            const qrBuffer = Buffer.from(qrCodeImage.split(',')[1], 'base64');
            doc.image(qrBuffer, 450, 130, { width: 80 });

            // Line separator
            doc.moveTo(50, 230).lineTo(550, 230).stroke();

            // Bill To
            doc.fontSize(12).font('Helvetica-Bold').text('BILL TO:', 50, 250);
            doc.fontSize(10).font('Helvetica')
                .text(`${orderData.address.firstName} ${orderData.address.lastName}`, 50, 270)
                .text(`${orderData.address.street}`, 50, 285)
                .text(`${orderData.address.city}, ${orderData.address.state} - ${orderData.address.zipcode}`, 50, 300)
                .text(`Phone: ${orderData.address.phone}`, 50, 315)
                .text(`Email: ${orderData.address.email}`, 50, 330);

            // Items Table Header
            const tableTop = 370;
            doc.fontSize(10).font('Helvetica-Bold');
            doc.text('Item', 50, tableTop);
            doc.text('Size', 250, tableTop);
            doc.text('Qty', 320, tableTop);
            doc.text('Price', 380, tableTop);
            doc.text('Total', 480, tableTop);

            // Line under header
            doc.moveTo(50, tableTop + 15).lineTo(550, tableTop + 15).stroke();

            // Items
            let yPosition = tableTop + 30;
            doc.font('Helvetica');

            orderData.items.forEach((item) => {
                const itemTotal = item.price * item.quantity;
                
                doc.text(item.name.substring(0, 30), 50, yPosition, { width: 180 });
                doc.text(item.size, 250, yPosition);
                doc.text(item.quantity.toString(), 320, yPosition);
                doc.text(`₹${item.price}`, 380, yPosition);
                doc.text(`₹${itemTotal}`, 480, yPosition);
                
                yPosition += 25;
            });

            // Line before totals
            yPosition += 10;
            doc.moveTo(50, yPosition).lineTo(550, yPosition).stroke();

            // Totals
            yPosition += 20;
            doc.font('Helvetica');
            doc.text('Subtotal:', 380, yPosition);
            doc.text(`₹${orderData.subtotal || orderData.amount}`, 480, yPosition);

            yPosition += 20;
            doc.text('Shipping:', 380, yPosition);
            doc.text(`₹${orderData.shippingCharge || 0}`, 480, yPosition);

            yPosition += 20;
            doc.fontSize(12).font('Helvetica-Bold');
            doc.text('Total Amount:', 380, yPosition);
            doc.text(`₹${orderData.amount}`, 480, yPosition);

            // Footer
            doc.fontSize(8).font('Helvetica').text(
                'Thank you for shopping with LOCOXO! For any queries, contact us at support@locoxo.com',
                50,
                yPosition + 80,
                { align: 'center', width: 500 }
            );

            doc.fontSize(8).text(
                'This is a computer-generated invoice and does not require a signature.',
                50,
                yPosition + 100,
                { align: 'center', width: 500 }
            );

            doc.end();

            stream.on('finish', () => {
                resolve(invoicePath);
            });

            stream.on('error', (error) => {
                reject(error);
            });

        } catch (error) {
            reject(error);
        }
    });
};

export default generateInvoice;
