const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const QRCode = require('qrcode');
const { v4: uuidv4 } = require('uuid');

const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

const app = express();
app.use(cors());
app.use(express.json());

mongoose.connect(process.env.MONGODB_URI)
    .then(() => console.log('📦 Base de datos conectada con éxito.'))
    .catch(err => console.error('Error conectando a la BD:', err));

// Modelo actualizado de la Base de Datos con Nombre y Teléfono
const Ticket = mongoose.model('Ticket', new mongoose.Schema({
    idBoleto: String,
    tipo: String,
    nombreComprador: String,
    telefonoComprador: String,
    emailComprador: String,
    pagado: { type: Boolean, default: false }
}));

app.post('/api/crear-pago', async (req, res) => {
    const { tipoBoleto, cantidad, formato, nombreComprador, telefonoComprador, emailComprador } = req.body;
    
    let precio = 5000; // Por defecto General (50.00 MXN en centavos)

    if (tipoBoleto === 'VIP') {
        precio = 10000; // 100.00 MXN en centavos
    } else if (tipoBoleto === 'General') {
        precio = 5000;  // 50.00 MXN en centavos
    } else if (tipoBoleto === 'Estudiante') {
        precio = 2500;  // 25.00 MXN en centavos
    }

    try {
        if (formato === 'digital') {
            const idUnico = uuidv4().substring(0, 8).toUpperCase();
            const codigoDR = `DR-${Math.floor(100000 + Math.random() * 900000)}`;
            const fechaActual = new Date().toLocaleDateString('es-MX');

            const urlDeGoogleScript = "https://script.google.com/macros/s/AKfycbyhttcJq4B6r7PKIThloX-VHza5o6_tGmZe_qCGw4oqSEDsKbNrNbvaTVmDjQ-DyJC6hg/exec";

            await fetch(urlDeGoogleScript, {
                method: 'POST',
                body: JSON.stringify({
                    idUnico: idUnico,
                    codigoDR: codigoDR,
                    nombre: nombreComprador,
                    tipo: tipoBoleto,
                    estado: 'Disponible',
                    fecha: fechaActual,
                    email: emailComprador,
                    telefono: telefonoComprador
                })
            });
            console.log("📄 Registro enviado a Google Sheets con éxito.");
        }

        // Guardamos los datos de la orden en MongoDB
        await Ticket.create({
            idBoleto: uuidv4(),
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
            customer_email: emailComprador || 'cliente@ejemplo.com',
            success_url: 'https://tusitio.com/exito',
            cancel_url: 'https://tusitio.com/fallo',
        });

        res.json({
            urlDePago: session.url 
        });

    } catch (error) {
        console.error('Error con Stripe o Google Sheets:', error);
        res.status(500).json({ error: 'Fallo al procesar la solicitud' });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`🚀 Servidor listo para cobrar en el puerto ${PORT}`);
});