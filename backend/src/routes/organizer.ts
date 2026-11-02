import { FastifyInstance } from 'fastify';
import { query, withTransaction } from '../db/pool.js';
import { authenticate } from './auth.js';

export async function organizerRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authenticate);

  // 1. Получить список всех сценариев пользователя
  app.get('/api/scenarios', async (request) => {
    const res = await query(
      'SELECT id, title, updated_at, created_at FROM scenarios WHERE user_id = $1 ORDER BY updated_at DESC',
      [request.user.id]
    );
    return { scenarios: res.rows };
  });

  // 2. Получить один сценарий со всем JSON-графом
  app.get<{ Params: { id: string } }>('/api/scenarios/:id', async (request, reply) => {
    const res = await query(
      'SELECT id, title, graph_data, updated_at FROM scenarios WHERE id = $1 AND user_id = $2',
      [request.params.id, request.user.id]
    );
    if (!res.rowCount) {
      return reply.code(404).send({ error: 'Сценарий не найден' });
    }
    return { scenario: res.rows[0] };
  });

  // 3. Создать новый пустой сценарий (слева в меню)
  app.post<{ Body: { title?: string } }>('/api/scenarios', async (request) => {
    const title = request.body?.title?.trim() || 'Новый сценарий';
    const res = await query(
      'INSERT INTO scenarios (user_id, title) VALUES ($1, $2) RETURNING id, title, graph_data, updated_at',
      [request.user.id, title]
    );
    return { scenario: res.rows[0] };
  });

  // 4. Сохранить граф сценария (JSON с расположением, размерами и содержанием нодов)
  // Одновременно синхронизирует квадратные ноды задач (type === 'taskNode') с таблицей tasks
  app.put<{
    Params: { id: string };
    Body: { title?: string; graph_data: any };
  }>('/api/scenarios/:id', async (request, reply) => {
    const { id } = request.params;
    const { title, graph_data } = request.body;
    const userId = request.user.id;

    const updated = await withTransaction(async (client) => {
      const check = await client.query(
        'SELECT id, title FROM scenarios WHERE id = $1 AND user_id = $2',
        [id, userId]
      );
      if (!check.rowCount) return null;

      const newTitle = title?.trim() || check.rows[0].title;
      const res = await client.query(
        'UPDATE scenarios SET title = $1, graph_data = $2::jsonb WHERE id = $3 AND user_id = $4 RETURNING id, title, graph_data, updated_at',
        [newTitle, JSON.stringify(graph_data), id, userId]
      );

      // Синхронизируем ноды задач из графа в таблицу tasks
      const nodes = Array.isArray(graph_data?.nodes) ? graph_data.nodes : [];
      for (const node of nodes) {
        if (node.type === 'taskNode' && node.id) {
          const taskTitle = (node.data?.title || 'Новая задача').trim();
          const taskStatus = node.data?.status === 'completed' ? 'completed' : 'in_progress';

          await client.query(
            `INSERT INTO tasks (user_id, scenario_id, node_id, title, status)
             VALUES ($1, $2, $3, $4, $5::task_status)
             ON CONFLICT (scenario_id, node_id)
             DO UPDATE SET title = EXCLUDED.title, status = EXCLUDED.status`,
            [userId, id, String(node.id), taskTitle, taskStatus]
          );
        }
      }

      return res.rows[0];
    });

    if (!updated) {
      return reply.code(404).send({ error: 'Сценарий не найден' });
    }
    return { scenario: updated };
  });

  // 5. Удалить сценарий
  app.delete<{ Params: { id: string } }>('/api/scenarios/:id', async (request) => {
    await query('DELETE FROM scenarios WHERE id = $1 AND user_id = $2', [
      request.params.id,
      request.user.id,
    ]);
    return { ok: true };
  });

  // 6. Получить список всех задач (с фильтром по статусу in_progress / completed) и суммарным временем
  app.get<{ Querystring: { status?: string } }>('/api/tasks', async (request) => {
    const statusFilter =
      request.query.status === 'in_progress' || request.query.status === 'completed'
        ? request.query.status
        : null;

    const res = await query(
      `SELECT t.id, t.title, t.status, t.scenario_id, t.node_id, t.created_at, t.updated_at,
              COALESCE(SUM(te.duration_minutes), 0)::int AS total_minutes,
              COUNT(te.id)::int AS entries_count
       FROM tasks t
       LEFT JOIN time_entries te ON te.task_id = t.id
       WHERE t.user_id = $1 AND ($2::task_status IS NULL OR t.status = $2::task_status)
       GROUP BY t.id
       ORDER BY t.updated_at DESC`,
      [request.user.id, statusFilter]
    );
    return { tasks: res.rows };
  });

  // 7. Получить конкретную задачу со всеми датами выполнения и суммарным временем
  app.get<{ Params: { id: string } }>('/api/tasks/:id', async (request, reply) => {
    const res = await query(
      `SELECT t.id, t.title, t.status, t.scenario_id, t.node_id,
              COALESCE(SUM(te.duration_minutes), 0)::int AS total_minutes,
              COALESCE(
                json_agg(
                  json_build_object(
                    'id', te.id,
                    'entry_date', te.entry_date::text,
                    'duration_minutes', te.duration_minutes,
                    'source_node_id', te.source_node_id,
                    'note', te.note,
                    'created_at', te.created_at
                  ) ORDER BY te.entry_date DESC, te.created_at DESC
                ) FILTER (WHERE te.id IS NOT NULL),
                '[]'
              ) AS entries
       FROM tasks t
       LEFT JOIN time_entries te ON te.task_id = t.id
       WHERE t.id = $1 AND t.user_id = $2
       GROUP BY t.id`,
      [request.params.id, request.user.id]
    );

    if (!res.rowCount) {
      return reply.code(404).send({ error: 'Задача не найдена' });
    }
    return { task: res.rows[0] };
  });

  // 8. Создать задачу напрямую или из нода
  app.post<{
    Body: {
      title: string;
      status?: 'in_progress' | 'completed';
      scenario_id?: string;
      node_id?: string;
      entry_date?: string;
      duration_minutes?: number;
    };
  }>('/api/tasks', async (request) => {
    const { title, status, scenario_id, node_id, entry_date, duration_minutes } = request.body;
    const taskStatus = status === 'completed' ? 'completed' : 'in_progress';

    const task = await withTransaction(async (client) => {
      const res = await client.query(
        `INSERT INTO tasks (user_id, scenario_id, node_id, title, status)
         VALUES ($1, $2, $3, $4, $5::task_status)
         ON CONFLICT (scenario_id, node_id)
         DO UPDATE SET title = EXCLUDED.title, status = EXCLUDED.status
         RETURNING *`,
        [request.user.id, scenario_id || null, node_id || null, title.trim(), taskStatus]
      );
      const created = res.rows[0];

      if (duration_minutes && Number(duration_minutes) > 0) {
        await client.query(
          `INSERT INTO time_entries (task_id, entry_date, duration_minutes)
           VALUES ($1, COALESCE($2::date, CURRENT_DATE), $3)`,
          [created.id, entry_date || null, Number(duration_minutes)]
        );
      }
      return created;
    });

    return { task };
  });

  // 9. Редактировать задачу (название и статус: в работе / выполненная)
  app.put<{
    Params: { id: string };
    Body: { title?: string; status?: 'in_progress' | 'completed' };
  }>('/api/tasks/:id', async (request, reply) => {
    const { id } = request.params;
    const { title, status } = request.body;

    const existing = await query('SELECT * FROM tasks WHERE id = $1 AND user_id = $2', [
      id,
      request.user.id,
    ]);
    if (!existing.rowCount) {
      return reply.code(404).send({ error: 'Задача не найдена' });
    }

    const nextTitle = title !== undefined ? title.trim() : existing.rows[0].title;
    const nextStatus =
      status === 'completed' || status === 'in_progress' ? status : existing.rows[0].status;

    const res = await query(
      'UPDATE tasks SET title = $1, status = $2::task_status WHERE id = $3 AND user_id = $4 RETURNING *',
      [nextTitle, nextStatus, id, request.user.id]
    );
    return { task: res.rows[0] };
  });

  // 10. Удалить задачу
  app.delete<{ Params: { id: string } }>('/api/tasks/:id', async (request) => {
    await query('DELETE FROM tasks WHERE id = $1 AND user_id = $2', [
      request.params.id,
      request.user.id,
    ]);
    return { ok: true };
  });

  // 11. Записать затраченное время для задачи (вручную или при прохождении тика по графу слева направо)
  app.post<{
    Body: {
      task_id?: string;
      scenario_id?: string;
      node_id?: string;
      task_title?: string;
      task_status?: 'in_progress' | 'completed';
      source_node_id?: string;
      entry_date?: string;
      duration_minutes: number;
      note?: string;
    };
  }>('/api/time-entries', async (request, reply) => {
    const {
      task_id,
      scenario_id,
      node_id,
      task_title,
      task_status,
      source_node_id,
      entry_date,
      duration_minutes,
      note,
    } = request.body;

    const mins = Math.max(0, Math.round(Number(duration_minutes) || 0));
    if (mins <= 0) {
      return reply.code(400).send({ error: 'Укажите затраченное время больше 0 минут' });
    }

    const result = await withTransaction(async (client) => {
      let targetTaskId = task_id;

      // Если время пришло из нода на графе — находим или создаем связанную задачу
      if (!targetTaskId && scenario_id && node_id) {
        const upsertTask = await client.query(
          `INSERT INTO tasks (user_id, scenario_id, node_id, title, status)
           VALUES ($1, $2, $3, $4, $5::task_status)
           ON CONFLICT (scenario_id, node_id)
           DO UPDATE SET title = COALESCE(EXCLUDED.title, tasks.title)
           RETURNING id`,
          [
            request.user.id,
            scenario_id,
            node_id,
            (task_title || 'Задача из графа').trim(),
            task_status === 'completed' ? 'completed' : 'in_progress',
          ]
        );
        targetTaskId = upsertTask.rows[0].id;
      }

      if (!targetTaskId) {
        throw new Error('Не указана задача');
      }

      // Проверяем принадлежность задачи пользователю
      const checkTask = await client.query(
        'SELECT id FROM tasks WHERE id = $1 AND user_id = $2',
        [targetTaskId, request.user.id]
      );
      if (!checkTask.rowCount) {
        throw new Error('Задача не найдена');
      }

      const entryRes = await client.query(
        `INSERT INTO time_entries (task_id, source_node_id, entry_date, duration_minutes, note)
         VALUES ($1, $2, COALESCE($3::date, CURRENT_DATE), $4, $5)
         RETURNING id, task_id, source_node_id, entry_date::text, duration_minutes, note, created_at`,
        [targetTaskId, source_node_id || null, entry_date || null, mins, note || null]
      );

      const sumRes = await client.query(
        'SELECT COALESCE(SUM(duration_minutes), 0)::int AS total_minutes FROM time_entries WHERE task_id = $1',
        [targetTaskId]
      );

      return {
        entry: entryRes.rows[0],
        task_id: targetTaskId,
        total_minutes: sumRes.rows[0].total_minutes,
      };
    });

    return result;
  });

  // 12. Получить ВСЕ записи времени в органайзере (общий журнал)
  app.get('/api/time-entries', async (request) => {
    const res = await query(
      `SELECT te.id, te.entry_date::text AS entry_date, te.duration_minutes, te.source_node_id, te.note, te.created_at,
              t.id AS task_id, t.title AS task_title, t.status AS task_status
       FROM time_entries te
       JOIN tasks t ON t.id = te.task_id
       WHERE t.user_id = $1
       ORDER BY te.entry_date DESC, te.created_at DESC`,
      [request.user.id]
    );
    return { entries: res.rows };
  });

  // 13. Удалить отдельную запись времени
  app.delete<{ Params: { id: string } }>('/api/time-entries/:id', async (request) => {
    await query(
      `DELETE FROM time_entries te
       USING tasks t
       WHERE te.id = $1 AND te.task_id = t.id AND t.user_id = $2`,
      [request.params.id, request.user.id]
    );
    return { ok: true };
  });
}
