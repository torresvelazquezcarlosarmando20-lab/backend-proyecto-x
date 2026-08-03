const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const QRCode = require('qrcode');
const { MercadoPagoConfig, Preference } = require('mercadopago');

const app = express();
app.use(cors());
app.use(express.json());

// 1. Configura tu Access Token de Mercado Pago (El de producción o prueba)
const client = new MercadoPagoConfig({ accessToken: 'TU_ACCESS_TOKEN_AQUI' });

// 2. Conexión a MongoDB (Cuando crees tu cuenta en Atlas, cambiarás este link local por el de la nube)
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

// 4. Endpoint para crear la orden de pago
app.post('/api/crear-pago', async (req, res) => {
    const { tipoBoleto, cantidad, emailComprador } = req.body;
    
    // Asignamos precios. Ajusta la moneda y valor final según necesites
    const precio = tipoBoleto === 'VIP' ? 30 : 0; 

    try {
        const preference = new Preference(client);
        const respuesta = await preference.create({
            body: {
                items: [
                    {
                        id: 'boleto_proyecto_x',
                        title: `Boleto ${tipoBoleto} - Proyecto X`,
                        quantity: Number(cantidad),
                        unit_price: Number(precio),
                        currency_id: 'PEN', 
                    }
                ],
                payer: {
                    email: emailComprador
                },
                back_urls: {
                    success: 'https://tusitio.com/exito',
                    failure: 'https://tusitio.com/fallo',
                    pending: 'https://tusitio.com/pendiente'
                },
                auto_return: 'approved',
            }
        });

        res.json({
            urlDePago: respuesta.init_point 
        });

    } catch (error) {
        console.error('Error al crear preferencia de Mercado Pago:', error);
        res.status(500).json({ error: 'Fallo al conectar con la pasarela de pagos' });
    }
});

// 5. Arranque del servidor
// process.env.PORT es vital para Render, ya que ellos asignan el puerto dinámicamente
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`🚀 Servidor listo para cobrar en el puerto ${PORT}`);
});
