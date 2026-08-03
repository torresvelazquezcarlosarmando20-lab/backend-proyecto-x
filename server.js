const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const QRCode = require('qrcode');

// Importamos Stripe y lo conectamos con la llave guardada en la caja fuerte de Render
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

const app = express();
app.use(cors());
app.use(express.json());

// 2. Conexión a MongoDB usando la variable de entorno de Render
mongoose.connect(process.env.MONGODB_URI)
    .then(() => console.log('📦 Base de datos conectada con éxito.'))
    .catch(err => console.error('Error conectando a la BD:', err));

// 3. Modelo de la Base de Datos
const Ticket = mongoose.model('Ticket', new mongoose.Schema({
    idBoleto: String,
    tipo: String,
    emailComprador: String,
    pagado: { type: Boolean, default: false }
}));

// 4. Endpoint para crear la orden de pago con Stripe
app.post('/api/crear-pago', async (req, res) => {
    const { tipoBoleto, cantidad, emailComprador } = req.body;
    
    // Asignación de precios según el tipo de boleto (cantidades en centavos)
    let precio = 2000; // Precio por defecto (si no coincide con ninguno)

    if (tipoBoleto === 'VIP') {
        precio = 10000; // $100.00 MXN (10000 centavos)
    } else if (tipoBoleto === 'General') {
        precio = 5000;  // $50.00 MXN (5000 centavos)
    } else if (tipoBoleto === 'Estudiante') {
        precio = 2500;  // $25.00 MXN (2500 centavos)
    }

    try {
        const session = await stripe.checkout.sessions.create({
            payment_method_types: ['card'],
            line_items: [
                {
                    price_data: {
                        currency: 'mxn', // Moneda en pesos mexicanos para tu cuenta Nu
                        product_data: {
                            name: `Boleto ${tipoBoleto} - Proyecto X`,
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

        // Devolvemos la URL segura de la pasarela de Stripe al Frontend
        res.json({
            urlDePago: session.url 
        });

    } catch (error) {
        console.error('Error con Stripe:', error);
        res.status(500).json({ error: 'Fallo al conectar con la pasarela de pagos' });
    }
});

// 5. Arranque del servidor
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`🚀 Servidor listo para cobrar en el puerto ${PORT}`);
});