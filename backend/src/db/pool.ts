import pg from 'pg';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '../.env') });

const { Pool } = pg;

export const pool = new Pool({
  host: process.env.DB_HOST || '127.0.0.1',
  port: Number(process.env.DB_PORT) || 5432,
  user: process.env.DB_USER || 'organizer_user',
  password: process.env.DB_PASSWORD || 'super_secret_db_pass_2026',
  database: process.env.DB_NAME || 'time_organizer',
  max: 20,
});

export async function query<T extends pg.QueryResultRow = any>(
  text: string,
  params?: any[]
): Promise<pg.QueryResult<T>> {
  return pool.query<T>(text, params);
}

export async function withTransaction<T>(
  fn: (client: pg.PoolClient) => Promise<T>
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}
