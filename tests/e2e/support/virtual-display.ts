import { execFile, spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { existsSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { promisify } from 'node:util';
import { waitUntil } from './types';

const run = promisify(execFile);

// `scripts/get-test-tools.sh` unpacks Xvfb here; nothing is installed system-wide.
const XVFB = join(homedir(), '.cache/clipwise-e2e-browsers/xvfb/usr/bin/Xvfb');
const INPUT_SCRIPT = resolve('tests/e2e/support/x11-input.py');
const SIZE = { width: 1280, height: 800 };

/**
 * A private X display (Xvfb) for running a browser with a visible window that nobody
 * sees, so tests can press keys and click as the operating system does. Browsers handle
 * this input like a person's, including extension shortcuts and native context menus,
 * which they ignore when it comes through their automation protocols.
 */
export type VirtualDisplay = {
  /** Environment for a browser that should open on this display (not the desktop). */
  env: Record<string, string>;
  width: number;
  height: number;
  /** Presses each key combination in turn, such as "Alt+Shift+D" or "ArrowUp". */
  pressKeys: (...combinations: string[]) => Promise<void>;
  /** Clicks at a point on the screen. */
  click: (point: ScreenPoint, button?: 'left' | 'right') => Promise<void>;
  /** Saves the whole screen, menus included, as a PNG. */
  screenshot: (path: string) => Promise<void>;
  /** Where `image`'s opaque pixels appear on screen within `box` (centres). */
  find: (image: string, box: ScreenBox) => Promise<ScreenPoint[]>;
  /** The visible top-level windows, bottom to top. Native menus are among them. */
  windows: () => Promise<ScreenWindow[]>;
  close: () => Promise<void>;
};

export type ScreenPoint = { x: number; y: number };
export type ScreenBox = { left: number; top: number; right: number; bottom: number };
/** A window on the display. Menus and popups are `overrideRedirect` windows. */
export type ScreenWindow = {
  id: number;
  x: number;
  y: number;
  width: number;
  height: number;
  overrideRedirect: boolean;
};

export function hasVirtualDisplay(): boolean {
  return existsSync(XVFB);
}

export async function startVirtualDisplay(dir: string): Promise<VirtualDisplay> {
  // The display only accepts clients that know this cookie.
  const xauthority = join(dir, 'Xauthority');
  writeFileSync(xauthority, authorityFile(randomBytes(16)));
  const server = spawn(
    XVFB,
    [
      '-displayfd',
      '3',
      '-screen',
      '0',
      `${String(SIZE.width)}x${String(SIZE.height)}x24`,
      '-nolisten',
      'tcp',
      '-auth',
      xauthority,
    ],
    { stdio: ['ignore', 'ignore', 'ignore', 'pipe'] },
  );
  const display = await new Promise<string>((resolve, reject) => {
    let output = '';
    server.stdio[3]?.on('data', (chunk: Buffer) => {
      output += chunk.toString();
      if (output.includes('\n')) resolve(`:${output.trim()}`);
    });
    server.once('exit', (code) => {
      reject(new Error(`Xvfb exited with ${String(code)}`));
    });
  });
  const exited = new Promise<void>((resolve) => {
    server.once('exit', () => {
      resolve();
    });
  });

  // The browser must not reach the desktop's Wayland session.
  const env: Record<string, string> = {};
  for (const [name, value] of Object.entries(process.env)) {
    if (value !== undefined && name !== 'WAYLAND_DISPLAY') env[name] = value;
  }
  Object.assign(env, {
    DISPLAY: display,
    XAUTHORITY: xauthority,
    XDG_SESSION_TYPE: 'x11',
    GDK_BACKEND: 'x11',
    MOZ_ENABLE_WAYLAND: '0',
    // Snap apps' GNOME launcher otherwise picks Wayland whenever the desktop has it.
    DISABLE_WAYLAND: '1',
  });
  const input = async (...args: string[]) =>
    (await run('python3', ['-I', INPUT_SCRIPT, ...args], { env })).stdout;
  await waitUntil(() =>
    input('ping').then(
      () => true,
      () => false,
    ),
  );

  return {
    env,
    ...SIZE,
    pressKeys: async (...combinations) => {
      await input('keys', ...combinations);
    },
    click: async ({ x, y }, button = 'left') => {
      await input('click', String(Math.round(x)), String(Math.round(y)), button);
    },
    screenshot: async (path) => {
      await input('screenshot', path);
    },
    find: async (image, { left, top, right, bottom }) =>
      (
        JSON.parse(await input('find', image, ...[left, top, right, bottom].map(String))) as [
          number,
          number,
        ][]
      ).map(([x, y]) => ({ x, y })),
    windows: async () => JSON.parse(await input('windows')) as ScreenWindow[],
    close: async () => {
      server.kill();
      await exited;
    },
  };
}

// An Xauthority file with one MIT-MAGIC-COOKIE-1 entry for any host and display
// (family "wild"), in libXau's format: big-endian length-prefixed fields.
function authorityFile(cookie: Buffer): Buffer {
  const field = (value: Buffer) => {
    const length = Buffer.alloc(2);
    length.writeUInt16BE(value.length);
    return Buffer.concat([length, value]);
  };
  const familyWild = Buffer.from([0xff, 0xff]);
  return Buffer.concat([
    familyWild,
    field(Buffer.alloc(0)),
    field(Buffer.alloc(0)),
    field(Buffer.from('MIT-MAGIC-COOKIE-1')),
    field(cookie),
  ]);
}
