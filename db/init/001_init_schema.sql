CREATE EXTENSION IF NOT EXISTS "pgcrypto";

DO $$ BEGIN
    CREATE TYPE task_status AS ENUM ('in_progress', 'completed');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    login VARCHAR(64) NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS scenarios (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title VARCHAR(255) NOT NULL DEFAULT 'Новый сценарий',
    graph_data JSONB NOT NULL DEFAULT '{"nodes": [], "edges": [], "viewport": {"x": 0, "y": 0, "zoom": 1}}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_scenarios_user_id ON scenarios(user_id);
CREATE INDEX IF NOT EXISTS idx_scenarios_graph_data_gin ON scenarios USING GIN (graph_data);

CREATE TABLE IF NOT EXISTS tasks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    scenario_id UUID REFERENCES scenarios(id) ON DELETE SET NULL,
    node_id VARCHAR(128),
    title VARCHAR(255) NOT NULL,
    status task_status NOT NULL DEFAULT 'in_progress',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (scenario_id, node_id)
);

CREATE INDEX IF NOT EXISTS idx_tasks_user_status ON tasks(user_id, status);
CREATE INDEX IF NOT EXISTS idx_tasks_scenario ON tasks(scenario_id);

CREATE TABLE IF NOT EXISTS time_entries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    source_node_id VARCHAR(128),
    entry_date DATE NOT NULL DEFAULT CURRENT_DATE,
    duration_minutes INTEGER NOT NULL CHECK (duration_minutes >= 0),
    note TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_time_entries_task_id ON time_entries(task_id);
CREATE INDEX IF NOT EXISTS idx_time_entries_date ON time_entries(entry_date);

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_scenarios_updated_at
BEFORE UPDATE ON scenarios
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_tasks_updated_at
BEFORE UPDATE ON tasks
FOR EACH ROW EXECUTE FUNCTION set_updated_at();
