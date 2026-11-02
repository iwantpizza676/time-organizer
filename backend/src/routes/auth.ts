import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { hash, verify } from '@node-rs/argon2';
import { z } from 'zod';
import { query, withTransaction } from '../db/pool.js';

const authSchema = z.object({
  login: z.string().min(3, 'Логин минимум 3 символа').max(64),
  password: z.string().min(4, 'Пароль минимум 4 символа').max(128),
});

declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: { id: string; login: string };
    user: { id: string; login: string };
  }
}

export async function authenticate(request: FastifyRequest, reply: FastifyReply) {
  try {
    await request.jwtVerify();
  } catch (err) {
    return reply.code(401).send({ error: 'Необходима авторизация' });
  }
}

export async function authRoutes(app: FastifyInstance) {
  // Регистрация нового пользователя
  app.post('/api/auth/register', async (request, reply) => {
    const parsed = authSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.issues[0].message });
    }

    const { login, password } = parsed.data;

    const existing = await query('SELECT id FROM users WHERE login = $1', [login]);
    if (existing.rowCount && existing.rowCount > 0) {
      return reply.code(409).send({ error: 'Пользователь с таким логином уже существует' });
    }

    const passwordHash = await hash(password);

    const user = await withTransaction(async (client) => {
      const userRes = await client.query<{ id: string; login: string; created_at: string }>(
        'INSERT INTO users (login, password_hash) VALUES ($1, $2) RETURNING id, login, created_at',
        [login, passwordHash]
      );
      const newUser = userRes.rows[0];

      // Создаем стартовый сценарий по умолчанию
      await client.query(
        'INSERT INTO scenarios (user_id, title) VALUES ($1, $2)',
        [newUser.id, 'Мой первый сценарий']
      );

      return newUser;
    });

    const token = app.jwt.sign({ id: user.id, login: user.login }, { expiresIn: '7d' });

    reply.setCookie('token', token, {
      path: '/',
      httpOnly: true,
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60,
    });

    return reply.code(201).send({ user, token });
  });

  // Вход по логину и паролю
  app.post('/api/auth/login', async (request, reply) => {
    const parsed = authSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'Некорректные данные' });
    }

    const { login, password } = parsed.data;

    const res = await query<{ id: string; login: string; password_hash: string }>(
      'SELECT id, login, password_hash FROM users WHERE login = $1',
      [login]
    );

    if (!res.rowCount || res.rowCount === 0) {
      return reply.code(401).send({ error: 'Неверный логин или пароль' });
    }

    const user = res.rows[0];
    const isValid = await verify(user.password_hash, password);
    if (!isValid) {
      return reply.code(401).send({ error: 'Неверный логин или пароль' });
    }

    const token = app.jwt.sign({ id: user.id, login: user.login }, { expiresIn: '7d' });

    reply.setCookie('token', token, {
      path: '/',
      httpOnly: true,
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60,
    });

    return { user: { id: user.id, login: user.login }, token };
  });

  // Выход
  app.post('/api/auth/logout', async (_request, reply) => {
    reply.clearCookie('token', { path: '/' });
    return { ok: true };
  });

  // Получение текущего пользователя
  app.get('/api/auth/me', { preHandler: [authenticate] }, async (request) => {
    return { user: request.user };
  });
}
