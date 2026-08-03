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
// 4. Endpoint para crear la orden de pago con Stripe
app.post('/api/crear-pago', async (req, res) => {
    // Recibimos los datos que envía tu nuevo index.html (incluyendo el formato: físico o digital)
    const { tipoBoleto, cantidad, formato, emailComprador } = req.body;
    
    // Asignación de precios según el tipo de boleto (cantidades en centavos)
    let precio = 2000; // Precio por defecto

    if (tipoBoleto === 'VIP') {
        precio = 10000; // $100.00 MXN
    } else if (tipoBoleto === 'General') {
        precio = 5000;  // $50.00 MXN
    } else if (tipoBoleto === 'Estudiante') {
        precio = 2500;  // $25.00 MXN
    }

    try {
        // ==========================================
        // AQUÍ ES DONDE INTEGRAS LA LÓGICA DE TU SECUENCIA
        // Si el usuario eligió formato digital, generamos su registro y QR:
        if (formato === 'digital') {
            const idUnico = uuidv4().substring(0, 8).toUpperCase();
            const codigoDR = `DR-${Math.floor(100000 + Math.random() * 900000)}`;
            const fechaActual = new Date().toLocaleDateString('es-MX');

            // Aquí ejecutas la función para guardarlo en tu Google Sheet / Drive o Base de datos:
            console.log(`Generando boleto digital con secuencia: ID: ${idUnico}, Código: ${codigoDR}, Fecha: ${fechaActual}`);
            
            // Ejemplo de los datos estructurados que se irán a tu registro:
            // CampoEjemploID: ${idUnico}
            // CódigoDR: ${codigoDR}
            // Nombre: Carlos Torres (o el que recolectes del formulario)
            // Tipo: ${tipoBoleto}
            // Estado: Disponible / Vendido
            // Fecha de compra: ${fechaActual}
            // Email: ${emailComprador}
        }
        // ==========================================

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
        console.error('Error con Stripe:', error);
        res.status(500).json({ error: 'Fallo al conectar con la pasarela de pagos' });
    }
});

// 5. Arranque del servidor
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`🚀 Servidor listo para cobrar en el puerto ${PORT}`);
});