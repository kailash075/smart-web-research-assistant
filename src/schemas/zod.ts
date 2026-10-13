import { z } from 'zod';

// Extension pages forbid eval through their Content Security Policy. By default Zod 4
// probes `new Function` to compile faster validators, which Firefox reports as a CSP
// error. Jitless mode never calls it. Schemas import `z` from here so this runs first.
z.config({ jitless: true });

export { z };
