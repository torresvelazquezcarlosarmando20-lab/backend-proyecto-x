const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const { v4: uuidv4 } = require('uuid');
const nodemailer = require('nodemailer');

const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

const app = express();
app.use(cors());

// ==========================================
// 1. BASE DE DATOS Y MODELOS (Debe ir arriba)
// ==========================================
mongoose.connect(process.env.MONGODB_URI)
    .then(() => console.log('📦 Base de datos conectada con éxito.'))
    .catch(err => console.error('Error conectando a la BD:', err));

const Ticket = mongoose.model('Ticket', new mongoose.Schema({
    idBoleto: String,
    tipo: String,
    nombreComprador: String,
    telefonoComprador: String,
    emailComprador: String,
    pagado: { type: Boolean, default: false }
}));

// ==========================================
// 2. RUTA WEBHOOK (Para escuchar a Stripe)
// IMPORTANTE: Stripe exige que el "body" sea raw
// ==========================================
app.post('/api/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
    const sig = req.headers['stripe-signature'];
    let event;

    try {
        event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET);
    } catch (err) {
        console.error('⚠️ Error en la firma del webhook:', err.message);
        return res.status(400).send(`Webhook Error: ${err.message}`);
    }

    if (event.type === 'checkout.session.completed') {
        const session = event.data.object;
        
        const { idBoleto, codigoDR, nombre, telefono, email, cantidad, tipo, formato, precioTotal } = session.metadata;

        console.log(`✅ ¡Pago exitoso confirmado para el boleto ${idBoleto}!`);

        // Marcamos el boleto como pagado
        await Ticket.findOneAndUpdate({ idBoleto: idBoleto }, { pagado: true });

        // ENVIAMOS EL CORREO A NIGHT BEAR
        try {
            const transporter = nodemailer.createTransport({
                service: 'gmail',
                auth: {
                    user: 'nightbearproduction@gmail.com',
                    pass: process.env.EMAIL_PASSWORD
                }
            });

            const mailOptions = {
                from: '"Sistema Night Bear" <nightbearproduction@gmail.com>',
                to: 'nightbearproduction@gmail.com',
                subject: `💰 PAGO CONFIRMADO - ${nombre.split(' | ')[0]}`,
                html: `
                    <div style="font-family: Arial, sans-serif; padding: 20px; color: #333;">
                        <h2 style="color: #2ecc71;">¡Pago completado con éxito!</h2>
                        <p>El dinero ya entró a tu cuenta de Stripe. Estos son los detalles de la compra real:</p>
                        <table style="width: 100%; border-collapse: collapse; margin-top: 15px;">
                            <tr><td style="padding: 8px; border-bottom: 1px solid #ddd;"><strong>Comprador(es):</strong></td><td style="padding: 8px; border-bottom: 1px solid #ddd;">${nombre}</td></tr>
                            <tr><td style="padding: 8px; border-bottom: 1px solid #ddd;"><strong>Correo(s):</strong></td><td style="padding: 8px; border-bottom: 1px solid #ddd;">${email}</td></tr>
                            <tr><td style="padding: 8px; border-bottom: 1px solid #ddd;"><strong>WhatsApp(s):</strong></td><td style="padding: 8px; border-bottom: 1px solid #ddd;">${telefono}</td></tr>
                            <tr><td style="padding: 8px; border-bottom: 1px solid #ddd;"><strong>Boletos:</strong></td><td style="padding: 8px; border-bottom: 1px solid #ddd;">${cantidad}x ${tipo} (${formato})</td></tr>
                            <tr><td style="padding: 8px; border-bottom: 1px solid #ddd;"><strong>Monto Pagado:</strong></td><td style="padding: 8px; border-bottom: 1px solid #ddd;">$${precioTotal} MXN</td></tr>
                            <tr><td style="padding: 8px; border-bottom: 1px solid #ddd;"><strong>ID Generado:</strong></td><td style="padding: 8px; border-bottom: 1px solid #ddd; color: #2ecc71; font-weight: bold;">${idBoleto}</td></tr>
                            <tr><td style="padding: 8px; border-bottom: 1px solid #ddd;"><strong>Código Asignado:</strong></td><td style="padding: 8px; border-bottom: 1px solid #ddd; color: #2ecc71; font-weight: bold;">${codigoDR}</td></tr>
                        </table>
                    </div>
                `
            };

            await transporter.sendMail(mailOptions);
            console.log("📧 Correo de confirmación de pago enviado al admin.");
        } catch (mailError) {
            console.error("Error al enviar el correo:", mailError);
        }
    }

    res.status(200).end();
});

