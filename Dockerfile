FROM oven/bun:latest

WORKDIR /app

COPY ./ ./

RUN bun install

VOLUME /app/data

ENV DB_PATH=/app/data/mango.db

CMD ["bun", "run", "dev"]