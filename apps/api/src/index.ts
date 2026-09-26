import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { createServer } from 'http';
import { Server as SocketIOServer } from 'socket.io';
import { authRouter } from './routes/auth';
import { mesasRouter } from './routes/mesas';
import { buildActasRouter } from './routes/actas';
import { resultadosRouter } from './routes/resultados';
import { catalogoRouter } from './routes/catalogo';
import { usuariosRouter } from './routes/usuarios';
import { localesRouter } from './routes/locales';

const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 4000;
const CORS_ORIGIN = process.env.CORS_ORIGIN ?? 'http://localhost:5173';

const app = express();
const httpServer = createServer(app);
const io = new SocketIOServer(httpServer, { cors: { origin: CORS_ORIGIN } });

app.use(helmet());
app.use(cors({ origin: CORS_ORIGIN }));
app.use(express.json({ limit: '1mb' }));

app.get('/health', (_req, res) => res.json({ ok: true }));

app.use('/api/auth', authRouter);
app.use('/api/mesas', mesasRouter);
app.use('/api/actas', buildActasRouter(io));
app.use('/api/resultados', resultadosRouter);
app.use('/api/catalogo', catalogoRouter);
app.use('/api/usuarios', usuariosRouter);
app.use('/api/locales', localesRouter);

io.on('connection', (socket) => {
  socket.on('disconnect', () => {});
});

httpServer.listen(PORT, () => {
  console.log(`API ERM2026 escuchando en puerto ${PORT}`);
});
