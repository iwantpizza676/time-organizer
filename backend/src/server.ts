import Fastify from 'fastify';
import cors from '@fastify/cors';
import cookie from '@fastify/cookie';
import jwt from '@fastify/jwt';
import fastifyStatic from '@fastify/static';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import { authRoutes } from './routes/auth.js';
import { organizerRoutes } from './routes/organizer.js';
import { query } from './db/pool.js';

dotenv.config({ path: path.resolve(process.cwd(), '../.env') });

const app = Fastify({ logger: true });

async function start() {
  await app.register(cors, {
    origin: true,
    credentials: true,
  });

  await app.register(cookie);

  await app.register(jwt, {
    secret: process.env.JWT_SECRET || 'super_secret_jwt_key_2026',
    cookie: {
      cookieName: 'token',
      signed: false,
    },
  });

  app.get('/api/health', async () => {
    const dbRes = await query('SELECT NOW() as now');
    return { status: 'ok', dbTime: dbRes.rows[0].now };
  });

  await app.register(authRoutes);
  await app.register(organizerRoutes);

  // Раздаем собранный фронтенд из ../frontend/dist, если он собран
  const frontendDist = path.resolve(process.cwd(), '../frontend/dist');
  if (fs.existsSync(frontendDist)) {
    await app.register(fastifyStatic, {
      root: frontendDist,
      prefix: '/',
    });

    app.setNotFoundHandler((req, reply) => {
      if (req.url.startsWith('/api/')) {
        reply.code(404).send({ error: 'API route not found' });
      } else {
        reply.sendFile('index.html');
      }
    });
  }

  const port = Number(process.env.PORT) || 3000;
  await app.listen({ port, host: '0.0.0.0' });
  console.log(`Server listening on http://0.0.0.0:${port}`);
}

start().catch((err) => {
  app.log.error(err);
  process.exit(1);
});
