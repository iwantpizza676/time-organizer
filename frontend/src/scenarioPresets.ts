import { Node, Edge } from '@xyflow/react';

export interface ScenarioPreset {
  id: string;
  title: string;
  category: string;
  description: string;
  buildGraph: (today: string) => {
    nodes: Node[];
    edges: Edge[];
    viewport: { x: number; y: number; zoom: number };
    intervalSeconds: number;
  };
}

export const SCENARIO_PRESETS: ScenarioPreset[] = [
  {
    id: 'empty',
    title: 'Пустой сценарий (чистый холст)',
    category: 'С нуля',
    description:
      'Чистая сетка канваса. Вытягивайте блоки из правой палитры и собирайте собственную логику учета времени.',
    buildGraph: () => ({
      nodes: [],
      edges: [],
      viewport: { x: 0, y: 0, zoom: 1 },
      intervalSeconds: 15,
    }),
  },
  {
    id: 'morning_sport_weather',
    title: 'Утренний спорт: Пробежка в парке или Тренировка дома',
    category: 'Здоровье и Погода',
    description:
      'Таймер на 45 минут проверяет погоду на улице (температура >= 15°C). Если тепло (TRUE) — записывает время в пробежку на свежем воздухе, если холодно/дождь (FALSE) — в домашнюю силовую тренировку.',
    buildGraph: (today) => ({
      viewport: { x: 40, y: 40, zoom: 0.9 },
      intervalSeconds: 15,
      nodes: [
        {
          id: 'preset_sport_timer',
          type: 'timeNode',
          position: { x: 60, y: 180 },
          data: {
            durationMinutes: 45,
            entryDate: today,
            elapsedSeconds: 0,
            isRunning: false,
          },
        },
        {
          id: 'preset_sport_weather',
          type: 'weatherNode',
          position: { x: 360, y: 155 },
          data: {
            region: 'Москва',
            temperature: 18,
            weather: 'Ясно',
            conditionPass: 'temp_above_15',
          },
        },
        {
          id: 'preset_sport_task_run',
          type: 'taskNode',
          position: { x: 700, y: 40 },
          data: {
            title: 'Утренняя пробежка в парке (5 км)',
            status: 'in_progress',
            durationMinutes: 45,
            entryDate: today,
            totalMinutes: 0,
          },
        },
        {
          id: 'preset_sport_task_home',
          type: 'taskNode',
          position: { x: 700, y: 310 },
          data: {
            title: 'Домашняя силовая тренировка и растяжка',
            status: 'in_progress',
            durationMinutes: 45,
            entryDate: today,
            totalMinutes: 0,
          },
        },
      ],
      edges: [
        {
          id: 'e_sport_1',
          source: 'preset_sport_timer',
          sourceHandle: 'out',
          target: 'preset_sport_weather',
          targetHandle: 'in',
          animated: true,
          style: { stroke: '#a1a1aa', strokeWidth: 2.5 },
        },
        {
          id: 'e_sport_true',
          source: 'preset_sport_weather',
          sourceHandle: 'true',
          target: 'preset_sport_task_run',
          targetHandle: 'in',
          animated: true,
          style: { stroke: '#34d399', strokeWidth: 2.5 },
        },
        {
          id: 'e_sport_false',
          source: 'preset_sport_weather',
          sourceHandle: 'false',
          target: 'preset_sport_task_home',
          targetHandle: 'in',
          animated: true,
          style: { stroke: '#f43f5e', strokeWidth: 2.5 },
        },
      ],
    }),
  },
  {
    id: 'deep_work_pomodoro',
    title: 'Рабочий спринт: Глубокий фокус vs. Текучка и почта',
    category: 'Работа и Карьера',
    description:
      'Нод условия проверяет длительность рабочего слота (>= 45 мин). Длинный слот (TRUE) направляется в разработку сложной фичи, а короткий слот (FALSE) — в разбор писем и код-ревью.',
    buildGraph: (today) => ({
      viewport: { x: 40, y: 40, zoom: 0.9 },
      intervalSeconds: 20,
      nodes: [
        {
          id: 'preset_work_timer',
          type: 'timeNode',
          position: { x: 60, y: 185 },
          data: {
            durationMinutes: 50,
            entryDate: today,
            elapsedSeconds: 0,
            isRunning: false,
          },
        },
        {
          id: 'preset_work_cond',
          type: 'conditionNode',
          position: { x: 360, y: 175 },
          data: {
            operator: '>=',
            threshold: 45,
            mode: 'auto',
          },
        },
        {
          id: 'preset_work_deep',
          type: 'taskNode',
          position: { x: 690, y: 45 },
          data: {
            title: 'Разработка архитектуры и написание кода',
            status: 'in_progress',
            durationMinutes: 50,
            entryDate: today,
            totalMinutes: 0,
          },
        },
        {
          id: 'preset_work_shallow',
          type: 'taskNode',
          position: { x: 690, y: 315 },
          data: {
            title: 'Разбор рабочей почты и код-ревью',
            status: 'in_progress',
            durationMinutes: 25,
            entryDate: today,
            totalMinutes: 0,
          },
        },
      ],
      edges: [
        {
          id: 'e_work_1',
          source: 'preset_work_timer',
          sourceHandle: 'out',
          target: 'preset_work_cond',
          targetHandle: 'in',
          animated: true,
          style: { stroke: '#71717a', strokeWidth: 2.5 },
        },
        {
          id: 'e_work_true',
          source: 'preset_work_cond',
          sourceHandle: 'true',
          target: 'preset_work_deep',
          targetHandle: 'in',
          animated: true,
          style: { stroke: '#34d399', strokeWidth: 2.5 },
        },
        {
          id: 'e_work_false',
          source: 'preset_work_cond',
          sourceHandle: 'false',
          target: 'preset_work_shallow',
          targetHandle: 'in',
          animated: true,
          style: { stroke: '#f43f5e', strokeWidth: 2.5 },
        },
      ],
    }),
  },
  {
    id: 'study_pipeline',
    title: 'Учеба и Английский: ТеорияПрактика или Повторение',
    category: 'Образование',
    description:
      'Последовательная цепочка: сначала время фиксируется в задаче «Изучение теории и лексики», затем через условие (>= 30 мин) переходит либо к написанию эссе (TRUE), либо к повторению карточек (FALSE).',
    buildGraph: (today) => ({
      viewport: { x: 25, y: 40, zoom: 0.85 },
      intervalSeconds: 15,
      nodes: [
        {
          id: 'preset_study_timer',
          type: 'timeNode',
          position: { x: 40, y: 190 },
          data: {
            durationMinutes: 35,
            entryDate: today,
            elapsedSeconds: 0,
            isRunning: false,
          },
        },
        {
          id: 'preset_study_theory',
          type: 'taskNode',
          position: { x: 320, y: 150 },
          data: {
            title: 'Английский: разбор грамматики и новой лексики',
            status: 'in_progress',
            durationMinutes: 35,
            entryDate: today,
            totalMinutes: 0,
          },
        },
        {
          id: 'preset_study_cond',
          type: 'conditionNode',
          position: { x: 630, y: 185 },
          data: {
            operator: '>=',
            threshold: 30,
            mode: 'auto',
          },
        },
        {
          id: 'preset_study_essay',
          type: 'taskNode',
          position: { x: 930, y: 50 },
          data: {
            title: 'Разговорная практика и написание эссе',
            status: 'in_progress',
            durationMinutes: 35,
            entryDate: today,
            totalMinutes: 0,
          },
        },
        {
          id: 'preset_study_cards',
          type: 'taskNode',
          position: { x: 930, y: 320 },
          data: {
            title: 'Быстрое повторение слов по карточкам Anki',
            status: 'in_progress',
            durationMinutes: 15,
            entryDate: today,
            totalMinutes: 0,
          },
        },
      ],
      edges: [
        {
          id: 'e_st_1',
          source: 'preset_study_timer',
          sourceHandle: 'out',
          target: 'preset_study_theory',
          targetHandle: 'in',
          animated: true,
          style: { stroke: '#a1a1aa', strokeWidth: 2.5 },
        },
        {
          id: 'e_st_2',
          source: 'preset_study_theory',
          sourceHandle: 'out',
          target: 'preset_study_cond',
          targetHandle: 'in',
          animated: true,
          style: { stroke: '#71717a', strokeWidth: 2.5 },
        },
        {
          id: 'e_st_true',
          source: 'preset_study_cond',
          sourceHandle: 'true',
          target: 'preset_study_essay',
          targetHandle: 'in',
          animated: true,
          style: { stroke: '#34d399', strokeWidth: 2.5 },
        },
        {
          id: 'e_st_false',
          source: 'preset_study_cond',
          sourceHandle: 'false',
          target: 'preset_study_cards',
          targetHandle: 'in',
          animated: true,
          style: { stroke: '#f43f5e', strokeWidth: 2.5 },
        },
      ],
    }),
  },
  {
    id: 'weekend_plans',
    title: 'Планы на выходной: Прогулка/Велосипед или Уборка и Чтение',
    category: 'Дом и Отдых',
    description:
      'Планирование 60 минут выходного дня: если погода солнечная (TRUE) — велопрогулка, если непогода (FALSE) — наведение порядка дома и чтение книги.',
    buildGraph: (today) => ({
      viewport: { x: 40, y: 40, zoom: 0.9 },
      intervalSeconds: 20,
      nodes: [
        {
          id: 'preset_wk_timer',
          type: 'timeNode',
          position: { x: 60, y: 185 },
          data: {
            durationMinutes: 60,
            entryDate: today,
            elapsedSeconds: 0,
            isRunning: false,
          },
        },
        {
          id: 'preset_wk_weather',
          type: 'weatherNode',
          position: { x: 350, y: 160 },
          data: {
            region: 'Санкт-Петербург',
            temperature: 20,
            weather: 'Ясно',
            conditionPass: 'true',
          },
        },
        {
          id: 'preset_wk_outdoor',
          type: 'taskNode',
          position: { x: 690, y: 40 },
          data: {
            title: 'Велопрогулка и отдых в парке',
            status: 'in_progress',
            durationMinutes: 60,
            entryDate: today,
            totalMinutes: 0,
          },
        },
        {
          id: 'preset_wk_indoor',
          type: 'taskNode',
          position: { x: 690, y: 310 },
          data: {
            title: 'Уборка квартиры и чтение книги',
            status: 'in_progress',
            durationMinutes: 60,
            entryDate: today,
            totalMinutes: 0,
          },
        },
      ],
      edges: [
        {
          id: 'e_wk_1',
          source: 'preset_wk_timer',
          sourceHandle: 'out',
          target: 'preset_wk_weather',
          targetHandle: 'in',
          animated: true,
          style: { stroke: '#a1a1aa', strokeWidth: 2.5 },
        },
        {
          id: 'e_wk_true',
          source: 'preset_wk_weather',
          sourceHandle: 'true',
          target: 'preset_wk_outdoor',
          targetHandle: 'in',
          animated: true,
          style: { stroke: '#34d399', strokeWidth: 2.5 },
        },
        {
          id: 'e_wk_false',
          source: 'preset_wk_weather',
          sourceHandle: 'false',
          target: 'preset_wk_indoor',
          targetHandle: 'in',
          animated: true,
          style: { stroke: '#f43f5e', strokeWidth: 2.5 },
        },
      ],
    }),
  },
];
