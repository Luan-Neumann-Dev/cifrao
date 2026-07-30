// Importado ANTES de tudo em main.ts: carrega o .env (dev) no processo antes que
// qualquer módulo instancie o Prisma. Em produção não há .env — usa o ambiente.
try {
  process.loadEnvFile();
} catch {
  // sem arquivo .env: segue com as variáveis já presentes no ambiente
}
