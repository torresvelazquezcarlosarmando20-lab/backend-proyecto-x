const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const QRCode = require('qrcode');
const { v4: uuidv4 } = require('uuid'); // <--- ESTA LÍNEA ES OBLIGATORIA ARRIBA

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
// 4. Endpoint para crear la orden de pago con Stripe
app.post('/api/crear-pago', async (req, res) => {
    const { tipoBoleto, cantidad, formato, emailComprador } = req.body;
    
    // Asignación de precios según el tipo de boleto (en centavos)
    let precio = 2000; 

    if (tipoBoleto === 'VIP') {
        precio = 10000; 
    } else if (tipoBoleto === 'General') {
        precio = 5000;  
    } else if (tipoBoleto === 'Estudiante') {
        precio = 2500;  
    }

    try {
        // ==========================================================
        // AQUÍ AGREGAS LA LÓGICA SI EL BOLETO ES DIGITAL
        // ==========================================================
        if (formato === 'digital') {
            const idUnico = uuidv4().substring(0, 8).toUpperCase();
            const codigoDR = `DR-${Math.floor(100000 + Math.random() * 900000)}`;
            const fechaActual = new Date().toLocaleDateString('es-MX');

            // La URL que te dio Google Apps Script al implementarlo
            const urlDeGoogleScript = "PEGAR_AQUÍ_TU_URL_DE_GOOGLE_APPS_SCRIPT";

            // Enviamos los datos en secreto a tu Google Sheet
            await fetch(urlDeGoogleScript, {
                method: 'POST',
                body: JSON.stringify({
                    idUnico: idUnico,
                    codigoDR: codigoDR,
                    nombre: emailComprador, // Puedes cambiarlo por el nombre si lo pides en el formulario
                    tipo: tipoBoleto,
                    estado: 'Disponible',
                    fecha: fechaActual,
                    email: emailComprador
                })
            });
            console.log("📄 Registro enviado a Google Sheets con éxito.");
        }
        // ==========================================================

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

// 5. Arranque del servidor
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`🚀 Servidor listo para cobrar en el puerto ${PORT}`);
});