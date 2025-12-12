-- Insert 2 sample news records

-- News 1: Welcome news with text and image
INSERT INTO news (
    slug,
    title,
    content,
    created_at,
    updated_at
) VALUES (
    'welcome-to-droplock',
    'Добро пожаловать в DropLock!',
    '[
        {
            "type": "text",
            "content": "Мы рады представить вам DropLock - новую платформу для открытия кейсов и получения уникальных скинов!"
        },
        {
            "type": "image",
            "url": "https://example.com/images/welcome-banner.jpg",
            "alt": "Добро пожаловать в DropLock"
        },
        {
            "type": "text",
            "content": "На нашей платформе вы можете открывать кейсы, участвовать в розыгрышах и получать эксклюзивные награды. Присоединяйтесь к нашему сообществу и начните свой путь к лучшим скинам!"
        }
    ]'::jsonb,
    NOW() - INTERVAL '5 days',
    NOW() - INTERVAL '5 days'
);

-- News 2: Update news with multiple content blocks
INSERT INTO news (
    slug,
    title,
    content,
    created_at,
    updated_at
) VALUES (
    'new-features-update',
    'Новые функции и обновления',
    '[
        {
            "type": "text",
            "content": "Мы выпустили важное обновление с новыми функциями!"
        },
        {
            "type": "image",
            "url": "https://example.com/images/update-screenshot.jpg",
            "alt": "Скриншот новых функций"
        },
        {
            "type": "text",
            "content": "В этом обновлении мы добавили:"
        },
        {
            "type": "text",
            "content": "• Улучшенную систему розыгрышей\n• Новые кейсы с эксклюзивными скинами\n• Систему достижений и наград\n• Оптимизацию производительности"
        },
        {
            "type": "image",
            "url": "https://example.com/images/new-cases.jpg",
            "alt": "Новые кейсы"
        },
        {
            "type": "text",
            "content": "Следите за обновлениями, чтобы не пропустить новые возможности!"
        }
    ]'::jsonb,
    NOW() - INTERVAL '2 days',
    NOW() - INTERVAL '1 day'
);
