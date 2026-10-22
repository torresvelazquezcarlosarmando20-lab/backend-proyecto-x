const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const { v4: uuidv4 } = require('uuid');
const nodemailer = require('nodemailer');

const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

const app = express();
app.use(cors());

// 
// 1. BASE DE DATOS Y MODELOS (Debe ir arriba)
// 
mongoose.connect(process.env.MONGODB_URI)
    .then(() => console.log('📦 Base de datos conectada con éxito.'))
    .catch(err => console.error('Error conectando a la BD:', err));

const Ticket = mongoose.model('Ticket', new mongoose.Schema({
    idBoleto: String,
    codigoDR: String,
    tipo: String,
    nombreComprador: String,
    telefonoComprador: String,
    emailComprador: String,
    lugar: String, // <-- LUGAR GUARDADO EN MONGODB
    pagado: { type: Boolean, default: false }
}));


// 
// 2. RUTA WEBHOOK (Para escuchar a Stripe)
// 
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

        console.log(`✅ ¡Pago exitoso confirmado para el boleto ${idBoleto} (${codigoDR})!`);
        await Ticket.findOneAndUpdate({ codigoDR: codigoDR }, { pagado: true });

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
        } catch (mailError) {
            console.error("Error al enviar el correo:", mailError);
        }
    }

    res.status(200).end();
});

// 
// 3. RUTAS NORMALES
// 
app.use(express.json());

// Ruta para verificar el estado de pago desde exito.html
app.get('/api/verificar-pago/:codigo', async (req, res) => {
    try {
        const codigoBuscado = req.params.codigo;
        const ticket = await Ticket.findOne({ codigoDR: codigoBuscado });

        if (ticket && ticket.pagado) {
            return res.json({ autorizado: true });
        } else {
            return res.json({ autorizado: false });
        }
    } catch (error) {
        console.error('Error al verificar pago:', error);
        res.status(500).json({ autorizado: false });
    }
});

// 
// RUTA PARA GENERACIÓN MANUAL DE BOLETOS (WhatsApp)
// 
app.post('/api/admin/generar-boleto', async (req, res) => {
    const { passwordAdmin, tipoBoleto, formato, nombreComprador, telefonoComprador, emailComprador, lugar } = req.body;

    if (passwordAdmin !== 'NIGHTBEAR2026') {
        return res.status(401).json({ error: 'Contraseña incorrecta' });
    }

    try {
        const idUnico = uuidv4().substring(0, 8).toUpperCase();
        const codigoDR = `DR-${Math.floor(100000 + Math.random() * 900000)}`;
        const fechaActual = new Date().toLocaleDateString('es-MX');

        await Ticket.create({
            idBoleto: idUnico,
            codigoDR: codigoDR,
            tipo: tipoBoleto,
            nombreComprador: nombreComprador,
            telefonoComprador: telefonoComprador,
            emailComprador: emailComprador,
            lugar: lugar || 'N/A',
            pagado: true
        });

        const urlDeGoogleScript = "https://script.google.com/macros/s/AKfycbwB_bzoYUP5nBFqq6q5zP9EmiGhPh01zsQUKKYrqQHVjNmOavEbxsUQ8un8Gj7MV8pv/exec";
        
        console.log("Enviando datos a Google...");

        const respuestaGoogle = await fetch(urlDeGoogleScript, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                idUnico: idUnico,
                codigoDR: codigoDR,
                nombre: nombreComprador,
                tipo: tipoBoleto,
                estado: 'Pagado (Venta Manual / WhatsApp)',
                fecha: fechaActual,
                email: emailComprador,
                telefono: telefonoComprador,
                lugar: lugar || 'N/A'
            })
        });

        const textoGoogle = await respuestaGoogle.text();
        console.log("Google Respondió:", textoGoogle);

        const enlaceBoleto = `https://nightbearproductions.netlify.app/exito.html?codigo=${codigoDR}&tipo=${encodeURIComponent(tipoBoleto)}&lugar=${encodeURIComponent(lugar || '')}`;
        res.json({ exito: true, codigoDR, enlaceBoleto });

    } catch (error) {
        console.error('Error generando boleto manual:', error);
        res.status(500).json({ error: 'Fallo al generar el boleto' });
    }
});

