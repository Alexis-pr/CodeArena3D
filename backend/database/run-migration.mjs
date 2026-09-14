import pg from 'pg';
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, '../.env') });

const dbUrl = process.env.DATABASE_URL;
if (!dbUrl) {
  console.error('No se encontró DATABASE_URL en backend/.env');
  process.exit(1);
}

const client = new pg.Client({
  connectionString: dbUrl,
  ssl: { rejectUnauthorized: false }
});

async function migrate() {
  console.log('Conectando a Supabase PostgreSQL para crear tablas salas y jugadores...');
  await client.connect();
  console.log('Conexión establecida con éxito.');

  const sqlPath = path.resolve(__dirname, 'schema.sql');
  const sql = fs.readFileSync(sqlPath, 'utf8');

  console.log('Ejecutando schema.sql...');
  await client.query(sql);
  console.log('✓ Tablas "salas" y "jugadores" creadas exitosamente en Supabase.');

  await client.end();
}

migrate().catch((err) => {
  console.error('Error al ejecutar la migración:', err);
  process.exit(1);
});
