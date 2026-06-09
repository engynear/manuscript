# Manuscript Forge

Manuscript Forge — Next.js приложение, которое превращает Markdown в PDF в стиле древнего fantasy-манускрипта: пергамент, буквицы, орнаменты, иллюстрации и A4-верстка.

AI используется для плана рукописи и генерации иллюстраций. Сам основной текст Markdown не переписывается моделью: после AI-плана тело секций восстанавливается из исходного Markdown.

## Возможности

- Вставка Markdown в редактор или загрузка `.md` файла в textarea.
- AI-план рукописи через OpenAI Structured Outputs.
- Генерация иллюстраций через OpenAI Images.
- Редактирование prompt/type/caption иллюстрации из предпросмотра.
- Настройки бумаги, орнаментов, разделителей, буквиц, количества иллюстраций и старта глав.
- HTML/CSS рендер манускрипта и экспорт в PDF через Playwright/Chromium.
- Локальный кэш планов, картинок, PDF и оптимизированных PDF-ассетов.
- Docker Compose для деплоя на VDS.

## Локальный запуск

```bash
npm install
cp .env.example .env.local
```

Заполни `.env.local`:

```bash
OPENAI_API_KEY=your_api_key_here
```

Запуск dev-сервера:

```bash
npm run dev
```

Открыть:

[http://localhost:3000](http://localhost:3000)

## Проверки

```bash
npm run lint
npm run typecheck
npm run build
```

## Переменные окружения

Минимально нужна:

```bash
OPENAI_API_KEY=your_api_key_here
```

Опционально:

```bash
OPENAI_PLAN_MODEL=gpt-4.1
OPENAI_IMAGE_MODEL=gpt-image-1
OPENAI_IMAGE_QUALITY=medium
MANUSCRIPT_IMAGE_CACHE_VERSION=v3
```

`OPENAI_IMAGE_QUALITY` можно поставить в `low`, `medium` или `high`.

## Хранилище

- `.cache/plans` — кэш AI-планов.
- `.cache/pdf-assets` — оптимизированные изображения для PDF.
- `public/generated` — сгенерированные изображения, overrides и PDF.
- `public/assets/manuscript` — подготовленные ассеты рукописи.

В Docker эти директории вынесены в volumes:

- `manuscript_cache`
- `manuscript_generated`

## Docker Compose на VDS

На сервере:

```bash
git clone git@github.com:engynear/manuscript.git
cd manuscript
cp .env.example .env
nano .env
```

Заполни `OPENAI_API_KEY`.

Поднять сервис:

```bash
docker compose up -d --build
```

Проверить:

```bash
docker compose ps
docker compose logs -f manuscript
curl http://127.0.0.1:3000
```

Обновление после нового push:

```bash
git pull
docker compose up -d --build
```

Остановка:

```bash
docker compose down
```

Сброс volumes, если нужно полностью очистить кэш и PDF:

```bash
docker compose down -v
```

## Nginx для manuscript.engy.me, сначала HTTP

Установить Nginx:

```bash
sudo apt update
sudo apt install -y nginx
```

Создать конфиг:

```bash
sudo nano /etc/nginx/sites-available/manuscript.engy.me
```

Вставить:

```nginx
server {
    listen 80;
    server_name manuscript.engy.me;

    client_max_body_size 25m;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_read_timeout 300;
        proxy_send_timeout 300;
    }
}
```

Активировать:

```bash
sudo ln -s /etc/nginx/sites-available/manuscript.engy.me /etc/nginx/sites-enabled/manuscript.engy.me
sudo nginx -t
sudo systemctl reload nginx
```

После этого HTTP должен открываться:

[http://manuscript.engy.me](http://manuscript.engy.me)

## HTTPS через certbot

Когда DNS уже указывает на VDS и HTTP работает:

```bash
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d manuscript.engy.me
```

Certbot сам обновит Nginx-конфиг под HTTPS.

Проверить автообновление:

```bash
sudo certbot renew --dry-run
```

## Где менять поведение

- OpenAI модели: `lib/openai.ts` или `.env`.
- Prompt-стиль иллюстраций: `lib/generateImages.ts`.
- Добор иллюстраций при нехватке AI-плана: `lib/ensureIllustrations.ts`.
- HTML/PDF верстка: `lib/renderManuscriptHtml.ts`.
- CSS манускрипта: `styles/manuscript.css`.
- PDF export: `lib/renderPdf.ts`.
- Основной API pipeline: `app/api/generate/route.ts`.
