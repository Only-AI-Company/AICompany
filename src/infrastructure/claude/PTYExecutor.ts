import { EventEmitter } from 'events';
import { spawn, type IPty } from 'node-pty';

export interface PTYStartOptions {
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  cols?: number;
  rows?: number;
  name?: string;
}

export interface PTYSession {
  id: string;
  command: string;
  args: string[];
  cwd: string;
  startedAt: number;
  process: IPty;
}

export class PTYExecutor extends EventEmitter {
  private sessions = new Map<string, PTYSession>();

  start(command: string, args: string[] = [], options: PTYStartOptions = {}): PTYSession {
    const id = `pty-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
    const cwd = options.cwd || process.cwd();
    const env = { ...process.env, ...(options.env || {}) };
    const ptyProcess = spawn(command, args, {
      name: options.name || 'xterm-color',
      cols: options.cols || 120,
      rows: options.rows || 30,
      cwd,
      env,
    });

    const session: PTYSession = {
      id,
      command,
      args,
      cwd,
      startedAt: Date.now(),
      process: ptyProcess,
    };

    this.sessions.set(id, session);

    ptyProcess.onData((data: string) => {
      this.emit('data', { id, data });
    });

    ptyProcess.onExit((event: { exitCode: number; signal?: number }) => {
      this.emit('exit', { id, exitCode: event.exitCode, signal: event.signal });
      this.sessions.delete(id);
    });

    return session;
  }

  write(id: string, data: string): boolean {
    const session = this.sessions.get(id);
    if (!session) return false;
    session.process.write(data);
    return true;
  }

  resize(id: string, cols: number, rows: number): boolean {
    const session = this.sessions.get(id);
    if (!session) return false;
    session.process.resize(cols, rows);
    return true;
  }

  stop(id: string, signal: string = 'SIGTERM'): boolean {
    const session = this.sessions.get(id);
    if (!session) return false;
    session.process.kill(signal);
    return true;
  }

  getSession(id: string): PTYSession | undefined {
    return this.sessions.get(id);
  }

  listSessions(): PTYSession[] {
    return Array.from(this.sessions.values());
  }
}