app.post('/api/crear-pago', async (req, res) => {
    const { tipoBoleto, cantidad, formato, nombreComprador, telefonoComprador, emailComprador, lugar } = req.body;
    
    let precio = 25000; // Por defecto Individual: $250.00 MXN
    const tipoLower = tipoBoleto.toLowerCase();

    // Lógica actualizada de precios (multiplicados por 100 para centavos de Stripe)
    if (tipoLower.includes('mesa') || tipoLower.includes('zona')) {
        if (tipoLower.includes('general')) {
            if (tipoLower.includes('final')) precio = 230000; // Zona general 2300
            else precio = 210000; // Zona general 2100 fase 2
        } else if (tipoLower.includes('vip')) {
            if (tipoLower.includes('final')) precio = 460000; // Zona vip 4600
            else precio = 400000; // Zona vip 4000 fase 2
        } else if (tipoLower.includes('midnight') || tipoLower.includes('pass')) {
            if (tipoLower.includes('final')) precio = 500000; // Zona Midnight Pass 5000
            else precio = 480000; // Zona Midnight Pass 4800 fase 2
        }
    } else {
        // Entradas individuales
        if (tipoLower.includes('midnight') || tipoLower.includes('menbers')) {
            precio = 50000; // Midnight Menbers 500
        } else if (tipoLower.includes('vip')) {
            if (tipoLower.includes('final')) precio = 46000; // VIP individual fase FINAL 460
            else precio = 42000; // VIP individual fase 2 420
        } else {
            precio = 25000; // Individual 250
        }
    }

    try {
        const idUnico = uuidv4().substring(0, 8).toUpperCase();
        const codigoDR = `DR-${Math.floor(100000 + Math.random() * 900000)}`;
        const fechaActual = new Date().toLocaleDateString('es-MX');

        if (formato === 'digital') {
            const urlDeGoogleScript = "https://script.google.com/macros/s/AKfycbwB_bzoYUP5nBFqq6q5zP9EmiGhPh01zsQUKKYrqQHVjNmOavEbxsUQ8un8Gj7MV8pv/exec";

            console.log("Enviando datos a Google desde crear-pago...");

            const respuestaGoogle = await fetch(urlDeGoogleScript, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    idUnico: idUnico,
                    codigoDR: codigoDR,
                    nombre: nombreComprador,
                    tipo: tipoBoleto,
                    estado: 'Pendiente de Pago',
                    fecha: fechaActual,
                    email: emailComprador,
                    telefono: telefonoComprador,
                    lugar: lugar || 'N/A'
                })
            });
            
            const textoGoogle = await respuestaGoogle.text();
            console.log("Google Respondió en crear-pago:", textoGoogle);
        }

        await Ticket.create({
            idBoleto: idUnico,
            codigoDR: codigoDR,
            tipo: tipoBoleto,
            nombreComprador: nombreComprador,
            telefonoComprador: telefonoComprador,
            emailComprador: emailComprador,
            lugar: lugar, 
            pagado: false
        });

        const session = await stripe.checkout.sessions.create({
            payment_method_types: ['card'],
            line_items: [
                {
                    price_data: {
                        currency: 'mxn',
                        product_data: { name: `Boleto ${tipoBoleto} (${formato}) - Night Bear Productions` },
                        unit_amount: precio,
                    },
                    quantity: Number(cantidad),
                },
            ],
            mode: 'payment',
            customer_email: emailComprador.split(' | ')[0] || 'cliente@ejemplo.com',
            success_url: `https://nightbearproductions.netlify.app/exito.html?codigo=${codigoDR}&tipo=${encodeURIComponent(tipoBoleto)}&lugar=${encodeURIComponent(lugar)}`,
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
                lugar: lugar || 'N/A',
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