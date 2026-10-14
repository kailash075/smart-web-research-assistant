import net from 'node:net';

// Minimal client for Firefox's Remote Debugging Protocol, the protocol web-ext and
// about:debugging use. Playwright can launch Firefox but cannot install extensions or
// read extension pages (WebDriver BiDi refuses moz-extension:// contexts), so the
// fixtures use this protocol for those two jobs, and for web pages too in a Firefox
// that Playwright cannot drive (Firefox 140).
// Protocol docs: https://firefox-source-docs.mozilla.org/devtools/backend/protocol.html

type Packet = Record<string, unknown>;

export type FirefoxDebugger = {
  request: (packet: Packet & { to: string }) => Promise<Packet>;
  waitForEvent: (predicate: (packet: Packet) => boolean, timeoutMs?: number) => Promise<Packet>;
  onEvent: (listener: (packet: Packet) => void) => void;
  close: () => void;
};

export type ExtensionDebugSession = {
  /** Console actor of the next extension page whose address (without query) ends with `suffix`. */
  waitForPage: (suffix: string) => Promise<string>;
  /** Errors logged or thrown by any of the extension's pages so far. */
  errors: string[];
};

const DEFAULT_TIMEOUT_MS = 10_000;

export async function connectFirefoxDebugger(port: number): Promise<FirefoxDebugger> {
  const socket = await connectWithRetry(port);
  const client = createClient(socket);
  await client.waitForEvent((packet) => packet['from'] === 'root'); // Greeting.
  return client;
}

export async function installTemporaryAddon(
  client: FirefoxDebugger,
  addonPath: string,
): Promise<string> {
  const root = await client.request({ to: 'root', type: 'getRoot' });
  const result = await client.request({
    to: stringField(root, 'addonsActor'),
    type: 'installTemporaryAddon',
    addonPath,
    openDevTools: false,
  });
  const addon = result['addon'];
  if (!isPacket(addon)) throw new Error(`Unexpected install response: ${JSON.stringify(result)}`);
  return stringField(addon, 'id');
}

/** The add-on's descriptor, which includes `actor` and `backgroundScriptStatus`. */
export async function getAddon(client: FirefoxDebugger, addonId: string): Promise<Packet> {
  const { addons } = await client.request({ to: 'root', type: 'listAddons' });
  const addon = Array.isArray(addons)
    ? addons.find((item): item is Packet => isPacket(item) && item['id'] === addonId)
    : undefined;
  if (!addon) throw new Error(`Add-on ${addonId} is not installed`);
  return addon;
}

export async function debugExtension(
  client: FirefoxDebugger,
  descriptorActor: string,
): Promise<ExtensionDebugSession> {
  const watcher = await client.request({
    to: descriptorActor,
    type: 'getWatcher',
    isServerTargetSwitchingEnabled: true,
  });
  const watcherActor = stringField(watcher, 'actor');

  const errors: string[] = [];
  const pageListeners: ((page: Packet) => void)[] = [];
  client.onEvent((packet) => {
    if (packet['type'] === 'target-available-form' && isPacket(packet['target'])) {
      for (const listener of pageListeners) listener(packet['target']);
    }
    if (packet['type'] === 'resources-available-array') errors.push(...readErrors(packet));
  });

  await client.request({ to: watcherActor, type: 'watchTargets', targetType: 'frame' });
  await client.request({
    to: watcherActor,
    type: 'watchResources',
    resourceTypes: ['console-message', 'error-message'],
  });

  return {
    errors,
    waitForPage: (suffix) =>
      new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          reject(new Error(`No extension page ending with ${suffix} appeared`));
        }, DEFAULT_TIMEOUT_MS);
        const listener = (page: Packet) => {
          // Ignores the query string, as in library.html?item=…
          if (!String(page['url']).split(/[?#]/)[0]?.endsWith(suffix)) return;
          clearTimeout(timer);
          resolve(stringField(page, 'consoleActor'));
        };
        pageListeners.push(listener);
      }),
  };
}

/**
 * Console actor of Firefox's parent process, which runs the browser window itself
 * (toolbar, menus, keyboard shortcuts). Needs the `devtools.chrome.enabled` pref.
 */
export async function getParentProcessConsole(client: FirefoxDebugger): Promise<string> {
  const reply = await client.request({ to: 'root', type: 'getProcess', id: 0 });
  const descriptor = reply['processDescriptor'];
  if (!isPacket(descriptor))
    throw new Error(`Unexpected getProcess reply: ${JSON.stringify(reply)}`);
  const target = await client.request({ to: stringField(descriptor, 'actor'), type: 'getTarget' });
  const form = target['process'];
  if (!isPacket(form)) throw new Error(`Unexpected getTarget reply: ${JSON.stringify(target)}`);
  return stringField(form, 'consoleActor');
}

/** Console actor of the page in the tab whose browser has this `browserId`. */
export async function getTabConsole(client: FirefoxDebugger, browserId: number): Promise<string> {
  const { tabs } = await client.request({ to: 'root', type: 'listTabs' });
  const tab = Array.isArray(tabs)
    ? tabs.find((item): item is Packet => isPacket(item) && item['browserId'] === browserId)
    : undefined;
  if (!tab) throw new Error(`No tab with browserId ${String(browserId)}`);
  const target = await client.request({ to: stringField(tab, 'actor'), type: 'getTarget' });
  const form = target['frame'];
  if (!isPacket(form)) throw new Error(`Unexpected getTarget reply: ${JSON.stringify(target)}`);
  return stringField(form, 'consoleActor');
}