// ==========================================
// 3. RUTAS NORMALES (A partir de aquí se usa JSON)
// ==========================================
app.use(express.json());

app.post('/api/crear-pago', async (req, res) => {
    const { tipoBoleto, cantidad, formato, nombreComprador, telefonoComprador, emailComprador } = req.body;
    
    let precio = 10000; // Valor por defecto (Preventa: 100 MXN en centavos)

    // Definición exacta de precios para cada tipo de acceso
    if (tipoBoleto === 'Preventa de Lanzamiento' || tipoBoleto === 'Preventa') {
        precio = 10000; // 100.00 MXN
    } else if (tipoBoleto === 'Zona General' || tipoBoleto.includes('General')) {
        precio = 180000; // 1,800.00 MXN
    } else if (tipoBoleto === 'Zona VIP' || tipoBoleto.includes('VIP')) {
        precio = 500000; // 5,000.00 MXN
    }

    try {
        const idUnico = uuidv4().substring(0, 8).toUpperCase();
        const codigoDR = `DR-${Math.floor(100000 + Math.random() * 900000)}`;
        const fechaActual = new Date().toLocaleDateString('es-MX');

        if (formato === 'digital') {
            const urlDeGoogleScript = "https://script.google.com/macros/s/AKfycbyhttcJq4B6r7PKIThloX-VHza5o6_tGmZe_qCGw4oqSEDsKbNrNbvaTVmDjQ-DyJC6hg/exec";

            await fetch(urlDeGoogleScript, {
                method: 'POST',
                body: JSON.stringify({
                    idUnico: idUnico,
                    codigoDR: codigoDR,
                    nombre: nombreComprador,
                    tipo: tipoBoleto,
                    estado: 'Pendiente de Pago',
                    fecha: fechaActual,
                    email: emailComprador,
                    telefono: telefonoComprador
                })
            });
        }

        await Ticket.create({
            idBoleto: idUnico,
            tipo: tipoBoleto,
            nombreComprador: nombreComprador,
            telefonoComprador: telefonoComprador,
            emailComprador: emailComprador,
            pagado: false
        });

        const session = await stripe.checkout.sessions.create({
            payment_method_types: ['card'],
            line_items: [
                {
                    price_data: {
                        currency: 'mxn',
                        product_data: {
                            name: `Boleto ${tipoBoleto} (${formato}) - Night Bear Productions`,
                        },
                        unit_amount: precio,
                    },
                    quantity: Number(cantidad),
                },
            ],
            mode: 'payment',
            customer_email: emailComprador.split(' | ')[0] || 'cliente@ejemplo.com',
            // Importante: Enviamos el código y el tipo de boleto para que exito.html cargue el diseño correcto
            success_url: `https://nightbearproductions.netlify.app/exito.html?codigo=${codigoDR}&tipo=${encodeURIComponent(tipoBoleto)}`,
            cancel_url: 'https://nightbearproductions.netlify.app/',
            metadata: {
                idBoleto: idUnico,
                codigoDR: codigoDR,
                nombre: nombreComprador.substring(0, 490),
                telefono: telefonoComprador.substring(0, 490),
                email: emailComprador.substring(0, 490),
                cantidad: cantidad.toString(),
                tipo: tipoBoleto,
                formato: formato,
                precioTotal: ((precio / 100) * cantidad).toString()
            }
        });

        res.json({ urlDePago: session.url });

    } catch (error) {
        console.error('Error procesando pago:', error);
        res.status(500).json({ error: 'Fallo al procesar la solicitud' });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`🚀 Servidor listo para cobrar en el puerto ${PORT}`);
});