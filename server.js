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

const Ticket = mongoose.model('Ticket', new mongoose.Schema({
    idBoleto: String,
    tipo: String,
    emailComprador: String,
    pagado: { type: Boolean, default: false }
}));

app.post('/api/crear-pago', async (req, res) => {
    const { tipoBoleto, cantidad, formato, emailComprador } = req.body;
    
    let precio = 2000; 

    if (tipoBoleto === 'VIP') {
        precio = 10000; 
    } else if (tipoBoleto === 'General') {
        precio = 5000;  
    } else if (tipoBoleto === 'Estudiante') {
        precio = 2500;  
    }

    try {
        if (formato === 'digital') {
            const idUnico = uuidv4().substring(0, 8).toUpperCase();
            const codigoDR = `DR-${Math.floor(100000 + Math.random() * 900000)}`;
            const fechaActual = new Date().toLocaleDateString('es-MX');

            const urlDeGoogleScript = "PEGAR_AQUÍ_TU_URL_DE_GOOGLE_APPS_SCRIPT";

            if (urlDeGoogleScript !== "PEGAR_AQUÍ_TU_URL_DE_GOOGLE_APPS_SCRIPT") {
                await fetch(urlDeGoogleScript, {
                    method: 'POST',
                    body: JSON.stringify({
                        idUnico: idUnico,
                        codigoDR: codigoDR,
                        nombre: emailComprador,
                        tipo: tipoBoleto,
                        estado: 'Disponible',
                        fecha: fechaActual,
                        email: emailComprador
                    })
                });
                console.log("📄 Registro enviado a Google Sheets con éxito.");
            } else {
                console.log("⚠️ Saltando envío a Google Sheets: URL no configurada aún.");
            }
        }

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