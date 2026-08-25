import { createHttpServer } from './server.js';

function parseArgs(argv: string[]): { cwd?: string; port?: number } {
  let cwd: string | undefined;
  let port: number | undefined;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--cwd' && argv[i + 1]) {
      cwd = argv[++i];
    } else if (arg.startsWith('--cwd=')) {
      cwd = arg.slice('--cwd='.length);
    } else if (arg === '--port' && argv[i + 1]) {
      port = Number(argv[++i]);
    } else if (arg.startsWith('--port=')) {
      port = Number(arg.slice('--port='.length));
    }
  }

  return { cwd, port };
}

export function main(argv = process.argv.slice(2)): void {
  const args = parseArgs(argv);
  const cwd = args.cwd ?? process.env.AGENT_PASSPORT_CWD ?? process.cwd();
  const port = args.port ?? Number(process.env.PORT ?? 8787);

  if (!Number.isFinite(port) || port <= 0) {
    console.error('Invalid PORT');
    process.exit(1);
  }

  const { app, gateway } = createHttpServer({ cwd });

  const server = app.listen(port, () => {
    console.log(`Agent Passport HTTP gateway listening on http://127.0.0.1:${port}`);
    console.log(`cwd: ${cwd}`);
  });

  const shutdown = () => {
    server.close(() => {
      gateway.close();
      process.exit(0);
    });
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main();