/** Evaluates `expression` in a page or process and returns the resulting string. */
export async function evaluateToString(
  client: FirefoxDebugger,
  consoleActor: string,
  expression: string,
): Promise<string> {
  const { resultID } = await client.request({
    to: consoleActor,
    type: 'evaluateJSAsync',
    text: expression,
  });
  const reply = await client.waitForEvent(
    (packet) => packet['type'] === 'evaluationResult' && packet['resultID'] === resultID,
  );
  if (typeof reply['exceptionMessage'] === 'string') {
    throw new Error(`Evaluation failed: ${reply['exceptionMessage']}`);
  }
  const result = reply['result'];
  if (typeof result === 'string') return result;
  // Strings over ~10k characters arrive as a "long string" handle.
  if (isPacket(result) && result['type'] === 'longString') {
    const full = await client.request({
      to: stringField(result, 'actor'),
      type: 'substring',
      start: 0,
      end: result['length'],
    });
    return stringField(full, 'substring');
  }
  throw new Error(`Expected a string result, got ${JSON.stringify(result)}`);
}

function readErrors(packet: Packet): string[] {
  const groups = Array.isArray(packet['array']) ? (packet['array'] as unknown[]) : [];
  const errors: string[] = [];
  for (const group of groups) {
    if (!Array.isArray(group)) continue;
    const [resourceType, resources] = group as [unknown, unknown];
    if (!Array.isArray(resources)) continue;
    for (const resource of resources as unknown[]) {
      if (!isPacket(resource)) continue;
      if (resourceType === 'error-message') {
        const pageError = isPacket(resource['pageError']) ? resource['pageError'] : resource;
        if (pageError['warning'] !== true) errors.push(String(pageError['errorMessage']));
      }
      if (resourceType === 'console-message') {
        const message = isPacket(resource['message']) ? resource['message'] : resource;
        if (message['level'] === 'error') errors.push(JSON.stringify(message['arguments']));
      }
    }
  }
  return errors;
}

async function connectWithRetry(port: number): Promise<net.Socket> {
  const deadline = Date.now() + DEFAULT_TIMEOUT_MS;
  for (;;) {
    try {
      return await connect(port);
    } catch (error) {
      if (Date.now() > deadline) {
        throw new Error(`Could not connect to the Firefox debugger on port ${String(port)}`, {
          cause: error,
        });
      }
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }
}

function connect(port: number): Promise<net.Socket> {
  return new Promise((resolve, reject) => {
    const socket = net.connect(port, '127.0.0.1');
    socket.once('connect', () => {
      socket.off('error', reject);
      resolve(socket);
    });
    socket.once('error', reject);
  });
}

// Packets are framed as `<byte length>:<JSON>`. Replies come from the addressed actor
// and have no `type`; packets with a `type` are events.
function createClient(socket: net.Socket): FirefoxDebugger {
  let buffer = Buffer.alloc(0);
  const pendingReplies = new Map<string, ((packet: Packet) => void)[]>();
  const events: Packet[] = [];
  const eventListeners: ((packet: Packet) => void)[] = [];

  socket.on('data', (chunk: Buffer) => {
    buffer = Buffer.concat([buffer, chunk]);
    for (;;) {
      const separator = buffer.indexOf(':');
      if (separator === -1) return;
      const end = separator + 1 + Number(buffer.subarray(0, separator).toString('ascii'));
      if (buffer.length < end) return;
      const packet = JSON.parse(buffer.subarray(separator + 1, end).toString('utf8')) as Packet;
      buffer = buffer.subarray(end);
      dispatch(packet);
    }
  });

  function dispatch(packet: Packet) {
    const from = String(packet['from']);
    const waiting = pendingReplies.get(from);
    if (!('type' in packet) && waiting?.length) {
      waiting.shift()?.(packet);
      return;
    }
    events.push(packet);
    for (const listener of eventListeners) listener(packet);
  }

  function request(packet: Packet & { to: string }): Promise<Packet> {
    return new Promise((resolve, reject) => {
      const queue = pendingReplies.get(packet.to) ?? [];
      queue.push((reply) => {
        if (typeof reply['error'] === 'string') {
          reject(new Error(`Firefox ${reply['error']}: ${String(reply['message'])}`));
        } else resolve(reply);
      });
      pendingReplies.set(packet.to, queue);
      const body = Buffer.from(JSON.stringify(packet), 'utf8');
      socket.write(`${String(body.length)}:`);
      socket.write(body);
    });
  }

  function waitForEvent(predicate: (packet: Packet) => boolean, timeoutMs = DEFAULT_TIMEOUT_MS) {
    const seen = events.find(predicate);
    if (seen) return Promise.resolve(seen);
    return new Promise<Packet>((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error('Timed out waiting for a Firefox debugger event'));
      }, timeoutMs);
      eventListeners.push((packet) => {
        if (!predicate(packet)) return;
        clearTimeout(timer);
        resolve(packet);
      });
    });
  }

  return {
    request,
    waitForEvent,
    onEvent: (listener) => eventListeners.push(listener),
    close: () => socket.destroy(),
  };
}

function stringField(packet: Packet, key: string): string {
  const value = packet[key];
  if (typeof value !== 'string') throw new Error(`Expected "${key}" in ${JSON.stringify(packet)}`);
  return value;
}

function isPacket(value: unknown): value is Packet {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
