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
    } else if (tipoBoleto === 'Prueba') {
        precio = 0;     // Gratis para testear códigos QR
    }

    try {
        // Si el precio es 0, nos saltamos Stripe, generamos el QR y respondemos con los datos
        if (precio === 0) {
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
                        estado: 'Disponible',
                        fecha: fechaActual,
                        email: emailComprador,
                        telefono: telefonoComprador
                    })
                });
                console.log("📄 Registro de prueba enviado a Google Sheets con éxito.");
            }

            // Guardamos directamente como pagado en MongoDB usando el idUnico
            await Ticket.create({
                idBoleto: idUnico,
                tipo: tipoBoleto,
                nombreComprador: nombreComprador,
                telefonoComprador: telefonoComprador,
                emailComprador: emailComprador,
                pagado: true
            });

            // Generamos el código QR en formato Base64 para mostrarlo directo en pantalla
            const datosQR = `ID: ${idUnico} | Codigo: ${codigoDR} | Nombre: ${nombreComprador} | Tipo: ${tipoBoleto}`;
            const imagenQRBase64 = await QRCode.toDataURL(datosQR);

            return res.json({
                esPruebaGratis: true,
                idBoleto: idUnico,
                codigoDR: codigoDR,
                qrUrl: imagenQRBase64
            });
        }

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
            // ESTA ES LA LÍNEA MÁGICA QUE HAY QUE CAMBIAR:
            customer_email: emailComprador.split(' | ')[0] || 'cliente@ejemplo.com',
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